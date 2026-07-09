---
id: dependency-inversion
category: foundations
kind: principle
sequence: 5
title: Dependency Inversion Principle
also_known_as: [DIP]
gof: false
intent: "Depend on abstractions, not concretions — high-level policy shouldn't rely on low-level detail."
frequency: high
difficulty: intermediate
tags: [solid, dip, abstraction, dependency-injection, decoupling]
related: [open-closed, interface-segregation, strategy, adapter]
languages: [javascript, python, elixir, go]
---

## The Principle

> High-level modules should not depend on low-level modules. Both should depend on abstractions.
> Abstractions should not depend on details; details should depend on abstractions.

Your business logic (high-level policy) shouldn't hard-wire a specific database, mailer, or API
(low-level detail). Put an abstraction between them and inject the detail, so policy stays stable
while details are swapped freely — and tested with fakes.

"Inversion" is the direction of the dependency arrow: instead of policy → detail, both point at
an interface the policy owns.

## The Smell

A high-level class that news-up a concrete low-level thing inside itself:

```
class OrderService {
  constructor() {
    this.db = new PostgresDatabase();  // welded to Postgres
    this.mailer = new SmtpMailer();    // welded to SMTP
  }
}
// can't test without a real DB; can't switch to another store without editing OrderService
```

## Why It Matters

- Business logic is testable with in-memory fakes — no real DB or network.
- Details (DB, transport, vendor) swap without touching policy.
- It's the mechanism behind OCP: extend behind the abstraction you depend on.

## Benefits and Cautions

### Benefits
- Decouples policy from detail; both depend on a stable interface.
- Enables dependency injection and easy testing.

### Cautions
- Every dependency behind an interface is over-abstraction — invert what actually varies or
  needs faking.
- The interface should be defined by the *consumer's* needs, not the provider's API.

## Common Mistakes

- **Newing dependencies inside** — construct-and-couple instead of inject.
- **Interface owned by the detail** — the abstraction should reflect what policy needs, not
  mirror the vendor SDK.
- **Inverting everything** — wrapping trivial, stable dependencies in needless interfaces.

## Key Takeaways

- DIP = depend on an abstraction; inject the concrete detail.
- The high-level module owns the interface; the low-level detail implements it.
- Injection makes policy testable and details swappable.

## Implementations

An `OrderService` that depends on a `Store` abstraction, not a concrete database.

### JavaScript

**❌ Naive**

```js
// High-level policy welded to a concrete low-level detail.
class OrderService {
  constructor() {
    this.db = new PostgresDatabase(); // hard dependency, untestable
  }
  place(order) { this.db.insert("orders", order); }
}
```

**✅ Idiomatic**

```js
// Policy depends on an abstraction it owns; the detail is injected.
class OrderService {
  constructor(store) { this.store = store; } // any Store works
  place(order) { return this.store.save(order); }
}

// Details implement the abstraction:
class PostgresStore { save(order) { /* real insert */ return "saved"; } }
class InMemoryStore { constructor() { this.rows = []; } save(order) { this.rows.push(order); return "saved"; } }

// Production wires Postgres; tests wire the in-memory fake — same OrderService.
const service = new OrderService(new PostgresStore());
const underTest = new OrderService(new InMemoryStore());
```

**🧠 Note** — `OrderService` now depends on a `Store` shape (`save`), not on Postgres, so it's
tested with `InMemoryStore` and re-pointed at any backend by injection. The dependency arrow
inverted: the detail conforms to what the service needs, not the other way around.

### Python

**❌ Naive**

```python
class OrderService:
    def __init__(self):
        self.db = PostgresDatabase()  # welded in

    def place(self, order):
        self.db.insert("orders", order)
```

**✅ Idiomatic**

```python
from typing import Protocol

class Store(Protocol):
    def save(self, order: dict) -> str: ...

class OrderService:
    def __init__(self, store: Store) -> None:  # inject the abstraction
        self._store = store
    def place(self, order: dict) -> str:
        return self._store.save(order)

class PostgresStore:
    def save(self, order: dict) -> str: ...        # real insert

class InMemoryStore:
    def __init__(self) -> None: self.rows: list[dict] = []
    def save(self, order: dict) -> str:
        self.rows.append(order); return "saved"

service = OrderService(PostgresStore())
under_test = OrderService(InMemoryStore())
```

**🧠 Note** — A `Store` `Protocol` defines what `OrderService` needs; any object with `save`
qualifies, so injection swaps Postgres for an in-memory fake in tests. Python's constructor
injection plus structural typing gives DIP with no framework — just pass the dependency in.

### Elixir

**❌ Naive**

```elixir
defmodule OrderService do
  # Calls a concrete module directly — welded to Postgres, hard to test.
  def place(order), do: PostgresStore.save(order)
end
```

**✅ Idiomatic**

```elixir
# Define the abstraction as a behaviour; inject the implementation.
defmodule Store do
  @callback save(order :: map()) :: {:ok, term()}
end

defmodule PostgresStore do
  @behaviour Store
  @impl true
  def save(order), do: {:ok, order}   # real insert
end

defmodule OrderService do
  # The store module is injected (arg here; often app config in practice).
  def place(order, store \\ PostgresStore), do: store.save(order)
end

# Tests pass an in-memory module implementing Store; prod uses config.
OrderService.place(order, InMemoryStore)
```

**🧠 Note** — Elixir inverts the dependency by taking the implementing *module* as an argument or
reading it from application config (`Application.get_env`). The `Store` behaviour is the
abstraction both sides depend on; tests inject a fake module. Config-based injection is the
common production form — swap the store without editing `OrderService`.

### Go

**❌ Naive**

```go
type OrderService struct {
	db *PostgresDatabase // concrete, welded in
}

func NewOrderService() *OrderService {
	return &OrderService{db: NewPostgresDatabase()}
}

func (s *OrderService) Place(order Order) error { return s.db.Insert("orders", order) }
```

**✅ Idiomatic**

```go
package orders

// The abstraction, defined by what the service needs (consumer-owned).
type Store interface {
	Save(order Order) error
}

type OrderService struct {
	store Store // depend on the interface
}

func NewOrderService(store Store) *OrderService { return &OrderService{store: store} }

func (s *OrderService) Place(order Order) error { return s.store.Save(order) }

// PostgresStore and an in-memory fake both implement Store; inject either.
```

**🧠 Note** — Idiomatically in Go the *consumer* declares the `Store` interface it needs, and any
type with `Save` satisfies it implicitly — so `OrderService` never imports the Postgres package.
Injecting the store via the constructor makes it trivially testable with a fake and swappable in
production. This "accept interfaces, return structs" habit is DIP by default.

## Applications

Where DIP shows up in practice:

- **Repositories** — services depend on a `Repository` interface, not a DB driver.
- **Notifications** — policy depends on a `Notifier`, injected with email/SMS/push.
- **Clock/time** — inject a time source so tests control "now."
- **Payment** — a `PaymentGateway` abstraction with vendor implementations injected.

## Related Principles & Patterns

- **Open/Closed** — you extend behind the abstraction DIP tells you to depend on.
- **Interface Segregation** — the injected abstractions should be small and consumer-shaped.
- **Strategy / Adapter** — inject a strategy; adapt a vendor to your abstraction.
