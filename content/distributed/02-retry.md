---
id: retry
category: distributed
sequence: 2
title: Retry
also_known_as: [Retry with Backoff]
gof: false
intent: "Automatically re-attempt a failed operation that might succeed on a second try — with backoff and jitter so retries don't stampede the dependency."
frequency: high
difficulty: beginner
tags: [distributed, resilience, transient-faults, backoff, idempotency]
related: [circuit-breaker, timeout, bulkhead]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

When an operation fails in a way that might be **transient** — a dropped connection, a brief
timeout, a `503` — try it again instead of surfacing the error. Wait a little between attempts,
grow the wait each time (**exponential backoff**), and add randomness (**jitter**) so many clients
don't all retry in lockstep.

Networks blink. A retry turns a momentary glitch into a non-event, without the caller or the user
ever seeing it — provided you retry the right failures, a bounded number of times, on operations
that are safe to repeat.

## The Problem

Treating every failure as final is brittle over a network:

- **Transient faults surface as errors** — a one-off connection reset or a load-balancer hiccup
  fails a request that would have worked a moment later.
- **Naive retries stampede** — retrying immediately, with no delay, hammers a struggling service
  and can turn a blip into an outage (a "retry storm").
- **Synchronized retries** — many clients retrying on the same fixed schedule hit the recovering
  service in waves ("thundering herd").
- **Unsafe repeats** — blindly retrying a non-idempotent operation (charge a card, send an email)
  can double it.

## Structure

Key Components:

- **Operation** — the call being attempted; ideally idempotent so repeats are safe.
- **Retry policy** — max attempts, which errors are retryable, and the backoff schedule.
- **Backoff** — the growing delay between attempts (usually exponential: 100ms, 200ms, 400ms…).
- **Jitter** — randomness added to the delay so clients desynchronize.

```
attempt 1 ──fail──► wait 100ms±j ──► attempt 2 ──fail──► wait 200ms±j ──► attempt 3 ──► give up / succeed
            (only for retryable errors, up to max attempts)
```

## When to Use

- Failures are often transient (network, rate limits, brief unavailability).
- The operation is idempotent, or you can make it so with an idempotency key.
- A short extra delay is acceptable in exchange for hiding blips.
- You can distinguish retryable errors (timeout, `503`) from permanent ones (`400`, `404`).

## Advantages and Disadvantages

### Advantages
- **Hides transient faults** — momentary glitches never reach the user.
- **Cheap resilience** — a policy wrapping a call, no new infrastructure.
- **Backoff + jitter protect the dependency** — spreads load instead of stampeding.

### Disadvantages
- **Amplifies real outages** — retrying a genuinely-down service multiplies load exactly when it's
  weakest (pair with a circuit breaker).
- **Added latency** — each retry adds its backoff to the worst-case response time.
- **Duplication risk** — retrying non-idempotent work can double side effects.

## Common Mistakes

- **Retrying non-idempotent operations** — re-sending a payment or POST without an idempotency key
  can charge twice; make the operation safe to repeat first.
- **Retrying non-retryable errors** — retrying a `400`/`404`/validation error just wastes time; the
  answer won't change.
- **No backoff or jitter** — immediate, synchronized retries create retry storms and thundering
  herds that deepen the outage.
- **Unbounded retries** — retrying forever turns a transient failure into a hung request; cap
  attempts and total time.

## Key Takeaways

- Retry *transient*, *retryable* failures on *idempotent* operations — not everything.
- Use exponential backoff plus jitter so retries don't stampede or synchronize.
- Bound attempts and total elapsed time; failing after N is a feature, not a bug.
- Combine with a circuit breaker so retries stop once failure is sustained, not transient.

## Implementations

### JavaScript

**❌ Naive**

```js
// One shot — a transient network blip surfaces as a hard failure.
async function loadProfile(id) {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error(res.status);
  return res.json();
}
```

**✅ Idiomatic**

```js
// Retry retryable failures with exponential backoff + jitter, bounded attempts.
async function withRetry(fn, { attempts = 4, baseMs = 200 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      const retryable = e.status === undefined || e.status >= 500 || e.status === 429;
      if (!retryable || i === attempts - 1) throw e;
      const backoff = baseMs * 2 ** i;
      const jitter = Math.random() * backoff;       // desynchronize
      await new Promise((r) => setTimeout(r, backoff + jitter));
    }
  }
}
// await withRetry(() => loadProfile(id));
```

**🧠 Tradeoff** — A small `withRetry` wrapper hides blips for a handful of lines, and exponential
backoff with jitter keeps it polite. It only re-runs the passed function, so idempotency is the
caller's responsibility — retrying a GET is safe, retrying a POST needs an idempotency key. It
doesn't know when a service is truly *down*, which is what a circuit breaker adds.

### Node.js

**❌ Naive**

```js
// Server-to-server call with no retry; a transient upstream error fails the request.
const data = await fetch("http://inventory:8080/stock").then((r) => r.json());
```

**✅ Idiomatic**

```js
// A mature library (p-retry) handles backoff, jitter, and abort on non-retryable errors.
const pRetry = require("p-retry");

async function getStock() {
  return pRetry(
    async () => {
      const res = await fetch("http://inventory:8080/stock");
      if (res.status >= 500) throw new Error("upstream " + res.status); // retryable
      if (!res.ok) throw new pRetry.AbortError("client error " + res.status); // don't retry
      return res.json();
    },
    { retries: 4, factor: 2, minTimeout: 200, randomize: true }, // exp backoff + jitter
  );
}
```

**🧠 Tradeoff** — `p-retry` gives production retry semantics — exponential backoff, randomization,
and `AbortError` to bail out of permanent failures — so you're not re-deriving the schedule. The
`AbortError` distinction is the important discipline: retry `5xx`/timeouts, abort on `4xx`.
Combine with a breaker so a sustained upstream outage stops the retries.

### Python

**❌ Naive**

```python
# Single attempt; a brief connection error propagates.
def fetch_report():
    return requests.get("https://reports.example.com/latest", timeout=5).json()
```

**✅ Idiomatic**

```python
from tenacity import retry, stop_after_attempt, wait_exponential_jitter, retry_if_exception_type

@retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential_jitter(initial=0.2, max=5),   # exp backoff + jitter
    retry=retry_if_exception_type((ConnectionError, Timeout)),  # only transient
    reraise=True,
)
def fetch_report():
    resp = requests.get("https://reports.example.com/latest", timeout=5)
    resp.raise_for_status()
    return resp.json()
```

**🧠 Tradeoff** — `tenacity` turns retry into a declarative decorator: stop condition, wait
strategy, and *which* exceptions to retry, all in one place. Restricting `retry_if_exception_type`
to transient errors avoids retrying validation failures. The library is the idiomatic choice; the
one thing it can't decide for you is idempotency — that's a property of the operation.

### Elixir

**❌ Naive**

```elixir
# One attempt; a transient failure returns an error to the caller.
def fetch_rate do
  case HTTPoison.get("https://fx.example.com/rate") do
    {:ok, %{status_code: 200, body: body}} -> {:ok, Jason.decode!(body)}
    other -> {:error, other}
  end
end
```

**✅ Idiomatic**

```elixir
# Recursive retry with exponential backoff + jitter, retrying only transient errors.
def fetch_rate(attempt \\ 0, max \\ 4) do
  case do_fetch() do
    {:ok, rate} -> {:ok, rate}
    {:error, reason} when attempt < max - 1 and reason in [:timeout, :closed] ->
      backoff = trunc(:math.pow(2, attempt) * 200)
      Process.sleep(backoff + :rand.uniform(backoff))   # jitter
      fetch_rate(attempt + 1, max)
    error -> error
  end
end
# (the `retry` library provides a declarative macro for the same thing)
```

**🧠 Tradeoff** — Recursion with a backoff sleep is the natural Elixir shape, and pattern matching
on the error makes "retry only transient reasons" explicit. Often you don't even retry in-process:
you `let it crash` and a supervisor restarts the worker, or you push the job to Oban, which retries
with backoff durably. The `retry` library packages the inline version when you want it.

### Go

**❌ Naive**

```go
// One attempt; a transient error is returned as-is.
func fetchRate(ctx context.Context) (Rate, error) {
    resp, err := http.Get("https://fx.example.com/rate")
    // ...
    return rate, err
}
```

**✅ Idiomatic**

```go
// Bounded retry loop with exponential backoff + jitter, respecting ctx cancellation.
func fetchRate(ctx context.Context) (Rate, error) {
    const attempts = 4
    var err error
    for i := 0; i < attempts; i++ {
        var rate Rate
        rate, err = doFetch(ctx)
        if err == nil || !retryable(err) {
            return rate, err // success, or a permanent error — stop
        }
        backoff := time.Duration(1<<i) * 200 * time.Millisecond
        jitter := time.Duration(rand.Int63n(int64(backoff)))
        select {
        case <-time.After(backoff + jitter):
        case <-ctx.Done():
            return Rate{}, ctx.Err() // caller cancelled / deadline hit
        }
    }
    return Rate{}, err
}
```

**🧠 Tradeoff** — A plain loop with `time.After` and a `select` on `ctx.Done()` is idiomatic Go:
explicit backoff, jitter, and cooperative cancellation so retries respect the caller's deadline. No
framework needed, though `cenkalti/backoff` packages the schedule. The verbosity buys total clarity
about when it stops and how it interacts with `context`.

### CSharp

**❌ Naive**

```csharp
// One attempt; a transient upstream error fails the whole request.
using var http = new HttpClient();
var report = await http.GetStringAsync("https://reports.example.com/latest"); // 503 → done
```

**✅ Idiomatic**

```csharp
// Bounded attempts, exponential backoff + jitter, and only for retryable failures.
using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) }; // bound each attempt
var report = await WithRetry(
    () => http.GetStringAsync("https://reports.example.com/latest"),
    attempts: 4, baseDelay: TimeSpan.FromMilliseconds(200));

static async Task<T> WithRetry<T>(Func<Task<T>> fn, int attempts, TimeSpan baseDelay)
{
    for (var i = 0; ; i++)
    {
        try
        {
            return await fn();
        }
        catch (Exception e) when (IsTransient(e) && i < attempts - 1)
        {
            var backoff = baseDelay * (1 << i);                            // 200, 400, 800…
            var jitter = Random.Shared.NextDouble() * backoff.TotalMilliseconds;
            await Task.Delay(backoff + TimeSpan.FromMilliseconds(jitter)); // desynchronize
        }
    }
}

static bool IsTransient(Exception e) => e switch
{
    TaskCanceledException => true,                                  // timeout — retry
    HttpRequestException { StatusCode: null } => true,              // connection-level blip
    HttpRequestException h => (int?)h.StatusCode is >= 500 or 429,  // 5xx / throttled
    _ => false,                       // 4xx, validation… — the answer won't change
};
```

**🧠 Tradeoff** — The exception filter (`catch … when`) is the idiomatic classify step: a permanent
failure never enters the catch block, so it propagates with its original stack. `Task.Delay` waits
without holding a thread, and `Random.Shared` supplies jitter with no setup. In production the
schedule usually comes from Polly — `WaitAndRetryAsync` with decorrelated jitter, composed with its
timeout and circuit-breaker strategies — but the loop above is the whole idea. Idempotency stays
the operation's problem, not the wrapper's.

### Rust

**❌ Naive**

```rust
// One attempt; a transient error is returned as-is.
fn fetch_rate() -> Result<f64, FetchError> {
    do_fetch() // a dropped connection fails the whole request
}
```

**✅ Idiomatic**

```rust
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

// Which failures are worth another try is a type, not a guess.
#[derive(Debug)]
enum FetchError {
    Timeout,    // transient
    Connection, // transient
    BadRequest, // permanent — the answer won't change
}

impl FetchError {
    fn is_transient(&self) -> bool {
        match self {
            FetchError::Timeout | FetchError::Connection => true,
            FetchError::BadRequest => false,
        }
    }
}

fn with_retry<T>(mut f: impl FnMut() -> Result<T, FetchError>) -> Result<T, FetchError> {
    const ATTEMPTS: u32 = 4;
    const BASE_MS: u64 = 200;
    let mut attempt = 0;
    loop {
        match f() {
            Ok(v) => return Ok(v),
            Err(e) if e.is_transient() && attempt < ATTEMPTS - 1 => {
                let backoff = BASE_MS << attempt; // 200, 400, 800…
                let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().subsec_nanos();
                let jitter = u64::from(nanos) % backoff; // desynchronize, no rand crate
                thread::sleep(Duration::from_millis(backoff + jitter));
                attempt += 1;
            }
            Err(e) => return Err(e), // permanent, or out of attempts
        }
    }
}

// let rate = with_retry(do_fetch)?;
```

**🧠 Tradeoff** — Making `FetchError` an enum turns "which failures are retryable" into a
compile-time decision: `is_transient` matches exhaustively, so adding a variant forces you to
classify it before the code builds. `FnMut` is honest about the operation running more than once.
`thread::sleep` blocks the thread — fine in a worker; async Rust would use a runtime's timer, a
dependency these katas skip. The clock-derived jitter avoids the `rand` crate; use a real RNG in
production.

### Zig

**❌ Naive**

```zig
// One attempt; a transient error propagates to the caller as-is.
fn fetchRate() FetchError!f64 {
    return doFetch(); // a dropped connection fails the whole request
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

const FetchError = error{ Timeout, ConnectionReset, BadRequest };

// The error set is closed, so classification is an exhaustive switch.
fn isTransient(err: FetchError) bool {
    return switch (err) {
        error.Timeout, error.ConnectionReset => true, // worth another try
        error.BadRequest => false, // the answer won't change
    };
}

fn withRetry(f: *const fn () FetchError!f64) FetchError!f64 {
    const attempts = 4;
    const base_ms: u64 = 200;
    var prng = std.Random.DefaultPrng.init(@intCast(std.time.milliTimestamp()));
    var i: u32 = 0;
    while (true) {
        return f() catch |err| {
            if (!isTransient(err) or i == attempts - 1) return err; // permanent, or out of attempts
            const backoff = base_ms << @intCast(i); // 200, 400, 800…
            const jitter = prng.random().uintLessThan(u64, backoff); // desynchronize
            std.Thread.sleep((backoff + jitter) * std.time.ns_per_ms);
            i += 1;
            continue;
        };
    }
}

// const rate = try withRetry(doFetch);
```

**🧠 Tradeoff** — Error sets give the same guarantee as Rust's enum: the `switch` in `isTransient`
is exhaustive, so a new error can't sneak past classification. `catch` is plain control flow — no
unwinding, no hidden cost — which keeps the retry loop readable top to bottom. `std.Thread.sleep`
blocks the OS thread, the stable answer while Zig's async story settles. The PRNG is explicit and
locally seeded: no global state, and fixing the seed makes the jitter reproducible in tests.

### Java

**❌ Naive**

```java
// One attempt; a transient failure propagates as-is.
String fetchReport() throws Exception {
    var req = HttpRequest.newBuilder(URI.create("https://reports.example.com/latest"))
            .timeout(Duration.ofSeconds(5)).build();
    return http.send(req, HttpResponse.BodyHandlers.ofString()).body(); // blip → error
}
```

**✅ Idiomatic**

```java
import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.concurrent.Callable;
import java.util.concurrent.ThreadLocalRandom;

class Reports {
    private final HttpClient http = HttpClient.newHttpClient();

    String fetchReport() throws Exception {
        return withRetry(() -> {
            var req = HttpRequest.newBuilder(URI.create("https://reports.example.com/latest"))
                    .timeout(Duration.ofSeconds(5)) // bound each attempt
                    .build();
            return http.send(req, HttpResponse.BodyHandlers.ofString()).body();
        });
    }

    static <T> T withRetry(Callable<T> fn) throws Exception {
        final int attempts = 4;
        final long baseMs = 200;
        for (int i = 0; ; i++) {
            try {
                return fn.call();
            } catch (Exception e) {
                if (!isTransient(e) || i == attempts - 1) throw e; // permanent, or out of tries
                long backoff = baseMs << i;                        // 200, 400, 800…
                long jitter = ThreadLocalRandom.current().nextLong(backoff); // desynchronize
                Thread.sleep(backoff + jitter);
            }
        }
    }

    // The classify step: a switch over the exception's type.
    static boolean isTransient(Exception e) {
        return switch (e) {
            case HttpTimeoutException _ -> true; // deadline hit — worth another try
            case ConnectException _ -> true;     // connection-level blip
            default -> false;                    // 4xx, parse errors… the answer won't change
        };
    }
}
```

**🧠 Tradeoff** — The `switch` over exception types makes classification one visible expression:
transient types retry, everything else propagates with its original stack. `Thread.sleep` blocking
a thread used to be the knock against plain retry loops in Java — on a virtual thread
(`Executors.newVirtualThreadPerTaskExecutor()`) a sleeping thread costs close to nothing, so the
blocking loop is respectable again; and since `sleep` throws `InterruptedException`, cancellation
interrupts the backoff for free. Production schedules usually come from Resilience4j's `Retry` (or
Spring Retry) — decorrelated jitter, metrics, composition with the circuit breaker — but the loop
above is the whole idea. Idempotency stays the operation's problem, not the wrapper's.

## Applications

- **HTTP & RPC clients** — the default resilience wrapper on any network call, retrying `5xx`,
  `429`, and timeouts (backend & frontend).
- **Cloud SDKs** — AWS, GCP, and Azure clients retry throttling and transient errors with backoff
  out of the box (backend).
- **Message & job systems** — queues (SQS, Oban, Sidekiq) redeliver failed jobs with backoff,
  retry being a first-class feature (backend).
- **Database drivers** — reconnect and retry on transient connection drops or serialization
  failures (backend).
- **Frontend fetches** — retrying a flaky request a couple of times keeps a UI from flashing an
  error on a momentary blip (frontend).

**In modern systems:**

- **Multi-agent** — retry a model call with backoff on rate-limit or `5xx`, and retry a tool on
  transient failure, before the agent gives up on the turn.
- **Workflow engine** — a per-step retry policy declared in the step definition, with backoff and
  a max-attempts cap before it dead-letters.
- **Low-code** — a datasource binding retries a failed fetch before showing an error state.

## Related Patterns

- **Circuit Breaker** — the counterpart: retry handles *transient* failure, the breaker stops the
  retries once failure is *sustained*, preventing a retry storm.
- **Timeout** — bounds each attempt so a hung call fails and can be retried rather than blocking.
- **Idempotency (keys)** — the enabling companion: retries are only safe when repeating the
  operation has no extra effect.
