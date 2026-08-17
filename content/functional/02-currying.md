---
id: currying
category: functional
sequence: 2
title: Currying & Partial Application
also_known_as: [Schönfinkeling, Partial Application]
gof: false
intent: "Turn a multi-argument function into a chain of single-argument functions (currying), or fix some arguments now and supply the rest later (partial application) — to specialize and compose functions."
frequency: medium
difficulty: intermediate
tags: [functional, higher-order-functions, specialization, composition, closures]
related: [function-composition, memoization, strategy]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

**Currying** rewrites `f(a, b, c)` as `f(a)(b)(c)` — a chain of one-argument functions, each
returning the next. **Partial application** is the practical use: call a function with *some* of its
arguments and get back a new function waiting for the rest. `add(2, 3)` becomes `add(2)` — a
specialized `addTwo` function.

Both let you **fix the stable arguments up front** (a config, a dependency, a strategy) and pass
around a smaller, purpose-built function. That smaller function is easier to compose, easier to hand
to `map`/`filter`, and reads at the call site as exactly the operation you mean.

## The Problem

Passing the same "context" arguments through every call is noise, and generic functions don't fit
higher-order callers cleanly:

- **Repeated arguments** — every call to `log(level, module, message)` repeats `level` and `module`;
  the varying part is buried among constants.
- **Awkward for `map`/`filter`** — `items.map(x => multiply(3, x))` needs a wrapper lambda just to
  fix `3`; you can't hand `multiply` directly.
- **No specialization** — you want an `addTax(price)` derived from a general `add(rate, price)`, but
  without partial application you re-thread `rate` everywhere.
- **Poor composition** — pipelines want unary functions; multi-arg functions don't slot in without
  adapters.

## Structure

Key Components:

- **Curry** — a transform that turns an n-ary function into nested unary functions.
- **Partial application** — fixing a prefix (or subset) of arguments, returning a function of the rest.
- **Closures** — the mechanism: each returned function captures the arguments supplied so far.
- **Specialized function** — the result: a smaller-arity function ready to compose or pass along.

```
f(a, b, c)  ──curry──►  f(a)(b)(c)          (chain of unary functions)
f(a, b, c)  ──partial(a)──►  g(b, c)        (a fixed; g awaits b, c)
```

## When to Use

- You call a function repeatedly with the same leading arguments (config, dependencies, a strategy).
- You want to pass a specialized function to `map`/`filter`/`reduce` without a wrapper lambda.
- You're building point-free pipelines that expect unary functions.
- You want to derive named, purpose-specific functions from a general one (`addTax`, `logError`).

## Advantages and Disadvantages

### Advantages
- **Specialization** — derive focused functions by fixing the stable arguments once.
- **Composability** — unary functions slot cleanly into pipelines and higher-order calls.
- **Readable call sites** — `addTax(price)` says more than `add(0.2, price)` repeated everywhere.

### Disadvantages
- **Cognitive overhead** — heavy currying (point-free style) can become cryptic and hard to debug.
- **Argument order matters** — currying fixes arguments left-to-right, so the API's parameter order
  dictates what you can partially apply.
- **Not idiomatic everywhere** — in some languages currying is unnatural and reads as cleverness
  rather than clarity.

## Common Mistakes

- **Over-currying into unreadable point-free code** — chaining a dozen partial applications to avoid
  naming anything hurts readability more than it helps; name intermediate functions.
- **Wrong argument order** — putting the *varying* argument first makes the stable ones un-fixable;
  order parameters config-first, data-last for partial application.
- **Confusing currying with partial application** — currying always produces unary steps; partial
  application fixes any subset — reach for the one you actually need.
- **Losing `this`/receiver** — currying methods can drop their binding; bind or use standalone
  functions.

## Key Takeaways

- Currying: `f(a, b, c)` → `f(a)(b)(c)`; partial application: fix some args, get a function of the rest.
- Order parameters "config first, data last" so the stable arguments can be fixed up front.
- The result is specialized, unary-friendly functions that compose and read well.
- Use it to remove repeated arguments and derive named operations — not to win a point-free contest.

## Implementations

### JavaScript

**❌ Naive**

```js
// Repeating the fixed arguments everywhere; wrapper lambdas just to fix one arg.
const price = (rate, amount) => amount + amount * rate;
cart.map((amount) => price(0.2, amount));   // 0.2 repeated, wrapper needed
receipt.map((amount) => price(0.2, amount)); // again
```

**✅ Idiomatic**

```js
// Curry (config first, data last) → derive a specialized, composable function.
const price = (rate) => (amount) => amount + amount * rate;
const withVat = price(0.2);            // partial application → a named unary function

cart.map(withVat);                     // hand it straight to map — no wrapper
receipt.map(withVat);

// a generic curry helper for existing multi-arg functions:
const curry = (fn) => function curried(...args) {
  return args.length >= fn.length ? fn(...args) : (...more) => curried(...args, ...more);
};
```

**🧠 Tradeoff** — Writing `price` as `(rate) => (amount) => …` makes `withVat` fall out naturally and
slot into `map` with no wrapper. Arrow functions and closures make this idiomatic in JS, and Ramda/
lodash provide `curry`/`partial` for existing functions. The caution is restraint: a little currying
clarifies, but stacking it into fully point-free pipelines can become write-only code.

### Node.js

**❌ Naive**

```js
// Middleware/handlers re-receiving the same deps on every call.
function makeHandler(req, res) {
  logRequest("info", "http", req.url); // "info","http" repeated across every handler
}
```

**✅ Idiomatic**

```js
// Partially apply dependencies/config to produce specialized functions and middleware.
const log = (level) => (module) => (message) => console.log(`[${level}] ${module}: ${message}`);
const httpInfo = log("info")("http");   // fixed level + module

// Injecting dependencies via partial application (a common Node DI style):
const makeGetUser = (db) => (id) => db.users.findById(id); // fix db once
const getUser = makeGetUser(pool);      // hand `getUser` around; db is baked in
```

**🧠 Tradeoff** — Partial application is a lightweight dependency-injection idiom in Node: fix the
`db`/config once with `makeGetUser(pool)` and pass the specialized function around, no container
needed. It also builds tidy, composable logging/middleware. The same restraint applies — a couple of
levels reads well; deeply nested `f(a)(b)(c)(d)` chains obscure intent, so name the specializations.

### Python

**❌ Naive**

```python
# Repeating fixed arguments; lambdas to adapt for map.
def price(rate, amount): return amount + amount * rate
list(map(lambda a: price(0.2, a), cart))   # 0.2 + wrapper lambda every time
```

**✅ Idiomatic**

```python
from functools import partial

def price(rate, amount): return amount + amount * rate

with_vat = partial(price, 0.2)    # fix the first argument → a specialized callable
list(map(with_vat, cart))         # hand it directly to map

# true currying is less idiomatic in Python, but closures express it:
def price_curried(rate):
    return lambda amount: amount + amount * rate
with_vat = price_curried(0.2)
```

**🧠 Tradeoff** — `functools.partial` is Python's idiomatic partial application — it fixes leading
arguments and returns a callable, no lambda needed. Full currying is less common (Python favors
named args and `partial`), but closures express it when wanted. `partial` shines for adapting
functions to `map`/callbacks and for injecting configuration; deep currying tends to read as
un-Pythonic.

### Elixir

**❌ Naive**

```elixir
# Repeating fixed args; anonymous wrappers just to adapt arity for Enum.
price = fn rate, amount -> amount + amount * rate end
Enum.map(cart, fn a -> price.(0.2, a) end)   # 0.2 + wrapper every call
```

**✅ Idiomatic**

```elixir
# Partial application via closures and the capture operator; pipelines love unary functions.
price = fn rate -> fn amount -> amount + amount * rate end end
with_vat = price.(0.2)                     # specialized unary function
Enum.map(cart, with_vat)

# capture operator fixes arguments concisely:
add = fn a, b -> a + b end
add_ten = &add.(10, &1)                    # partially applied → unary
Enum.map(nums, add_ten)
```

**🧠 Tradeoff** — Elixir functions aren't auto-curried, but closures and the capture operator
(`&fun/arity`, `&f.(x, &1)`) make partial application natural, and the pipe operator (`|>`) rewards
the unary functions it produces. It fits the language's functional grain. Full currying is uncommon
(Elixir prefers explicit multi-arity functions and `|>`), so partial application via captures is the
idiomatic reach.

### Go

**❌ Naive**

```go
// Threading the same config through every call.
func price(rate, amount float64) float64 { return amount + amount*rate }
for _, a := range cart { total += price(0.2, a) } // 0.2 repeated
```

**✅ Idiomatic**

```go
// Closures give partial application: fix arguments, return a specialized func.
func price(rate float64) func(float64) float64 {
    return func(amount float64) float64 { return amount + amount*rate }
}

withVat := price(0.2)                 // specialized unary function
for _, a := range cart {
    total += withVat(a)
}

// dependency-fixing closure (common Go pattern):
func makeGetUser(db *DB) func(id string) (User, error) {
    return func(id string) (User, error) { return db.Find(id) }
}
```

**🧠 Tradeoff** — Go has no currying syntax, but a function returning a `func` is idiomatic partial
application, and it's the standard way to bake a dependency (`db`) or config (`rate`) into a
handler. It's more verbose than curried languages — you write the closure explicitly — and Go
programmers use it sparingly, favoring plain functions and structs; but for fixing config and
producing specialized handlers it's clean and common.

### CSharp

**❌ Naive**

```csharp
// Repeating the fixed rate everywhere; a wrapper lambda just to fix one argument.
decimal[] cart = [100m, 250m];
var totals = cart.Select(a => Price(0.2m, a));    // 0.2 repeated, wrapper needed
var receipt = cart.Select(a => Price(0.2m, a));   // again

static decimal Price(decimal rate, decimal amount) => amount + amount * rate;
```

**✅ Idiomatic**

```csharp
// Curried lambdas: fix the rate once, get a unary function LINQ takes directly.
Func<decimal, Func<decimal, decimal>> price = rate => amount => amount + amount * rate;
var withVat = price(0.2m);                        // partial application → named unary function

decimal[] cart = [100m, 250m];
Console.WriteLine(string.Join(", ", cart.Select(withVat))); // 120.0, 300.0

// The same idiom bakes a dependency in — injection without a container:
Func<HttpClient, Func<string, Task<string>>> makeFetch =
    http => url => http.GetStringAsync(url);
var fetch = makeFetch(new HttpClient());          // client fixed; hand `fetch` around
```

**🧠 Tradeoff** — lambdas and closures make currying expressible in C#, and a specialized
`Func<decimal, decimal>` slots straight into LINQ with no wrapper. But the type spells the cost
out loud: `Func<decimal, Func<decimal, decimal>>` is noise where JS reads clean. Idiomatic C#
uses partial application at the edges — fixing a dependency or a config value — and gives the
specialization a name; curried *public* APIs read foreign, and DI containers already cover the
"fix the dependencies once" case for anything bigger.

### Rust

**❌ Naive**

```rust
// Threading the same rate through every call site.
fn price(rate: f64, amount: f64) -> f64 {
    amount + amount * rate
}

fn main() {
    let cart = [100.0, 250.0];
    let totals: Vec<f64> = cart.iter().map(|&a| price(0.2, a)).collect(); // 0.2 + wrapper
    println!("{totals:?}");
}
```

**✅ Idiomatic**

```rust
// A function returning a closure: fix the rate, get back a unary function.
fn price(rate: f64) -> impl Fn(f64) -> f64 {
    move |amount| amount + amount * rate   // `move`: the closure owns its config
}

fn main() {
    let with_vat = price(0.2);             // partial application
    println!("{}", with_vat(100.0));       // 120

    let cart = [100.0, 250.0];
    let totals: Vec<f64> = cart.into_iter().map(&with_vat).collect(); // no wrapper
    println!("{totals:?}");                // [120.0, 300.0]
}
```

**🧠 Tradeoff** — Rust has no auto-currying; a function returning `impl Fn` is the
partial-application idiom, and `move` makes the captured config's ownership explicit — the
borrow checker forces you to say who owns `rate`, which JS never asks. Returning different
closures from different branches needs `Box<dyn Fn>` (one heap hop). Rust code reaches for this
shape to bake in config or dependencies; deep `f(a)(b)(c)` chains are un-idiomatic — iterator
adapters and builder structs carry that weight instead.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

// Threading the same rate through every call.
fn price(rate: f64, amount: f64) f64 {
    return amount + amount * rate;
}

pub fn main() void {
    const cart = [_]f64{ 100.0, 250.0 };
    var total: f64 = 0;
    for (cart) |a| total += price(0.2, a); // 0.2 repeated at every call site
    std.debug.print("{d}\n", .{total});
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// Compile-time partial application: rate is baked into a generated function.
fn priceWith(comptime rate: f64) fn (f64) f64 {
    return struct {
        fn call(amount: f64) f64 {
            return amount + amount * rate;
        }
    }.call;
}

// Runtime partial application: no closures, so the environment is an explicit struct.
const Price = struct {
    rate: f64,
    pub fn apply(self: Price, amount: f64) f64 {
        return amount + amount * self.rate;
    }
};

pub fn main() void {
    const withVat = priceWith(0.2);              // a plain fn (f64) f64, zero overhead
    std.debug.print("{d}\n", .{withVat(100.0)}); // 120

    const vat = Price{ .rate = 0.2 };            // rate could arrive at runtime
    var total: f64 = 0;
    for ([_]f64{ 100.0, 250.0 }) |a| total += vat.apply(a);
    std.debug.print("{d}\n", .{total});          // 420
}
```

**🧠 Tradeoff** — be honest: Zig has no closures, so currying doesn't survive the port intact.
The `comptime` form generates a real specialized function at zero runtime cost, but only for
config known at compile time. The struct form is what a closure *is* underneath — the captured
environment made explicit — and it's just "a struct with a method," which Zig would tell you to
write anyway. Most of the time, don't bother: pass both arguments. Reach for these only when an
API demands a bare `fn (f64) f64` or the same pairing repeats everywhere.

### Java

**❌ Naive**

```java
import java.util.List;

// Repeating the fixed rate everywhere; a wrapper lambda just to fix one argument.
public class Demo {
    static double price(double rate, double amount) { return amount + amount * rate; }

    public static void main(String[] args) {
        var cart = List.of(100.0, 250.0);
        var totals = cart.stream().map(a -> price(0.2, a)).toList();  // 0.2 repeated, wrapper needed
        var receipt = cart.stream().map(a -> price(0.2, a)).toList(); // again
        System.out.println(totals); // [120.0, 300.0]
    }
}
```

**✅ Idiomatic**

```java
import java.util.List;
import java.util.function.Function;

public class Demo {
    // Curried: fix the rate once, get back a unary function streams take directly.
    static Function<Double, Function<Double, Double>> price =
        rate -> amount -> amount + amount * rate;

    public static void main(String[] args) {
        var withVat = price.apply(0.2);           // partial application → a named unary function
        System.out.println(withVat.apply(100.0)); // 120.0

        var cart = List.of(100.0, 250.0);
        System.out.println(cart.stream().map(withVat).toList()); // [120.0, 300.0]

        // andThen/compose chain the unary functions currying produces:
        var withShipping = withVat.andThen(total -> total + 10);
        System.out.println(withShipping.apply(100.0)); // 130.0
    }
}
```

**🧠 Tradeoff** — lambdas capture like closures, so currying works, and `Function.andThen`/
`compose` chain the unary results — that's the composition payoff. The cost is written in the
type: `Function<Double, Function<Double, Double>>` is noise where JS reads clean, and every
`Double` boxes (the primitive specializations — `DoubleUnaryOperator` and friends — avoid the
boxing but don't curry). So idiomatic Java partial-applies at the edges: fix a dependency or a
config value, give the result a name, and hand streams a method reference. Curried *public* APIs
read foreign here; nobody should need `.apply().apply()` to call your code.

## Applications

- **Configured functions** — fixing a base URL, API key, or logger level once to derive specialized
  callers (backend & frontend).
- **Event handlers** — `onClick={handleSelect(item.id)}` partially applies the id per element
  (frontend).
- **Dependency injection** — baking a `db`/service into a function via partial application instead of
  a container (backend).
- **`map`/`filter` adapters** — turning multi-arg functions into the unary functions higher-order
  helpers expect (backend & frontend).
- **Function pipelines** — producing the unary functions that `pipe`/`|>` compose (backend & frontend).

## Related Patterns

- **Function Composition** — currying produces the unary functions composition chains together; the
  two are constant companions in FP.
- **Strategy** — a partially-applied function is a lightweight strategy: a specialized behavior fixed
  with its configuration, ready to pass around.
- **Memoization** — often applied to curried/specialized functions to cache their results per fixed
  configuration.
