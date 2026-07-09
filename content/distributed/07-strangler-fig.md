---
id: strangler-fig
category: distributed
sequence: 7
title: Strangler Fig
also_known_as: [Strangler Application, Incremental Migration]
gof: false
intent: "Replace a legacy system incrementally by routing traffic through a facade that sends migrated features to the new system and the rest to the old — until the old one is gone."
frequency: medium
difficulty: intermediate
tags: [distributed, migration, legacy, incremental, routing]
related: [hexagonal, cache-aside, circuit-breaker]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Put a **facade** in front of the legacy system that intercepts every request. Rebuild one feature
at a time in a new system, and flip the facade to route *that* feature to the new code while
everything else still goes to the old. Feature by feature, the new system grows around the old one
until the legacy system handles nothing and can be deleted.

The name is a strangler fig: a vine that grows around a host tree, gradually taking over until the
original tree is gone but the shape remains. It replaces the "big bang rewrite" — which so often
fails — with a safe, reversible, incremental migration where the system keeps running the whole time.

## The Problem

The instinct with a creaky legacy system is to rewrite it wholesale. That's the pattern's cautionary
tale:

- **Big-bang rewrites fail** — a multi-year rewrite that must reach feature parity before *any*
  cutover routinely overruns, and often never ships.
- **No value until the end** — the business gets nothing from the new system until the whole thing
  is done, so risk and cost accumulate with no payback.
- **Frozen requirements** — the old system keeps changing while you rewrite, so you're chasing a
  moving target.
- **All-or-nothing cutover** — flipping everything at once is terrifying and hard to roll back if it
  goes wrong.

## Structure

Key Components:

- **Facade / Router** — a proxy in front of both systems that decides where each request goes.
- **Legacy System** — the existing system; still serves everything not yet migrated.
- **New System** — the replacement; grows one feature/route at a time.
- **Routing rules** — per-route (or per-request) config sending migrated traffic to the new system.
- **Data strategy** — how the two systems share or sync data during the overlap.

```
                     ┌── migrated routes ──► New System
Client ──► Facade ───┤
                     └── everything else ──► Legacy System
     over time, more routes move to New until Legacy handles none
```

## When to Use

- A large legacy system must be modernized without a risky big-bang rewrite.
- The system must keep running and delivering value throughout the migration.
- Features can be carved out and migrated one (or a few) at a time.
- You want each step to be small, verifiable, and reversible.

## Advantages and Disadvantages

### Advantages
- **Incremental & low-risk** — small steps, each verifiable and reversible; the system stays live.
- **Continuous value** — migrated features ship and pay off before the whole migration is done.
- **Easy rollback** — a bad migration is undone by routing that feature back to the legacy system.

### Disadvantages
- **Two systems at once** — you run, deploy, and monitor both for the (often long) overlap.
- **Data-sharing complexity** — old and new must read/write consistent data during the transition —
  usually the hardest part.
- **The tail never ends** — teams migrate the easy 80% and leave the gnarly 20% forever, so the
  legacy system lingers.

## Common Mistakes

- **No plan to finish** — migrating the easy features and stopping leaves *two* systems permanently;
  commit to decommissioning the legacy one.
- **Ignoring shared data** — routing is the easy half; if both systems touch the same data, you need
  a sync/ownership strategy or you'll get inconsistency.
- **Migrating too big a slice** — carving off a huge chunk at once reintroduces big-bang risk; keep
  each step small.
- **Facade with no fallback** — if the new system fails, the facade should be able to route back to
  legacy; without it, a migration bug is an outage.

## Key Takeaways

- Front both systems with a facade and move traffic feature-by-feature until legacy is empty.
- It replaces the big-bang rewrite with incremental, reversible steps that keep delivering value.
- The routing is easy; the shared *data* during overlap is the hard part — plan it first.
- Have a plan (and the will) to actually retire the legacy system, or you'll run two forever.

## Implementations

### JavaScript

**❌ Naive**

```js
// A frozen rewrite: build the whole new app, then flip everything at once.
// (No code — the anti-pattern is the plan: parity-then-cutover, big bang.)
```

**✅ Idiomatic**

```js
// A routing facade decides, per request, whether the new or legacy handler serves it.
const migrated = new Set(["/checkout", "/cart"]); // grows as features move

function facade(req, res) {
  if (migrated.has(req.path)) {
    return newSystem.handle(req, res);   // migrated feature
  }
  return legacyProxy(req, res);          // everything else still legacy
}
// flip a feature by adding its route to `migrated` — reversible by removing it.
```

**🧠 Tradeoff** — A route set the facade consults is the whole idea in miniature: migrating a
feature is adding a route, rolling back is removing it. The routing logic is trivial; what this
snippet hides is the real work — making `/checkout` in the new system read and write the *same*
data the legacy system uses during the overlap.

### Node.js

**❌ Naive**

```js
// Point clients directly at whichever backend — no seam to migrate incrementally.
app.use(createProxyMiddleware({ target: "http://legacy:8080" })); // all-or-nothing
```

**✅ Idiomatic**

```js
// An API gateway proxies migrated paths to the new service, the rest to legacy.
const { createProxyMiddleware } = require("http-proxy-middleware");

const toNew = createProxyMiddleware({ target: "http://new-service:3000", changeOrigin: true });
const toLegacy = createProxyMiddleware({ target: "http://legacy:8080", changeOrigin: true });

const migratedPrefixes = ["/api/checkout", "/api/cart"];

app.use((req, res, next) => {
  const useNew = migratedPrefixes.some((p) => req.path.startsWith(p));
  return (useNew ? toNew : toLegacy)(req, res, next);
});
```

**🧠 Tradeoff** — A proxy layer (`http-proxy-middleware`, or an nginx/Envoy gateway) routing by
path prefix is the canonical Node facade: config-driven, so migrating a feature is a config change
and rollback is instant. Adding a circuit breaker to the `toNew` route gives an automatic fallback
to legacy if the new service misbehaves — turning a risky cutover into a safe one.

### Python

**❌ Naive**

```python
# Rewrite everything in the new framework, cut over on launch day. (The anti-pattern.)
```

**✅ Idiomatic**

```python
# WSGI/ASGI dispatch: send migrated paths to the new app, the rest to the legacy app.
MIGRATED_PREFIXES = ("/checkout", "/cart")

def facade(environ, start_response):
    path = environ.get("PATH_INFO", "")
    app = new_app if path.startswith(MIGRATED_PREFIXES) else legacy_app
    return app(environ, start_response)

# `facade` is the WSGI entry point; move features by extending MIGRATED_PREFIXES.
```

**🧠 Tradeoff** — Because WSGI/ASGI apps are just callables, a dispatching facade that picks the new
or legacy app by path is clean and framework-agnostic — you can even run a new FastAPI service beside
a legacy Django app behind it. The routing is a few lines; the migration's substance is data
ownership and keeping both apps consistent, which no dispatcher solves for you.

### Elixir

**❌ Naive**

```elixir
# Replace the whole Phoenix app in one release. (Big-bang, the thing to avoid.)
```

**✅ Idiomatic**

```elixir
# A plug inspects the path and forwards migrated routes to the new system, else proxies legacy.
defmodule Facade do
  import Plug.Conn
  @migrated ["/checkout", "/cart"]

  def init(opts), do: opts
  def call(conn, _opts) do
    if Enum.any?(@migrated, &String.starts_with?(conn.request_path, &1)) do
      NewSystem.Router.call(conn, [])          # handle in-app
    else
      ReverseProxy.call(conn, upstream: "http://legacy:8080")  # proxy to legacy
    end
  end
end
```

**🧠 Tradeoff** — A `Plug` is the idiomatic seam in Elixir: it sits at the top of the pipeline and
routes each request to the new router or a reverse proxy to legacy, so features migrate by editing a
list. Phoenix's composability makes running new and old side by side natural. The BEAM doesn't make
the shared-data problem any easier, though — that's still the migration's crux.

### Go

**❌ Naive**

```go
// Serve entirely from one backend; nothing supports gradual migration.
http.Handle("/", httputil.NewSingleHostReverseProxy(legacyURL)) // all traffic to legacy
```

**✅ Idiomatic**

```go
// A handler routes migrated prefixes to the new backend, the rest to legacy.
func facade(newBackend, legacy *httputil.ReverseProxy, migrated []string) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        for _, p := range migrated {
            if strings.HasPrefix(r.URL.Path, p) {
                newBackend.ServeHTTP(w, r) // migrated feature
                return
            }
        }
        legacy.ServeHTTP(w, r) // everything else
    }
}
// migrated := []string{"/api/checkout", "/api/cart"} — grow this to move features.
```

**🧠 Tradeoff** — Go's `httputil.ReverseProxy` makes the facade a small, standard-library handler:
match a prefix, forward to the new or legacy proxy. It's explicit and fast, and you can wrap the new
backend with a timeout/circuit breaker for automatic fallback. The migration list can come from
config or a feature-flag service so flipping a route needs no redeploy.

## Applications

- **Monolith to microservices** — the standard way to decompose a monolith: extract one service,
  route its endpoints to it, repeat (backend).
- **Legacy platform replacement** — mainframe or old-stack systems modernized endpoint-by-endpoint
  behind an API gateway (backend).
- **Frontend migrations** — moving pages from a legacy SPA/server-rendered app to a new framework
  route-by-route behind a proxy (frontend).
- **API versioning & re-platforming** — routing some paths to a rewritten backend while the rest
  stay on the old one (backend).
- **Cloud migration** — shifting features from on-prem to cloud incrementally behind a routing layer
  (backend).

## Related Patterns

- **Hexagonal (Ports & Adapters)** — a clean-ported new system makes it easy to run beside legacy and
  share data through adapters during the migration.
- **Circuit Breaker** — wrapping the new backend so the facade falls back to legacy if the new
  service fails turns each migration step into a safe one.
- **Facade / Proxy** — the routing layer is literally a facade/proxy over the two systems, presenting
  one interface to clients throughout.
