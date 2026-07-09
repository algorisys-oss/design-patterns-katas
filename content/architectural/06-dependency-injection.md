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
languages: [javascript, node-js, python, elixir, go]
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

## Related Patterns

- **Dependency Inversion** — the principle (depend on abstractions); DI is a concrete technique for
  achieving it by supplying those abstractions from outside.
- **Hexagonal (Ports & Adapters)** — DI is how adapters get wired into the core's ports at the
  composition root.
- **Service Locator** — the alternative where objects *pull* dependencies from a registry; more
  hidden coupling, generally discouraged in favor of injection.
