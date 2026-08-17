---
id: golden-hammer
category: anti-patterns
kind: anti-pattern
sequence: 3
title: Golden Hammer
also_known_as: [Law of the Instrument, "If all you have is a hammer…"]
gof: false
intent: "Over-relying on one familiar tool, pattern, or technology for every problem — reaching for what you know instead of what fits, so solutions get forced into the wrong shape."
frequency: high
difficulty: beginner
tags: [anti-pattern, tooling, judgment, over-engineering, fit]
related: [strategy, premature-optimization, singleton]
languages: [javascript, python, go, csharp, rust, zig, java]
---

## The Anti-Pattern

"When all you have is a hammer, everything looks like a nail." The **Golden Hammer** is the habit of
applying one favored tool — a language, a framework, a design pattern, a database — to **every** problem,
regardless of whether it fits. The tool becomes the default answer before the question is even understood.

It's a failure of judgment, not of the tool. The tool may be excellent for its purpose; the anti-pattern is
using it *outside* that purpose because it's familiar. The result is solutions bent into awkward shapes:
a graph problem forced into SQL joins, a simple script dragged into a heavyweight framework, a design
pattern applied where a plain function would do.

## How It Happens

- **Familiarity bias** — you know the tool deeply, so reaching for it is fast and comfortable, and learning
  an alternative feels expensive.
- **Sunk-cost & investment** — the team has invested in the tool (licenses, expertise, infrastructure), so
  everything must justify using it.
- **Resume-driven / hype-driven** — a shiny technology (microservices, Kubernetes, a new framework) is
  applied everywhere because it's exciting, not because it fits.
- **Pattern zealotry** — having just learned a design pattern, applying it to everything (the "pattern
  happy" phase).

## Why It Hurts

- **Poor fit, accidental complexity** — forcing the problem into the wrong tool's model adds workarounds and
  complexity that the right tool wouldn't need.
- **Worse performance/cost** — the ill-fitting tool is slower, more expensive, or more fragile for this job.
- **Blind spots** — over-relying on one approach means you don't see simpler or better solutions.
- **Over-engineering** — a heavyweight tool for a lightweight problem buries a simple need under machinery.
- **Stagnation** — the team never learns alternatives, so the Golden Hammer becomes the only tool they *can*
  reach for.

## The Refactor

Match the tool to the problem:

- **Understand the problem first** — characterize the actual requirements before choosing a tool, not after.
- **Consider alternatives** — deliberately list a couple of different approaches and their trade-offs, even
  if you expect to pick the familiar one.
- **Right-size the solution** — a plain function instead of a pattern; a file instead of a database; a script
  instead of a framework — when that's what the problem needs.
- **Expand the toolbox** — invest in learning complementary tools so "what I know" and "what fits" overlap
  more often.

```
Familiar Tool ──force-fit──► "queue problem" · "cache problem" · "graph problem"
   (one hammer)               ──► instead: pick the tool that matches each problem
```

## Warning Signs

- Every design discussion ends with the same technology, regardless of the problem.
- Solutions have awkward workarounds to make the chosen tool "kind of" work.
- "We use X for everything" stated with pride rather than justification.
- Reaching for a pattern/framework before understanding the requirement.
- The team can't articulate when they *wouldn't* use their default tool.

## Key Takeaways

- The Golden Hammer applies one familiar tool to every problem regardless of fit.
- It's a judgment failure, not a tool failure — the tool may be great, just misapplied.
- The result is forced solutions, accidental complexity, and blind spots.
- Understand the problem, weigh alternatives, and right-size the solution — sometimes the answer is a plain
  function.

## Implementations

### JavaScript

**❌ The Smell**

```js
// Reaching for a heavyweight state-management library for trivial local UI state.
import { configureStore, createSlice } from "@reduxjs/toolkit"; // for... a toggle?
const modalSlice = createSlice({
  name: "modal",
  initialState: { open: false },
  reducers: { toggle: (s) => { s.open = !s.open; } },
});
const store = configureStore({ reducer: { modal: modalSlice.reducer } });
// ...actions, dispatch, selectors, a provider — all to open a modal
```

**✅ The Refactor**

```js
// The right-sized tool: local component state.
function Modal() {
  const [open, setOpen] = useState(false); // that's it
  return open ? <Dialog onClose={() => setOpen(false)} /> : <button onClick={() => setOpen(true)}>Open</button>;
}
// Reach for Redux/Zustand when state is genuinely shared and complex — not for a toggle.
```

**🧠 The Fix** — Redux is a fine tool *for shared, complex application state*; using it for a modal toggle is
the Golden Hammer — ceremony and indirection for a one-line `useState`. The fix isn't "never use Redux," it's
matching the tool to the need: local state for local concerns, a store when state is actually shared. Ask
"what does this problem need?" before "what do I always use?".

### Python

**❌ The Smell**

```python
# Spinning up pandas + a DataFrame to sum a short list of numbers.
import pandas as pd
def total(prices):
    df = pd.DataFrame({"price": prices})   # a whole DataFrame...
    return df["price"].sum()               # ...to add a few numbers
```

**✅ The Refactor**

```python
# The right-sized tool: the standard library.
def total(prices):
    return sum(prices)   # done

# pandas is superb for real tabular/analytical work — importing it to sum a list is the hammer.
```

**🧠 The Fix** — pandas is the right tool for real dataframes and analytics; reaching for it to `sum` a short
list adds a heavyweight dependency and object churn for something `sum()` does. The anti-pattern is defaulting
to the powerful familiar tool regardless of scale. Right-size: the standard library for small jobs, pandas
when the data and operations actually warrant it.

### Go

**❌ The Smell**

```go
// Standing up a full microservice (HTTP server, Docker, deploy) for a nightly cron task.
func main() {
    http.HandleFunc("/run", runJob)      // a whole service...
    http.ListenAndServe(":8080", nil)    // ...triggered by an external scheduler hitting it
}
// plus a Dockerfile, k8s manifests, CI pipeline, health checks — for one nightly job
```

**✅ The Refactor**

```go
// The right-sized tool: a plain program run by cron/a scheduler.
func main() {
    if err := runJob(context.Background()); err != nil {
        log.Fatal(err)
    }
}
// build a binary; a cron entry or a scheduled job runs it. No server, no k8s, no HTTP.
```

**🧠 The Fix** — Microservices and Kubernetes are the right tools for independently-scaled, long-running
services; wrapping a nightly batch job in an HTTP service plus container orchestration is the Golden Hammer —
enormous operational overhead for a task a cron-run binary handles. The fix is right-sizing: a scheduled
program for a scheduled job. Reach for the service architecture when the problem is actually a service.

### CSharp

**❌ The Smell**

```csharp
// An interface, a class, and a DI registration — to sum a list of prices.
public interface ITotalCalculator
{
    decimal Total(IEnumerable<decimal> prices);
}

public sealed class TotalCalculator : ITotalCalculator
{
    public decimal Total(IEnumerable<decimal> prices) => prices.Sum();
}

// Program.cs
builder.Services.AddScoped<ITotalCalculator, TotalCalculator>();
// ...then injected through two constructors to reach the one line that uses it
```

**✅ The Refactor**

```csharp
// The right-sized tool: call Sum where you need it.
var total = cart.Items.Sum(i => i.Price);

// An interface earns its keep at a real seam — a payment gateway you fake in
// tests, a storage backend with two implementations. A pure one-line calculation
// isn't a seam; it's just an expression.
```

**🧠 The Fix** — "Interface for everything" is C#'s house Golden Hammer, trained in by DI-container habits:
one implementation, one mechanical `I`-prefixed twin, registration ceremony, and an extra indirection for
every reader — with nothing bought, since a pure calculation needs no faking. The fix isn't "never write
interfaces"; it's writing them at real seams (I/O, external services, genuine polymorphism) and letting plain
code be plain. If the interface will only ever have one implementation and no test needs to swap it, delete it.

### Rust

**❌ The Smell**

```rust
// A trait, a generic, and a lifetime — to add up a list of prices.
trait Summable {
    fn value(&self) -> u32;
}

impl Summable for u32 {
    fn value(&self) -> u32 { *self }
}

fn total<'a, T, I>(items: I) -> u32
where
    T: Summable + 'a,
    I: IntoIterator<Item = &'a T>,
{
    items.into_iter().map(|i| i.value()).sum()
}
// ...called from exactly one place, with exactly one type
```

**✅ The Refactor**

```rust
// The right-sized tool: a slice and the standard library.
fn total(prices: &[u32]) -> u32 {
    prices.iter().sum()
}

// Generics and traits are for real variation — a second item type that exists
// today, not one you imagine. One call site with one type is just a function.
```

**🧠 The Fix** — Rust's Golden Hammer is abstraction that costs nothing at runtime, so nothing pushes back:
"zero-cost" traits and generics still charge for reading, compiling, and error messages, and the type-system
puzzle is fun enough that the machinery gets built before the second use case exists. The honest test is
variation you can point at — a second implementor, today. Until then, take the concrete type; when the second
type genuinely arrives, the borrow checker makes the mechanical generalization safe to do late.

### Zig

*Targets Zig 0.17-dev.*

**❌ The Smell**

```zig
// Comptime generics and a strategy struct — to add up a list of prices.
fn Totaler(comptime T: type, comptime Weigher: type) type {
    return struct {
        weigher: Weigher,
        pub fn total(self: @This(), items: []const T) T {
            var t: T = 0;
            for (items) |item| t += self.weigher.weight(item);
            return t;
        }
    };
}

const Identity = struct {
    pub fn weight(_: Identity, item: u32) u32 {
        return item;
    }
};
// ...instantiated once, with one type, and a "weigher" that does nothing
```

**✅ The Refactor**

```zig
// The right-sized tool: a loop.
fn total(prices: []const u32) u32 {
    var t: u32 = 0;
    for (prices) |p| t += p;
    return t;
}

// comptime earns its keep when types genuinely vary — one function stamped out
// for many concrete types. One instantiation is just a function with extra steps.
```

**🧠 The Fix** — `comptime` is Zig's Golden Hammer: it's the language's signature feature, it's genuinely
powerful, and that's exactly why it gets reached for before the problem asks for it. A type-returning function
with one instantiation is a plain function wearing a costume — harder to read, harder to grep, same machine
code. Zig's own culture backs the fix: the standard library keeps things concrete until multiple types force
the issue, and so should you. Ask for the second instantiation; if it doesn't exist, neither should the generic.

### Java

**❌ The Smell**

```java
// An interface, an abstract base, a subclass, and a factory — to sum a list of prices.
interface TotalStrategy {
    int total(List<Integer> prices);
}

abstract class AbstractTotalCalculator implements TotalStrategy {
    protected abstract int weight(int price);      // a hook nobody varies

    public int total(List<Integer> prices) {
        int t = 0;
        for (int p : prices) t += weight(p);
        return t;
    }
}

class DefaultTotalCalculator extends AbstractTotalCalculator {
    protected int weight(int price) { return price; }
}

class TotalCalculatorFactory {
    static TotalStrategy create() { return new DefaultTotalCalculator(); } // only one, ever
}
// ...one implementation of everything, called from exactly one place
```

**✅ The Refactor**

```java
// The right-sized tool: the standard library.
int total = prices.stream().mapToInt(Integer::intValue).sum();

// A strategy earns its keep when behavior actually varies — a second calculator
// that exists today. Until then, a pure calculation is just an expression.
```

**🧠 The Fix** — Java's Golden Hammer is the abstraction layer cake — the reflex that gave the world
Spring's real `AbstractSingletonProxyFactoryBean`. The GoF vocabulary is so at home in Java that
Abstract/Factory/Strategy scaffolding goes up before anyone asks whether behavior varies, and every layer
with one implementation is pure reading tax. Modern Java already dissolved most of the ceremony: a lambda
is a strategy, a stream is the template method's loop. Keep the patterns for real variation — a second
implementor you can point at today — and when an abstract base has one subclass, inline it.

## Related Patterns

- **Strategy** — the constructive opposite: instead of one hammer, define a family of interchangeable
  approaches and pick the one that fits the situation.
- **Premature Optimization** — a sibling judgment failure: applying effort (there, optimization; here, a
  heavyweight tool) before the problem justifies it.
- **Singleton** — often a Golden Hammer in the design-pattern world: reached for reflexively where a plain
  value or dependency injection would serve better.
