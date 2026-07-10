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
languages: [javascript, node-js, python, elixir, go]
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
