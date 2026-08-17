---
id: hexagonal
category: architectural
sequence: 3
title: Hexagonal (Ports & Adapters)
also_known_as: [Ports and Adapters, Onion Architecture, Clean Architecture]
gof: false
intent: "Put the domain at the center and let the outside world plug in through interfaces the domain owns, so business logic never depends on frameworks, databases, or transports."
frequency: medium
difficulty: advanced
tags: [architecture, ports-adapters, dependency-inversion, testability, boundaries]
related: [layered, repository, dependency-inversion]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Make the **domain the center** of the system and surround it with **ports** — interfaces the
domain defines — that the outside world implements as **adapters**. HTTP, the database, the
message bus, the clock: all of them are adapters plugged into ports, and none of them are visible
to the core.

The defining rule is that **dependencies point inward**. The domain depends on nothing; adapters
depend on the domain's ports. Swap Postgres for an in-memory store, or REST for gRPC, by writing a
new adapter — the business logic doesn't change and doesn't even know.

## The Problem

In plain layered code the domain usually ends up depending *downward* on infrastructure: it
imports the database client, the HTTP library, the ORM. That inverts the value you wanted:

- **Framework lock-in** — the rules are tangled with a specific database and web framework, so
  replacing either means surgery on the core.
- **Slow, brittle tests** — you can't test a use case without spinning up a database and a server.
- **Leaky abstractions** — ORM models and request objects seep into business logic, coupling rules
  to schemas and transports.
- **Wrong dependency direction** — the most valuable, stable part (the domain) depends on the
  least stable part (infrastructure).

## Structure

Key Components:

- **Application Core / Domain** — entities, rules, and use cases. Depends only on ports.
- **Ports** — interfaces the core owns: *driving* ports (how the world calls in) and *driven*
  ports (what the core needs from the world, e.g. a repository).
- **Driving Adapters** — call the core through driving ports (HTTP controllers, CLI, tests).
- **Driven Adapters** — implement driven ports (database, email, message bus).

```
 [ HTTP Adapter ] ──► «Input Port» ──► [  Core  ] ──► «Output Port» ◄── [ DB Adapter ]
   driving side          (owned by the core)  ▲   the core defines both ports;
                                              │   adapters depend inward on them
```

## When to Use

- The domain is complex and valuable enough to protect from framework and infrastructure churn.
- You expect to swap infrastructure (datastore, transport, provider) over the system's life.
- Fast, infrastructure-free tests of the business logic matter.
- Multiple driving surfaces (HTTP, CLI, queue consumer) share one core.

## Advantages and Disadvantages

### Advantages
- **Infrastructure independence** — swap databases, transports, or providers by changing adapters.
- **Fast tests** — the core runs against in-memory fakes; no DB or server in unit tests.
- **Right dependency direction** — the stable domain depends on nothing; volatility lives at the edges.

### Disadvantages
- **Ceremony** — ports, adapters, and mapping add indirection that a simple CRUD app doesn't need.
- **Mapping overhead** — translating between domain models and adapter models is real, repetitive work.
- **Over-abstraction risk** — teams port-and-adapter everything, including things that will never
  be swapped.

## Common Mistakes

- **Ports owned by the adapter** — if the database layer defines the repository interface, the
  dependency still points outward; the *core* must own the port.
- **Leaking adapter types inward** — returning ORM entities or `Request` objects through a port
  re-couples the domain to infrastructure; map at the boundary.
- **Anemic core** — pushing all logic into services/adapters and leaving the domain a bag of data
  loses the point; the rules belong in the center.
- **Adapters calling adapters** — infrastructure talking directly to other infrastructure bypasses
  the core and its rules; route through the domain.

## Key Takeaways

- The domain sits at the center and owns its ports; adapters depend inward on them.
- Driving adapters call in through ports; driven adapters implement ports the core needs.
- The payoff is swappable infrastructure and fast tests; the cost is mapping and indirection.
- It's the dependency-inversion principle applied to a whole application's boundaries.

## Implementations

### JavaScript

*Targets modern JavaScript (ES2015+).*

**❌ Naive**

```js
// The use case imports the database directly — core coupled to infrastructure.
import { mongo } from "./mongo.js";
export async function placeOrder(cart) {
  if (cart.items.length === 0) throw new Error("empty");   // rule
  return mongo.collection("orders").insertOne({ cart });   // infrastructure, hard-wired
}
```

**✅ Idiomatic**

```js
// The core defines the port (a shape it needs); an adapter implements it.
// core/place-order.js — depends only on the port's contract
export function makePlaceOrder({ orders }) {   // `orders` is a driven port
  return async (cart) => {
    if (cart.items.length === 0) throw new DomainError("empty");
    return orders.save({ cart, status: "placed" });
  };
}

// adapters/mongo-orders.js — implements the port
export const mongoOrders = {
  save: (order) => mongo.collection("orders").insertOne(order),
};

// wiring (composition root): const placeOrder = makePlaceOrder({ orders: mongoOrders });
// tests: makePlaceOrder({ orders: { save: async (o) => o } })  // no DB
```

**🧠 Tradeoff** — The use case now depends on a `orders.save` *shape*, not Mongo, so the same core
runs against a real adapter in production and a one-line fake in tests. In dynamic JS the "port" is
just a duck-typed object — cheap to define, but nothing enforces the contract, so a mismatched
adapter fails at runtime rather than compile time.

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// A service that reaches for nodemailer and pg directly is welded to both.
const nodemailer = require("nodemailer");
async function notify(userId, msg) {
  const user = await pgPool.query("SELECT email FROM users WHERE id=$1", [userId]);
  await nodemailer.createTransport(cfg).sendMail({ to: user.rows[0].email, text: msg });
}
```

**✅ Idiomatic**

```js
// Core depends on Users and Mailer ports; adapters wrap pg and nodemailer.
function makeNotify({ users, mailer }) {         // ports
  return async (userId, msg) => {
    const user = await users.byId(userId);
    if (!user) throw new NotFound("user");
    await mailer.send(user.email, msg);
  };
}
// adapters
const pgUsers = { byId: (id) => pgPool.query(/* ... */).then((r) => r.rows[0]) };
const smtpMailer = { send: (to, text) => transport.sendMail({ to, text }) };
// composition root wires them; a queue consumer or a test can call the same core.
```

**🧠 Tradeoff** — Wrapping `pg` and `nodemailer` behind `users`/`mailer` ports means the notify
use case is transport- and provider-agnostic: switch to SES or a different datastore by writing an
adapter. You pay for a composition root that wires everything and for the wrapper objects — worth
it when providers change, overkill for a script that emails once.

### Python

*Targets Python 3.12.*

**❌ Naive**

```python
# Use case imports SQLAlchemy models — the domain now depends on the ORM.
def place_order(cart):
    if not cart.items:
        raise ValueError("empty")
    session.add(OrderModel(cart=cart))  # infrastructure in the core
    session.commit()
```

**✅ Idiomatic**

```python
from typing import Protocol

class Orders(Protocol):                 # driven port, owned by the core
    def save(self, order: "Order") -> None: ...

class PlaceOrder:                       # core use case
    def __init__(self, orders: Orders):
        self.orders = orders
    def __call__(self, cart: Cart) -> None:
        if not cart.items:
            raise DomainError("empty")
        self.orders.save(Order(cart=cart, status="placed"))

class SqlOrders:                        # driven adapter
    def save(self, order): session.add(to_row(order)); session.commit()
```

**🧠 Tradeoff** — `typing.Protocol` gives a structural port with no inheritance: `SqlOrders`
satisfies `Orders` just by having `save`, and a fake with a `save` works in tests. It's the
cleanest expression here — real interfaces, checked by the type checker, without a class hierarchy.
The mapping (`to_row`) between domain and ORM models is the recurring tax.

### Elixir

*Targets Elixir 1.18.*

**❌ Naive**

```elixir
# The context calls Repo directly, so the "core" is glued to Ecto/Postgres.
def place_order(cart) do
  if cart.items == [], do: raise("empty")
  Repo.insert!(%Order{cart: cart})
end
```

**✅ Idiomatic**

```elixir
# A behaviour is the port; adapters implement it; the impl is chosen by config.
defmodule Orders do
  @callback save(Order.t()) :: {:ok, Order.t()} | {:error, term}
end

defmodule PlaceOrder do                       # core, depends on the behaviour
  @orders Application.compile_env(:my_app, :orders_adapter)
  def call(cart) do
    if cart.items == [], do: {:error, :empty}, else: @orders.save(%Order{cart: cart})
  end
end

defmodule Orders.Ecto do                       # driven adapter
  @behaviour Orders
  @impl true
  def save(order), do: Repo.insert(to_schema(order))
end
# config: config :my_app, orders_adapter: Orders.Ecto  (Orders.InMemory in tests)
```

**🧠 Tradeoff** — Elixir's **behaviours** are the ports and application config picks the adapter,
so tests swap in `Orders.InMemory` with one config line. It's idiomatic OTP — named contracts plus
runtime configuration — and gives fast, DB-free tests. The subtlety is that compile-time adapter
selection (`compile_env`) versus runtime selection changes how easily you swap per-test.

### Go

*Targets Go 1.26.*

**❌ Naive**

```go
// The use case depends on *sql.DB directly.
func PlaceOrder(db *sql.DB, cart Cart) error {
    if len(cart.Items) == 0 {
        return errors.New("empty")
    }
    _, err := db.Exec("INSERT INTO orders ...")
    return err
}
```

**✅ Idiomatic**

```go
// The core declares the port; the adapter implements it. Go's implicit
// interfaces make the domain own the contract without importing the adapter.
type Orders interface {                 // driven port, defined next to the use case
    Save(Order) error
}

type PlaceOrder struct{ Orders Orders }

func (p PlaceOrder) Do(cart Cart) error {
    if len(cart.Items) == 0 {
        return ErrEmpty
    }
    return p.Orders.Save(Order{Cart: cart, Status: "placed"})
}

// adapters/postgres.go — implements Orders, imports the core, not vice versa
type PostgresOrders struct{ db *sql.DB }
func (r PostgresOrders) Save(o Order) error { _, err := r.db.Exec("INSERT ..."); return err }
```

**🧠 Tradeoff** — Go's implicit interfaces make hexagonal feel native: the core package declares
`Orders`, and the postgres package implements it by importing the *core* — so dependencies point
inward with no wiring framework. Tests pass a struct with a `Save` method. Verbosity lives in the
composition root in `main`, where every adapter is constructed and injected by hand.

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// The use case news up the database client — core welded to infrastructure.
public sealed class PlaceOrder
{
    public async Task DoAsync(Cart cart)
    {
        if (cart.Items.Count == 0) throw new EmptyCartException();
        await using var db = new NpgsqlConnection(connString); // infrastructure, hard-wired
        await db.ExecuteAsync("INSERT INTO orders ...");
    }
}
```

**✅ Idiomatic**

```csharp
// Core project — owns the port and the rule; references no other project.
public record Order(Cart Cart, string Status);

public interface IOrders                       // driven port, owned by the core
{
    Task SaveAsync(Order order);
}

public sealed class PlaceOrder(IOrders orders)
{
    public async Task DoAsync(Cart cart)
    {
        if (cart.Items.Count == 0) throw new EmptyCartException();
        await orders.SaveAsync(new Order(cart, "placed"));
    }
}

// Infrastructure project — references the core, never the reverse.
public sealed class PostgresOrders(NpgsqlDataSource db) : IOrders
{
    public Task SaveAsync(Order order) =>
        db.ExecuteAsync("INSERT INTO orders ...", order);   // SQL stays here
}

// Composition root: builder.Services.AddScoped<IOrders, PostgresOrders>();
// Tests: new PlaceOrder(new InMemoryOrders()) — no container, no database.
```

**🧠 Tradeoff** — The assembly boundary makes "dependencies point inward" compiler-enforced: the
core project has zero package references, so an EF or Npgsql import in the domain is a build
error, not a code-review catch. ASP.NET's DI container is the composition root, which trims the
wiring Go writes by hand at the cost of some indirection. For a single-method port a
`Func<Order, Task>` would technically do — but hexagonal is about *naming* the seams, and
`IOrders` is the name.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// The use case takes the concrete client — core tied to the database crate.
fn place_order(db: &mut postgres::Client, cart: &Cart) -> Result<(), Error> {
    if cart.items.is_empty() {
        return Err(Error::EmptyCart);
    }
    db.execute("INSERT INTO orders ...", &[])?; // infrastructure in the core
    Ok(())
}
```

**✅ Idiomatic**

```rust
// core/ — owns the port (a trait) and the rule; no infrastructure imports.
struct Cart { items: Vec<String> }
struct Order { cart: Cart, status: &'static str }

trait Orders {                          // driven port, owned by the core
    fn save(&mut self, order: Order) -> Result<(), String>;
}

struct PlaceOrder<O: Orders> { orders: O }

impl<O: Orders> PlaceOrder<O> {
    fn call(&mut self, cart: Cart) -> Result<(), String> {
        if cart.items.is_empty() {
            return Err("empty cart".into());
        }
        self.orders.save(Order { cart, status: "placed" })
    }
}

// adapters/ — depends on the core and implements its trait.
struct InMemoryOrders { saved: Vec<Order> }

impl Orders for InMemoryOrders {
    fn save(&mut self, order: Order) -> Result<(), String> {
        self.saved.push(order);
        Ok(())
    }
}

fn main() {
    let mut place = PlaceOrder { orders: InMemoryOrders { saved: vec![] } };
    place.call(Cart { items: vec!["book".into()] }).unwrap();
    println!("saved: {}", place.orders.saved.len()); // saved: 1
}
```

**🧠 Tradeoff** — The trait is the port, and crate boundaries enforce the direction: a core crate
whose `Cargo.toml` lists no database dependency provably can't depend on one. Rust then makes you
pick what Go and C# hide — `PlaceOrder<O: Orders>` monomorphizes each adapter to static-dispatch
code but fixes it at compile time, while `Box<dyn Orders>` lets config choose the adapter at
runtime for a vtable hop. Ownership is a bonus at the boundary: `save` takes the `Order` by
value, so the core hands data outward and keeps no strings attached.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// The use case calls the concrete store directly — core knows the storage type.
fn placeOrder(store: *PostgresStore, items: []const []const u8) !void {
    if (items.len == 0) return error.EmptyCart;
    try store.insert(items); // swap the store, edit the core
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

const Order = struct { items: []const []const u8, status: []const u8 };

// The port. Zig has no interfaces, so we build one from a context pointer
// plus a function pointer — the same idiom std.mem.Allocator uses.
const Orders = struct {
    ctx: *anyopaque,
    saveFn: *const fn (ctx: *anyopaque, order: Order) anyerror!void,

    pub fn save(self: Orders, order: Order) !void {
        return self.saveFn(self.ctx, order);
    }
};

// The core use case depends on the port only.
fn placeOrder(orders: Orders, items: []const []const u8) !void {
    if (items.len == 0) return error.EmptyCart;
    try orders.save(.{ .items = items, .status = "placed" });
}

// A driven adapter: an in-memory store that hands out itself as a port.
const InMemoryOrders = struct {
    saved: usize = 0,
    last_status: []const u8 = "",

    fn save(ctx: *anyopaque, order: Order) anyerror!void {
        const self: *InMemoryOrders = @ptrCast(@alignCast(ctx));
        self.saved += 1;
        self.last_status = order.status;
    }

    pub fn port(self: *InMemoryOrders) Orders {
        return .{ .ctx = self, .saveFn = save };
    }
};

pub fn main() !void {
    var store = InMemoryOrders{};
    try placeOrder(store.port(), &.{"book"});
    std.debug.print("saved {d}, status {s}\n", .{ store.saved, store.last_status });
    // saved 1, status placed
}
```

**🧠 Tradeoff** — Zig won't give you an interface, so the port is built by hand: an `*anyopaque`
context, a function pointer, and an `@ptrCast` back on the adapter side. That's more ceremony
than `interface`/`trait` — and more honest, because the indirection you pay is sitting right
there in the source. When every adapter is known at compile time, a comptime generic
(`orders: anytype`) gives the same seam with static dispatch and no casts; the vtable earns its
keep when the adapter is picked at runtime — config in production, a fake in tests, no
recompile. Stripped of language sugar, hexagonal's claim is plain here: a port is just a calling
convention the core owns.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// The use case opens its own connection — core welded to JDBC and the schema.
class PlaceOrder {
    void call(List<String> items) throws SQLException {
        if (items.isEmpty()) throw new IllegalStateException("empty cart");
        try (var conn = DriverManager.getConnection(DB_URL)) {
            conn.prepareStatement("INSERT INTO orders ...").executeUpdate(); // infra in the core
        }
    }
}
```

**✅ Idiomatic**

```java
import java.util.ArrayList;
import java.util.List;

// core — owns the port and the rule; imports no infrastructure.
record Order(List<String> items, String status) {}

interface Orders {                       // driven port, owned by the core
    void save(Order order);
}

class PlaceOrder {
    private final Orders orders;
    PlaceOrder(Orders orders) { this.orders = orders; }

    void call(List<String> items) {
        if (items.isEmpty()) throw new IllegalStateException("empty cart");
        orders.save(new Order(items, "placed"));
    }
}

// adapter — implements the core's port; depends inward, never the reverse.
class InMemoryOrders implements Orders {
    final List<Order> saved = new ArrayList<>();
    public void save(Order order) { saved.add(order); }
}

public class Demo {
    public static void main(String[] args) {
        var store = new InMemoryOrders();
        new PlaceOrder(store).call(List.of("book"));
        System.out.println("saved: " + store.saved.size()); // saved: 1

        // Orders is a single method — a functional interface — so a fake is a lambda:
        new PlaceOrder(order -> System.out.println("status: " + order.status()))
            .call(List.of("pen")); // status: placed
    }
}
```

**🧠 Tradeoff** — Java's `interface` was built for exactly this seam, and putting the core in its
own build module makes the direction enforceable: a core module with zero dependencies provably
can't import JDBC. JPMS goes one step further — `module-info.java` exporting only the ports is
the architecture written as code — but a Maven/Gradle module split is where most teams sensibly
stop. Two modern touches earn their keep here: the `Order` record crosses the port as an immutable
value, so no adapter can mutate core state, and a single-method port is a functional interface, so
the test fake is a lambda instead of a stub class. The mapping tax and the hand-wired (or
DI-container-wired) composition root remain — that part no language sugar removes.

## Applications

- **Long-lived services** — systems expected to outlive their initial database/framework choices
  protect the domain behind ports (backend).
- **Multi-transport APIs** — one core served over REST, GraphQL, gRPC, and a queue consumer, each a
  driving adapter (backend).
- **Testable business logic** — fintech/healthcare domains with heavy rules run their core against
  in-memory adapters for fast, exhaustive tests (backend).
- **Provider portability** — swapping payment, email, or storage providers becomes writing one
  adapter, not editing the domain (backend).
- **Migration & strangler work** — a clean core lets old and new infrastructure coexist behind the
  same ports during a migration (backend).

## Related Patterns

- **Layered Architecture** — hexagonal is layering with the dependencies inverted: the domain is
  the center, not the top, and infrastructure plugs in rather than sitting beneath.
- **Repository** — the archetypal driven port; a repository interface owned by the domain with
  database adapters behind it.
- **Dependency Inversion** — the principle hexagonal is built on: depend on abstractions the core
  owns, not on concrete infrastructure.
