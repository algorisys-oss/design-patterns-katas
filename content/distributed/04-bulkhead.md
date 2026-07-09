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
languages: [javascript, node-js, python, elixir, go]
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
