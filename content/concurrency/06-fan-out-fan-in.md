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
languages: [javascript, node-js, python, elixir, go]
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

## Related Patterns

- **Worker Pool** — the pool bounds the fan-out width so it doesn't become unbounded parallelism;
  fan-out/fan-in is often *implemented* on top of a pool.
- **Future / Promise** — fan-out starts many futures; fan-in is `all`/`gather` awaiting them.
- **Producer–Consumer** — the input side of fan-out is a producer feeding many consumers; chaining
  stages builds a pipeline.
