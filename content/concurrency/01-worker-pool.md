---
id: worker-pool
category: concurrency
sequence: 1
title: Worker Pool
also_known_as: [Thread Pool, Replicated Workers]
gof: false
intent: "Run many tasks over a fixed set of reusable workers, capping concurrency instead of spawning one worker per task."
frequency: high
difficulty: intermediate
tags: [concurrency, throughput, backpressure, bounded-parallelism, pool]
related: [producer-consumer, future-promise, bulkhead]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Hand a stream of tasks to a **fixed** number of long-lived workers that pull work as they
free up, rather than starting a fresh thread, process, or connection for every task.

The pool is a valve. It decouples *how much work arrives* from *how much runs at once*, so a
burst of ten thousand tasks still only keeps, say, eight things in flight — protecting the CPU,
the memory, and whatever downstream service the tasks touch.

## The Problem

The naive move is "one worker per task": for each job, spawn a thread (or goroutine, or
process, or open a connection) and let it run. It reads beautifully and falls over in
production:

- **Resource exhaustion** — 10,000 tasks become 10,000 threads. Each costs memory and a
  scheduler slot; the machine thrashes long before the work finishes.
- **No backpressure** — nothing tells the producer to slow down, so a fast producer buries a
  slow consumer.
- **Downstream overload** — 10,000 simultaneous requests flatten the database or API the tasks
  call, turning your throughput problem into *their* outage.

Spawning is also wasteful: setup and teardown cost repeats for every single task. A pool pays
that cost **once** and reuses the workers.

## Structure

Key Components:

- **Task Queue** — a buffer the producer submits to and workers pull from. Usually bounded, so
  a full queue applies backpressure to the producer.
- **Workers** — a fixed set of long-lived executors. Each loops: take a task, run it, repeat.
- **Producer / Dispatcher** — submits tasks; never touches a worker directly.
- **Result sink** (optional) — where finished results land (a channel, a future per task, a
  results slice).

```
                      ┌──────────► [ Worker 1 ] ─┐
  submit()            │                          │
Producer ──► [ Task Queue ] ─────► [ Worker 2 ] ─┼──► results
                      │                          │
                      └──────────► [ Worker 3 ] ─┘
        (bounded — a full queue slows the producer)
```

## When to Use

- Tasks arrive faster than they can be processed, and you need to **cap** how many run at once.
- Per-task setup is expensive and worth amortizing (threads, DB connections, browser tabs).
- A downstream dependency has a concurrency or rate limit you must respect.
- You want a natural place to apply backpressure and observe queue depth.

## Advantages and Disadvantages

### Advantages
- **Bounded resource use** — concurrency is a constant you choose, not a function of load.
- **Backpressure for free** — a bounded queue makes the producer wait instead of overrunning.
- **Amortized cost** — workers and their resources are created once and reused.
- **A tuning knob** — pool size is one number to match cores, connection limits, or SLAs.

### Disadvantages
- **Head-of-line blocking** — one slow task ties up a worker; a few can starve the rest.
- **Sizing is a guess** — too small under-uses the machine, too large re-creates the overload.
- **Added machinery** — a queue, lifecycle, and shutdown path you now own.

## Common Mistakes

- **Unbounded queue** — a queue that grows forever just moves the resource leak from threads to
  memory; the producer never feels backpressure. Bound it.
- **Sizing the pool by task count** — the pool size should track the *constraint* (cores for
  CPU work, the connection cap for I/O), not how many tasks exist.
- **No graceful shutdown** — workers left running on exit drop in-flight tasks and leak
  resources. Drain the queue and stop the workers deliberately.
- **CPU-bound work on an I/O pool** — in runtimes with a GIL or a single event loop, a thread
  pool won't parallelize CPU-bound work; you need processes or real worker threads.

## Key Takeaways

- A worker pool caps concurrency: load can spike without the number in flight spiking with it.
- The bounded queue is the point — it's what turns overload into a well-behaved wait.
- Size the pool to the bottleneck (cores or the downstream limit), not to the workload.
- Pick the right worker for the work: threads/async for I/O, processes/worker-threads for CPU.

## Implementations

### JavaScript

**❌ Naive**

```js
// Fires every task at once — 10k tasks means 10k concurrent requests.
async function processAll(tasks, run) {
  return Promise.all(tasks.map(run));
}
```

**✅ Idiomatic**

```js
// A promise pool: at most `size` tasks in flight; start a new one each time one settles.
async function workerPool(tasks, size, run) {
  const results = new Array(tasks.length);
  const executing = new Set();

  for (let i = 0; i < tasks.length; i++) {
    const p = Promise.resolve(run(tasks[i], i)).then((r) => {
      results[i] = r;
      executing.delete(p);
    });
    executing.add(p);
    if (executing.size >= size) await Promise.race(executing); // wait for a slot
  }

  await Promise.all(executing);
  return results;
}

// await workerPool(urls, 8, (url) => fetch(url).then((r) => r.json()));
```

**🧠 Tradeoff** — In the browser there are no threads to pool; the "workers" are just concurrent
promises and the pool is a concurrency limiter. That's exactly right for I/O (fetches, reads),
which is what JS does. It buys you a hard ceiling on in-flight requests for a few lines; it does
nothing for CPU-bound work, which still blocks the single event loop — reach for Web Workers or
the Node version below.

### Node.js

**❌ Naive**

```js
// A fresh OS-backed thread per task; thousands of tasks thrash the machine.
const { Worker } = require("node:worker_threads");

function hashAll(items) {
  return Promise.all(
    items.map(
      (data) =>
        new Promise((resolve, reject) => {
          const w = new Worker("./hash-worker.js", { workerData: data });
          w.once("message", resolve);
          w.once("error", reject);
        }),
    ),
  );
}
```

**✅ Idiomatic**

```js
// A fixed pool of reusable worker threads; tasks queue and reuse idle workers.
const { Worker } = require("node:worker_threads");

class WorkerPool {
  constructor(file, size) {
    this.idle = Array.from({ length: size }, () => new Worker(file));
    this.queue = [];
  }

  run(data) {
    return new Promise((resolve, reject) => {
      this.queue.push({ data, resolve, reject });
      this._pump();
    });
  }

  _pump() {
    if (!this.queue.length || !this.idle.length) return;
    const worker = this.idle.pop();
    const { data, resolve, reject } = this.queue.shift();
    const release = (fn) => (payload) => {
      worker.off("message", onOk);
      worker.off("error", onErr);
      this.idle.push(worker);
      this._pump(); // hand the freed worker the next task
      fn(payload);
    };
    const onOk = release(resolve);
    const onErr = release(reject);
    worker.once("message", onOk);
    worker.once("error", onErr);
    worker.postMessage(data);
  }

  async destroy() {
    await Promise.all(this.idle.map((w) => w.terminate()));
  }
}
```

**🧠 Tradeoff** — Unlike browser JS, Node's `worker_threads` are real threads, so this pool
gives you *actual* parallelism for CPU-bound work (hashing, image resizing, parsing). The cost
is the machinery: message passing, a lifecycle, and `destroy()` to avoid leaking threads. For
pure I/O, skip it — the promise pool above is lighter and just as effective.

### Python

**❌ Naive**

```python
import threading

# One OS thread per task, all joined at the end — unbounded thread count.
def process_all(tasks, run):
    threads = [threading.Thread(target=run, args=(t,)) for t in tasks]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
```

**✅ Idiomatic**

```python
from concurrent.futures import ThreadPoolExecutor

# Bounded pool; `map` streams results back in input order, reusing 8 threads.
def process_all(tasks, run, size=8):
    with ThreadPoolExecutor(max_workers=size) as pool:
        return list(pool.map(run, tasks))

# CPU-bound? Swap the executor — processes sidestep the GIL:
#   from concurrent.futures import ProcessPoolExecutor
#   with ProcessPoolExecutor(max_workers=os.cpu_count()) as pool: ...
```

**🧠 Tradeoff** — `concurrent.futures` gives you the whole pattern — pool, queue, futures — in
one import, and the `with` block guarantees a clean shutdown. The catch is the GIL:
`ThreadPoolExecutor` parallelizes I/O beautifully but not CPU-bound Python. The one-line switch
to `ProcessPoolExecutor` fixes that, at the price of pickling arguments and results across
process boundaries.

### Elixir

**❌ Naive**

```elixir
# One process per task. Processes are cheap on the BEAM, but there's still no
# limit — a million tasks spawn a million processes and can swamp a slow service.
tasks
|> Enum.map(&Task.async(fn -> run.(&1) end))
|> Enum.map(&Task.await/1)
```

**✅ Idiomatic**

```elixir
# Task.async_stream is the pool: bounded concurrency, lazy, back-pressured, ordered.
tasks
|> Task.async_stream(&run/1, max_concurrency: 8, timeout: 30_000)
|> Enum.map(fn {:ok, result} -> result end)

# For long-lived, supervised workers, a pool library (Poolboy) or a
# DynamicSupervisor + a counting registry plays the same role.
```

**🧠 Tradeoff** — The BEAM's processes are so cheap that "one per task" is often genuinely fine
— the real need is a *limit* and *backpressure*, and `Task.async_stream` delivers both as a lazy
stream with a `max_concurrency` knob. It's the most declarative version here: no queue or
worker lifecycle to write. When you need workers that outlive a single batch (a supervised,
named pool), you graduate to Poolboy or a `DynamicSupervisor`.

### Go

**❌ Naive**

```go
// A goroutine per task. Goroutines are light, but unbounded fan-out still
// exhausts memory and hammers whatever run() calls.
func processAll(tasks []Task, run func(Task)) {
    var wg sync.WaitGroup
    for _, t := range tasks {
        wg.Add(1)
        go func(t Task) { defer wg.Done(); run(t) }(t)
    }
    wg.Wait()
}
```

**✅ Idiomatic**

```go
// Fixed workers pull indices off a jobs channel; the channel is the queue.
func workerPool(tasks []Task, size int, run func(Task) Result) []Result {
    jobs := make(chan int)
    results := make([]Result, len(tasks))
    var wg sync.WaitGroup

    for w := 0; w < size; w++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for i := range jobs { // loops until jobs is closed
                results[i] = run(tasks[i])
            }
        }()
    }

    for i := range tasks {
        jobs <- i // blocks when all workers are busy — natural backpressure
    }
    close(jobs)
    wg.Wait()
    return results
}
```

**🧠 Tradeoff** — Go makes the pattern feel native: the `jobs` channel *is* the queue, the
`range` loop *is* the worker, and an unbuffered channel gives you backpressure with no extra
code. You do wire the pieces by hand (channel, `WaitGroup`, `close`), and correctness lives in
those details — forget to `close(jobs)` and the workers block forever. That explicitness is the
Go bargain: no framework, but you own the concurrency.

## Applications

- **Web servers** — a thread/goroutine pool serves requests so a traffic spike queues instead
  of forking unbounded handlers (backend).
- **Background jobs** — Sidekiq, Celery, and Oban run jobs over a fixed worker set; pool
  size is the throughput dial (backend).
- **Database connection pools** — a specialized worker pool where the scarce "worker" is a
  connection (backend).
- **Batch media processing** — resize or transcode thousands of images across N CPU workers
  without launching thousands of processes (backend).
- **Web scraping / API clients** — cap in-flight requests to stay under a rate limit while
  still parallelizing (frontend or backend).
- **Parallel test runners** — Jest, pytest-xdist, and `go test` shard tests across a bounded
  pool of workers.

**In modern systems:**

- **Workflow engine** — a fixed pool of executors pulls ready steps off the queue, so pool size
  caps how much of the workflow runs at once.
- **Multi-agent** — a bounded pool of agent workers drains a task queue, so a fan-out can't spawn
  unbounded, budget-burning model calls.
- **Low-code** — a render pool materializes many rows or widgets without flooding the main thread.

## Related Patterns

- **Producer–Consumer** — the worker pool *is* a producer–consumer with a fixed consumer count;
  the queue between them is the shared piece.
- **Future / Promise** — each submitted task typically hands back a future to await its result.
- **Semaphore** — a pool of N workers is a counting semaphore permitting N concurrent tasks; a
  semaphore is the pool with the workers factored out.
- **Actor** — actors are long-lived message-processing workers; a router over a pool of
  identical actors is this pattern in an actor system.
