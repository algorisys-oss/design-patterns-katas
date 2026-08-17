---
id: fan-out-fan-in
category: concurrency
sequence: 6
title: Fan-out / Fan-in
also_known_as: [Scatter–Gather, Map–Reduce (in the small)]
gof: false
intent: "Split independent work across many concurrent workers (fan-out), then merge their results back into one stream (fan-in)."
frequency: high
difficulty: intermediate
tags: [concurrency, parallelism, scatter-gather, pipeline, merge]
related: [worker-pool, future-promise, producer-consumer]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Take a batch of independent items, **fan out** — hand each to a concurrent worker so they run in
parallel — and then **fan in** — collect every result into a single stream or list.

It's the small-scale shape of map–reduce: the "map" runs in parallel across workers, the "reduce"
is the merge that waits for all of them. The point is latency: work that would take the *sum* of
the item times now takes roughly the *slowest* item's time.

## The Problem

Processing independent items in a plain loop leaves the machine idle:

- **No overlap** — `for item in items: result = slow(item)` runs one at a time, so total time is
  the sum of every item, even though the items don't depend on each other.
- **Idle cores / idle waits** — while one item blocks on I/O (or one core computes), the rest of
  the machine does nothing.
- **Manual merging is fiddly** — start some concurrency by hand and you're suddenly juggling
  which result belongs where and when everything is done.

The work is *embarrassingly parallel* — the loop just doesn't exploit it.

## Structure

Key Components:

- **Source** — the batch of independent items (or an input channel/stream).
- **Fan-out** — dispatch each item to a concurrent worker (a task, goroutine, coroutine).
- **Workers** — run the same operation on different items, in parallel.
- **Fan-in** — a merge point that collects results and signals when all are done.

```
              ┌─► Worker 1 ─┐
Source ──fan-out─► Worker 2 ─┼─fan-in─► [ merged results ]
              └─► Worker 3 ─┘
        split work            wait for all, combine
```

## When to Use

- Items are independent — no result depends on another — so they can run in any order, at once.
- The per-item cost (I/O wait or CPU) is high enough that overlap pays off.
- You want the batch's latency bounded by the slowest item, not the sum.
- Optionally cap the width with a worker pool so fan-out doesn't become unbounded.

## Advantages and Disadvantages

### Advantages
- **Latency collapse** — total time drops from the sum of items toward the slowest single item.
- **Utilization** — cores and I/O run concurrently instead of idling in a serial loop.
- **Composable** — fan-out/fan-in stages chain into pipelines, each stage its own merge.

### Disadvantages
- **Unbounded fan-out overloads** — one worker per item can exhaust memory or hammer a dependency
  (combine with a worker pool).
- **Merge complexity** — preserving input order, or streaming results as they finish, takes care.
- **Partial failure** — if one worker fails, you must decide: fail the batch, skip, or collect
  errors alongside results.

## Common Mistakes

- **Truly unbounded fan-out** — spawning a task per item for a million items is the classic OOM;
  bound the width with a pool or a semaphore.
- **Losing errors in the merge** — collecting only successful results silently drops failures;
  gather errors too and decide the policy explicitly.
- **Assuming result order** — workers finish out of order; if you need input order, index the
  results, don't rely on completion order.
- **Fanning out dependent work** — if item B needs item A's result, they aren't independent;
  this pattern doesn't apply.

## Key Takeaways

- Fan-out parallelizes independent work; fan-in waits for all and merges — map then reduce.
- The payoff is latency: slowest-item time instead of sum-of-items time.
- Bound the fan-out width (pool/semaphore) so parallelism doesn't become overload.
- Decide up front how to handle order and partial failure in the merge.

## Implementations

### JavaScript

*Targets modern JavaScript (ES2015+).*

**❌ Naive**

```js
// Serial: each await blocks the next, so total time is the sum of all fetches.
async function fetchAll(urls) {
  const results = [];
  for (const url of urls) results.push(await fetch(url).then((r) => r.json()));
  return results;
}
```

**✅ Idiomatic**

```js
// map fans out (all requests start at once); Promise.all fans in (waits for all,
// preserves input order).
async function fetchAll(urls) {
  return Promise.all(urls.map((url) => fetch(url).then((r) => r.json())));
}

// Bound the width so a huge list doesn't fire thousands of requests at once —
// reuse the Worker Pool from this family:
//   return workerPool(urls, 8, (url) => fetch(url).then((r) => r.json()));
```

**🧠 Tradeoff** — `map` + `Promise.all` is fan-out/fan-in in one line: every request starts
immediately and `all` gathers them in input order. It's ideal for a bounded number of I/O tasks.
The catch is *un*boundedness — `all` over ten thousand URLs opens ten thousand sockets — so for
large batches wrap the fan-out in the worker pool to cap concurrency.

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// Sequential CPU work on the main thread — no parallelism, and it blocks the loop.
function hashAll(files) {
  return files.map((f) => expensiveHash(fs.readFileSync(f))); // one at a time
}
```

**✅ Idiomatic**

```js
// Fan out CPU work across worker threads, fan in with Promise.all.
const { Worker } = require("node:worker_threads");

function hashOne(file) {
  return new Promise((resolve, reject) => {
    const w = new Worker("./hash-worker.js", { workerData: file });
    w.once("message", resolve);
    w.once("error", reject);
  });
}

async function hashAll(files) {
  return Promise.all(files.map(hashOne)); // parallel across cores, merged in order
}
// For many files, dispatch through a fixed WorkerPool instead of one worker each.
```

**🧠 Tradeoff** — For CPU-bound work, fanning out across `worker_threads` gives real
multi-core parallelism, and `Promise.all` still handles the fan-in. The overhead is per-worker
setup and message passing, so this wins when each task is substantial — and you'll almost always
route the fan-out through a bounded pool rather than a thread per file.

### Python

*Targets Python 3.12.*

**❌ Naive**

```python
# Serial loop; independent calls don't overlap their I/O waits.
def fetch_all(urls):
    return [get(u) for u in urls]
```

**✅ Idiomatic**

```python
import asyncio

# asyncio.gather fans out coroutines and fans in their results in order.
async def fetch_all(urls):
    return await asyncio.gather(*(get(u) for u in urls))

# CPU-bound instead? Fan out across processes, fan in via the executor:
#   from concurrent.futures import ProcessPoolExecutor
#   with ProcessPoolExecutor() as ex:
#       results = list(ex.map(cpu_task, items))
```

**🧠 Tradeoff** — `asyncio.gather` is the idiomatic scatter–gather for I/O: it schedules all
coroutines and returns results in argument order. For CPU-bound work the GIL blocks true
parallelism, so you fan out across a `ProcessPoolExecutor` instead — same shape, processes doing
the "map." Bound the width (a semaphore for asyncio, `max_workers` for the pool) on large batches.

### Elixir

*Targets Elixir 1.18.*

**❌ Naive**

```elixir
# Sequential mapping — each call finishes before the next begins.
Enum.map(items, &process/1)
```

**✅ Idiomatic**

```elixir
# Task.async_stream fans out with bounded concurrency and fans in lazily,
# preserving order — the merge is just consuming the stream.
items
|> Task.async_stream(&process/1, max_concurrency: System.schedulers_online(), ordered: true)
|> Enum.map(fn {:ok, result} -> result end)
```

**🧠 Tradeoff** — `Task.async_stream` is fan-out/fan-in with the sharp edges already handled:
`max_concurrency` bounds the width, `ordered: true` preserves input order, and results stream
back as a lazy fan-in — no manual collection. For heavier data-parallel pipelines, Flow
generalizes it across stages. It's the most batteries-included version here; the only cost is
learning its options.

### Go

*Targets Go 1.26.*

**❌ Naive**

```go
// Serial loop — independent work runs one item at a time.
func processAll(items []Item) []Result {
    out := make([]Result, len(items))
    for i, it := range items {
        out[i] = process(it)
    }
    return out
}
```

**✅ Idiomatic**

```go
// Fan-out: N goroutines read the same input channel. Fan-in: they write one
// shared output channel; a WaitGroup closes it when all workers are done.
func fanOutIn(items []Item, workers int) <-chan Result {
    in := make(chan Item)
    out := make(chan Result)

    go func() { // source
        for _, it := range items {
            in <- it
        }
        close(in)
    }()

    var wg sync.WaitGroup
    for w := 0; w < workers; w++ { // fan-out
        wg.Add(1)
        go func() {
            defer wg.Done()
            for it := range in {
                out <- process(it) // fan-in: all workers → one channel
            }
        }()
    }
    go func() { wg.Wait(); close(out) }() // close when every worker finishes
    return out
}
```

**🧠 Tradeoff** — Go turns fan-out/fan-in into an idiom: many goroutines reading one input channel
*is* the fan-out, all writing one output channel *is* the fan-in, and `WaitGroup` + `close`
signals "all done." It streams results as they're produced (no waiting for the whole batch) and
bounds width by the worker count. The price is Go's usual bookkeeping — the extra goroutine to
`Wait` then `close(out)`, and results arrive unordered unless you carry an index.

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// Serial: each await completes before the next starts — total time is the sum.
async Task<List<Result>> ProcessAll(IEnumerable<Item> items)
{
    var results = new List<Result>();
    foreach (var item in items)
        results.Add(await ProcessAsync(item)); // one at a time
    return results;
}
```

**✅ Idiomatic**

```csharp
// Select fans out (every task starts immediately); Task.WhenAll fans in,
// preserving input order.
async Task<Result[]> ProcessAll(IEnumerable<Item> items) =>
    await Task.WhenAll(items.Select(ProcessAsync));

// Large batch? Bound the width — and writing each result into its own
// indexed slot keeps input order without sorting.
async Task<Result[]> ProcessAllBounded(IReadOnlyList<Item> items, int workers)
{
    var results = new Result[items.Count];
    await Parallel.ForAsync(0, items.Count,
        new ParallelOptions { MaxDegreeOfParallelism = workers },
        async (i, _) => results[i] = await ProcessAsync(items[i]));
    return results;
}
```

**🧠 Tradeoff** — `Select` + `Task.WhenAll` is .NET's `Promise.all`: unbounded fan-out, ordered
fan-in, right for a modest batch of I/O. `Parallel.ForAsync` is the bounded form — width is one
option away, close to what Elixir's `Task.async_stream` bakes in as flags. Mind the failure
policy: `WhenAll` throws only the *first* exception and leaves the rest sitting on their tasks,
so when partial failure matters, inspect the task states (or `Task.WhenEach`) instead of letting
one fault mask the others.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// Serial loop — independent items run one at a time; total time is the sum.
fn process_all(items: &[u32]) -> Vec<String> {
    items.iter().map(|&item| process(item)).collect()
}
```

**✅ Idiomatic**

```rust
use std::thread;

fn process(item: u32) -> String {
    format!("processed {item}") // stand-in for real work
}

// Fan-out: scoped threads borrow items directly — no Arc, no clones, because
// the compiler knows every thread joins before the scope ends.
// Fan-in: joining the handles, which also preserves input order.
fn process_all(items: &[u32]) -> Vec<String> {
    thread::scope(|s| {
        let handles: Vec<_> = items
            .iter()
            .map(|&item| s.spawn(move || process(item)))
            .collect(); // collect first: all threads start before any join
        handles.into_iter().map(|h| h.join().unwrap()).collect()
    })
}

// Bounded width: a thread per chunk, not per item.
fn process_all_bounded(items: &[u32], workers: usize) -> Vec<String> {
    let chunk = items.len().div_ceil(workers).max(1);
    thread::scope(|s| {
        let handles: Vec<_> = items
            .chunks(chunk)
            .map(|c| s.spawn(move || c.iter().map(|&i| process(i)).collect::<Vec<_>>()))
            .collect();
        handles.into_iter().flat_map(|h| h.join().unwrap()).collect()
    })
}

fn main() {
    let results = process_all(&[1, 2, 3]);
    println!("{results:?}"); // ["processed 1", "processed 2", "processed 3"]
}
```

**🧠 Tradeoff** — `thread::scope` is the load-bearing choice: scoped threads may borrow `items`
because the compiler proves they join before the borrow ends — no `Arc`, no cloning the input.
Joining handles in spawn order makes the fan-in order-preserving for free. But these are OS
threads, not goroutines: a thread per item only makes sense for small batches, so the chunked
version is the honest std-only way to bound width. (In crates-land, rayon's
`par_iter().map().collect()` is this whole tab in one line — much as `Task.async_stream` is for
Elixir.)

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// Serial loop — one item at a time; total time is the sum of all items.
fn processAll(items: []const u64, out: []u64) void {
    for (items, out) |item, *slot| slot.* = process(item);
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

fn process(item: u64) u64 {
    return item * item; // stand-in for real work
}

fn worker(items: []const u64, out: []u64) void {
    for (items, out) |item, *slot| slot.* = process(item);
}

// Fan-out: N threads, each owning a disjoint chunk of input AND output — no
// mutex, because no two threads ever share a slot. Fan-in: join; the results
// are already in input order.
pub fn main() !void {
    const items = [_]u64{ 1, 2, 3, 4, 5, 6, 7, 8 };
    var results: [items.len]u64 = undefined;

    const workers = 4;
    const chunk = items.len / workers;
    var threads: [workers]std.Thread = undefined;

    for (&threads, 0..) |*t, w| {
        const lo = w * chunk;
        const hi = if (w == workers - 1) items.len else lo + chunk;
        t.* = try std.Thread.spawn(.{}, worker, .{ items[lo..hi], results[lo..hi] });
    }
    for (threads) |t| t.join(); // fan-in: wait for every worker

    std.debug.print("{any}\n", .{results}); // { 1, 4, 9, 16, 25, 36, 49, 64 }
}
```

**🧠 Tradeoff** — No channels at all: partition the input *and* the output so no two threads
share a slot, and the merge disappears — `results` is complete and in input order the moment
`join` returns. That's the Zig-shaped answer: make the race structurally impossible with plain
slices instead of guarding it with locks. The costs are being honest about threads (OS threads
are expensive, hence a thread per chunk, never per item) and the static shapes here — a real
batch takes an allocator and a runtime worker count. Elixir's `Task.async_stream` gives you the
bounded, ordered version in one line on a scheduler of cheap processes; Zig makes you place
every thread, and shows you exactly what that line costs.

### Java

*Targets Java 25.*

**❌ Naive**

```java
import java.util.List;

// Serial: each item finishes before the next starts — total time is the sum.
class Serial {
    static List<Result> processAll(List<Item> items) {
        return items.stream().map(Serial::process).toList();
    }
}
```

**✅ Idiomatic**

```java
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

// Fan-out: one virtual thread per item — cheap enough that thread-per-task
// is the idiom, not the bug. Fan-in: invokeAll waits for all, in input order.
class FanOutIn {
    static List<Result> processAll(List<Item> items) throws InterruptedException {
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Callable<Result>> tasks = items.stream()
                    .<Callable<Result>>map(item -> () -> process(item))
                    .toList();
            return pool.invokeAll(tasks).stream()
                    .map(Future::resultNow) // every future is already settled here
                    .toList();
        }
    }

    // CPU-bound instead? The one-liner fans out across the cores:
    //   items.parallelStream().map(FanOutIn::process).toList();
}
```

**🧠 Tradeoff** — virtual threads (Java 21) flipped the old advice. Before them, fan-out
meant rationing platform threads through a pool; now, for I/O work, a thread per item *is*
the plain idiom, and the width bound moves to a `Semaphore` — or simply to whatever limit
the downstream imposes. `invokeAll` is a tidy fan-in: it waits for everything and returns
futures in input order, and failures stay on their own `Future`, so partial-failure policy
is a per-task decision (`resultNow` throws for the tasks that failed). CPU-bound work still
wants width equal to cores — `parallelStream` or a fixed pool. `StructuredTaskScope`
(still in preview) is where this shape is headed: fan-out/fan-in as a scoped block with
cancel-on-first-failure built in.

## Applications

- **Parallel API aggregation** — a backend fans out calls to several services and fans in their
  responses into one payload, bounding latency to the slowest (backend).
- **Batch media/data processing** — resize, transcode, or parse thousands of items across
  workers, merged into one result set (backend).
- **Search scatter–gather** — a query fans out to shards, results fan in and merge/rank
  (backend).
- **Concurrent page loads** — a frontend fires independent data requests at once and renders when
  all resolve (frontend).
- **MapReduce jobs** — the canonical large-scale form: map tasks fan out across a cluster, reduce
  tasks fan in (backend).

**In modern systems:**

- **Multi-agent** — spawn N sub-agents over slices of a task, then gather and merge their results:
  map-reduce for agents, and how a supervisor parallelizes a large job.
- **Workflow engine** — a parallel-gateway step forks branches and joins on all of them before
  continuing.
- **Low-code** — resolve many field datasources in parallel, then render once all resolve.

## Related Patterns

- **Worker Pool** — the pool bounds the fan-out width so it doesn't become unbounded parallelism;
  fan-out/fan-in is often *implemented* on top of a pool.
- **Future / Promise** — fan-out starts many futures; fan-in is `all`/`gather` awaiting them.
- **Producer–Consumer** — the input side of fan-out is a producer feeding many consumers; chaining
  stages builds a pipeline.
