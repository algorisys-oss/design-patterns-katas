---
id: memoization
category: functional
sequence: 3
title: Memoization
also_known_as: [Function Caching, Tabling]
gof: false
intent: "Cache the results of a pure function keyed by its arguments, so repeated calls with the same inputs return instantly instead of recomputing."
frequency: high
difficulty: beginner
tags: [functional, caching, performance, purity, tradeoff]
related: [currying, cache-aside, flyweight]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Wrap a **pure** function so that the first time it's called with a given set of arguments it computes
the result and stores it in a cache keyed by those arguments; every later call with the same
arguments returns the stored value. The function's behavior is unchanged — same input, same output —
but repeated work is done once.

It's a classic space-for-time trade: spend memory holding results to avoid recomputing expensive
calculations. Because the function is pure (no side effects, output depends only on input), caching
by input is always safe — the cached value is exactly what recomputing would produce.

## The Problem

Recomputing the same expensive result over and over wastes time:

- **Redundant work** — a costly calculation (a parse, a layout, a Fibonacci-style recursion) is
  called repeatedly with the same inputs, redoing the whole thing each time.
- **Exponential blowups** — naive recursive algorithms (Fibonacci, edit distance) recompute the same
  sub-results an exponential number of times.
- **Repeated derived state** — a UI recomputes a derived value on every render even though its inputs
  didn't change.
- **Hot pure calls** — a pure function on a hot path is called thousands of times a second with a
  small set of distinct arguments.

## Structure

Key Components:

- **Pure function** — the function to cache; its output must depend only on its arguments (no side
  effects), or caching is unsound.
- **Cache** — a map from a key derived from the arguments to the computed result.
- **Key function** — turns the arguments into a cache key (identity for primitives; a serialization
  or structural key for objects).
- **Wrapper** — checks the cache on each call: hit → return stored; miss → compute, store, return.
- **Eviction (optional)** — a size/TTL bound so the cache doesn't grow without limit.

```
call(x) ──► [ memoized ] ──hit──► cached result
                 │ miss
                 ▼
            compute(x) ──► store in cache ──► result
```

## When to Use

- A pure function is expensive and called repeatedly with a limited set of repeated arguments.
- A recursive algorithm recomputes overlapping subproblems (dynamic programming).
- Derived values in a UI should only recompute when their inputs change.
- The set of distinct arguments is small enough (or bounded) that caching pays off.

## Advantages and Disadvantages

### Advantages
- **Speed** — repeated calls become a cache lookup; can turn exponential algorithms into linear.
- **Transparent** — same signature and behavior; callers don't change.
- **Simple** — a wrapper plus a map, for pure functions.

### Disadvantages
- **Memory** — the cache holds results indefinitely unless bounded; unbounded caches leak.
- **Only sound for pure functions** — caching a function with side effects or hidden inputs returns
  wrong/stale results.
- **Key cost & correctness** — turning complex arguments into a correct, cheap cache key is
  non-trivial; a bad key causes false hits or misses.

## Common Mistakes

- **Memoizing an impure function** — caching something that depends on time, randomness, or external
  state returns stale/incorrect values; only memoize pure functions.
- **Unbounded cache** — no size/TTL limit turns memoization into a memory leak on high-cardinality
  inputs; bound it (LRU/TTL).
- **Bad keys for object arguments** — using reference identity when you meant structural equality (or
  a slow/incorrect serialization) causes misses or wrong hits.
- **Memoizing cheap functions** — the cache lookup and memory can cost more than recomputing; measure
  before caching trivial work.

## Key Takeaways

- Cache a pure function's results by its arguments; repeated inputs return instantly.
- Only sound for pure functions — output must depend solely on inputs.
- Bound the cache (size/TTL) unless the input space is genuinely tiny, or it leaks memory.
- The key function is the subtle part: correct and cheap keys make or break it.

## Implementations

### JavaScript

**❌ Naive**

```js
// Exponential recomputation — fib(40) recalculates the same subproblems billions of times.
function fib(n) {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}
```

**✅ Idiomatic**

```js
// A generic memoize wrapper with a keying function; the recursion caches subproblems.
function memoize(fn, keyOf = (...a) => a.join("|")) {
  const cache = new Map();
  return (...args) => {
    const key = keyOf(...args);
    if (cache.has(key)) return cache.get(key);        // hit
    const result = fn(...args);
    cache.set(key, result);                            // store
    return result;
  };
}

const fib = memoize((n) => (n < 2 ? n : fib(n - 1) + fib(n - 2))); // subproblems cached → linear
```

**🧠 Tradeoff** — A `Map`-backed wrapper turns exponential `fib` into linear by caching each `n`
once. It's transparent — same signature — and generic via `keyOf`. In React, `useMemo`/`memo` apply
the same idea to derived values and components. The unshown risks are the usual ones: this cache is
unbounded (fine for `fib`, a leak for high-cardinality inputs) and the default `join` key is wrong
for object arguments.

### Node.js

**❌ Naive**

```js
// Re-parsing/recompiling the same input on every request.
function render(templateSource, data) {
  const compiled = compileTemplate(templateSource); // expensive, repeated for the same source
  return compiled(data);
}
```

**✅ Idiomatic**

```js
// Memoize the expensive compile step, bounded with an LRU to avoid unbounded growth.
const { LRUCache } = require("lru-cache");
const cache = new LRUCache({ max: 500 }); // bound the cache

function render(templateSource, data) {
  let compiled = cache.get(templateSource);
  if (!compiled) {
    compiled = compileTemplate(templateSource); // miss → compute once
    cache.set(templateSource, compiled);
  }
  return compiled(data); // data varies per call; only the compile is memoized
}
```

**🧠 Tradeoff** — Memoizing just the pure, expensive part (compiling the template) with a **bounded**
LRU is the production-safe shape: repeated sources are compiled once, and the cache can't grow
without limit. The important discipline is memoizing only the pure step — `data` changes per call, so
you cache `compiled`, not the rendered output. Bounding is what separates a cache from a leak.

### Python

**❌ Naive**

```python
# Recomputes overlapping subproblems — exponential.
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```

**✅ Idiomatic**

```python
from functools import lru_cache

@lru_cache(maxsize=None)          # bounded caches: pass a real maxsize
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)

# For methods / TTL / custom keys, use cachetools:
#   from cachetools import cached, TTLCache
#   @cached(TTLCache(maxsize=500, ttl=60))
```

**🧠 Tradeoff** — `functools.lru_cache` is Python's built-in, idiomatic memoization: one decorator,
optional `maxsize` bound, and it turns exponential `fib` linear. It requires **hashable** arguments
(that's your key), so it's perfect for pure functions of primitives/tuples. For TTLs, object keys, or
method caching, `cachetools` extends it. The footgun is `maxsize=None` on high-cardinality inputs — a
memory leak.

### Elixir

**❌ Naive**

```elixir
# Recomputing an expensive pure result on every call; processes don't share it either.
def expensive(n), do: heavy_calculation(n)   # redone every call
```

**✅ Idiomatic**

```elixir
# Cache in ETS (shared, fast) — the functional analog of memoization across processes.
def expensive(n) do
  case :ets.lookup(:memo, n) do
    [{^n, result}] -> result                     # hit
    [] ->
      result = heavy_calculation(n)              # miss → compute
      :ets.insert(:memo, {n, result})            # store (shared across processes)
      result
  end
end
# (libraries like Cachex or Nebulex add TTL, LRU, and bounds over ETS)
```

**🧠 Tradeoff** — Elixir data is immutable and processes don't share memory, so "memoization" means a
shared cache in **ETS** (or a GenServer's state), giving cross-process reuse that a plain closure
can't. `Cachex`/`Nebulex` add bounds and TTLs. For within-a-recursion memoization you thread an
accumulator map instead. The functional model reframes memoization as an explicit cache rather than
transparent per-function state — a bit more ceremony, but honest about where the state lives.

### Go

**❌ Naive**

```go
// Recomputes the same expensive result repeatedly.
func fib(n int) int {
    if n < 2 { return n }
    return fib(n-1) + fib(n-2) // exponential
}
```

**✅ Idiomatic**

```go
// A closure captures the cache; sync.Map (or a mutex-guarded map) makes it concurrency-safe.
func Memoize[K comparable, V any](fn func(K) V) func(K) V {
    var cache sync.Map
    return func(k K) V {
        if v, ok := cache.Load(k); ok {
            return v.(V) // hit
        }
        v := fn(k)
        cache.Store(k, v) // store
        return v
    }
}

// For concurrent callers that must compute a missing key exactly once, use singleflight.
```

**🧠 Tradeoff** — Generics give Go a clean, typed `Memoize[K, V]` wrapper, and `sync.Map` makes it
safe under concurrency. For the case where many goroutines miss the same key at once,
`golang.org/x/sync/singleflight` ensures the work runs once (the same tool as cache-aside). Go has no
decorator sugar, so you wrap explicitly, and you own bounding — a plain map/`sync.Map` grows
unbounded, so add an LRU (e.g. `hashicorp/golang-lru`) for open-ended inputs.

### CSharp

**❌ Naive**

```csharp
// Exponential recomputation — Fib(40) makes over a billion recursive calls.
Console.WriteLine(Fib(40));

static long Fib(long n) => n < 2 ? n : Fib(n - 1) + Fib(n - 2);
```

**✅ Idiomatic**

```csharp
using System.Collections.Concurrent;

// A generic memoizer over ConcurrentDictionary — thread-safe, transparent to callers.
Func<long, long> fib = null!;
fib = Memoize<long, long>(n => n < 2 ? n : fib(n - 1) + fib(n - 2));

Console.WriteLine(fib(80)); // 23416728348467685 — subproblems cached once, linear

static Func<TIn, TOut> Memoize<TIn, TOut>(Func<TIn, TOut> fn) where TIn : notnull
{
    var cache = new ConcurrentDictionary<TIn, TOut>();
    return x => cache.GetOrAdd(x, fn); // hit → stored value; miss → compute, store
}
```

**🧠 Tradeoff** — `ConcurrentDictionary.GetOrAdd` gives a thread-safe map-backed memoizer in one
line, and generics keep it typed. C# has no decorator sugar, so you wrap delegates explicitly —
the `null!`-then-assign dance exists so the recursive call goes through the *memoized* `fib`,
not the raw lambda. Two cautions: `GetOrAdd` may run the factory more than once when threads
miss the same key together (wrap values in `Lazy<T>` when compute-once matters), and the cache
is unbounded — reach for `MemoryCache` when inputs are open-ended.

### Rust

**❌ Naive**

```rust
// Recomputes overlapping subproblems — exponential.
fn fib(n: u64) -> u64 {
    if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
```

**✅ Idiomatic**

```rust
use std::collections::HashMap;

// Thread the cache explicitly — ownership makes the memo state visible in the signature.
fn fib(n: u64, memo: &mut HashMap<u64, u64>) -> u64 {
    if n < 2 {
        return n;
    }
    if let Some(&v) = memo.get(&n) {
        return v; // hit
    }
    let v = fib(n - 1, memo) + fib(n - 2, memo);
    memo.insert(n, v); // store
    v
}

fn main() {
    let mut memo = HashMap::new();
    println!("{}", fib(80, &mut memo)); // 23416728348467685 — instant
}
```

**🧠 Tradeoff** — Rust won't let a plain closure quietly mutate a captured cache the way JS
does; a transparent wrapper needs interior mutability (`RefCell`, or `Mutex` across threads).
So idiomatic Rust usually threads `&mut HashMap` through the recursion — more explicit, and the
signature now admits the function carries state, which is honest. The `cached` crate restores
the decorator feel (`#[cached]`) when you want it; for sharing across threads, wrap the map in
`Arc<Mutex<...>>` and you've made the hidden global every other language gave you implicitly.

### Zig

**❌ Naive**

```zig
const std = @import("std");

// Recomputes the same subproblems — exponential.
fn fib(n: u64) u64 {
    if (n < 2) return n;
    return fib(n - 1) + fib(n - 2);
}

pub fn main() void {
    std.debug.print("{d}\n", .{fib(40)});
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// The cache is a HashMap you allocate — and inserting can fail, so fib returns !u64.
fn fib(memo: *std.AutoHashMap(u64, u64), n: u64) !u64 {
    if (n < 2) return n;
    if (memo.get(n)) |v| return v; // hit
    const a = try fib(memo, n - 1);
    const b = try fib(memo, n - 2);
    try memo.put(n, a + b); // store — may allocate, hence `try`
    return a + b;
}

pub fn main() !void {
    var memo = std.AutoHashMap(u64, u64).init(std.heap.page_allocator);
    defer memo.deinit(); // the cache's memory is yours to free

    std.debug.print("{d}\n", .{try fib(&memo, 80)}); // 23416728348467685
}
```

**🧠 Tradeoff** — nothing is hidden: the cache takes an explicit allocator, `put` can fail so
the memoized `fib` returns `!u64` even though the arithmetic can't, and `defer memo.deinit()`
is you paying the memory back. That's the pattern's fine print made visible — memoization always
costs memory somewhere; Zig makes you sign for it. No decorator form exists, and bounding is
also yours. For a small closed domain like this one, plain Zig often skips the map entirely and
fills a fixed `[81]u64` table — cheaper than hashing and impossible to leak.

### Java

**❌ Naive**

```java
// Exponential recomputation — fib(40) makes over a billion recursive calls.
public class Demo {
    static long fib(long n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }

    public static void main(String[] args) {
        System.out.println(fib(40));
    }
}
```

**✅ Idiomatic**

```java
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

public class Demo {
    // The general memoizer: computeIfAbsent is check, compute, and store in one call.
    static <K, V> Function<K, V> memoize(Function<K, V> fn) {
        Map<K, V> cache = new HashMap<>();
        return k -> cache.computeIfAbsent(k, fn); // for non-recursive functions
    }

    // Recursion can't go through computeIfAbsent — the mapping function would re-enter
    // the map mid-update (ConcurrentModificationException). Use the two-step form:
    static final Map<Long, Long> memo = new HashMap<>();

    static long fib(long n) {
        if (n < 2) return n;
        var hit = memo.get(n);
        if (hit != null) return hit;      // hit
        var v = fib(n - 1) + fib(n - 2);  // compute — the recursion finishes before...
        memo.put(n, v);                   // ...the store touches the map
        return v;
    }

    public static void main(String[] args) {
        Function<String, String> slug = memoize(s -> s.toLowerCase().replace(' ', '-'));
        System.out.println(slug.apply("Design Patterns")); // computed once, cached after
        System.out.println(fib(80)); // 23416728348467685 — subproblems cached once, linear
    }
}
```

**🧠 Tradeoff** — `computeIfAbsent` is the built-in memoizer, and on a `ConcurrentHashMap` it's
thread-safe *and* runs the factory at most once per key — the compute-once guarantee C#'s
`GetOrAdd` only gets with `Lazy<T>`. The catch is recursion: the mapping function must not touch
the map, so a recursive `fib` inside `computeIfAbsent` throws (`ConcurrentModificationException`
on `HashMap`, "Recursive update" on `ConcurrentHashMap`) — hence the two-step get/put form above.
Both caches are unbounded; `LinkedHashMap` with `removeEldestEntry` is the standard library's
pocket LRU, and Caffeine is the production answer with size and TTL bounds.

## Applications

- **Dynamic programming** — memoizing overlapping subproblems (Fibonacci, edit distance, knapsack)
  collapses exponential to polynomial (backend).
- **Derived UI state** — `useMemo`/computed values recompute only when inputs change (frontend).
- **Expensive parses/compiles** — template/regex/schema compilation cached by source (backend).
- **Pure request handlers** — caching pure transformations keyed by input on hot paths (backend).
- **Selector libraries** — Reselect memoizes derived state selectors in Redux apps (frontend).

## Related Patterns

- **Cache-Aside** — memoization is cache-aside scoped to one pure function; cache-aside generalizes it
  to a shared store with invalidation across the app.
- **Flyweight** — both trade memory to avoid repeated work/allocation; flyweight shares immutable
  objects, memoization shares computed results.
- **Currying** — memoization is often applied to specialized (curried) functions to cache results per
  fixed configuration.
