---
id: dependency-injection
category: architectural
sequence: 6
title: Dependency Injection
also_known_as: [DI, Inversion of Control]
gof: false
intent: "Give an object its dependencies from the outside instead of letting it construct them, so what it depends on can be swapped, configured, and tested."
frequency: high
difficulty: beginner
tags: [architecture, decoupling, testability, inversion-of-control, wiring]
related: [dependency-inversion, hexagonal, repository]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Instead of an object reaching out and `new`-ing up the things it needs, **hand them to it** — via
its constructor, a function parameter, or configuration. The object declares *what* it depends on
(usually as an interface); a separate place decides *which* concrete thing it gets.

That move — construction pulled out of the object and up to a wiring layer — is what makes
dependencies swappable. The same service runs against a real payment gateway in production and a
fake in tests, with no change to the service itself.

## The Problem

When an object builds its own dependencies, it's welded to them:

- **Hard-wired concretes** — `this.gateway = new StripeGateway()` means you can't run the service
  without Stripe, can't test it without real HTTP, and can't switch providers without editing it.
- **Untestable** — there's no seam to insert a fake, so tests hit real databases and networks.
- **Hidden dependencies** — what a class needs is buried in its body, not visible in its signature.
- **Rigid configuration** — timeouts, credentials, and endpoints are baked in rather than supplied.

## Structure

Key Components:

- **Client / Service** — declares its dependencies (ideally as interfaces) and receives them.
- **Dependency (interface)** — the abstraction the client depends on.
- **Concrete implementations** — the real thing(s) that satisfy the interface.
- **Injector / Composition Root** — the one place that constructs concretes and wires them in
  (a container, a factory, or just `main`).

```
Container ──creates──► OrderService ──depends on──► «Gateway»
    │                                                   △ implements
    └──creates──────────────────────────────────► StripeGateway
      (the composition root wires the concrete into the service)
```

## When to Use

- A class depends on something external (I/O, a provider, a clock) you'll want to swap or fake.
- Tests need to substitute dependencies without patching globals.
- Configuration (endpoints, credentials, feature flags) should be supplied, not hard-coded.
- You want dependencies visible in signatures rather than hidden in constructors.

## Advantages and Disadvantages

### Advantages
- **Testability** — inject a fake/mock; no real network or database in unit tests.
- **Flexibility** — swap implementations (providers, storage) by changing wiring, not code.
- **Explicit dependencies** — a constructor/signature that lists what's needed documents the object.

### Disadvantages
- **Wiring overhead** — something must construct and connect everything; that composition root grows.
- **Indirection** — following "who provides this?" is harder, especially through a magic container.
- **Framework lock-in** — heavyweight DI containers add annotations, lifecycles, and startup magic
  that can obscure more than they help.

## Common Mistakes

- **Service Locator instead of injection** — having objects *pull* dependencies from a global
  registry hides them again and reintroduces coupling; prefer pushing them in.
- **Injecting concretes** — passing `StripeGateway` instead of a `Gateway` interface gives you the
  wiring flexibility but not the decoupling; depend on the abstraction.
- **Over-injecting** — threading a container everywhere, or injecting trivial value objects, adds
  ceremony without benefit; inject the volatile, external things.
- **Constructor doing work** — a constructor that also *uses* its dependencies (opens connections,
  makes calls) couples construction to side effects; construct, then act.

## Key Takeaways

- Push dependencies in from the outside instead of constructing them inside — that's the whole move.
- Depend on interfaces; let a single composition root choose the concretes.
- The big everyday payoff is testability: inject a fake with no global patching.
- You don't need a framework — a constructor parameter is dependency injection.

## Implementations

### JavaScript

**❌ Naive**

```js
// The service constructs its own gateway — welded to Stripe, untestable.
class OrderService {
  constructor() {
    this.gateway = new StripeGateway(process.env.STRIPE_KEY); // hard-wired
  }
  async checkout(cart) {
    return this.gateway.charge(cart.total);
  }
}
```

**✅ Idiomatic**

```js
// The gateway is injected; the service depends on the shape, not the vendor.
class OrderService {
  constructor(gateway) { this.gateway = gateway; } // injected dependency
  async checkout(cart) {
    return this.gateway.charge(cart.total);
  }
}

// composition root wires the real thing:
const service = new OrderService(new StripeGateway(process.env.STRIPE_KEY));
// tests inject a fake:
const test = new OrderService({ charge: async (n) => ({ ok: true, amount: n }) });
```

**🧠 Tradeoff** — Passing the gateway into the constructor turns an untestable class into one you
test with a two-line fake, and lets you swap providers by changing the wiring. JS needs no DI
framework — a constructor argument is enough — but nothing enforces the "shape," so a wrong fake
fails at call time rather than compile time.

### Node.js

**❌ Naive**

```js
// A module reaches for singletons at import time — implicit, global coupling.
const db = require("./db");          // shared connection, hard to swap
const mailer = require("./mailer");
async function welcome(userId) {
  const user = await db.users.byId(userId);
  await mailer.send(user.email, "welcome");
}
```

**✅ Idiomatic**

```js
// Factory functions take deps and return the wired unit; main composes them.
function makeWelcome({ users, mailer }) {          // dependencies injected
  return async (userId) => {
    const user = await users.byId(userId);
    await mailer.send(user.email, "welcome");
  };
}
// index.js (composition root)
const welcome = makeWelcome({ users: pgUsers(pool), mailer: smtpMailer(cfg) });
// tests: makeWelcome({ users: fakeUsers, mailer: { send: jest.fn() } })
```

**🧠 Tradeoff** — Factory functions that accept a `deps` object are the lightweight Node idiom:
explicit, no container, and trivially faked in tests. It keeps dependencies out of module-level
`require` singletons. For large apps a container (Awilix, InversifyJS) automates the wiring, at the
price of the indirection and startup magic those bring.

### Python

**❌ Naive**

```python
# Service instantiates its collaborators — no seam for tests or swaps.
class ReportService:
    def __init__(self):
        self.db = Database(DSN)          # hard-wired
        self.clock = SystemClock()

    def daily(self):
        return self.db.rows_since(self.clock.midnight())
```

**✅ Idiomatic**

```python
class ReportService:
    def __init__(self, db: "DB", clock: "Clock"):  # injected
        self.db = db
        self.clock = clock

    def daily(self):
        return self.db.rows_since(self.clock.midnight())

# composition root
service = ReportService(db=PostgresDB(DSN), clock=SystemClock())
# tests inject fakes — deterministic time, no database
service = ReportService(db=FakeDB(rows), clock=FrozenClock("2026-01-01"))
```

**🧠 Tradeoff** — Plain constructor injection with `Protocol`-typed parameters is idiomatic and
enough for most Python: fakes drop in, and a `FrozenClock` makes time-dependent logic testable.
Frameworks (`dependency-injector`, FastAPI's `Depends`) add containers and request-scoped wiring
when an app grows — useful, but constructor injection covers the 90% case without them.

### Elixir

**❌ Naive**

```elixir
# The module calls a concrete implementation directly — nothing to swap.
defmodule Report do
  def daily, do: MyApp.Postgres.rows_since(DateTime.utc_now())  # hard-wired
end
```

**✅ Idiomatic**

```elixir
# Inject via config/behaviours (compile- or runtime-configured), or pass deps in.
defmodule Report do
  # dependency resolved from config → swappable per environment/test
  defp repo, do: Application.get_env(:my_app, :repo, MyApp.Postgres)
  defp clock, do: Application.get_env(:my_app, :clock, MyApp.SystemClock)

  def daily, do: repo().rows_since(clock().now())
end
# config :my_app, repo: MyApp.Postgres, clock: MyApp.SystemClock
# test config: repo: MyApp.FakeRepo, clock: MyApp.FrozenClock
```

**🧠 Tradeoff** — Elixir "injects" through application config plus behaviours: the module looks up
its collaborators, and each environment (or `Mox` in tests) supplies a different implementation.
It's the community norm and keeps modules pure of hard-wired concretes. The subtlety is
implicitness — the dependency is resolved inside the module rather than handed in — so passing deps
as function arguments is often clearer for library code.

### Go

**❌ Naive**

```go
// Constructor builds its own dependency; no way to inject a fake.
type OrderService struct{ gw *StripeGateway }
func NewOrderService() *OrderService {
    return &OrderService{gw: NewStripeGateway(os.Getenv("STRIPE_KEY"))} // hard-wired
}
```

**✅ Idiomatic**

```go
// Depend on an interface; take it as a constructor parameter. main wires it.
type Gateway interface {
    Charge(amount int) error
}

type OrderService struct{ gw Gateway }

func NewOrderService(gw Gateway) *OrderService { // injected
    return &OrderService{gw: gw}
}

// main.go (composition root)
svc := NewOrderService(NewStripeGateway(os.Getenv("STRIPE_KEY")))
// tests: NewOrderService(fakeGateway{})
```

**🧠 Tradeoff** — Idiomatic Go DI is exactly this: depend on a small interface, accept it as a
parameter, and wire concretes in `main`. No framework, no tags — the dependency graph is plain
Go you can read top to bottom. For very large graphs, code generators (Google's `wire`) automate
the wiring while keeping it compile-time and explicit, avoiding runtime reflection containers.

### CSharp

**❌ Naive**

```csharp
// The service constructs its own gateway — welded to Stripe, untestable.
public sealed class OrderService
{
    private readonly StripeGateway _gateway =
        new(Environment.GetEnvironmentVariable("STRIPE_KEY")!); // hard-wired

    public Task Checkout(Cart cart) => _gateway.Charge(cart.Total);
}
```

**✅ Idiomatic**

```csharp
// Composition root: the top-level statements wire the concrete in.
var service = new OrderService(
    new StripeGateway(Environment.GetEnvironmentVariable("STRIPE_KEY")!));
await service.Checkout(new Cart(100));
// tests: new OrderService(new FakeGateway()) — no network, no key

public interface IGateway
{
    Task Charge(int amount);
}

public sealed class StripeGateway(string apiKey) : IGateway
{
    public Task Charge(int amount) => Task.CompletedTask; // real HTTP call with apiKey here
}

// Primary constructor: the dependency is the signature.
public sealed class OrderService(IGateway gateway)
{
    public Task Checkout(Cart cart) => gateway.Charge(cart.Total);
}

public sealed record Cart(int Total);
```

**🧠 Tradeoff** — Constructor injection through a primary constructor is the whole pattern, and
`IGateway` is compile-checked where the JS fake is duck-typed. What C# adds is a container in the
box: `new ServiceCollection().AddSingleton<IGateway, StripeGateway>()` builds an `IServiceProvider`,
and ASP.NET Core resolves constructor parameters from it automatically, with lifetimes (singleton,
scoped-per-request, transient) you'd otherwise manage by hand. The catch is that a missing
registration surfaces at startup, not compile time — the container trades visible wiring for
convenience. For a library or a small app, plain `new` in `Main` is still the clearest root.

### Rust

**❌ Naive**

```rust
// The service builds its own gateway — welded to Stripe, untestable.
struct OrderService {
    gateway: StripeGateway,
}

impl OrderService {
    fn new() -> Self {
        let key = std::env::var("STRIPE_KEY").unwrap(); // hard-wired
        Self { gateway: StripeGateway { api_key: key } }
    }
    fn checkout(&self, total: u32) -> Result<(), String> {
        self.gateway.charge(total)
    }
}
```

**✅ Idiomatic**

```rust
trait Gateway {
    fn charge(&self, amount: u32) -> Result<(), String>;
}

struct StripeGateway {
    api_key: String,
}

impl Gateway for StripeGateway {
    fn charge(&self, amount: u32) -> Result<(), String> {
        // real HTTP call with self.api_key here
        println!("charged {amount} via stripe");
        Ok(())
    }
}

// Generic over the trait: the dependency is injected and monomorphized.
struct OrderService<G: Gateway> {
    gateway: G,
}

impl<G: Gateway> OrderService<G> {
    fn new(gateway: G) -> Self {
        Self { gateway }
    }
    fn checkout(&self, total: u32) -> Result<(), String> {
        self.gateway.charge(total)
    }
}

fn main() {
    // composition root: main constructs the concrete and hands it in
    let service = OrderService::new(StripeGateway { api_key: "sk_live_x".to_string() });
    service.checkout(100).unwrap(); // charged 100 via stripe
}

// tests: impl Gateway for FakeGateway { ... } then
// let service = OrderService::new(FakeGateway::default());
```

**🧠 Tradeoff** — Rust has no reflection, so there's no runtime container to hide the graph — and
manual wiring in `main` is the honest, standard form, not a compromise. The generic
`OrderService<G>` monomorphizes each concrete gateway to zero-overhead calls, but the type parameter
spreads to everything that holds the service; `Box<dyn Gateway>` flattens that to one runtime type
at the cost of dynamic dispatch. Either way the compiler checks the entire dependency graph — a
missing or wrong dependency is a build error, not a startup surprise.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// The service builds its own gateway — welded to Stripe, untestable.
const OrderService = struct {
    gateway: StripeGateway,

    fn init() OrderService {
        return .{ .gateway = .{ .api_key = "sk_live_x" } }; // hard-wired
    }
    fn checkout(self: OrderService, total: u32) !void {
        try self.gateway.charge(total);
    }
};
```

**✅ Idiomatic**

```zig
const std = @import("std");

// No interfaces: the contract is comptime duck typing — any type with charge().
fn OrderService(comptime Gateway: type) type {
    return struct {
        gateway: Gateway, // injected

        fn checkout(self: @This(), total: u32) !void {
            try self.gateway.charge(total);
        }
    };
}

const StripeGateway = struct {
    api_key: []const u8,

    fn charge(self: StripeGateway, amount: u32) !void {
        // real HTTP call with self.api_key here
        std.debug.print("charged {d} via stripe ({s})\n", .{ amount, self.api_key });
    }
};

const FakeGateway = struct {
    fn charge(self: FakeGateway, amount: u32) !void {
        _ = self;
        std.debug.print("fake: recorded {d}, no network\n", .{amount});
    }
};

pub fn main() !void {
    // composition root: main picks the concrete type and value
    const service = OrderService(StripeGateway){ .gateway = .{ .api_key = "sk_live_x" } };
    try service.checkout(100); // charged 100 via stripe (sk_live_x)

    const test_service = OrderService(FakeGateway){ .gateway = .{} };
    try test_service.checkout(100); // fake: recorded 100, no network
}
```

**🧠 Tradeoff** — `OrderService(comptime Gateway: type)` is static dependency injection: the
compiler instantiates a service per concrete gateway, calls are direct (no vtable), and a type
missing `charge` fails at compile time. The cost is that the dependency is part of the type —
`OrderService(StripeGateway)` and `OrderService(FakeGateway)` are different types, so you can't
swap gateways at runtime or store mixed services in one array. When you need that, reach for the
two-field vtable idiom (`*anyopaque` context + function pointer) that `std.mem.Allocator` itself
uses — which is Zig injecting its most important dependency, the allocator, by hand everywhere.

### Java

**❌ Naive**

```java
// The service constructs its own gateway — welded to Stripe, untestable.
class OrderService {
    private final StripeGateway gateway =
        new StripeGateway(System.getenv("STRIPE_KEY")); // hard-wired

    void checkout(Cart cart) { gateway.charge(cart.total()); }
}
```

**✅ Idiomatic**

```java
interface Gateway {
    void charge(int amount);
}

class StripeGateway implements Gateway {
    private final String apiKey;

    StripeGateway(String apiKey) { this.apiKey = apiKey; }

    public void charge(int amount) {
        // real HTTP call with apiKey here
        System.out.println("charged " + amount + " via stripe");
    }
}

record Cart(int total) {}

// The dependency is the constructor signature — injected, never constructed inside.
class OrderService {
    private final Gateway gateway;

    OrderService(Gateway gateway) { this.gateway = gateway; }

    void checkout(Cart cart) { gateway.charge(cart.total()); }
}

public class Demo {
    public static void main(String[] args) {
        // composition root: main constructs the concrete and hands it in
        var service = new OrderService(new StripeGateway(System.getenv("STRIPE_KEY")));
        service.checkout(new Cart(100)); // charged 100 via stripe

        // tests: Gateway is a single-method interface, so a lambda is a fake
        var testService = new OrderService(amount ->
            System.out.println("fake: recorded " + amount + ", no network"));
        testService.checkout(new Cart(100)); // fake: recorded 100, no network
    }
}
```

**🧠 Tradeoff** — Constructor injection into a `final` field is the whole pattern, and no framework
appears in the code above — a fake is one lambda because `Gateway` is a functional interface. What
Java is famous for is the container layer on top: Spring, Guice, and CDI scan for components,
resolve constructor parameters by type, and manage lifecycles (singleton, request-scoped) and
proxies. That earns its keep in large apps, but it moves wiring errors from compile time to startup
and hides the graph behind annotations. Telling detail: modern Spring's own advice is plain
constructor injection — the container ends up calling the same constructor `main` would. For
libraries and small services, wiring by hand in `main` stays the clearest composition root.

## Applications

- **Testing** — the primary driver everywhere: inject fakes/mocks so unit tests avoid real I/O
  (backend & frontend).
- **Provider swaps** — payment, email, storage, and auth providers behind interfaces, chosen at
  wiring time (backend).
- **Environment configuration** — dev/test/prod supply different databases, endpoints, and
  credentials through the composition root (backend).
- **Framework backbones** — Spring, Angular, NestJS, and ASP.NET are built around DI containers
  that wire the whole app (backend & frontend).
- **Feature flags & A/B** — inject different strategy implementations per user or rollout without
  branching the callers (backend & frontend).

**In modern systems:**

- **Multi-agent** — inject the model client, tools, and memory into an agent so it's testable with
  mocks and reconfigurable without touching its logic.
- **Low-code** — the runtime injects datasources, validators, and theme into the renderer, so one
  schema runs against different backends.
- **Workflow engine** — inject the store and queue into the executor to swap in-memory for prod
  infra.

## Related Patterns

- **Dependency Inversion** — the principle (depend on abstractions); DI is a concrete technique for
  achieving it by supplying those abstractions from outside.
- **Hexagonal (Ports & Adapters)** — DI is how adapters get wired into the core's ports at the
  composition root.
- **Service Locator** — the alternative where objects *pull* dependencies from a registry; more
  hidden coupling, generally discouraged in favor of injection.
