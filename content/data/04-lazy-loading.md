---
id: lazy-loading
category: data
sequence: 4
title: Lazy Loading
also_known_as: [Deferred Loading, On-Demand Loading]
gof: false
intent: "Defer loading a piece of data — usually a related object or collection — until the moment it's actually accessed, instead of loading everything up front."
frequency: high
difficulty: intermediate
tags: [data, persistence, performance, deferred, n-plus-one]
related: [proxy, cache-aside]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Load an object's expensive or related data **on demand**. When you fetch an `Order`, don't also fetch its
`Customer`, its `LineItems`, and its `Payments` — leave placeholders, and load each only when code
actually touches it. The first access triggers the load; subsequent accesses use the loaded value.

Most of the time you don't need the whole object graph. Lazy loading avoids the work and memory of
pulling data you'll never look at, making the initial fetch cheap and paying the cost of related data only
when it's genuinely used. The classic implementation is a **virtual proxy** standing in for the real
object until it's needed.

## The Problem

Eagerly loading everything an object *might* reference is wasteful:

- **Over-fetching** — loading an order's customer, items, history, and shipments when the caller only
  wanted the order total pulls (and holds) data that's never used.
- **Expensive up-front cost** — a deep object graph means many joins/queries and a lot of memory on every
  load, even for callers who need a sliver.
- **Slow initial response** — the user waits for data they may not view.
- **Tight coupling to needs** — loading logic must guess what every caller wants, so it either over-fetches
  or under-serves.

## Structure

Key Components:

- **Placeholder / Virtual Proxy** — stands in for the not-yet-loaded object, exposing the same interface.
- **Trigger** — the first access (a property read, a method call) that causes the real load.
- **Loader** — the logic that fetches the real data when triggered.
- **Loaded flag / memoization** — after loading, the value is cached so later accesses don't reload.

```
Order { customer: Proxy } ──access .customer──► [ Lazy Proxy ] ──first time──► load Customer
                                                     │
                                                     └──after──► return the loaded Customer
```

## When to Use

- Objects reference related data that's often not needed by a given caller.
- The related data is expensive to load (extra queries, large payloads).
- You want cheap initial fetches and to pay for related data only on use.
- Access patterns vary — different callers need different parts of the graph.

## Advantages and Disadvantages

### Advantages
- **Cheaper initial load** — fetch only what's asked for; related data waits.
- **Less memory & I/O** — unused associations are never loaded.
- **Faster first response** — the user doesn't wait for data they may not view.

### Disadvantages
- **N+1 query problem** — lazy-loading a collection's items in a loop fires one query per item, the classic
  performance trap.
- **Hidden cost & surprise queries** — a property access silently triggers I/O, which can happen at
  awkward times (after the session closed, mid-render).
- **Complexity** — proxies, load state, and triggering logic add machinery and subtle bugs.

## Common Mistakes

- **N+1 queries** — iterating a collection and touching a lazy association per element fires N queries;
  eager-load (a join/`IN` query) when you know you'll need them all.
- **Lazy-loading after the session closes** — accessing a lazy field once the DB session/transaction has
  ended throws (a very common ORM error); load it while the session is open.
- **Lazy by default everywhere** — making everything lazy causes surprise queries scattered through the
  code; choose eager vs. lazy per access pattern.
- **No memoization** — reloading on every access instead of caching the first load multiplies the cost.

## Key Takeaways

- Defer loading related/expensive data until it's actually accessed; memoize after the first load.
- It cuts initial load cost and memory when callers use only part of the object graph.
- Beware the N+1 trap — eager-load collections you'll iterate — and lazy loads after the session closes.
- The usual mechanism is a virtual proxy standing in for the real object.

## Implementations

### JavaScript

**❌ Naive**

```js
// Eagerly load the whole graph even when the caller wants only the total.
async function getOrder(id) {
  const order = await db.order(id);
  order.customer = await db.customer(order.customerId); // loaded even if unused
  order.items = await db.items(id);                     // and this
  return order;
}
```

**✅ Idiomatic**

```js
// A getter (or Proxy) loads related data on first access and memoizes it.
function makeOrder(row) {
  let customer;
  return {
    id: row.id,
    total: row.total,
    get customer() {                       // triggers load only when accessed
      customer ??= db.customer(row.customerId); // memoized promise
      return customer;
    },
  };
}
// const order = makeOrder(row); // no customer query yet
// await order.customer;          // NOW the customer is loaded, once
```

**🧠 Tradeoff** — A lazy getter that memoizes the fetch (`??=`) loads the customer only if accessed, and
only once. It keeps `getOrder` cheap for callers who want the total. The hazards are JS-agnostic:
iterating many orders and touching `.customer` each is N+1 (batch instead), and the "access does I/O"
surprise means the getter returns a promise you must await. A `Proxy` can make it fully transparent at
more complexity.

### Node.js

**❌ Naive**

```js
// ORM eager-loads associations by default, or a loop lazy-loads → N+1.
const posts = await Post.findAll();
for (const p of posts) p.author = await User.findByPk(p.authorId); // N queries
```

**✅ Idiomatic**

```js
// Lazy by default, but batch-load when iterating (DataLoader coalesces into one query).
const DataLoader = require("dataloader");
const userLoader = new DataLoader(async (ids) => {
  const rows = await User.findAll({ where: { id: ids } }); // ONE query for all ids
  return ids.map((id) => rows.find((u) => u.id === id));
});

const posts = await Post.findAll();
await Promise.all(posts.map(async (p) => { p.author = await userLoader.load(p.authorId); }));
// each load() is lazy per post, but DataLoader batches them into a single query
```

**🧠 Tradeoff** — DataLoader keeps loading lazy and per-item (each post asks for its author) while
*batching* those asks into one query per tick — the standard fix for the N+1 trap lazy loading creates,
and the backbone of GraphQL resolvers. You get lazy's on-demand benefit without its query storm. The cost
is the extra loader abstraction and remembering to route lazy loads through it.

### Python

**❌ Naive**

```python
# SQLAlchemy lazy relationship iterated in a loop → classic N+1.
orders = session.query(Order).all()
for o in orders:
    print(o.customer.name)   # one SELECT per order for the customer
```

**✅ Idiomatic**

```python
# Lazy by default; eager-load (joinedload/selectinload) when you'll touch the relation.
from sqlalchemy.orm import selectinload

orders = (
    session.query(Order)
    .options(selectinload(Order.customer))  # one extra query for ALL customers, not N
    .all()
)
for o in orders:
    print(o.customer.name)  # already loaded — no per-order query

# a hand-rolled lazy attribute (descriptor) memoizes on first access:
class lazy_property:
    def __init__(self, fn): self.fn = fn
    def __get__(self, obj, _):
        val = self.fn(obj); setattr(obj, self.fn.__name__, val); return val  # cache
```

**🧠 Tradeoff** — SQLAlchemy relationships are lazy by default, which is exactly the N+1 footgun in a
loop; `selectinload`/`joinedload` switch to eager batching when you know you'll use the relation. The
`lazy_property` descriptor shows the memoize-on-first-access mechanism for non-ORM cases. The lesson is to
pick lazy vs. eager per access pattern rather than accept the default blindly.

### Elixir

**❌ Naive**

```elixir
# Accessing an unloaded association raises; looping and preloading per item is N+1.
order = Repo.get(Order, id)
order.customer.name   # ** (Ecto.Association.NotLoaded) — Ecto never lazy-loads implicitly
```

**✅ Idiomatic**

```elixir
# Ecto makes loading EXPLICIT (no hidden lazy). Preload what you need, in one query.
orders =
  Order
  |> Repo.all()
  |> Repo.preload(:customer)   # batched: one query loads all customers, no N+1

for o <- orders, do: o.customer.name   # already loaded

# load on demand when you truly want lazy:
order = Repo.get(Order, id)
customer = Repo.preload(order, :customer).customer  # explicit, at the point of need
```

**🧠 Tradeoff** — Ecto deliberately has **no implicit lazy loading**: an unloaded association is a
`NotLoaded` struct that raises if used, forcing you to `Repo.preload` explicitly. This trades convenience
for predictability — you can never accidentally trigger a query by touching a field, and N+1 becomes a
conscious choice rather than a hidden default. "Lazy" in Elixir means *you* decide when to preload, which
sidesteps the surprise-query and closed-session problems the other ecosystems fight.

### Go

**❌ Naive**

```go
// Eagerly load every association up front, used or not.
order, _ := repo.Order(id)
order.Customer, _ = repo.Customer(order.CustomerID) // loaded even if the caller never reads it
order.Items, _ = repo.Items(id)
```

**✅ Idiomatic**

```go
// A lazy field via a sync.Once-guarded loader (virtual proxy); loads once, on first use.
type Order struct {
    ID         int
    CustomerID int
    repo       Repo
    once       sync.Once
    customer   *Customer
}

func (o *Order) Customer() (*Customer, error) {
    var err error
    o.once.Do(func() { o.customer, err = o.repo.Customer(o.CustomerID) }) // load once
    return o.customer, err
}
// order.Customer() triggers the query only when called, safely under concurrency.
```

**🧠 Tradeoff** — A `Customer()` accessor guarded by `sync.Once` is Go's idiomatic lazy field: the query
fires on first call, is memoized, and is safe if multiple goroutines call it. It's explicit (a method, not
a field), which suits Go — no hidden I/O behind a struct field. GORM offers association lazy/eager loading;
plain Go prefers this visible on-demand pattern, and you batch (an `IN` query) yourself to avoid N+1 when
iterating.

### CSharp

**❌ Naive**

```csharp
// Eagerly load every association up front, used or not.
var order = repo.Order(id);
order.Customer = repo.Customer(order.CustomerId); // loaded even if the caller never reads it
order.Items = repo.Items(id);
```

**✅ Idiomatic**

```csharp
// Lazy<T> is the standard library's virtual proxy: loads on first .Value, once, thread-safely.
var order = new Order(1, customerId: 42, new Repo());
Console.WriteLine($"order {order.Id} loaded"); // no customer query yet
Console.WriteLine(order.Customer.Name);        // SELECT fires NOW, once
Console.WriteLine(order.Customer.Name);        // memoized — no second query

public sealed record Customer(int Id, string Name);

public sealed class Repo
{
    public Customer Customer(int id)
    {
        Console.WriteLine($"SELECT customer {id}"); // the expensive load
        return new Customer(id, "Ada");
    }
}

public sealed class Order(int id, int customerId, Repo repo)
{
    private readonly Lazy<Customer> _customer =
        new(() => repo.Customer(customerId));    // deferred — not run here

    public int Id { get; } = id;
    public Customer Customer => _customer.Value; // first read triggers the load
}
```

**🧠 Tradeoff** — `Lazy<T>` packages the whole mechanism — deferred loader, memoization, thread safety
(`ExecutionAndPublication` by default) — into one field: Go's `sync.Once` accessor as a library type. The
catch is that `.Value` hides I/O behind a property read, the classic lazy surprise, and `Lazy<T>` is
synchronous — an async load wants `Lazy<Task<Customer>>` awaited at the access site. EF Core's
lazy-loading proxies do this per navigation property, with the same N+1 trap: reach for `.Include()` when
you know you'll iterate the relation.

### Rust

**❌ Naive**

```rust
// Eagerly load every association up front, used or not.
let mut order = repo.order(id);
order.customer = Some(repo.customer(order.customer_id)); // loaded even if never read
order.items = repo.items(id);
```

**✅ Idiomatic**

```rust
use std::cell::OnceCell;

struct Customer { name: String }

struct Repo;
impl Repo {
    fn customer(&self, id: u32) -> Customer {
        println!("SELECT customer {id}"); // the expensive load
        Customer { name: "Ada".into() }
    }
}

struct Order {
    id: u32,
    customer_id: u32,
    repo: Repo,
    customer: OnceCell<Customer>, // empty until first access
}

impl Order {
    fn customer(&self) -> &Customer {
        self.customer.get_or_init(|| self.repo.customer(self.customer_id)) // load once
    }
}

fn main() {
    let order = Order { id: 1, customer_id: 42, repo: Repo, customer: OnceCell::new() };
    println!("order {} loaded", order.id); // no customer query yet
    println!("{}", order.customer().name); // SELECT fires NOW, once
    println!("{}", order.customer().name); // memoized — no second query
}
```

**🧠 Tradeoff** — `OnceCell` gives lazy-with-memoization through `&self`: interior mutability lets
`customer()` fill the cell on first call and hand back a plain `&Customer` whose lifetime the borrow
checker ties to the order — no lock, no `mut` in the signature. `LazyCell` is the same idea with the
initializer baked in at construction; across threads, swap in `OnceLock`/`LazyLock`. Rust has no ORM that
lazy-loads behind your back, so the surprise-query problem mostly disappears — like Ecto, loading is a
visible call, and N+1 stays a conscious batching decision.

### Zig

**❌ Naive**

```zig
// Eagerly load every association up front, used or not.
var order = repo.order(id);
order.customer = repo.customer(order.customer_id); // loaded even if never read
order.items = repo.items(id);
```

**✅ Idiomatic**

```zig
const std = @import("std");

const Customer = struct { name: []const u8 };

const Repo = struct {
    fn customer(_: Repo, id: u32) Customer {
        std.debug.print("SELECT customer {d}\n", .{id}); // the expensive load
        return .{ .name = "Ada" };
    }
};

const Order = struct {
    id: u32,
    customer_id: u32,
    repo: Repo,
    customer: ?Customer = null, // null until first access

    fn getCustomer(self: *Order) Customer {
        if (self.customer == null) {
            self.customer = self.repo.customer(self.customer_id); // load once
        }
        return self.customer.?;
    }
};

pub fn main() void {
    var order = Order{ .id = 1, .customer_id = 42, .repo = .{} };
    std.debug.print("order {d} loaded\n", .{order.id});     // no customer query yet
    _ = order.getCustomer();                                // SELECT fires NOW, once
    std.debug.print("{s}\n", .{order.getCustomer().name});  // memoized — no second query
}
```

**🧠 Tradeoff** — an optional field plus an init-on-first-use accessor is the whole pattern with nothing
hidden: `?Customer` is the load state, the `if` is the trigger, the assignment is the memoization. Note
the signature — Zig has no interior mutability, so lazy loading needs `*Order`, and a `const` order simply
can't do it. That visibility is very Zig: a field read can never do I/O; only a method taking a mutable
pointer can. Thread safety is yours to add (`std.Thread.Mutex` around the check-and-load), and batching to
dodge N+1 is a query you write yourself.

### Java

**❌ Naive**

```java
// Eagerly load every association up front, used or not.
var order = repo.order(id);
order.customer = repo.customer(order.customerId); // loaded even if the caller never reads it
order.items = repo.items(id);
```

**✅ Idiomatic**

```java
import java.util.function.Supplier;

record Customer(int id, String name) {}

class Repo {
    Customer customer(int id) {
        System.out.println("SELECT customer " + id); // the expensive load
        return new Customer(id, "Ada");
    }
}

// A lazy field is mutable state, so Order is a class — a record couldn't hold it.
class Order {
    final int id;
    private final Supplier<Customer> loader;
    private Customer customer;                         // null until first access

    Order(int id, int customerId, Repo repo) {
        this.id = id;
        this.loader = () -> repo.customer(customerId); // deferred — not run here
    }

    Customer customer() {
        if (customer == null) customer = loader.get(); // first call triggers the load
        return customer;                               // memoized after that
    }
}

public class Demo {
    public static void main(String[] args) {
        var order = new Order(1, 42, new Repo());
        System.out.println("order " + order.id + " loaded"); // no customer query yet
        System.out.println(order.customer().name());         // SELECT fires NOW, once
        System.out.println(order.customer().name());         // memoized — no second query
    }
}
```

**🧠 Tradeoff** — the JDK has no `Lazy<T>`, so the idiom is what you see: a `Supplier` holding the
deferred load and a null-checked accessor that memoizes — which is exactly what Hibernate generates
behind every lazy `@ManyToOne` getter. Java is where this lesson's scars come from:
`LazyInitializationException` *is* the load-after-session-close mistake, and lazy collections
touched in a loop are the canonical N+1. The plain form above isn't thread-safe (two threads can
both trigger the load); double-checked locking on a `volatile` field or Guava's `Suppliers.memoize`
closes that gap, and the JDK is previewing `StableValue` to finally cover it in the standard
library.

## Applications

- **ORM associations** — lazy vs. eager loading of relationships is a core ORM feature (Hibernate,
  SQLAlchemy, Ecto preload) (backend).
- **GraphQL resolvers** — fields resolve (load) on demand, with DataLoader batching to avoid N+1
  (backend).
- **Large object graphs** — loading a document/aggregate's parts only as navigated (backend).
- **Infinite scroll / pagination** — loading more rows only as the user scrolls (frontend).
- **Expensive computed properties** — deferring a costly derivation until first read, then memoizing
  (backend & frontend).

## Related Patterns

- **Proxy (Virtual Proxy)** — the mechanism: a placeholder object that loads the real one on first access;
  lazy loading is a virtual proxy applied to persistence.
- **Cache-Aside** — both defer/avoid work until needed; cache-aside caches across requests, lazy loading
  defers within an object's lifetime.
- **Identity Map** — pairs with lazy loading so a lazily-loaded related object resolves to the one shared
  instance in the session.
