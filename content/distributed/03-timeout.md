---
id: timeout
category: distributed
sequence: 3
title: Timeout
also_known_as: [Deadline]
gof: false
intent: "Cap how long you'll wait for an operation, so a slow or hung dependency fails fast and frees your resources instead of blocking forever."
frequency: high
difficulty: beginner
tags: [distributed, resilience, latency, deadlines, resource-management]
related: [retry, circuit-breaker, bulkhead]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Put an upper bound on every wait. If an operation — a network call, a lock, a query — doesn't
complete within its deadline, **abandon it** and return a timeout error, freeing the thread,
connection, or goroutine that was blocked on it.

"Slow" is often worse than "failed." A failed call returns an error you can handle; a call that
hangs holds a resource indefinitely, and enough hung calls exhaust the pool and take the whole
service down. A timeout converts an unbounded wait into a bounded, handleable failure.

## The Problem

Waiting without a limit is a resource leak in slow motion:

- **Hung calls hold resources** — a request stuck waiting on a slow dependency keeps its thread,
  socket, and memory tied up until… never.
- **Pool exhaustion** — enough blocked calls and the connection/thread pool is empty, so *new*
  requests can't even start — a total outage caused by one slow dependency.
- **Unbounded tail latency** — without a deadline, the slowest response defines the worst case, and
  there's no worst case.
- **No propagated deadline** — a chain of services each waiting "as long as it takes" means the
  user's browser gave up long ago while servers keep working.

## Structure

Key Components:

- **Deadline / duration** — the maximum time to wait, per operation or propagated across a call chain.
- **The operation** — the call being bounded.
- **The timer** — races the operation; whichever finishes first wins.
- **Cancellation** — on timeout, signal the operation to stop so it doesn't keep consuming resources.

```
             ┌── operation completes ──► result
call ──race──┤
             └── timer fires (deadline) ──► timeout error + cancel the operation
```

## When to Use

- Any call that can block: network requests, database queries, lock acquisition, external processes.
- You need bounded latency and predictable resource release under slowdown.
- A deadline should flow through a chain of calls so downstream work stops when the client is gone.
- Failing fast is better than waiting indefinitely.

## Advantages and Disadvantages

### Advantages
- **Bounded latency & resources** — the worst case is the timeout, and blocked resources release.
- **Prevents cascading exhaustion** — one slow dependency can't drain your pools.
- **Makes failure handleable** — turns an infinite hang into an error you can retry or fall back from.

### Disadvantages
- **Tuning tension** — too short cuts off slow-but-valid responses; too long barely protects.
- **Wasted work & duplicates** — the abandoned operation may still complete server-side, so
  non-idempotent work can double if you then retry.
- **Needs real cancellation** — a timeout that returns but leaves the work running still leaks the
  resource; the operation must actually stop.

## Common Mistakes

- **No timeout at all** — the most common production incident: a default-infinite client timeout
  means one slow dependency hangs everything.
- **Returning without cancelling** — timing out the *waiter* but not the *work* leaves the
  connection/goroutine running; propagate cancellation.
- **Not propagating the deadline** — each hop using its own fresh timeout means total time is the
  sum; pass one deadline down the chain so it shrinks as time is spent.
- **Timeout shorter than the dependency's realistic latency** — guarantees failures under normal
  load; base it on the dependency's P99, not a guess.

## Key Takeaways

- Bound every blocking call; "slow" left unbounded exhausts resources worse than "failed."
- On timeout, cancel the underlying work, don't just stop waiting for it.
- Propagate a single deadline across a call chain so downstream stops when the client is gone.
- Timeouts feed circuit breakers (a timeout is a countable failure) and enable retries.

## Implementations

### JavaScript

**❌ Naive**

```js
// fetch with no timeout waits as long as the server (or network) makes it.
async function getQuote() {
  const res = await fetch("https://quotes.example.com"); // could hang indefinitely
  return res.json();
}
```

**✅ Idiomatic**

```js
// AbortController races a timer against the request and cancels it on timeout.
async function getQuote(ms = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms); // fire the deadline
  try {
    const res = await fetch("https://quotes.example.com", { signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(timer); // cancel the request AND clean up the timer
  }
}
```

**🧠 Tradeoff** — `AbortController` is the right tool: it both bounds the wait *and* actually
cancels the fetch, so no socket is left hanging. The `finally` cleanup avoids a leaked timer. The
subtlety JS shares with everyone: aborting the client doesn't guarantee the server stopped, so a
subsequent retry needs idempotency.

### Node.js

**❌ Naive**

```js
// Server-to-server call with no timeout; a slow upstream stalls the handler and its socket.
app.get("/data", async (_req, res) => {
  const r = await fetch("http://slow-service:8080/data"); // no deadline
  res.json(await r.json());
});
```

**✅ Idiomatic**

```js
// AbortSignal.timeout gives a one-liner deadline; propagate it down the chain.
app.get("/data", async (req, res, next) => {
  try {
    const r = await fetch("http://slow-service:8080/data", {
      signal: AbortSignal.timeout(2000), // abort after 2s
    });
    res.json(await r.json());
  } catch (e) {
    if (e.name === "TimeoutError") return res.status(504).send("upstream timeout");
    next(e);
  }
});
```

**🧠 Tradeoff** — `AbortSignal.timeout(ms)` is the modern Node idiom — a self-cancelling deadline
with no manual timer. Mapping the `TimeoutError` to a `504` gives the client a clear, fast failure
instead of a hang. To propagate a deadline across hops, thread the remaining budget into each
downstream `AbortSignal` so the total stays bounded.

### Python

**❌ Naive**

```python
# No timeout means requests waits forever on a stalled server — a classic outage.
def get_quote():
    return requests.get("https://quotes.example.com").json()  # missing timeout=
```

**✅ Idiomatic**

```python
# Always pass a timeout; in asyncio, wrap with a deadline that cancels the task.
def get_quote():
    return requests.get("https://quotes.example.com", timeout=3).json()  # (connect, read)

import asyncio
async def get_quote_async(session):
    async with asyncio.timeout(3):          # cancels the awaited work on deadline
        async with session.get("https://quotes.example.com") as resp:
            return await resp.json()
```

**🧠 Tradeoff** — `requests`' `timeout=` and `asyncio.timeout()` are the idioms; the async version
*cancels* the coroutine on the deadline, releasing the connection. The perennial Python footgun is
omitting `timeout=` — the default is no timeout, so a single stalled call can pin a worker
indefinitely. Make it a lint rule.

### Elixir

**❌ Naive**

```elixir
# Task.await defaults to 5s but a bare receive or an infinite timeout blocks the process.
result = Task.await(task, :infinity)  # blocks this process forever if the task hangs
```

**✅ Idiomatic**

```elixir
# Deadlines are first-class: Task.await/2 and Task.yield/2 take timeouts; kill on expiry.
task = Task.async(fn -> slow_call() end)

case Task.yield(task, 3_000) || Task.shutdown(task, :brutal_kill) do
  {:ok, result} -> {:ok, result}
  nil -> {:error, :timeout}     # deadline passed; task was shut down
end
```

**🧠 Tradeoff** — Elixir bakes timeouts into its concurrency primitives: `Task.await/yield`,
`GenServer.call/3`, and `receive ... after` all take deadlines. The `yield || shutdown` idiom is
important — it both stops waiting *and* kills the task, so the work truly stops (process isolation
makes that clean). The lesson mirrors the others: never pass `:infinity` to something that talks to
the outside world.

### Go

**❌ Naive**

```go
// http.Get uses the default client with no timeout — it can block indefinitely.
resp, err := http.Get("https://quotes.example.com") // no deadline
```

**✅ Idiomatic**

```go
// context.WithTimeout carries a deadline the whole call chain respects and cancels on.
func getQuote(ctx context.Context) (Quote, error) {
    ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
    defer cancel() // release resources; cancel propagates down

    req, _ := http.NewRequestWithContext(ctx, "GET", "https://quotes.example.com", nil)
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return Quote{}, err // includes context.DeadlineExceeded on timeout
    }
    defer resp.Body.Close()
    return decode(resp.Body)
}
```

**🧠 Tradeoff** — `context.Context` is Go's deadline mechanism, and it's the standout here: one
`ctx` carries the timeout *and* cancellation through every function that accepts it, so a downstream
call automatically inherits (and shrinks within) the deadline. `defer cancel()` frees resources
promptly. It's more threading of `ctx` through signatures than other languages, but propagation is
first-class rather than bolted on.

## Applications

- **HTTP clients & servers** — connect/read/write timeouts on every call, plus server-side request
  deadlines (backend & frontend).
- **Database queries** — statement timeouts so a runaway query can't hold a connection forever
  (backend).
- **RPC frameworks** — gRPC deadlines propagate across service hops so the whole chain honors the
  caller's budget (backend).
- **Locks & coordination** — bounded lock acquisition so a stuck holder can't deadlock waiters
  (backend).
- **UI operations** — bounding a fetch so the interface can show a timeout state instead of an
  endless spinner (frontend).

## Related Patterns

- **Retry** — a timeout produces the bounded failure that a retry can then re-attempt; together they
  turn a hang into "try again, briefly."
- **Circuit Breaker** — timeouts are how the breaker *counts* slow calls as failures so it can trip.
- **Bulkhead** — timeouts release resources quickly; bulkheads cap how many can be held at once —
  both keep a slow dependency from exhausting the caller.
