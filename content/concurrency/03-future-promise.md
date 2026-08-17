---
id: future-promise
category: concurrency
sequence: 3
title: Future / Promise
also_known_as: [Deferred, Task, Eventual]
gof: false
intent: "Represent a value that isn't ready yet as a first-class object you can pass around, compose, and await — instead of blocking or nesting callbacks."
frequency: high
difficulty: beginner
tags: [concurrency, async, composition, non-blocking, values]
related: [worker-pool, fan-out-fan-in, actor]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Turn "a value that will exist later" into a **thing you can hold now**: a future. You get the
future immediately, keep working, and attach continuations (`then`) or `await` it when you
actually need the value.

A future has a simple lifecycle — *pending* → *fulfilled* (with a value) or *rejected* (with an
error) — and it settles exactly once. That single object is what lets async results be returned,
stored, passed to functions, and combined, the same way ordinary values are.

## The Problem

Without futures, "do this when that finishes" has two bad shapes:

- **Blocking** — call the slow thing and wait. Simple, but the thread/loop is frozen; you can't
  run two slow things at once, and the UI or server stalls.
- **Callbacks** — pass a function to run on completion. Non-blocking, but composition falls
  apart: three dependent steps nest three deep ("callback hell"), error handling scatters across
  every callback, and running several in parallel and collecting results is manual bookkeeping.

Neither gives you a *value* to work with — there's nothing to return from a function, store in a
list, or hand to `map`.

## Structure

Key Components:

- **Future / Promise** — the object standing in for the eventual result; holds state
  (pending/fulfilled/rejected) and the settled value or error.
- **Producer** — the async operation that eventually *resolves* or *rejects* the future.
- **Consumer** — code that attaches a continuation (`then`/`await`) to use the value when ready.
- **Combinators** — `all` / `race` / `gather` that turn many futures into one.

```
  start()                     resolve(v)
Producer ──────► [ Future ] ◄──────────  (pending → fulfilled: v)
                     │
                     └── then(fn) / await ──► Consumer
```

## When to Use

- An operation is asynchronous (I/O, a timer, a remote call) and you want its result as a value.
- You need to run several async operations concurrently and combine their results.
- You want linear, readable async code with unified error handling (`async/await`).
- A function should *return* an async result rather than take a callback.

## Advantages and Disadvantages

### Advantages
- **Composability** — futures chain and combine; `all`/`race` express fan-out and timeouts cheaply.
- **Readable async** — `await` makes concurrent code read top-to-bottom, errors via `try/catch`.
- **First-class** — an async result becomes a value you can return, store, and pass around.

### Disadvantages
- **Hidden concurrency** — `await` in a loop silently serializes; it's easy to lose parallelism.
- **Eager vs lazy** — JS promises start immediately and can't be cancelled cleanly; other
  runtimes differ, and mixing models confuses.
- **Error propagation** — an unobserved rejected promise can vanish silently without handling.

## Common Mistakes

- **Awaiting in a loop when you meant parallel** — `for (const x of xs) await f(x)` runs one at a
  time; use `Promise.all(xs.map(f))` to actually overlap them.
- **Forgetting to await** — dropping the `await` (or the returned promise) means the work runs
  detached, errors go unhandled, and ordering breaks.
- **Swallowing rejections** — no `.catch` / `try` around an await leaves failures silent; always
  handle or propagate.
- **Blocking on a future from the thread that must resolve it** — waiting synchronously on the
  same event loop/thread that would complete the work deadlocks.

## Key Takeaways

- A future is a *value* for a not-yet-ready result — that's what makes async composable.
- `then`/`await` attach continuations without blocking; combinators (`all`, `race`) merge many.
- Concurrency comes from starting work *before* awaiting; `await` in sequence throws it away.
- Every language has one, but the semantics (eager/lazy, cancellable) differ — know your runtime's.

## Implementations

### JavaScript

*Targets modern JavaScript (ES2015+).*

**❌ Naive**

```js
// Callback nesting: dependent steps pyramid, errors handled three times.
getUser(id, (err, user) => {
  if (err) return fail(err);
  getOrders(user, (err, orders) => {
    if (err) return fail(err);
    getTotal(orders, (err, total) => {
      if (err) return fail(err);
      done(total);
    });
  });
});
```

**✅ Idiomatic**

```js
// Promises + async/await: linear reads, one error path, easy parallelism.
async function orderTotal(id) {
  const user = await getUser(id);
  const orders = await getOrders(user);
  return getTotal(orders);
}

// Run independent futures concurrently and combine:
const [a, b] = await Promise.all([orderTotal(1), orderTotal(2)]);
```

**🧠 Tradeoff** — Promises are native and `async/await` makes async read like sync, with
`try/catch` for errors and `Promise.all`/`race` for combining. The sharp edge is that promises
are *eager* (they start when created) and not cancellable — `await` in a loop quietly serializes,
and there's no clean "stop this one." You trade control for ergonomics.

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// Callback-style core APIs pyramid the same way.
const fs = require("node:fs");
fs.readFile("a.txt", "utf8", (err, a) => {
  if (err) throw err;
  fs.readFile("b.txt", "utf8", (err, b) => {
    if (err) throw err;
    done(a + b);
  });
});
```

**✅ Idiomatic**

```js
// The promise APIs + await; run independent reads in parallel.
const fs = require("node:fs/promises");

async function concat() {
  const [a, b] = await Promise.all([
    fs.readFile("a.txt", "utf8"),
    fs.readFile("b.txt", "utf8"),
  ]);
  return a + b;
}
```

**🧠 Tradeoff** — Node ships promise versions of its callback APIs (`fs/promises`,
`util.promisify`), so the whole platform composes with `await`. `Promise.all` here overlaps the
two reads instead of serializing them — the win is real concurrency for I/O with no threads. The
caveat matches browser JS: eager, non-cancellable promises.

### Python

*Targets Python 3.12.*

**❌ Naive**

```python
# Blocking calls run strictly one after another — no overlap on I/O waits.
def order_total(id):
    user = get_user(id)      # blocks
    orders = get_orders(user)  # blocks
    return get_total(orders)   # blocks
```

**✅ Idiomatic**

```python
import asyncio

async def order_total(id):
    user = await get_user(id)
    orders = await get_orders(user)
    return await get_total(orders)

# Futures run concurrently with gather:
async def main():
    a, b = await asyncio.gather(order_total(1), order_total(2))
```

**🧠 Tradeoff** — `asyncio` coroutines are Python's futures: `await` for the linear form,
`asyncio.gather` for concurrency. Unlike JS, coroutines are *lazy* — they don't run until
scheduled on the loop — which makes `create_task`/`gather` the point where concurrency actually
starts. The cost is the two-color split: `async` functions and the loop are their own world you
have to opt into.

### Elixir

*Targets Elixir 1.18.*

**❌ Naive**

```elixir
# Sequential — each call blocks the process before the next starts.
user = get_user(id)
orders = get_orders(user)
get_total(orders)
```

**✅ Idiomatic**

```elixir
# A Task is a future: async starts the work in its own process, await collects it.
task_a = Task.async(fn -> order_total(1) end)
task_b = Task.async(fn -> order_total(2) end)
[a, b] = Task.await_many([task_a, task_b])

# Dependent steps still read linearly — the win is running independent work in parallel.
```

**🧠 Tradeoff** — `Task.async/await` is the future on the BEAM: each task runs in its own cheap
process, and `await_many` collects several in parallel. Because processes are isolated, a crashing
task fails its `await` rather than corrupting the caller — futures with fault isolation built in.
The flip side: a `Task` is tied to its owner process and has an await timeout, so it's for
scoped concurrency, not long-lived background work (use a GenServer for that).

### Go

*Targets Go 1.26.*

**❌ Naive**

```go
// Sequential blocking calls; independent work doesn't overlap.
func orderTotal(id int) int {
    user := getUser(id)
    orders := getOrders(user)
    return getTotal(orders)
}
```

**✅ Idiomatic**

```go
// Go has no Future type — a goroutine writing to a channel IS the future.
func async[T any](fn func() T) <-chan T {
    ch := make(chan T, 1)
    go func() { ch <- fn() }()
    return ch // hold the channel now; receive when you need the value
}

func main() {
    a := async(func() int { return orderTotal(1) })
    b := async(func() int { return orderTotal(2) }) // both run concurrently
    total := <-a + <-b                              // await both
}
```

**🧠 Tradeoff** — Go deliberately omits a `Future` type; the idiom is "start a goroutine, hand
back a channel." A one-element buffered channel *is* a fulfilled-once future, and starting two
before receiving gives you parallelism. It's more explicit than `async/await` — no `then`
chaining, and errors travel as a second channel value or a struct — but it composes with
`select` for timeouts and cancellation via `context`.

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// Blocking, strictly sequential — the two totals never overlap.
var total = OrderTotal(1) + OrderTotal(2);
Console.WriteLine(total);

static int OrderTotal(int id)
{
    var user = GetUser(id);       // blocks
    var orders = GetOrders(user); // blocks
    return GetTotal(orders);      // blocks
}
```

**✅ Idiomatic**

```csharp
// Task IS the future: it starts hot, and await attaches the continuation.
var a = OrderTotalAsync(1);
var b = OrderTotalAsync(2);            // both already running
var totals = await Task.WhenAll(a, b); // the `all` combinator
Console.WriteLine(totals[0] + totals[1]);

static async Task<int> OrderTotalAsync(int id)
{
    var user = await GetUserAsync(id);
    var orders = await GetOrdersAsync(user);
    return await GetTotalAsync(orders);
}

// Wrapping a callback API? TaskCompletionSource is the promise's producer half:
//   var tcs = new TaskCompletionSource<int>();
//   legacyApi.OnDone(result => tcs.SetResult(result));
//   int value = await tcs.Task;
```

**🧠 Tradeoff** — `Task` is the future, and it's *hot* like a JS promise — running the
moment it exists — but unlike JS it's cancellable via `CancellationToken`, and
`Task.WhenAll`/`WhenAny` are `all`/`race`. When you're wrapping a callback API,
`TaskCompletionSource` is the producer half: hold the source, hand out its `Task`, settle
it once. The classic hazard is sync-over-async — `.Result` or `.Wait()` on a context thread
is exactly the "blocking the thread that must resolve it" deadlock from Common Mistakes.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// Sequential blocking calls; the two independent totals never overlap.
fn order_total(id: u32) -> u32 {
    let user = get_user(id);
    let orders = get_orders(user);
    get_total(orders)
}

fn main() {
    let total = order_total(1) + order_total(2); // one after the other
    println!("total: {total}");
}
```

**✅ Idiomatic**

```rust
use std::thread;

// In dependency-free Rust the future is a JoinHandle: spawn starts the work,
// join() is the await.
fn spawn_total(id: u32) -> thread::JoinHandle<u32> {
    thread::spawn(move || order_total(id))
}

fn main() {
    let a = spawn_total(1);
    let b = spawn_total(2); // both threads run concurrently
    let total = a.join().unwrap() + b.join().unwrap(); // await both
    println!("total: {total}");
}
```

**🧠 Tradeoff** — Rust has `async`/`await` and a `Future` trait, but std ships no executor:
without a runtime crate (tokio, smol) an async fn never runs, so the honest std future is a
thread and its `JoinHandle` — eager like a JS promise, joined exactly once, and a panic
comes back as `join`'s `Err` instead of vanishing. Know the twist before reaching for real
async: Rust futures are *lazy* — they do nothing until polled — the exact opposite of JS.
And when you need the resolve-by-hand half, a one-shot `mpsc` channel plays the promise.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

// Blocking and strictly sequential — the second total waits on the first.
pub fn main() void {
    const a = orderTotal(1);
    const b = orderTotal(2);
    std.debug.print("total: {d}\n", .{a + b});
}

fn orderTotal(id: u32) u32 {
    const user = getUser(id);
    const orders = getOrders(user);
    return getTotal(orders);
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// std ships the future now, behind the Io capability: async starts, await joins.
fn orderTotal(id: u32) u32 {
    const user = getUser(id);
    const orders = getOrders(user);
    return getTotal(orders);
}

pub fn main(init: std.process.Init) !void {
    const io = init.io; // the concurrency capability — passed explicitly, like an allocator

    var a = io.async(orderTotal, .{1}); // start — pending
    var b = io.async(orderTotal, .{2}); // both in flight

    const total = a.await(io) + b.await(io); // await: blocks until the result is ready
    std.debug.print("total: {d}\n", .{total});
}
```

**🧠 Tradeoff** — Zig grew a real future in 0.17-dev, but behind the `std.Io` capability:
`io.async` starts the work, `await` and `cancel` settle it, and every one of those calls
takes the `io` you were handed — concurrency is something the caller grants you, exactly
like an allocator. The type hides nothing: `Future(u32)` is a pending handle plus the
result slot, the same two parts you'd wire by hand with `std.Thread.spawn` and a `*u32`.
One honest subtlety: `async` means *may* run concurrently — the runtime is free to run it
inline — while `io.concurrent` demands real parallelism or fails. A fallible task makes
the future's slot an error union, and "many futures at once" is `std.Io.Group` — or the
worker pool from kata 01.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// Blocking, strictly sequential — the two totals never overlap.
class Demo {
    public static void main(String[] args) {
        var total = orderTotal(1) + orderTotal(2); // one after the other
        System.out.println(total);
    }

    static int orderTotal(int id) {
        var user = getUser(id);       // blocks
        var orders = getOrders(user); // blocks
        return getTotal(orders);      // blocks
    }
}
```

**✅ Idiomatic**

```java
import java.util.concurrent.CompletableFuture;

// CompletableFuture is the future: it starts hot, and then* attaches continuations.
class Demo {
    public static void main(String[] args) {
        var a = orderTotalAsync(1);
        var b = orderTotalAsync(2);                                // both already running
        System.out.println(a.thenCombine(b, Integer::sum).join()); // await both
    }

    // supplyAsync starts the work; thenCompose chains the dependent async steps.
    static CompletableFuture<Integer> orderTotalAsync(int id) {
        return CompletableFuture.supplyAsync(() -> getUser(id))
                .thenCompose(user -> CompletableFuture.supplyAsync(() -> getOrders(user)))
                .thenApply(Demo::getTotal);
    }

    // Wrapping a callback API? CompletableFuture is its own promise half:
    //   var cf = new CompletableFuture<Integer>();
    //   legacyApi.onDone(cf::complete);
    //   int value = cf.join();
}
```

**🧠 Tradeoff** — `CompletableFuture` is both halves in one class: the future (`join`,
`allOf`/`anyOf` as `all`/`race`, `orTimeout` for deadlines) and the promise
(`complete`/`completeExceptionally`) — where JS hides the resolver inside the constructor
and C# splits `Task` from `TaskCompletionSource`. Like a JS promise it's hot, starting on
the common pool the moment it exists. Java has no `async`/`await`, so composition stays
method chaining — `thenApply`/`thenCompose` are the callbacks flattened, not removed.
Virtual threads (Java 21) undercut the whole style: when blocking parks a cheap virtual
thread, the naive sequential code above — run on two virtual threads — often reads better
than the chain. Keep `CompletableFuture` for its combinators, not to avoid blocking.

## Applications

- **HTTP clients** — every `fetch`/`http` call returns a future; combinators run several requests
  at once and race timeouts (frontend & backend).
- **UI data loading** — components await data futures and render loading/error/loaded states
  from the future's lifecycle (frontend).
- **Parallel aggregation** — fan out calls to several services and `all`/`gather` their results
  into one response (backend).
- **Deferred computation** — hand a future to code that will need the value later, without
  forcing it to be computed now (frontend & backend).
- **Timeouts & fallbacks** — `race` a work future against a timer future to bound latency
  (backend).

## Related Patterns

- **Worker Pool** — pools typically hand back one future per submitted task, so callers `await`
  results without knowing about the workers.
- **Fan-out / Fan-in** — fan-out starts many futures; fan-in is `all`/`gather` collecting them.
- **Actor** — an actor's request/reply (`call`) returns a future for the reply while the actor
  keeps processing other messages.
