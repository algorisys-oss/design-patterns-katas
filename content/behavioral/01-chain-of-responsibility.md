---
id: chain-of-responsibility
category: behavioral
sequence: 1
title: Chain of Responsibility
also_known_as: [CoR, Chain of Command]
gof: true
intent: "Pass a request along a chain of handlers; each one either handles it or forwards it to the next."
frequency: medium
difficulty: intermediate
tags: [behavioral, decoupling, handlers, middleware, pipeline]
related: [command, composite, decorator]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Give more than one object a chance to handle a request by passing it down a chain of
handlers. Each handler decides: process this myself, or forward it to the next one. The
sender fires the request at the head of the chain and never learns which handler answered.

This is the pattern behind middleware stacks, validation pipelines, and event bubbling: an
ordered line of handlers, each free to act or defer, with the sender decoupled from the receiver.

## The Problem

You need to validate a form field: it's required, it must be an email, it can't be too long.
The obvious first cut is one function stacking the checks:

```
function validate(field) {
  if (!field.value) return `${field.name} is required`;
  if (!field.value.includes("@")) return `${field.name} must be an email`;
  if (field.value.length > 50) return `${field.name} is too long`;
  // add a rule → open this function and edit it again
  return null;
}
```

Every new rule reopens `validate`, the checks can't be reordered or reused, and there's no
way to swap the rule set at runtime. Chain of Responsibility turns each check into its own
handler and lets you assemble the line from outside.

## Structure

Key Components:

- **Handler** — the interface every link implements (`handle(request)`), plus a reference to
  the next handler in the line.
- **Concrete Handlers** — each processes the requests it recognizes and forwards the rest.
- **Client** — builds the chain and sends the request to its head, unaware of who responds.

```
request → [ Handler A ] → [ Handler B ] → [ Handler C ] → (unhandled)
             handle?         handle?         handle?
             else pass       else pass       else pass
```

## When to Use

- More than one object may handle a request and the handler isn't known in advance.
- You want to issue a request without coupling the sender to a specific receiver.
- The set of handlers — and their order — should be configurable at runtime.
- You have a natural pipeline: validation, filtering, logging, authorization, middleware.

## Advantages and Disadvantages

### Advantages
- Decouples sender from receiver — neither knows the other's concrete type.
- Add or reorder handlers without touching existing ones (Open/Closed).
- Each handler has a single, focused responsibility.

### Disadvantages
- No handler is guaranteed to process the request — it can fall off the end unhandled.
- A long chain can hurt performance and is harder to debug ("which link answered?").
- Behavior depends on chain order, which is easy to get wrong and invisible in the types.

## Common Mistakes

- **No terminal handler** — a request that reaches the end silently vanishes; always give the
  chain a default or make "unhandled" an explicit, visible outcome.
- **Forgetting to forward** — a handler that neither handles nor calls the next drops the
  request. Every non-handling branch must pass along.
- **Order left implicit** — the chain's order *is* its behavior; encode it deliberately, don't
  let it emerge from construction accidents.
- **Reaching for it too soon** — if exactly one object always handles the request, a plain call
  or a `switch` is simpler. CoR earns its keep when the handler is genuinely unknown up front.

## Key Takeaways

- Chain of Responsibility = an ordered line of handlers, each of which handles or forwards.
- The sender talks only to the head and stays ignorant of which handler responds.
- Handlers are added, removed, and reordered freely — the chain is data, not hard-wired calls.
- Most real chains you meet are middleware stacks; the pattern is already everywhere.

## Implementations

A field-validation chain: each validator either rejects the field (handling the request and
stopping the chain) or passes it to the next. If all pass, the field is valid.

### JavaScript

**❌ Naive**

```js
// One function with the checks hard-coded and ordered in place.
function validate(field) {
  if (!field.value) return `${field.name} is required`;
  if (!field.value.includes("@")) return `${field.name} must be an email`;
  if (field.value.length > 50) return `${field.name} is too long`;
  return null; // valid
}
```

**✅ Idiomatic (frontend)**

```js
// Each validator returns an error string (handles, stops the chain) or null (passes along).
const required = (f) => (f.value ? null : `${f.name} is required`);
const isEmail  = (f) => (f.value.includes("@") ? null : `${f.name} must be an email`);
const maxLen   = (n) => (f) => (f.value.length <= n ? null : `${f.name} is too long`);

// The chain: run handlers in order, stop at the first that returns an error.
const chain = (...validators) => (field) =>
  validators.reduce((err, handle) => err ?? handle(field), null);

const validate = chain(required, isEmail, maxLen(50));
validate({ name: "email", value: "" });        // "email is required"
validate({ name: "email", value: "nope" });    // "email must be an email"
validate({ name: "email", value: "a@b.co" });  // null → valid
```

**🧠 Tradeoff** — Functions-as-handlers drop the class hierarchy entirely; the chain is just an
array, so reordering or swapping rule sets is a one-liner. The `??` short-circuits so later
handlers don't run once one handles. What you give up is the explicit `next` pointer — if a
handler needs per-instance state or must decide dynamically *which* handler comes next, the
class-based linked chain (or the `(req, next) =>` middleware form below) carries its weight better.

### Node.js

**❌ Naive**

```js
// One route handler doing auth, rate-limiting, and work in a single tangled block.
app.get("/orders", (req, res) => {
  if (!req.headers.authorization) return res.status(401).send("Unauthorized");
  if (overLimit(req.ip)) return res.status(429).send("Too Many Requests");
  res.json({ orders: [] }); // the actual work, buried under guard clauses
});
```

**✅ Idiomatic (backend)**

```js
// Express middleware IS Chain of Responsibility: each link calls next() to pass along,
// or ends the response to handle the request and stop the chain.
import express from "express";
const app = express();

const authenticate = (req, res, next) => {
  if (!req.headers.authorization) return res.status(401).send("Unauthorized");
  next();                                        // pass to the next handler
};
const rateLimit = (req, res, next) => {
  if (overLimit(req.ip)) return res.status(429).send("Too Many Requests");
  next();
};

app.use(authenticate);
app.use(rateLimit);
app.get("/orders", (req, res) => res.json({ orders: [] })); // terminal handler
```

**🧠 Tradeoff** — Express, Koa, and Connect *are* this pattern: `next()` forwards, ending the
response handles. You almost never hand-roll the chain on the backend — the framework owns it,
and you just register links. The cost is that a middleware which forgets to call `next()` (and
doesn't end the response) hangs the request forever — the "forgetting to forward" mistake made
concrete.

### Python

**❌ Naive**

```python
def validate(field: dict) -> str | None:
    if not field["value"]:
        return f'{field["name"]} is required'
    if "@" not in field["value"]:
        return f'{field["name"]} must be an email'
    if len(field["value"]) > 50:
        return f'{field["name"]} is too long'
    return None
```

**✅ Idiomatic**

```python
from typing import Callable, Optional

# A validator handles the request by returning an error, or passes by returning None.
Validator = Callable[[dict], Optional[str]]

def required(f: dict) -> Optional[str]:
    return None if f["value"] else f'{f["name"]} is required'

def is_email(f: dict) -> Optional[str]:
    return None if "@" in f["value"] else f'{f["name"]} must be an email'

def chain(*validators: Validator) -> Validator:
    def run(field: dict) -> Optional[str]:
        for handle in validators:
            if (err := handle(field)) is not None:
                return err          # first handler that handles stops the chain
        return None
    return run

validate = chain(required, is_email)
print(validate({"name": "email", "value": ""}))        # email is required
print(validate({"name": "email", "value": "a@b.co"}))  # None
```

**🧠 Tradeoff** — Callables plus a walrus-operator loop give the pythonic chain: the list is the
order, and short-circuiting is a plain `return`. When handlers need configuration or state — a
rate limiter holding counters, an approver holding a spending limit — promote them to a `Protocol`
with a `handle` method and an explicit `_next` reference, which is the classic object chain.

### Elixir

**❌ Naive**

```elixir
def validate(field) do
  cond do
    field.value == "" -> {:error, "#{field.name} is required"}
    not String.contains?(field.value, "@") -> {:error, "#{field.name} must be an email"}
    String.length(field.value) > 50 -> {:error, "#{field.name} is too long"}
    true -> :ok
  end
end
```

**✅ Idiomatic**

```elixir
defmodule Validate do
  # Each validator returns :ok to pass, or {:error, msg} to handle and stop the chain.
  def chain(validators) do
    fn field ->
      Enum.reduce_while(validators, :ok, fn handle, _acc ->
        case handle.(field) do
          :ok -> {:cont, :ok}          # pass to the next handler
          {:error, _} = err -> {:halt, err}
        end
      end)
    end
  end
end

required = fn
  %{value: ""} = f -> {:error, "#{f.name} is required"}
  _ -> :ok
end
is_email = fn f ->
  if String.contains?(f.value, "@"), do: :ok, else: {:error, "#{f.name} must be an email"}
end

validate = Validate.chain([required, is_email])
validate.(%{name: "email", value: ""})        # {:error, "email is required"}
validate.(%{name: "email", value: "a@b.co"})  # :ok
```

**🧠 Tradeoff** — `Enum.reduce_while` is Elixir's Chain of Responsibility: `:cont` forwards,
`:halt` handles and stops, and the list of functions *is* the chain — no mutable `next` pointer
anywhere. When handlers are long-lived or must run concurrently, model each as a process (a
`GenStage` stage, or a `GenServer` that forwards the message it can't handle) and the chain
becomes a supervised pipeline instead of a fold.

### Go

**❌ Naive**

```go
func Validate(f Field) error {
	if f.Value == "" {
		return fmt.Errorf("%s is required", f.Name)
	}
	if !strings.Contains(f.Value, "@") {
		return fmt.Errorf("%s must be an email", f.Name)
	}
	if len(f.Value) > 50 {
		return fmt.Errorf("%s is too long", f.Name)
	}
	return nil
}
```

**✅ Idiomatic**

```go
package validate

import "fmt"

type Field struct {
	Name  string
	Value string
}

// A Validator handles the request by returning an error, or passes by returning nil.
type Validator func(Field) error

// Chain runs validators in order and stops at the first that handles the request.
func Chain(vs ...Validator) Validator {
	return func(f Field) error {
		for _, handle := range vs {
			if err := handle(f); err != nil {
				return err // first handler that handles stops the chain
			}
		}
		return nil
	}
}

func Required(f Field) error {
	if f.Value == "" {
		return fmt.Errorf("%s is required", f.Name)
	}
	return nil
}

// usage: validate := Chain(Required, IsEmail); err := validate(Field{"email", ""})
```

**🧠 Tradeoff** — A `Validator` func type plus a variadic `Chain` is the idiomatic single-method
handler: no interface hierarchy, and the chain composes with a plain loop. For HTTP, Go's
canonical form of this pattern is `func(http.Handler) http.Handler` middleware, wrapped
outside-in (`logging(auth(handler))`) — same chain, expressed as function composition rather
than a slice.

### CSharp

**❌ Naive**

```csharp
// One method with the checks hard-coded and ordered in place.
Console.WriteLine(Validate(new Field("email", "nope"))); // email must be an email

static string? Validate(Field f)
{
    if (f.Value is "") return $"{f.Name} is required";
    if (!f.Value.Contains('@')) return $"{f.Name} must be an email";
    if (f.Value.Length > 50) return $"{f.Name} is too long";
    return null; // valid
}

public sealed record Field(string Name, string Value);
```

**✅ Idiomatic**

```csharp
// Each validator returns an error string (handles, stops the chain) or null (passes along).
var validate = Chain(Required, IsEmail, MaxLen(50));

Console.WriteLine(validate(new Field("email", "")));                  // email is required
Console.WriteLine(validate(new Field("email", "nope")));              // email must be an email
Console.WriteLine(validate(new Field("email", "a@b.co")) ?? "valid"); // valid

static string? Required(Field f) => f.Value is "" ? $"{f.Name} is required" : null;
static string? IsEmail(Field f) => f.Value.Contains('@') ? null : $"{f.Name} must be an email";
static Func<Field, string?> MaxLen(int n) =>
    f => f.Value.Length <= n ? null : $"{f.Name} is too long";

// The chain: run validators in order, stop at the first that returns an error.
static Func<Field, string?> Chain(params Func<Field, string?>[] validators) =>
    field => validators
        .Select(handle => handle(field))
        .FirstOrDefault(err => err is not null);

public sealed record Field(string Name, string Value);
```

**🧠 Tradeoff** — a single-method handler contract collapses into `Func<Field, string?>`: the
delegate *is* the handler interface, so hold off on an `IValidator` until a handler carries
state or several members (a rate limiter with counters earns the interface and an explicit
`SetNext`). The lazy `Select`/`FirstOrDefault` pair short-circuits, so later validators never
run once one handles. And the pattern is already in the platform: ASP.NET Core middleware —
`app.Use(...)` with its `next` delegate — is this exact chain.

### Rust

**❌ Naive**

```rust
struct Field { name: String, value: String }

// One function with the checks hard-coded and ordered in place.
fn validate(f: &Field) -> Option<String> {
    if f.value.is_empty() {
        return Some(format!("{} is required", f.name));
    }
    if !f.value.contains('@') {
        return Some(format!("{} must be an email", f.name));
    }
    if f.value.len() > 50 {
        return Some(format!("{} is too long", f.name));
    }
    None // valid
}
```

**✅ Idiomatic**

```rust
struct Field { name: String, value: String }

// A validator handles the request by returning Some(error), or passes with None.
type Validator = Box<dyn Fn(&Field) -> Option<String>>;

// The chain: find_map runs validators in order and stops at the first Some.
fn chain(validators: Vec<Validator>) -> impl Fn(&Field) -> Option<String> {
    move |field| validators.iter().find_map(|handle| handle(field))
}

fn required(f: &Field) -> Option<String> {
    f.value.is_empty().then(|| format!("{} is required", f.name))
}

fn is_email(f: &Field) -> Option<String> {
    (!f.value.contains('@')).then(|| format!("{} must be an email", f.name))
}

fn max_len(n: usize) -> Validator {
    Box::new(move |f| (f.value.len() > n).then(|| format!("{} is too long", f.name)))
}

fn main() {
    let validators: Vec<Validator> = vec![Box::new(required), Box::new(is_email), max_len(50)];
    let validate = chain(validators);

    let field = Field { name: "email".into(), value: "".into() };
    println!("{:?}", validate(&field)); // Some("email is required")

    let field = Field { name: "email".into(), value: "a@b.co".into() };
    println!("{:?}", validate(&field)); // None — valid
}
```

**🧠 Tradeoff** — `find_map` is the chain in one call: walk the list, stop at the first
`Some`. `Box<dyn Fn>` buys a mixed list — plain `fn`s and state-capturing closures like
`max_len` side by side — at the price of a heap allocation and dynamic dispatch per handler.
If the rule set were closed, an enum of rules matched in the loop would drop the boxes; keep
`dyn` here because a validation chain is exactly the kind of set that must stay open.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

const Field = struct { name: []const u8, value: []const u8 };

// One function with the checks hard-coded and ordered in place.
fn validate(f: Field) ?[]const u8 {
    if (f.value.len == 0) return "is required";
    if (std.mem.indexOfScalar(u8, f.value, '@') == null) return "must be an email";
    if (f.value.len > 50) return "is too long";
    return null; // valid
}

pub fn main() void {
    const f = Field{ .name = "email", .value = "nope" };
    if (validate(f)) |err| std.debug.print("{s} {s}\n", .{ f.name, err }); // email must be an email
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

const Field = struct { name: []const u8, value: []const u8 };

// A validator handles the request by returning an error message, or passes with null.
const Validator = *const fn (Field) ?[]const u8;

// The chain is a slice of function pointers; the first non-null answer stops it.
fn validate(validators: []const Validator, field: Field) ?[]const u8 {
    for (validators) |handle| {
        if (handle(field)) |err| return err;
    }
    return null;
}

fn required(f: Field) ?[]const u8 {
    return if (f.value.len == 0) "is required" else null;
}

fn isEmail(f: Field) ?[]const u8 {
    return if (std.mem.indexOfScalar(u8, f.value, '@') == null) "must be an email" else null;
}

fn maxLen50(f: Field) ?[]const u8 {
    return if (f.value.len > 50) "is too long" else null;
}

pub fn main() void {
    const chain = [_]Validator{ required, isEmail, maxLen50 };

    const field = Field{ .name = "email", .value = "" };
    if (validate(&chain, field)) |err| {
        std.debug.print("{s} {s}\n", .{ field.name, err }); // email is required
    }

    const ok = Field{ .name = "email", .value = "a@b.co" };
    if (validate(&chain, ok) == null) std.debug.print("valid\n", .{}); // valid
}
```

**🧠 Tradeoff** — a slice of `*const fn` pointers makes the chain plain data, and the
`?[]const u8` return is the handle-or-pass signal — `if (handle(field)) |err|` reads it in one
line. The honest limits: Zig has no closures, so `maxLen50` bakes its limit into its name; a
configurable validator needs the two-field vtable idiom (`*anyopaque` context plus a function
pointer, the `std.mem.Allocator` shape). The messages also stay static slices — formatting
"email is required" at runtime would mean threading an allocator through the chain.

### Java

**❌ Naive**

```java
// One method with the checks hard-coded and ordered in place.
class FieldValidator {
    static String validate(String name, String value) {
        if (value.isEmpty()) return name + " is required";
        if (!value.contains("@")) return name + " must be an email";
        if (value.length() > 50) return name + " is too long";
        return null; // valid — and every new rule reopens this method
    }
}
```

**✅ Idiomatic**

```java
import java.util.List;
import java.util.Optional;

record Field(String name, String value) {}

// A validator handles the request by returning an error, or passes with an empty Optional.
@FunctionalInterface
interface Validator {
    Optional<String> check(Field f);
}

public class Demo {
    static Validator required =
        f -> f.value().isEmpty() ? Optional.of(f.name() + " is required") : Optional.empty();
    static Validator isEmail =
        f -> f.value().contains("@") ? Optional.empty() : Optional.of(f.name() + " must be an email");

    static Validator maxLen(int n) {
        return f -> f.value().length() <= n ? Optional.empty() : Optional.of(f.name() + " is too long");
    }

    // The chain is a List; the lazy stream stops at the first handler that handles.
    static Optional<String> validate(List<Validator> chain, Field field) {
        return chain.stream().flatMap(v -> v.check(field).stream()).findFirst();
    }

    public static void main(String[] args) {
        var chain = List.of(required, isEmail, maxLen(50));

        System.out.println(validate(chain, new Field("email", "")));       // Optional[email is required]
        System.out.println(validate(chain, new Field("email", "nope")));   // Optional[email must be an email]
        System.out.println(validate(chain, new Field("email", "a@b.co"))); // Optional.empty → valid
    }
}
```

**🧠 Tradeoff** — `Validator` has one method, so it's a functional interface: lambdas are the
handlers and a `List` is the chain — no abstract `Handler` base, no `setNext` plumbing. The
stream is lazy, so `findFirst` short-circuits the moment a validator handles. The GoF linked
form survives in Java as the platform's own chains: servlet filters
(`doFilter(request, response, chain)` — call `chain.doFilter` to forward, return without it to
handle) and Spring's `HandlerInterceptor`s are this exact pattern, order and all. Hand-roll the
list form for your own pipelines; promote a handler to a class implementing `Validator` when it
carries state, and it drops into the same list.

## Applications

Real-world uses of Chain of Responsibility (from the reference article), by tier:

- **Frontend** — DOM event bubbling/handling up a component hierarchy, form-validation
  pipelines, Redux middleware, permission-gated UI rendering (`admin → user → guest`),
  user-command processing.
- **Backend** — Express/Koa middleware stacks, layered authorization checks
  (`token → role → permission`), tiered logging by level, request filtering (IP → method →
  content-type), staged error handling (`404 → validation → 500`).
- **Both** — any "try each candidate in order until one takes it" flow: parsers, dispatchers,
  fallback resolvers.

**In modern systems:**

- **Low-code** — a validation pipeline where each rule from the JSON schema gets a pass at the
  value, the first failure stopping the chain.
- **Workflow engine** — step middleware (auth → quota → audit) each step passes through before it
  runs.
- **Multi-agent** — a fallback model chain (fast → strong → human), or tool dispatch where each
  handler claims only the calls it recognizes.

## Related Patterns

- **Command** — the request travelling the chain is often a Command object; CoR decides *who*
  runs it, Command encapsulates *what* runs.
- **Composite** — a chain frequently runs *along* a Composite tree, forwarding a request from a
  child up to its parent until someone handles it.
- **Decorator** — both wrap objects into a line, but a Decorator always forwards (adding
  behavior on the way through), while a CoR handler may stop the request cold.
