---
id: function-composition
category: functional
sequence: 4
title: Function Composition
also_known_as: [Pipelines, Pipe, Compose]
gof: false
intent: "Build complex behavior by chaining small, single-purpose functions into a pipeline where each one's output feeds the next — instead of one large function or deeply nested calls."
frequency: high
difficulty: beginner
tags: [functional, composition, pipeline, reusability, readability]
related: [currying, option-result, decorator]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Write many **small, focused functions** and combine them so data flows through them in order:
`h(g(f(x)))`, or read left-to-right as a **pipeline** `x |> f |> g |> h`. Each function does one
transformation and knows nothing about the others; composition wires them into the whole.

The value is that behavior becomes a *sequence you can read* and *parts you can reuse*. Each step is
independently testable and swappable, and building a new flow is rearranging small pieces rather than
editing a monolith. It's "small functions, composed" — the functional counterpart to building objects
from small collaborators.

## The Problem

The alternatives to composition are a monolith or a nesting pyramid:

- **One giant function** — a single function that parses, validates, transforms, and formats is hard
  to read, test, and reuse; changing one stage risks the others.
- **Nested calls** — `format(validate(parse(normalize(input))))` reads inside-out, right-to-left, the
  opposite of the order things happen.
- **Temporary-variable sprawl** — `const a = f(x); const b = g(a); const c = h(b);` works but is
  noisy and invents names for every intermediate.
- **No reuse** — logic welded into a big function can't be lifted out and used elsewhere.

## Structure

Key Components:

- **Small functions** — each a single transformation, ideally pure and unary (one input, one output).
- **Compose / Pipe** — the combinator: `compose(h, g, f)` (math order) or `pipe(f, g, h)`
  (left-to-right reading order) produces one function.
- **Data flow** — the output type of each function matches the input type of the next.
- **Pipeline** — the composed function; call it with the initial value to run all stages.

```
Input x ──► f ──f(x)──► g ──g(f(x))──► h ──► Output
      pipe(f, g, h)(x)  =  h(g(f(x)))   (one reusable function)
```

## When to Use

- A transformation naturally decomposes into ordered, independent stages.
- You want each stage testable and reusable on its own.
- Nested calls or a big function have become hard to read or change.
- The stages line up type-wise (each output feeds the next input).

## Advantages and Disadvantages

### Advantages
- **Readable** — a pipeline reads top-to-bottom in execution order.
- **Reusable & testable** — each small function stands alone; flows are recombinations.
- **Easy to extend** — insert, remove, or reorder a stage without touching the others.

### Disadvantages
- **Type/shape alignment** — each step's output must match the next's input; mismatches need adapters.
- **Debugging mid-pipeline** — inspecting the value between stages is less obvious than with named
  temporaries.
- **Point-free excess** — composing everything to avoid naming can become cryptic; some steps read
  better named.

## Common Mistakes

- **Composing functions with side effects** — hidden effects make a pipeline's behavior depend on
  order and context, defeating the reasoning benefit; keep stages pure (or isolate effects).
- **Steps that don't line up** — forcing mismatched shapes together with ad-hoc adapters inside the
  pipeline; design the stage signatures to chain.
- **Over-composing into unreadable point-free code** — a wall of `compose(a, b, c, d, e)` with no
  names hurts more than it helps; name meaningful sub-pipelines.
- **Confusing compose vs. pipe order** — `compose` runs right-to-left, `pipe` left-to-right; mixing
  them silently reverses your pipeline.

## Key Takeaways

- Combine small, single-purpose functions so each one's output feeds the next.
- `pipe(f, g, h)` reads in execution order; `compose(h, g, f)` is the math (inside-out) order.
- Keep stages pure and shape-aligned so the pipeline is easy to reason about and rearrange.
- It's the functional way to build big behavior from small, reusable, testable parts.

## Implementations

### JavaScript

*Targets modern JavaScript (ES2015+).*

**❌ Naive**

```js
// Nested, inside-out calls — read right-to-left, hard to extend.
const slug = format(dedupe(lowercase(trim(input))));
```

**✅ Idiomatic**

```js
// pipe reads left-to-right in execution order; each step is small and reusable.
const pipe = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);

const trim = (s) => s.trim();
const lowercase = (s) => s.toLowerCase();
const dedupe = (s) => s.replace(/\s+/g, " ");
const slugify = (s) => s.replace(/\s/g, "-");

const toSlug = pipe(trim, lowercase, dedupe, slugify); // one reusable function
toSlug("  Hello   World  "); // "hello-world"
```

**🧠 Tradeoff** — A one-line `pipe` (reduce over the functions) turns the inside-out nest into a
readable, reusable `toSlug` built from tiny testable parts, and adding a stage is inserting one name.
Ramda/lodard-fp provide `pipe`/`compose`; the TC39 pipeline operator (`|>`) may make it native. Keep
the stages pure — a side-effecting step makes the pipeline's result depend on hidden context.

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// A monolith handler doing every stage inline.
async function handle(req) {
  const body = await parseBody(req);
  const clean = sanitize(body);
  const valid = validate(clean);
  if (!valid.ok) throw valid.error;
  return persist(valid.value); // one big function; stages not reusable
}
```

**✅ Idiomatic**

```js
// Compose async stages into a pipeline; reuse stages across routes.
const pipeAsync = (...fns) => (x) => fns.reduce((p, fn) => p.then(fn), Promise.resolve(x));

const handle = pipeAsync(
  parseBody,
  sanitize,
  validateOrThrow,
  persist,
); // each stage is a small, testable unit reused across endpoints
```

**🧠 Tradeoff** — An async `pipe` (reduce with `.then`) composes the request stages into one flow
that reads as a list of steps and lets you reuse `sanitize`/`validate` across routes. It's the
functional cousin of Express middleware. The care points are error handling (a rejected stage
short-circuits the chain — pair with Result if you want explicit branches) and keeping stages free of
hidden effects.

### Python

*Targets Python 3.12.*

**❌ Naive**

```python
# Nested calls or a stack of temporaries.
result = format_output(validate(transform(parse(raw))))
```

**✅ Idiomatic**

```python
from functools import reduce

def pipe(*fns):
    return lambda x: reduce(lambda acc, fn: fn(acc), fns, x)

parse      = lambda s: s.strip()
transform  = lambda s: s.lower()
validate   = lambda s: s if s else "n/a"
clean      = pipe(parse, transform, validate)   # one reusable function
clean("  HELLO  ")  # "hello"

# for data pipelines, generator composition and toolz.compose/pipe are idiomatic too:
#   from toolz import pipe as tpipe
#   tpipe(raw, parse, transform, validate)
```

**🧠 Tradeoff** — A `reduce`-based `pipe` gives Python readable composition, and `toolz` provides
`compose`/`pipe` plus lazy, composable data pipelines. Python's method chaining (pandas, string
methods) and generator composition express the same idea idiomatically for data work. Deeply
point-free style is less Pythonic than named steps, so compose meaningful chunks and name them.

### Elixir

*Targets Elixir 1.18.*

**❌ Naive**

```elixir
# Nested calls read inside-out; awkward to follow or extend.
format_output(validate(transform(parse(raw))))
```

**✅ Idiomatic**

```elixir
# The pipe operator |> is function composition as first-class syntax.
raw
|> parse()
|> transform()
|> validate()
|> format_output()

# reusable composed function via Function composition or a plain def:
process = fn input ->
  input |> parse() |> transform() |> validate()
end
```

**🧠 Tradeoff** — Elixir's `|>` operator makes composition the *default* way to write code: data flows
top-to-bottom through small functions, each taking the previous result as its first argument. It's
the language's signature idiom and reads beautifully. The constraint is the "data first" convention —
functions must take the piped value as the first argument — which shapes how you design APIs, and
`|>` composes at the call site rather than producing a reusable composed function (wrap in a `def`/
closure for that).

### Go

*Targets Go 1.26.*

**❌ Naive**

```go
// Nested calls or a chain of intermediate variables.
out := format(validate(transform(parse(raw))))
```

**✅ Idiomatic**

```go
// A generic Pipe composes unary functions of the same type into one.
func Pipe[T any](fns ...func(T) T) func(T) T {
    return func(x T) T {
        for _, fn := range fns {
            x = fn(x)
        }
        return x
    }
}

clean := Pipe(strings.TrimSpace, strings.ToLower, dedupe) // one reusable func
clean("  Hello  ") // "hello"
```

**🧠 Tradeoff** — Generics let Go express a typed `Pipe` for same-type stages, and it reads cleanly
for string/data transforms. Go's static typing makes heterogeneous pipelines (each stage a different
type) awkward — you'd need per-shape helpers or interfaces — so idiomatic Go often prefers explicit
sequential statements for clarity over clever composition. Where the stages share a type, `Pipe` is
tidy; where they don't, plain code wins.

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// Nested, inside-out calls — read right-to-left, hard to extend.
var slug = Slugify(Dedupe(Lowercase(Trim(input))));
```

**✅ Idiomatic**

```csharp
// A two-line Then extension composes delegates left-to-right.
Func<string, string> trim = s => s.Trim();
Func<string, string> lowercase = s => s.ToLower();
Func<string, string> dedupe = s => string.Join(" ", s.Split(' ', StringSplitOptions.RemoveEmptyEntries));
Func<string, string> slugify = s => s.Replace(' ', '-');

var toSlug = trim.Then(lowercase).Then(dedupe).Then(slugify); // one reusable delegate
Console.WriteLine(toSlug("  Hello   World  ")); // hello-world

static class FuncExtensions
{
    public static Func<A, C> Then<A, B, C>(this Func<A, B> f, Func<B, C> g) => x => g(f(x));
}
```

**🧠 Tradeoff** — C# has no pipe operator, but delegates plus a two-line `Then` extension give you
typed composition that reads in execution order — and because `Then` is generic over three types, the
stages don't have to share a shape; the compiler checks each output feeds the next input. Method
chaining is C#'s native pipeline, and for sequences LINQ (`.Where().Select()`) is usually what you
want instead. Explicit `Func` composition earns its place when the pipeline itself is a value you
store, pass, or build from configuration.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// Nested, inside-out calls — read right-to-left.
let slug = slugify(lowercase(trim(input)));
```

**✅ Idiomatic**

```rust
// When the pipeline itself must be a value, compose closures:
fn compose<A, B, C>(f: impl Fn(A) -> B, g: impl Fn(B) -> C) -> impl Fn(A) -> C {
    move |x| g(f(x))
}

fn main() {
    // Everyday Rust composes by method chaining — the pipeline is built in:
    let chained: String = "  Hello   World  ".to_lowercase().split_whitespace().collect::<Vec<_>>().join("-");
    println!("{chained}"); // hello-world

    let trim = |s: String| s.trim().to_string();
    let lowercase = |s: String| s.to_lowercase();
    let slugify = |s: String| s.split_whitespace().collect::<Vec<_>>().join("-");

    let to_slug = compose(compose(trim, lowercase), slugify); // one reusable closure
    println!("{}", to_slug("  Hello   World  ".to_string())); // hello-world
}
```

**🧠 Tradeoff** — method chaining *is* Rust's pipeline: string methods and iterator adapters already
read left-to-right, so most Rust code never writes `compose`. When you do need the pipeline as a
value, a generic `compose` monomorphizes each nesting to zero-cost code — but Rust has no variadic
compose without a macro, so deep pipelines nest the calls. Storing swappable stages in a `Vec` forces
`Box<dyn Fn(String) -> String>`, trading the zero-cost dispatch for runtime flexibility. Ownership is
the extra care point: stages that take `String` by value move it through the chain, which is exactly
what a pipeline wants.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// Nested calls work, but read inside-out — the opposite of execution order.
const out = slugify(lowercase(trim(&buf)));
```

**✅ Idiomatic**

```zig
const std = @import("std");

// No closures in Zig — stages are function pointers sharing one signature.
// These transform a caller-owned buffer in place, so no allocator is needed.
const Stage = *const fn ([]u8) []u8;

fn pipe(stages: []const Stage, buf: []u8) []u8 {
    var s = buf;
    for (stages) |stage| s = stage(s);
    return s;
}

fn trim(s: []u8) []u8 {
    var a: usize = 0;
    var b: usize = s.len;
    while (a < b and s[a] == ' ') a += 1;
    while (b > a and s[b - 1] == ' ') b -= 1;
    return s[a..b];
}

fn lowercase(s: []u8) []u8 {
    for (s) |*c| c.* = std.ascii.toLower(c.*);
    return s;
}

fn slugify(s: []u8) []u8 {
    for (s) |*c| {
        if (c.* == ' ') c.* = '-';
    }
    return s;
}

pub fn main() void {
    var buf = "  Hello World  ".*; // copy the literal into a mutable array
    const stages = [_]Stage{ trim, lowercase, slugify };
    const out = pipe(&stages, &buf);
    std.debug.print("{s}\n", .{out}); // hello-world
}
```

**🧠 Tradeoff** — be honest about the limits: without closures, every stage must share one signature
and can't capture configuration, and transforming a buffer in place gives up purity — the original is
overwritten, which is composition's shape without immutability's guarantees. What Zig buys is a
pipeline that's a plain array of function pointers — data you can build at runtime — with zero hidden
allocation. For heterogeneous stages, a comptime tuple of functions walked with `inline for` composes
at compile time with no indirection. But often the most idiomatic Zig is neither: just call the
functions in sequence and let the reader see every step.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// Nested, inside-out calls — read right-to-left, hard to extend.
var slug = slugify(dedupe(lowercase(trim(input))));
```

**✅ Idiomatic**

```java
import java.util.function.Function;

public class Demo {
    public static void main(String[] args) {
        Function<String, String> trim = String::trim;
        Function<String, String> lowercase = String::toLowerCase;
        Function<String, String> dedupe = s -> s.replaceAll("\\s+", " ");
        Function<String, String> slugify = s -> s.replace(' ', '-');

        // andThen reads left-to-right in execution order; compose is the math order.
        var toSlug = trim.andThen(lowercase).andThen(dedupe).andThen(slugify);
        System.out.println(toSlug.apply("  Hello   World  ")); // hello-world

        // stages needn't share a type — the compiler checks each output feeds the next input:
        var slugLength = toSlug.andThen(String::length);
        System.out.println(slugLength.apply("  Hello   World  ")); // 11
    }
}
```

**🧠 Tradeoff** — Java shipped this pattern in the standard library: `Function.andThen` is `pipe` and
`compose` is the math order, so there's no combinator to write — method references chain in execution
order, and the generic signatures let stages change type along the way. For sequences, Streams
(`map`/`filter`/`collect`) are Java's native pipeline and usually the better fit. Explicit `Function`
composition earns its place when the pipeline itself is a value you store, pass, or assemble from
configuration; the `.apply(...)` at each call site is the small tax Java charges for not having a
pipe operator.

## Applications

- **Data transformation** — parse → normalize → validate → format pipelines for input processing
  (backend & frontend).
- **Middleware chains** — HTTP middleware, stream transforms, and interceptors compose small handlers
  (backend).
- **Reactive/stream operators** — RxJS/Elixir Stream pipelines chain `map`/`filter`/`reduce`-style
  operators (frontend & backend).
- **Build & ETL pipelines** — each stage a composable transformation over records (backend).
- **UI derivation** — deriving view data through a chain of selectors/formatters (frontend).

## Related Patterns

- **Currying & Partial Application** — supplies the unary functions composition needs, and specializes
  stages before composing them.
- **Option / Result** — composing fallible steps uses `map`/`andThen` so a pipeline short-circuits on
  the first failure.
- **Decorator** — a functional cousin: composing behavior by wrapping, where each layer adds to the
  next rather than transforming a data value.
