---
id: bulkhead
category: distributed
sequence: 4
title: Bulkhead
also_known_as: [Resource Isolation]
gof: false
intent: "Partition resources into isolated pools so a failure or overload in one part can't consume everything and sink the whole system."
frequency: medium
difficulty: intermediate
tags: [distributed, resilience, isolation, resource-management, fault-containment]
related: [circuit-breaker, timeout, worker-pool]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Divide a shared resource — a thread pool, connection pool, or set of instances — into separate
**compartments**, one per dependency or class of work, each with its own limit. If one dependency
gets slow and saturates its compartment, the others keep their own capacity and stay healthy.

The name comes from a ship's hull: watertight bulkheads mean a breach in one compartment floods
only that compartment, not the whole vessel. In software, they stop one misbehaving dependency from
consuming all your threads or connections and taking everything down with it.

## The Problem

Share one pool across everything and any single dependency can drain it:

- **One slow dependency, total outage** — all requests draw from the same thread pool; when
  dependency A goes slow, calls to A pile up and consume every thread, so requests to healthy
  dependencies B and C can't get one either.
- **No blast-radius containment** — a failure that should affect one feature affects the whole
  service because they compete for the same resources.
- **Noisy neighbors** — a burst of low-priority work starves critical requests sharing the pool.
- **Correlated collapse** — with everything pooled together, load or failure in one place is felt
  everywhere at once.

## Structure

Key Components:

- **Partitions / Pools** — separate resource pools (threads, connections, semaphores), one per
  dependency or workload class.
- **Limits** — each partition's cap on concurrent work; exceeding it rejects or queues *within that
  partition only*.
- **Routing** — each call is directed to its partition based on the dependency/workload it targets.
- **Isolation boundary** — saturation or failure in one partition stays contained to it.

```
              ┌─► Pool A (limit 10) ─► Dependency A
Client ──route┤
              └─► Pool B (limit 10) ─► Dependency B
     A saturates → only A's callers wait; B keeps its 10 slots
```

## When to Use

- A service calls multiple dependencies and one slow/failing one shouldn't starve the others.
- Different workload classes (critical vs. batch, tenant vs. tenant) must not steal each other's capacity.
- You need to contain the blast radius of a failure to one feature or dependency.
- Shared pools (threads, DB connections) are a single point of exhaustion.

## Advantages and Disadvantages

### Advantages
- **Fault containment** — a saturated dependency affects only its own partition.
- **Predictable capacity** — each workload has guaranteed, reserved resources.
- **Graceful degradation** — one feature fails or slows while the rest of the system keeps serving.

### Disadvantages
- **Lower utilization** — reserved-but-idle capacity in one partition can't help a busy other one.
- **Sizing complexity** — you now tune several pools instead of one, and get each wrong differently.
- **More moving parts** — multiple pools/semaphores to configure, monitor, and reason about.

## Common Mistakes

- **Partitions too small** — over-isolating leaves each pool starved and the machine underused;
  size partitions to real per-dependency demand.
- **One giant shared pool anyway** — "isolating" with a single pool and hoping is the very failure
  mode bulkheads prevent.
- **No rejection policy** — a full partition must fail fast (or shed) rather than silently queueing
  forever, or you've just moved the exhaustion into a queue.
- **Ignoring the caller side** — bulkheading the server but letting the client use one shared
  connection pool re-couples them.

## Key Takeaways

- Separate pools per dependency/workload contain a failure to one compartment.
- The trade is utilization: reserved capacity protects, but idle reserves can't be borrowed.
- A full partition should fail fast, not queue unboundedly.
- Bulkheads pair with timeouts (release fast) and circuit breakers (stop calling the sick one).

## Implementations

### JavaScript

**❌ Naive**

```js
// One global concurrency limiter shared across all dependencies — A's slowness blocks B.
const limiter = pLimit(20);
const callA = (x) => limiter(() => fetch(`/a/${x}`));
const callB = (x) => limiter(() => fetch(`/b/${x}`)); // shares A's 20 slots
```

**✅ Idiomatic**

```js
// A semaphore per dependency: each has its own slots, so one can't starve the other.
import pLimit from "p-limit";

const bulkheads = {
  a: pLimit(10),
  b: pLimit(10), // isolated capacity
};

const callA = (x) => bulkheads.a(() => fetch(`/a/${x}`));
const callB = (x) => bulkheads.b(() => fetch(`/b/${x}`));
// If A goes slow and fills its 10, B still has its own 10 free.
```

**🧠 Tradeoff** — Giving each dependency its own `pLimit` semaphore is a lightweight bulkhead:
A saturating its 10 slots can't touch B's. It caps concurrency, not OS threads (JS is single-
threaded), which is exactly what you want for I/O isolation. The cost is choosing per-dependency
limits and accepting that A's idle slots can't help a busy B.

### Node.js

**❌ Naive**

```js
// One pg Pool for the whole app; a slow reporting query can exhaust it and stall everything.
const pool = new Pool({ max: 20 });
// both fast transactional queries and slow analytics draw from the same 20 connections
```

**✅ Idiomatic**

```js
// Separate connection pools per workload class so one can't drain the other.
const { Pool } = require("pg");

const txPool = new Pool({ max: 15, connectionTimeoutMillis: 2000 });   // fast, critical
const analyticsPool = new Pool({ max: 5, connectionTimeoutMillis: 2000 }); // slow, best-effort

// critical path:   txPool.query(...)
// heavy reports:    analyticsPool.query(...)   ← capped; can't starve the tx path
```

**🧠 Tradeoff** — Two `pg` pools partition the database connections so a slow analytics query
storm can only exhaust its own 5 connections, leaving the 15 transactional ones untouched. The
`connectionTimeoutMillis` makes a full pool fail fast instead of queueing. You trade some peak
throughput on each path for the guarantee that reports can't take down checkout.

### Python

**❌ Naive**

```python
# A single ThreadPoolExecutor for all outbound calls — a slow dependency fills it.
pool = ThreadPoolExecutor(max_workers=20)
pool.submit(call_a); pool.submit(call_b)  # compete for the same 20 threads
```

**✅ Idiomatic**

```python
from concurrent.futures import ThreadPoolExecutor

# One executor per dependency = isolated thread budgets.
bulkheads = {
    "a": ThreadPoolExecutor(max_workers=10),
    "b": ThreadPoolExecutor(max_workers=10),
}

def call(dep, fn, *args):
    return bulkheads[dep].submit(fn, *args)  # A's saturation stays in A's pool

# (asyncio equivalent: a separate asyncio.Semaphore per dependency)
```

**🧠 Tradeoff** — A `ThreadPoolExecutor` per dependency isolates thread budgets so a slow `a`
can't starve `b`. For asyncio, a `Semaphore` per dependency does the same for coroutine
concurrency. It's straightforward, but you now manage several executors and their shutdown, and
reserved-but-idle threads in one pool don't help another — the isolation/utilization trade.

### Elixir

**❌ Naive**

```elixir
# All external calls go through one shared pool (e.g. one Finch/HTTP pool) — shared fate.
Finch.build(:get, url) |> Finch.request(MyApp.Finch)  # one pool for every host
```

**✅ Idiomatic**

```elixir
# Named, per-dependency pools; a supervised worker pool (Poolboy) per external service.
# config: separate Finch pools keyed by destination
{Finch, name: MyApp.Finch, pools: %{
   "https://a.example.com" => [size: 10],   # bulkhead for A
   "https://b.example.com" => [size: 10]    # bulkhead for B
 }}
# Each host draws only from its own pool; A saturating can't consume B's connections.
```

**🧠 Tradeoff** — The BEAM's process isolation already contains crashes, and pooling libraries
(Finch's per-host pools, Poolboy) add the *resource* isolation: a pool per dependency so one host's
slowness can't drain another's connections. It's idiomatic and supervised. The nuance is that
process cheapness tempts you to skip pooling entirely — but external *connections* are still finite,
so bulkheading them matters.

### Go

**❌ Naive**

```go
// One buffered channel (semaphore) gates every outbound call — shared limit.
var sem = make(chan struct{}, 20)
func callA() { sem <- struct{}{}; defer func() { <-sem }(); doA() } // shares with B
```

**✅ Idiomatic**

```go
// A semaphore channel per dependency = isolated concurrency budgets.
type Bulkhead struct{ slots chan struct{} }

func NewBulkhead(limit int) *Bulkhead { return &Bulkhead{slots: make(chan struct{}, limit)} }

func (b *Bulkhead) Do(ctx context.Context, fn func() error) error {
    select {
    case b.slots <- struct{}{}: // acquire a slot
        defer func() { <-b.slots }()
        return fn()
    case <-ctx.Done():
        return ctx.Err() // partition full and deadline hit → fail fast
    }
}
// bulkA, bulkB := NewBulkhead(10), NewBulkhead(10)  // independent capacity
```

**🧠 Tradeoff** — A buffered channel as a counting semaphore, one per dependency, is the idiomatic
Go bulkhead — and the `select` on `ctx.Done()` gives fail-fast when a partition is full. It's a
dozen lines and completely explicit. You size and wire each bulkhead yourself; there's no framework
hiding it, which is very Go and makes the isolation boundaries obvious in the code.

### CSharp

**❌ Naive**

```csharp
// One SemaphoreSlim gates every outbound call — A and B share the same 20 slots.
var sem = new SemaphoreSlim(20);

async Task<string> CallA()
{
    await sem.WaitAsync();
    try { return await FetchA(); } finally { sem.Release(); }
}
// CallB acquires from the same semaphore — when A goes slow, B starves.
```

**✅ Idiomatic**

```csharp
// A SemaphoreSlim per dependency = isolated concurrency budgets.
var bulkheadA = new Bulkhead(10);
var bulkheadB = new Bulkhead(10); // independent capacity

// await bulkheadA.Do(FetchA, TimeSpan.FromSeconds(2));
// await bulkheadB.Do(FetchB, TimeSpan.FromSeconds(2)); // A full? B still has its 10.

public sealed class Bulkhead(int limit)
{
    private readonly SemaphoreSlim _slots = new(limit, limit);

    public async Task<T> Do<T>(Func<Task<T>> fn, TimeSpan wait)
    {
        if (!await _slots.WaitAsync(wait))
            throw new BulkheadRejectedException(); // partition full → fail fast
        try { return await fn(); }
        finally { _slots.Release(); }
    }
}

public sealed class BulkheadRejectedException : Exception;
```

**🧠 Tradeoff** — `SemaphoreSlim` counts in-flight *async operations*, not threads — an
awaiting caller holds a slot but no thread, which is exactly the isolation you want for I/O.
`WaitAsync(wait)` returning `false` is the fail-fast: a full partition rejects instead of
queueing forever. Polly ships this same idea as a configured concurrency limiter; the
hand-rolled version shows there isn't much under the hood. The standing trade remains: A's
idle slots can't help a busy B.

### Rust

**❌ Naive**

```rust
// One channel, one pool of 20 workers for every dependency — shared fate.
let (tx, _rx) = std::sync::mpsc::channel::<Job>();
// all 20 workers drain this same queue; when A's jobs go slow they hold
// every thread, and B's jobs sit behind them
```

**✅ Idiomatic**

```rust
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::thread;

type Job = Box<dyn FnOnce() + Send>;

// A bounded worker pool per dependency: its own threads, its own queue.
struct Bulkhead {
    queue: SyncSender<Job>,
}

impl Bulkhead {
    fn new(workers: usize, depth: usize) -> Bulkhead {
        let (tx, rx) = sync_channel::<Job>(depth);
        let rx = Arc::new(Mutex::new(rx));
        for _ in 0..workers {
            let rx = Arc::clone(&rx);
            thread::spawn(move || loop {
                // lock only to receive; run the job unlocked
                let job = match rx.lock().unwrap().recv() {
                    Ok(job) => job,
                    Err(_) => break, // pool dropped → workers exit
                };
                job();
            });
        }
        Bulkhead { queue: tx }
    }

    fn submit(&self, job: Job) -> Result<(), Job> {
        self.queue.try_send(job).map_err(|e| match e {
            TrySendError::Full(job) | TrySendError::Disconnected(job) => job, // fail fast
        })
    }
}

// let bulk_a = Bulkhead::new(10, 5);
// let bulk_b = Bulkhead::new(10, 5); // A saturating its queue can't touch B's threads
```

**🧠 Tradeoff** — A pool per dependency isolates real OS threads, so it contains CPU-bound
work as well as I/O — stronger isolation than a concurrency counter over shared workers.
`sync_channel`'s bound is the queue depth, and `try_send` turns a full partition into an
immediate `Err` that hands the job back to the caller. The `Arc<Mutex<Receiver>>` dance is
the std idiom because a `Receiver` can't be cloned; a crossbeam channel would tidy it, but
the katas stay dependency-free. You now size threads *and* queue depth per partition —
twice the knobs to get wrong.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// One shared Io.Threaded pool for every dependency — A's slow jobs hold all the threads.
var pool: std.Io.Threaded = .init(allocator, .{ .concurrent_limit = .limited(20) });
defer pool.deinit();
const io = pool.io();
// var a = try io.concurrent(callA, .{});  var b = try io.concurrent(callB, .{});  // same 20 slots
```

**✅ Idiomatic**

```zig
const std = @import("std");

// A bounded worker pool per dependency: fixed threads, fixed queue, no allocation.
const Bulkhead = struct {
    mutex: std.Io.Mutex = .init,
    cond: std.Io.Condition = .init,
    jobs: [8]*const fn () void = undefined,
    len: usize = 0,

    fn start(self: *Bulkhead, io: std.Io, workers: usize) !void {
        for (0..workers) |_| (try std.Thread.spawn(.{}, worker, .{ self, io })).detach();
    }

    fn worker(self: *Bulkhead, io: std.Io) void {
        while (true) {
            self.mutex.lockUncancelable(io); // plain threads sit outside task cancelation
            while (self.len == 0) self.cond.waitUncancelable(io, &self.mutex);
            self.len -= 1;
            const job = self.jobs[self.len];
            self.mutex.unlock(io);
            job(); // run outside the lock
        }
    }

    // A full partition is an error, not an unbounded queue.
    fn submit(self: *Bulkhead, io: std.Io, job: *const fn () void) error{PartitionFull}!void {
        self.mutex.lockUncancelable(io);
        defer self.mutex.unlock(io);
        if (self.len == self.jobs.len) return error.PartitionFull; // fail fast
        self.jobs[self.len] = job;
        self.len += 1;
        self.cond.signal(io);
    }
};

// var bulk_a = Bulkhead{};  try bulk_a.start(io, 10);
// var bulk_b = Bulkhead{};  try bulk_b.start(io, 10);
// A filling its 8-deep queue gets error.PartitionFull; B's threads never notice.
```

**🧠 Tradeoff** — Fixed arrays mean this bulkhead never allocates — no allocator parameter,
capacity decided at compile time, which is a very Zig way to make the limit real. It does
take an `io`: 0.17 routes locks and condvars through the `std.Io` capability, threaded as
explicitly as the allocator these fixed arrays avoid, and the `Uncancelable` variants keep
`submit`'s error set down to the one rejection that matters. That error union puts rejection
in `submit`'s signature: callers must `try` or `catch`, so a full partition can't be
silently ignored. Bare fn pointers cover stateless jobs; a job that carries data needs the
`*anyopaque` context + fn-pointer pair, the same idiom `std.mem.Allocator` uses. The demo
queue is LIFO for brevity — a ring buffer makes it fair.

### Java

**❌ Naive**

```java
// One shared Semaphore gates every outbound call — A and B share the same 20 permits.
var sem = new Semaphore(20);

String callA() throws InterruptedException {
    sem.acquire();
    try { return fetchA(); } finally { sem.release(); }
}
// callB acquires from the same semaphore — when A goes slow, B starves.
```

**✅ Idiomatic**

```java
import java.time.Duration;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

// A Semaphore per dependency = isolated concurrency budgets.
final class Bulkhead {
    private final Semaphore slots;
    private final Duration wait;

    Bulkhead(int limit, Duration wait) {
        this.slots = new Semaphore(limit);
        this.wait = wait;
    }

    <T> T call(Supplier<T> fn) throws InterruptedException {
        if (!slots.tryAcquire(wait.toMillis(), TimeUnit.MILLISECONDS))
            throw new BulkheadFullException(); // partition full → fail fast
        try { return fn.get(); } finally { slots.release(); }
    }
}

final class BulkheadFullException extends RuntimeException {}

// var bulkA = new Bulkhead(10, Duration.ofSeconds(2));
// var bulkB = new Bulkhead(10, Duration.ofSeconds(2)); // independent capacity
// bulkA.call(() -> fetchA());  // A full and 2s up? Throws — B still has its 10.
```

**🧠 Tradeoff** — Historically Java bulkheaded with a `ThreadPoolExecutor` per dependency;
virtual threads change that. Threads are now too cheap to pool, so the limit moves to a
`Semaphore` per dependency: spawn freely, but only `limit` calls to A are in flight, and
`tryAcquire` with a deadline makes a full partition reject instead of queueing. A permit
is held per *call*, not per thread — the right unit for I/O isolation. Resilience4j's
`Bulkhead` is this same semaphore with metrics, events, and config around it; the
hand-rolled version shows how little is inside. The standing trade remains: A's idle
permits can't help a busy B.

## Applications

- **Connection pools** — separate database/HTTP pools per workload so batch jobs can't starve
  interactive requests (backend).
- **Multi-tenant systems** — per-tenant resource quotas so one tenant's spike doesn't degrade
  everyone (backend).
- **Microservice clients** — a thread/connection budget per downstream service so one slow
  dependency can't exhaust the caller (backend).
- **Service meshes & libraries** — Resilience4j, Polly, and Envoy provide bulkhead/concurrency
  limits as configuration (backend).
- **Critical vs. best-effort** — reserving capacity for checkout/auth while capping analytics,
  exports, and webhooks (backend).

## Related Patterns

- **Circuit Breaker** — the breaker stops calling a *failing* dependency; the bulkhead limits how
  much of your resources any dependency can hold — deployed together for layered protection.
- **Timeout** — timeouts release a partition's slots quickly so a slow call doesn't hold isolation
  capacity for long.
- **Worker Pool** — a bulkhead is essentially a worker pool used for isolation: a bounded pool per
  dependency rather than one shared pool.
