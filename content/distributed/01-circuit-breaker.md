---
id: circuit-breaker
category: distributed
sequence: 1
title: Circuit Breaker
also_known_as: []
gof: false
intent: "Stop calling a failing dependency for a while — trip a 'breaker' after repeated failures so calls fail fast instead of piling up, then test for recovery."
frequency: high
difficulty: intermediate
tags: [distributed, resilience, fault-tolerance, fail-fast, cascading-failure]
related: [retry, timeout, bulkhead]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Wrap calls to a remote dependency in a **breaker** that watches for failures. After too many, the
breaker **trips open** and every call fails immediately — no waiting, no retrying — for a cooldown
period. Then it lets one trial call through; success closes it again, failure re-opens it.

Like an electrical breaker, it protects the system from a fault downstream. A dependency that's
down or slow stops consuming your threads, connections, and patience; you fail fast and shed load
instead of amplifying the outage.

## The Problem

When a downstream service degrades, naive callers make it worse:

- **Piling on a sick service** — every request still tries the failing dependency, so it never
  gets breathing room to recover, and retries hammer it harder.
- **Resource exhaustion** — calls to a *slow* service hold threads and connections until they time
  out; enough of them and the caller runs out of capacity and falls over too.
- **Cascading failure** — one struggling service drags down everything that calls it, which drags
  down everything that calls *them* — an outage that spreads.
- **Wasted latency** — you wait for the full timeout on every call to something you already know
  is broken.

## Structure

Key Components:

- **Circuit Breaker** — wraps the call and holds state: **Closed** (calls flow, failures counted),
  **Open** (calls fail fast), **Half-Open** (one trial call allowed to test recovery).
- **Failure threshold** — how many failures (or what error rate) trips the breaker Open.
- **Reset timeout** — how long to stay Open before allowing a trial call (Half-Open).
- **Fallback** (optional) — what to return while Open (cached value, default, error).

```
        failures ≥ threshold          reset timeout elapsed
Closed ───────────────────────► Open ──────────────────────► Half-Open
  ▲   (calls flow, count fails)  (fail fast)   (one trial call)  │
  └──────────── trial succeeds ─────────────────────────────────┘
                 trial fails → back to Open
```

## When to Use

- Calls to a remote dependency can fail or slow down, and you want to fail fast when they do.
- Repeated calls to a broken service risk exhausting the caller's resources.
- One dependency's failure could cascade across your system.
- You have a sensible fallback, or failing fast is better than hanging.

## Advantages and Disadvantages

### Advantages
- **Fail fast** — no waiting on a dependency you know is down; latency stays bounded.
- **Protects the caller** — stops a slow dependency from exhausting threads/connections.
- **Gives the dependency room** — backing off lets a struggling service recover.

### Disadvantages
- **Tuning is hard** — thresholds and timeouts too tight trip on blips; too loose don't protect.
- **False trips** — a transient spike can open the breaker and reject healthy traffic.
- **Added state** — per-dependency breaker state to hold, share (across instances?), and observe.

## Common Mistakes

- **No timeout under it** — a breaker counts *failures*, but a call that hangs forever never
  "fails"; always pair it with a timeout so slow counts as failed.
- **One breaker for everything** — a single breaker across unrelated dependencies trips on one and
  blocks the others; scope a breaker per dependency (see Bulkhead).
- **Retrying through an open breaker** — stacking retries on top defeats fail-fast; retry *inside*
  the breaker's closed state, not against an open one.
- **Silent trips** — an open breaker rejecting traffic with no metric or log hides the outage; emit
  state changes.

## Key Takeaways

- Three states — Closed, Open, Half-Open — turn "keep trying a broken service" into "fail fast,
  then test for recovery."
- The point is protecting the *caller* and shedding load, not fixing the dependency.
- Always put a timeout underneath so a hung call registers as a failure.
- Scope one breaker per dependency, and make trips observable.

## Implementations

### JavaScript

**❌ Naive**

```js
// Every call tries the failing service; slow failures pile up and hang the caller.
async function getRate() {
  return fetch("https://fx.example.com/rate").then((r) => r.json()); // no protection
}
```

**✅ Idiomatic**

```js
// A minimal breaker: count failures, open after a threshold, half-open after a cooldown.
function circuitBreaker(fn, { threshold = 5, cooldownMs = 10_000 } = {}) {
  let failures = 0;
  let openedAt = 0;
  let state = "closed";
  return async (...args) => {
    if (state === "open") {
      if (Date.now() - openedAt < cooldownMs) throw new Error("circuit open"); // fail fast
      state = "half-open"; // allow one trial
    }
    try {
      const result = await fn(...args);
      failures = 0;
      state = "closed"; // success closes it
      return result;
    } catch (e) {
      if (++failures >= threshold || state === "half-open") {
        state = "open";
        openedAt = Date.now();
      }
      throw e;
    }
  };
}
// const getRate = circuitBreaker(() => fetch(...).then((r) => r.json()));
```

**🧠 Tradeoff** — A closure holding `failures`/`state` is a complete breaker in a few lines, and
wrapping any async function protects the caller from a down dependency. In the browser it's
per-tab and in-memory, which is fine for client-side calls. It counts thrown errors, so it only
works if the wrapped call actually rejects on failure — pair it with a fetch timeout.

### Node.js

**❌ Naive**

```js
// A route that calls a flaky upstream with no breaker will hang every request when it's down.
app.get("/price", async (_req, res) => {
  const r = await fetch("http://pricing:8080/price"); // upstream down → all requests stall
  res.json(await r.json());
});
```

**✅ Idiomatic**

```js
// Use a battle-tested breaker (opossum) with a timeout and a fallback.
const CircuitBreaker = require("opossum");

const call = () => fetch("http://pricing:8080/price").then((r) => r.json());
const breaker = new CircuitBreaker(call, {
  timeout: 2000,               // slow call counts as a failure
  errorThresholdPercentage: 50,
  resetTimeout: 10_000,        // half-open after 10s
});
breaker.fallback(() => ({ price: null, stale: true })); // what to serve while open

app.get("/price", (_req, res) => breaker.fire().then((p) => res.json(p)));
```

**🧠 Tradeoff** — `opossum` gives production-grade breakers — error-rate thresholds, a built-in
timeout, fallbacks, and metrics events — so you don't hand-roll the state machine. The dependency
and its configuration are the cost, plus the reminder that in a clustered app each instance has its
own breaker unless you share state.

### Python

**❌ Naive**

```python
# Blocking call to a flaky service with no protection ties up the worker.
def get_rate():
    return requests.get("https://fx.example.com/rate", timeout=2).json()
```

**✅ Idiomatic**

```python
import time

class CircuitBreaker:
    def __init__(self, threshold=5, cooldown=10):
        self.threshold, self.cooldown = threshold, cooldown
        self.failures, self.opened_at, self.state = 0, 0.0, "closed"

    def call(self, fn, *args, **kwargs):
        if self.state == "open":
            if time.monotonic() - self.opened_at < self.cooldown:
                raise RuntimeError("circuit open")   # fail fast
            self.state = "half-open"
        try:
            result = fn(*args, **kwargs)
            self.failures, self.state = 0, "closed"
            return result
        except Exception:
            self.failures += 1
            if self.failures >= self.threshold or self.state == "half-open":
                self.state, self.opened_at = "open", time.monotonic()
            raise

# breaker = CircuitBreaker(); breaker.call(get_rate)
# (or use the `pybreaker` library for a mature implementation)
```

**🧠 Tradeoff** — A small class with the same three-state logic is easy to write and test; the
mature `pybreaker` library adds thread-safety, listeners, and storage backends for sharing state.
Either way, `requests`' own `timeout=` is essential — without it a hung call never becomes a
"failure" and the breaker never trips.

### Elixir

**❌ Naive**

```elixir
# Directly calling a flaky external service; failures aren't tracked or shed.
def get_rate, do: HTTPoison.get!("https://fx.example.com/rate").body |> Jason.decode!()
```

**✅ Idiomatic**

```elixir
# A breaker is naturally a GenServer holding state; :fuse is the standard library.
# Install a fuse (threshold: 5 failures in 10s), then guard the call:
def get_rate do
  case :fuse.ask(:fx_api, :sync) do
    :ok ->
      try do
        rate = do_get_rate()
        rate
      rescue
        e -> :fuse.melt(:fx_api); reraise e, __STACKTRACE__  # record a failure
      end
    :blown ->
      {:error, :circuit_open}   # fail fast while blown
  end
end
# :fuse.install(:fx_api, {{:standard, 5, 10_000}, {:reset, 30_000}})
```

**🧠 Tradeoff** — On the BEAM a breaker is just process state, and `:fuse` provides a robust one
(`ask`/`melt`, tolerance windows, auto-reset). It fits OTP: the breaker is a supervised process,
and "let it crash" plus a breaker gives layered resilience. The API is lower-level than
`opossum`/`pybreaker`, so you wire the melt-on-failure explicitly.

### Go

**❌ Naive**

```go
// Every request calls the upstream; when it's slow, goroutines and connections pile up.
func getRate() (Rate, error) {
    resp, err := http.Get("https://fx.example.com/rate") // no breaker, no shedding
    // ...
}
```

**✅ Idiomatic**

```go
// gobreaker wraps the call; Execute fails fast when the breaker is open.
import "github.com/sony/gobreaker"

var cb = gobreaker.NewCircuitBreaker(gobreaker.Settings{
    Name:        "fx-api",
    MaxRequests: 1,                // trial calls in half-open
    Timeout:     10 * time.Second, // stay open this long
    ReadyToTrip: func(c gobreaker.Counts) bool { return c.ConsecutiveFailures >= 5 },
})

func getRate(ctx context.Context) (Rate, error) {
    body, err := cb.Execute(func() (any, error) {
        return doGet(ctx, "https://fx.example.com/rate") // ctx carries the timeout
    })
    if err != nil {
        return Rate{}, err // includes gobreaker.ErrOpenState when tripped
    }
    return body.(Rate), nil
}
```

**🧠 Tradeoff** — `gobreaker` implements the state machine and `Execute` returns
`ErrOpenState` immediately when tripped — clean, idiomatic, and paired with a `context` timeout so
slow calls count as failures. Go's explicitness shows: you configure `ReadyToTrip` and thread
`ctx` yourself, but the breaker's behavior is entirely visible and testable.

## Applications

- **Microservice calls** — every synchronous service-to-service call is a candidate; breakers stop
  one bad service cascading (backend).
- **Third-party APIs** — payment, geocoding, and email providers wrapped so an outage there fails
  fast locally with a fallback (backend).
- **Service meshes** — Istio/Linkerd and libraries (Resilience4j, Polly, Hystrix's heirs) provide
  breakers as infrastructure (backend).
- **Database & cache clients** — trip when the datastore is unreachable to avoid connection-pool
  exhaustion (backend).
- **Frontend API clients** — a breaker on a flaky endpoint lets the UI show cached/degraded state
  instead of spinning (frontend).

## Related Patterns

- **Retry** — retry handles *transient* blips; the breaker handles *sustained* failure. Put retries
  inside the closed state, and let the breaker stop them once failure persists.
- **Timeout** — the essential partner: a timeout turns a hung call into a countable failure so the
  breaker can trip.
- **Bulkhead** — isolates resources per dependency so one failure can't exhaust everything; breakers
  and bulkheads are usually deployed together.
