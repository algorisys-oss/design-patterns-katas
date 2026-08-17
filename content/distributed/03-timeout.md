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
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
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

*Targets modern JavaScript (ES2015+).*

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

*Targets Node.js 24.*

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

*Targets Python 3.12.*

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

*Targets Elixir 1.18.*

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

*Targets Go 1.26.*

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

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// The default HttpClient timeout is 100 seconds — near-unbounded for a request path.
using var http = new HttpClient();
var quote = await http.GetStringAsync("https://quotes.example.com"); // no real deadline
```

**✅ Idiomatic**

```csharp
// A CancellationToken carries the deadline; every call that accepts it stops on expiry.
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3)); // the deadline
try
{
    Console.WriteLine(await GetQuote(cts.Token));
}
catch (OperationCanceledException)
{
    Console.WriteLine("upstream timeout"); // bounded failure; resources released
}

static async Task<string> GetQuote(CancellationToken ct)
{
    using var http = new HttpClient();
    // Pass the token all the way down — the request is cancelled, not just the wait.
    return await http.GetStringAsync("https://quotes.example.com", ct);
}
```

**🧠 Tradeoff** — `CancellationTokenSource(TimeSpan)` is C#'s answer to Go's `context`: the token
carries deadline and cancellation together, and every layer that accepts it — `HttpClient`,
`Task.Delay`, database drivers — actually stops the work, not just the wait. For APIs that don't
take a token, `task.WaitAsync(timeout)` bounds the wait but abandons the work, so prefer threading
the token when you can. `HttpClient.Timeout` is a real backstop, but it doesn't propagate down a
call chain the way one shared token does.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// A blocking call with no deadline parks this thread for as long as the server likes.
fn get_quote() -> String {
    blocking_fetch("https://quotes.example.com") // could block forever
}
```

**✅ Idiomatic**

```rust
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

// Race the operation against the clock: run it on a thread, wait with a deadline.
fn with_timeout<T: Send + 'static>(
    limit: Duration,
    f: impl FnOnce() -> T + Send + 'static,
) -> Result<T, mpsc::RecvTimeoutError> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let _ = tx.send(f()); // if we timed out, the receiver is gone — send just fails
    });
    rx.recv_timeout(limit) // Err(Timeout) once the deadline passes
}

fn main() {
    match with_timeout(Duration::from_secs(3), || blocking_fetch("https://quotes.example.com")) {
        Ok(quote) => println!("{quote}"),
        Err(_) => println!("upstream timeout"), // bounded failure; this thread moves on
    }
}
```

**🧠 Tradeoff** — `recv_timeout` bounds the *wait*, not the *work*: std can't kill a thread, so the
abandoned fetch runs to completion and its `send` lands harmlessly in a closed channel. Real
cancellation has to live where the blocking happens — `TcpStream::set_read_timeout` pushes the
deadline into the socket itself — or in an async runtime, where `tokio::time::timeout` cancels by
dropping the future (a dependency these katas skip). Work that may still complete server-side is
exactly why timeout plus retry needs idempotency.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// A blocking fetch with no deadline parks this thread for as long as the server likes.
fn getQuote() f64 {
    return blockingFetch(); // no limit, no way out
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// Race the call against the clock: a worker fills a slot; we wait with a deadline.
const Slot = struct {
    mutex: std.Io.Mutex = .init,
    cond: std.Io.Condition = .init,
    done: bool = false,
    abandoned: bool = false, // the waiter gave up; the worker owns cleanup
    quote: f64 = 0,

    fn run(self: *Slot, allocator: std.mem.Allocator, io: std.Io) void {
        const q = blockingFetch(); // may take as long as it likes
        self.mutex.lockUncancelable(io); // the handoff must finish even if the task is canceled
        self.quote = q;
        self.done = true;
        const orphaned = self.abandoned;
        self.cond.signal(io);
        self.mutex.unlock(io);
        if (orphaned) allocator.destroy(self); // nobody is waiting — free ourselves
    }
};

fn getQuote(io: std.Io, allocator: std.mem.Allocator, limit: std.Io.Duration) !f64 {
    const slot = try allocator.create(Slot);
    slot.* = .{};
    const worker = try std.Thread.spawn(.{}, Slot.run, .{ slot, allocator, io });
    worker.detach(); // no join — the deadline decides who cleans up

    slot.mutex.lockUncancelable(io); // bailing here would leave the slot with no owner
    const deadline: std.Io.Timeout = .{ .duration = .{ .raw = limit, .clock = .awake } };
    while (!slot.done) {
        slot.cond.waitTimeout(io, &slot.mutex, deadline) catch |err| {
            // Deadline hit (or the wait was canceled). std can't kill the thread —
            // the fetch keeps running, so ownership of the slot passes to the worker.
            slot.abandoned = true;
            slot.mutex.unlock(io);
            return err;
        };
    }
    const quote = slot.quote;
    slot.mutex.unlock(io);
    allocator.destroy(slot); // result seen — the slot is ours to free
    return quote;
}

// const quote = try getQuote(io, allocator, .fromSeconds(3));
```

**🧠 Tradeoff** — Zig makes the ugly truth of timeouts explicit: you can stop *waiting*, but you
can't stop the *thread*, so a timeout is really an ownership handoff — the `abandoned` flag decides
whether the waiter or the orphaned worker frees the slot. Runtimes in other languages run this same
machinery; Zig just refuses to hide it, allocator and all. In 0.17 the wait itself is a capability
too: the mutex, condition, and clock all go through `io`, and the `Uncancelable` variants mark the
two lock sites where the handoff must not be interrupted. For sockets, the cleaner route is
pushing the deadline into the OS (`SO_RCVTIMEO` via `std.posix.setsockopt`) so the blocking read
itself returns an error.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// No request timeout — send blocks for as long as the server (or network) likes.
String getQuote() throws Exception {
    var req = HttpRequest.newBuilder(URI.create("https://quotes.example.com")).build();
    return http.send(req, HttpResponse.BodyHandlers.ofString()).body(); // no deadline
}
```

**✅ Idiomatic**

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.*;

class Quotes {
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2)).build();

    // Best: push the deadline into the client — it cancels the request, not just the wait.
    String getQuote() throws Exception {
        var req = HttpRequest.newBuilder(URI.create("https://quotes.example.com"))
                .timeout(Duration.ofSeconds(3)) // HttpTimeoutException on expiry
                .build();
        return http.send(req, HttpResponse.BodyHandlers.ofString()).body();
    }

    // Async: orTimeout bounds any CompletableFuture pipeline.
    CompletableFuture<String> getQuoteAsync() {
        var req = HttpRequest.newBuilder(URI.create("https://quotes.example.com")).build();
        return http.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenApply(HttpResponse::body)
                .orTimeout(3, TimeUnit.SECONDS); // completes with TimeoutException
    }

    // Blocking code with no timeout parameter: bound the wait, then interrupt the work.
    static String bounded(ExecutorService pool) throws Exception {
        Future<String> f = pool.submit(() -> blockingFetch());
        try {
            return f.get(3, TimeUnit.SECONDS); // waits at most 3s
        } catch (TimeoutException e) {
            f.cancel(true); // delivers an interrupt — the work stops only if it's interruptible
            throw e;
        }
    }
}
```

**🧠 Tradeoff** — `request.timeout` is the honest one: the HTTP client abandons the exchange and
frees the connection, so the work stops with the wait. `Future.get(timeout)` and `orTimeout` bound
only the *wait* — the task keeps running until `cancel(true)`'s interrupt lands, and interrupts
only land in code that blocks interruptibly (`java.net.http` does; a raw `InputStream.read` mostly
doesn't). So prefer pushing the deadline into the layer that actually blocks — request timeouts,
JDBC's `setQueryTimeout`, socket timeouts — and treat `orTimeout` as the backstop. Java has no
ambient deadline like Go's `context`: propagating a budget across hops means passing the remaining
time down yourself, though structured concurrency's scope-wide deadline (still in preview) is the
emerging answer.

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

**In modern systems:**

- **Multi-agent** — bound a model or tool call so a hung dependency can't freeze the whole agent
  loop, which otherwise waits forever with no signal.
- **Workflow engine** — a per-step deadline that fails the step (and triggers compensation)
  instead of hanging the instance indefinitely.

## Related Patterns

- **Retry** — a timeout produces the bounded failure that a retry can then re-attempt; together they
  turn a hang into "try again, briefly."
- **Circuit Breaker** — timeouts are how the breaker *counts* slow calls as failures so it can trip.
- **Bulkhead** — timeouts release resources quickly; bulkheads cap how many can be held at once —
  both keep a slow dependency from exhausting the caller.
