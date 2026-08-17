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
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
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

*Targets modern JavaScript (ES2015+).*

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

*Targets Node.js 24.*

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

*Targets Python 3.12.*

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

*Targets Elixir 1.18.*

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

*Targets Go 1.26.*

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

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// Every request goes straight to legacy — no seam to migrate one feature at a time.
Console.WriteLine(Legacy.Handle("/checkout")); // legacy: handled /checkout
Console.WriteLine(Legacy.Handle("/cart"));     // migrating anything = big-bang rewrite

static class Legacy
{
    public static string Handle(string path) => $"legacy: handled {path}";
}
```

**✅ Idiomatic**

```csharp
// Top-level statements: the demo runs first, the types follow.
var facade = new Facade(new NewSystem(), new LegacySystem());
facade.Migrate("/checkout");

Console.WriteLine(facade.Handle("/checkout")); // new: handled /checkout
Console.WriteLine(facade.Handle("/orders"));   // legacy: handled /orders

facade.Migrate("/cart");
Console.WriteLine(facade.Handle("/cart"));     // new: handled /cart

facade.Rollback("/checkout");                  // a bad migration is one call to undo
Console.WriteLine(facade.Handle("/checkout")); // legacy: handled /checkout

public interface IBackend
{
    string Handle(string path);
}

public sealed class LegacySystem : IBackend
{
    public string Handle(string path) => $"legacy: handled {path}";
}

public sealed class NewSystem : IBackend
{
    public string Handle(string path) => $"new: handled {path}";
}

// Primary constructor: the facade fronts both systems and owns the routing rules.
public sealed class Facade(IBackend newSystem, IBackend legacy)
{
    private readonly HashSet<string> _migrated = [];

    public void Migrate(string prefix) => _migrated.Add(prefix);
    public void Rollback(string prefix) => _migrated.Remove(prefix);

    public string Handle(string path) =>
        _migrated.Any(p => path.StartsWith(p)) ? newSystem.Handle(path) : legacy.Handle(path);
}
```

**🧠 Tradeoff** — In production .NET the facade is YARP (Microsoft's reverse proxy) or ASP.NET
Core middleware matching path prefixes; this in-process version keeps the mechanism visible:
migrating is `Migrate`, rollback is `Rollback`, and nothing else changes. `IBackend` is a
one-method contract, so a `Func<string, string>` per backend would do — the interface earns its
place once backends grow config or health checks. Routing stays the easy half; the shared data
during the overlap is still yours to solve.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// All traffic hits the legacy system directly — no seam to migrate through.
fn legacy(path: &str) -> String {
    format!("legacy: handled {path}")
}

fn main() {
    println!("{}", legacy("/checkout")); // big-bang rewrite or nothing
    println!("{}", legacy("/cart"));
}
```

**✅ Idiomatic**

```rust
// The facade fronts both systems; the migrated list is the whole migration state.
trait Backend {
    fn handle(&self, path: &str) -> String;
}

struct Legacy;
impl Backend for Legacy {
    fn handle(&self, path: &str) -> String {
        format!("legacy: handled {path}")
    }
}

struct NewSystem;
impl Backend for NewSystem {
    fn handle(&self, path: &str) -> String {
        format!("new: handled {path}")
    }
}

struct Facade<N: Backend, L: Backend> {
    new_system: N,
    legacy: L,
    migrated: Vec<&'static str>,
}

impl<N: Backend, L: Backend> Facade<N, L> {
    fn migrate(&mut self, prefix: &'static str) {
        self.migrated.push(prefix);
    }
    fn rollback(&mut self, prefix: &str) {
        self.migrated.retain(|p| *p != prefix);
    }
    fn handle(&self, path: &str) -> String {
        if self.migrated.iter().any(|p| path.starts_with(p)) {
            self.new_system.handle(path)
        } else {
            self.legacy.handle(path)
        }
    }
}

fn main() {
    let mut facade = Facade { new_system: NewSystem, legacy: Legacy, migrated: vec![] };
    facade.migrate("/checkout");

    println!("{}", facade.handle("/checkout")); // new: handled /checkout
    println!("{}", facade.handle("/orders"));   // legacy: handled /orders

    facade.rollback("/checkout");               // reversible by design
    println!("{}", facade.handle("/checkout")); // legacy: handled /checkout
}
```

**🧠 Tradeoff** — `Facade<N, L>` is generic, so both backends monomorphize: zero dispatch cost,
fixed at compile time — the right default when a facade fronts exactly two known systems. Reach
for `Box<dyn Backend>` only if the backend set is chosen at runtime from config. Be honest about
scale, though: a real strangler facade is a reverse proxy (nginx, Envoy) in front of two deployed
services, and the pattern is architectural — this single-process version shows the seam, not the
infrastructure, and the shared-data problem is untouched by either.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

// Every request goes straight to the legacy code — no seam to migrate through.
fn handle(path: []const u8) void {
    std.debug.print("legacy: handled {s}\n", .{path});
}

pub fn main() void {
    handle("/checkout"); // big-bang rewrite or nothing
    handle("/cart");
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// Both backends are stateless here, so a bare function pointer is the contract.
const Handler = *const fn (path: []const u8) void;

fn legacyHandle(path: []const u8) void {
    std.debug.print("legacy: handled {s}\n", .{path});
}

fn newHandle(path: []const u8) void {
    std.debug.print("new: handled {s}\n", .{path});
}

// The facade owns the routing table; migrating a feature is adding its prefix.
const Facade = struct {
    new_system: Handler,
    legacy: Handler,
    migrated: [8][]const u8 = undefined,
    count: usize = 0,

    pub fn migrate(self: *Facade, prefix: []const u8) void {
        self.migrated[self.count] = prefix;
        self.count += 1;
    }

    pub fn handle(self: Facade, path: []const u8) void {
        for (self.migrated[0..self.count]) |prefix| {
            if (std.mem.startsWith(u8, path, prefix)) return self.new_system(path);
        }
        self.legacy(path);
    }
};

pub fn main() void {
    var facade = Facade{ .new_system = newHandle, .legacy = legacyHandle };
    facade.migrate("/checkout");

    facade.handle("/checkout"); // new: handled /checkout
    facade.handle("/orders");   // legacy: handled /orders

    facade.migrate("/cart");
    facade.handle("/cart");     // new: handled /cart
}
```

**🧠 Tradeoff** — Function pointers cover stateless backends; the moment a backend carries state
(a connection pool, say), Zig's answer is the two-field vtable idiom (`*anyopaque` context plus
function pointer) that `std.mem.Allocator` uses. The fixed `[8][]const u8` table dodges the
allocator for a demo — a real routing table would take one and grow. And keep perspective: the
strangler facade in the wild is a proxy in front of two deployed systems; this shows the shape of
the seam, and the routing was never the hard part — the shared data is.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// Every request goes straight to legacy — no seam to migrate one feature at a time.
class Legacy {
    static String handle(String path) {
        return "legacy: handled " + path;
    }
}

public class Demo {
    public static void main(String[] args) {
        System.out.println(Legacy.handle("/checkout")); // legacy: handled /checkout
        System.out.println(Legacy.handle("/cart"));     // migrating anything = big-bang rewrite
    }
}
```

**✅ Idiomatic**

```java
import java.util.HashSet;
import java.util.Set;

// The backend contract — one method, so it's a functional interface.
interface Backend {
    String handle(String path);
}

class LegacySystem implements Backend {
    public String handle(String path) { return "legacy: handled " + path; }
}

class NewSystem implements Backend {
    public String handle(String path) { return "new: handled " + path; }
}

// The facade fronts both systems and owns the routing rules.
class Facade {
    private final Backend newSystem;
    private final Backend legacy;
    private final Set<String> migrated = new HashSet<>();

    Facade(Backend newSystem, Backend legacy) {
        this.newSystem = newSystem;
        this.legacy = legacy;
    }

    void migrate(String prefix) { migrated.add(prefix); }
    void rollback(String prefix) { migrated.remove(prefix); }

    String handle(String path) {
        var target = migrated.stream().anyMatch(path::startsWith) ? newSystem : legacy;
        return target.handle(path);
    }
}

public class Demo {
    public static void main(String[] args) {
        var facade = new Facade(new NewSystem(), new LegacySystem());
        facade.migrate("/checkout");

        System.out.println(facade.handle("/checkout")); // new: handled /checkout
        System.out.println(facade.handle("/orders"));   // legacy: handled /orders

        facade.migrate("/cart");
        System.out.println(facade.handle("/cart"));     // new: handled /cart

        facade.rollback("/checkout");                   // a bad migration is one call to undo
        System.out.println(facade.handle("/checkout")); // legacy: handled /checkout
    }
}
```

**🧠 Tradeoff** — In production Java the facade is an API gateway: Spring Cloud Gateway route
predicates (or nginx/Envoy) in front of the two deployed systems, where migrating a feature is a
route-config change and rollback needs no redeploy. This in-process version keeps the mechanism
visible: one contract, two implementations, a routing set that *is* the migration state. `Backend`
is a functional interface, so a lambda per backend would compile — but here each implementation
stands for a whole system, and the class earns its place the moment it grows config or health
checks. Either way, routing is the easy half; the shared data during the overlap is still yours.

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
