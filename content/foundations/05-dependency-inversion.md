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
languages: [javascript, python, elixir, go, csharp, rust, zig, java]
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

*Targets modern JavaScript (ES2015+).*

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

*Targets Python 3.12.*

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

*Targets Elixir 1.18.*

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

*Targets Go 1.26.*

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

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// High-level policy welded to a concrete detail.
public sealed class OrderService
{
    private readonly PostgresDatabase _db = new(); // newed up inside, untestable

    public void Place(Order order) => _db.Insert("orders", order);
}
```

**✅ Idiomatic**

```csharp
// Production wires Postgres; tests wire the fake — same OrderService.
var service = new OrderService(new PostgresStore());
var underTest = new OrderService(new InMemoryStore());
Console.WriteLine(underTest.Place(new Order(1))); // saved

// The abstraction, shaped by what the service needs.
public interface IStore
{
    string Save(Order order);
}

// Primary constructor: the dependency is injected, never constructed inside.
public sealed class OrderService(IStore store)
{
    public string Place(Order order) => store.Save(order);
}

public sealed class PostgresStore : IStore
{
    public string Save(Order order) => "saved"; // real insert
}

public sealed class InMemoryStore : IStore
{
    public List<Order> Rows { get; } = [];
    public string Save(Order order) { Rows.Add(order); return "saved"; }
}

public sealed record Order(int Id);
```

**🧠 Note** — constructor injection is so standard in .NET that ASP.NET Core ships a container
for it — but the principle is just this: `OrderService` names an `IStore` it owns, and the
concrete store arrives from outside. Keep the interface consumer-shaped (`Save(order)`), not a
mirror of the vendor SDK. And when the dependency is a single method, a `Func<Order, string>`
injected directly does the same inversion without declaring an interface at all.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
struct PostgresDatabase;
impl PostgresDatabase {
    fn insert(&self, _table: &str, _order: &str) { /* real insert */ }
}

// High-level policy welded to the concrete detail.
struct OrderService {
    db: PostgresDatabase, // can't test without it
}

impl OrderService {
    fn new() -> Self {
        Self { db: PostgresDatabase } // constructed inside
    }
    fn place(&self, order: &str) {
        self.db.insert("orders", order);
    }
}
```

**✅ Idiomatic**

```rust
// The abstraction the service owns.
trait Store {
    fn save(&mut self, order: &str) -> String;
}

struct PostgresStore;
impl Store for PostgresStore {
    fn save(&mut self, _order: &str) -> String {
        "saved".into() // real insert
    }
}

struct InMemoryStore {
    rows: Vec<String>,
}
impl Store for InMemoryStore {
    fn save(&mut self, order: &str) -> String {
        self.rows.push(order.to_string());
        "saved".into()
    }
}

// Generic over any Store — whoever constructs the service picks the detail.
struct OrderService<S: Store> {
    store: S,
}

impl<S: Store> OrderService<S> {
    fn new(store: S) -> Self {
        Self { store }
    }
    fn place(&mut self, order: &str) -> String {
        self.store.save(order)
    }
}

fn main() {
    let mut service = OrderService::new(PostgresStore);
    let mut under_test = OrderService::new(InMemoryStore { rows: Vec::new() });
    println!("{}", service.place("order-1"));    // saved
    println!("{}", under_test.place("order-1")); // saved
}
```

**🧠 Note** — Rust makes the injection cost explicit. The generic `OrderService<S: Store>` above
monomorphizes: zero dispatch overhead, but the store is fixed per instantiation — exactly right
when prod uses Postgres and tests use the fake. If the store must change at runtime, or the
generic parameter starts infecting every type that holds a service, switch the field to
`Box<dyn Store>` and pay one indirection. Either way the arrow is inverted: both stores conform
to a trait the service owns.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

const PostgresDatabase = struct {
    pub fn insert(_: PostgresDatabase, table: []const u8, order: []const u8) void {
        std.debug.print("insert into {s}: {s}\n", .{ table, order });
    }
};

// High-level policy welded to the concrete detail.
const OrderService = struct {
    db: PostgresDatabase = .{}, // constructed inside — can't swap, can't fake

    pub fn place(self: OrderService, order: []const u8) void {
        self.db.insert("orders", order);
    }
};
```

**✅ Idiomatic**

```zig
const std = @import("std");

// The abstraction: the two-field vtable idiom std.mem.Allocator uses.
const Store = struct {
    ptr: *anyopaque,
    saveFn: *const fn (ptr: *anyopaque, order: []const u8) []const u8,

    pub fn save(self: Store, order: []const u8) []const u8 {
        return self.saveFn(self.ptr, order);
    }
};

const OrderService = struct {
    store: Store, // depends on the abstraction only

    pub fn place(self: OrderService, order: []const u8) []const u8 {
        return self.store.save(order);
    }
};

const InMemoryStore = struct {
    rows: [16][]const u8 = undefined, // fixed buffer — no allocator needed here
    len: usize = 0,

    fn save(ptr: *anyopaque, order: []const u8) []const u8 {
        const self: *InMemoryStore = @ptrCast(@alignCast(ptr));
        self.rows[self.len] = order;
        self.len += 1;
        return "saved";
    }

    pub fn store(self: *InMemoryStore) Store {
        return .{ .ptr = self, .saveFn = save };
    }
};

pub fn main() void {
    var fake = InMemoryStore{};
    const under_test = OrderService{ .store = fake.store() };
    std.debug.print("{s}\n", .{under_test.place("order-1")}); // saved
    // Production builds a PostgresStore exposing the same store() — the service never changes.
}
```

**🧠 Note** — Zig's standard library is built on this exact inversion: everything that allocates
depends on `std.mem.Allocator`, a `*anyopaque` context plus function pointers, and the caller
injects the concrete allocator. The `Store` above is the same idiom at kata size — the erased
pointer plus `@ptrCast(@alignCast(...))` is the price of runtime swapping without interfaces.
When the store can be fixed at build time, the cheaper Zig form is comptime injection: make the
service generic over the store type (`fn OrderService(comptime S: type)`) and skip the vtable.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// High-level policy welded to a concrete detail.
class OrderService {
    private final PostgresDatabase db = new PostgresDatabase(); // newed up inside, untestable

    void place(Order order) { db.insert("orders", order); }
}
```

**✅ Idiomatic**

```java
import java.util.ArrayList;
import java.util.List;

// The abstraction, shaped by what the service needs.
interface Store {
    String save(Order order);
}

record Order(int id) {}

class OrderService {
    private final Store store; // depends on the abstraction only

    OrderService(Store store) { this.store = store; }
    String place(Order order) { return store.save(order); }
}

class PostgresStore implements Store {
    public String save(Order order) { return "saved"; } // real insert
}

class InMemoryStore implements Store {
    final List<Order> rows = new ArrayList<>();
    public String save(Order order) { rows.add(order); return "saved"; }
}

public class Demo {
    public static void main(String[] args) {
        var service = new OrderService(new PostgresStore());
        var underTest = new OrderService(new InMemoryStore());
        System.out.println(underTest.place(new Order(1))); // saved
    }
}
```

**🧠 Note** — this wiring is what Spring's whole container automates, but DIP needs none of it:
constructor injection is just `new` at the edge of the program. Two modern touches. `Store` has
one method, so it's a functional interface and a test fake is a lambda —
`new OrderService(order -> "saved")`. And keep the interface consumer-shaped (`save(order)`),
not a mirror of JDBC or the vendor SDK — the service owns the contract, the detail conforms.
Reach for a container when the object graph gets deep; the principle is already satisfied here.

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
