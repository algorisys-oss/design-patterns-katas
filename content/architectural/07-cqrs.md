---
id: cqrs
category: architectural
sequence: 7
title: CQRS
also_known_as: [Command Query Responsibility Segregation]
gof: false
intent: "Split the write side (commands that change state) from the read side (queries that return it) into separate models, so each can be designed and scaled for its own job."
frequency: medium
difficulty: advanced
tags: [architecture, read-write-split, scalability, models, eventual-consistency]
related: [event-sourcing, pub-sub, layered]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Use **two models instead of one**: a write model that handles **commands** (do something, change
state) and a read model that answers **queries** (give me this shape of data). They can have
different schemas, different stores, and different scaling — because reads and writes rarely have
the same shape or the same load.

The insight is that the structure optimized for enforcing business rules on a change is almost
never the structure optimized for displaying data. CQRS stops forcing one model to serve both
masters.

## The Problem

A single model doing both reads and writes gets pulled in opposite directions:

- **Conflicting shapes** — normalized tables enforce write consistency but need painful joins to
  render a screen; denormalize for reads and writes get error-prone.
- **Mismatched load** — most systems read far more than they write, yet one model (and one
  database) must scale for both together.
- **Bloated logic** — the same objects carry validation rules *and* display concerns, so both grow
  tangled.
- **Query pressure on the write store** — heavy reporting queries contend with transactional writes
  on the same tables.

## Structure

Key Components:

- **Commands** — imperative requests to change state; handled by the write side, return no data.
- **Write Model** — enforces rules and persists changes; optimized for consistency.
- **Queries** — requests for data in a specific shape; handled by the read side, change nothing.
- **Read Model** — one or more denormalized projections optimized for the queries that need them.
- **Projection** — keeps the read model in sync with writes (synchronously or via events).

```
             commands              queries
Client ───────────────► Write Model      Read Model ◄─────────── Client
                            │  projects        ▲
                            └──────────────────┘
                       (read model updated from writes)
```

## When to Use

- Read and write workloads differ sharply in shape, volume, or scaling needs.
- The domain has rich write-side rules but simple, varied read shapes (dashboards, search).
- You can tolerate eventual consistency between a write and when it appears in reads.
- Reporting/query load is hurting transactional write performance.

## Advantages and Disadvantages

### Advantages
- **Independent optimization** — model and scale reads and writes for their own workloads.
- **Simpler models** — write logic isn't muddied by display concerns, and vice versa.
- **Tailored read shapes** — build exactly the projections your screens and reports need.

### Disadvantages
- **Eventual consistency** — asynchronous projections mean a write may not be visible in reads
  immediately; the UI must cope.
- **More moving parts** — two models, projections, and sync machinery to build and operate.
- **Overkill for simple CRUD** — where reads and writes share a shape, CQRS is pure overhead.

## Common Mistakes

- **Applying it everywhere** — CQRS on simple CRUD adds projections and consistency headaches for
  no benefit; use it where read/write pressures actually diverge.
- **Ignoring the consistency gap** — building a UI that assumes a write is instantly queryable
  breaks under asynchronous projection; design for the lag (return the command's result, poll, or
  read-your-writes).
- **Sharing the models anyway** — reusing the same ORM entities for both sides quietly recouples
  them and forfeits the split.
- **Conflating CQRS with event sourcing** — they pair well but are independent; you can do CQRS
  with plain projected tables and no event log.

## Key Takeaways

- Separate the write model (commands, rules) from the read model (queries, display shapes).
- The read model is one or more denormalized projections kept in sync with writes.
- The price is eventual consistency and extra machinery — spend it only where reads and writes
  genuinely diverge.
- CQRS is independent of event sourcing, though they combine naturally.

## Implementations

### JavaScript

*Targets modern JavaScript (ES2015+).*

**❌ Naive**

```js
// One model and store serve both a strict write and a join-heavy read.
class OrderModel {
  async place(cart) { /* validate, write normalized rows */ }
  async dashboard() {
    // expensive joins across orders, items, customers to render a screen
    return db.query("SELECT ... FROM orders JOIN items JOIN customers ...");
  }
}
```

**✅ Idiomatic**

```js
// Commands and queries take separate paths and separate models.
const commands = {
  async placeOrder(cart) {
    validate(cart);
    await writeStore.insertOrder(cart);            // normalized write model
    await projectOrderSummary(cart);               // update the read model
  },
};

const queries = {
  dashboard: () => readStore.get("order_summaries"), // denormalized, ready to render
};

// commands change state and return nothing; queries return shaped data and change nothing.
```

**🧠 Tradeoff** — Routing writes through `commands` (normalized, validated) and reads through
`queries` (a pre-shaped summary) lets each side be exactly what it needs, and the dashboard query
becomes a cheap lookup. The cost is the `projectOrderSummary` step and the window where the summary
lags the write — worth it for read-heavy screens, needless for a simple form.

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// Reporting query and transactional writes hit the same tables and contend.
app.post("/orders", (req, res) => writePool.query("INSERT INTO orders ..."));
app.get("/reports/sales", (req, res) =>
  writePool.query("SELECT date_trunc('day', created_at), sum(total) FROM orders GROUP BY 1")); // heavy, on the write DB
```

**✅ Idiomatic**

```js
// Write to the primary; project to a read store the queries hit instead.
app.post("/orders", async (req, res) => {
  const order = await writeDb.insertOrder(req.body);    // write model
  await eventBus.publish("order.placed", order);        // trigger projection
  res.status(202).json({ id: order.id });               // accepted; read may lag
});

// projector (separate process): on "order.placed" → upsert into read store
bus.on("order.placed", (order) => readDb.upsertSalesRollup(order));

app.get("/reports/sales", (_req, res) => readDb.salesRollup().then((r) => res.json(r))); // fast read
```

**🧠 Tradeoff** — Publishing an event on write and projecting into a separate read store moves
reporting load off the transactional database and makes the report a fast lookup. The `202` and the
projection lag are the honest signal that reads are eventually consistent. It's real infrastructure
(a bus, a projector, a read store) — justified when read load threatens writes, overkill otherwise.

### Python

*Targets Python 3.12.*

**❌ Naive**

```python
# The same ORM model answers both a rule-heavy write and a display query.
class Order(models.Model):
    def place(self, cart): ...  # validation + normalized save
    @staticmethod
    def dashboard():            # heavy joins/aggregation on write tables
        return Order.objects.select_related("customer").prefetch_related("items")...
```

**✅ Idiomatic**

```python
# Separate command and query handlers with distinct models.
class PlaceOrder:                      # command side
    def __init__(self, write_repo, projector):
        self.write_repo, self.projector = write_repo, projector
    def __call__(self, cart):
        validate(cart)
        order = self.write_repo.save(cart)
        self.projector.on_order_placed(order)   # update read model
        return order.id

class SalesDashboard:                  # query side
    def __init__(self, read_repo):
        self.read_repo = read_repo
    def __call__(self):
        return self.read_repo.sales_rollup()    # denormalized, fast
```

**🧠 Tradeoff** — Splitting into `PlaceOrder` (command) and `SalesDashboard` (query) handlers with
separate repos keeps write rules and read shapes from tangling and lets the read model live in its
own store (even Redis or a materialized view). It's more classes than a fat model; pay it when the
two sides truly diverge, not for every entity.

### Elixir

*Targets Elixir 1.18.*

**❌ Naive**

```elixir
# One context does both the transactional write and the heavy read query.
defmodule Orders do
  def place(cart), do: Repo.insert(build_order(cart))
  def dashboard, do: Repo.all(from o in Order, join: ..., group_by: ...)  # heavy, same store
end
```

**✅ Idiomatic**

```elixir
# Command and query contexts, with the read model projected from events.
defmodule Orders.Commands do
  def place(cart) do
    with {:ok, order} <- Repo.insert(build_order(cart)) do
      Phoenix.PubSub.broadcast(MyApp.PubSub, "orders", {:placed, order})  # trigger projection
      {:ok, order.id}
    end
  end
end

defmodule Orders.Projector do          # subscribes, keeps the read model current
  use GenServer
  def handle_info({:placed, order}, state), do: {:noreply, ReadStore.upsert_summary(order)}
end

defmodule Orders.Queries do
  def dashboard, do: ReadStore.summaries()   # fast, denormalized read
end
```

**🧠 Tradeoff** — Elixir splits cleanly into command/query contexts, and a `GenServer` projector
subscribed via `Phoenix.PubSub` keeps the read model current — the BEAM's process and pub/sub
primitives make the projection machinery natural. Libraries like Commanded formalize this. The
consistency lag between the broadcast and the projection is the same trade CQRS always makes.

### Go

*Targets Go 1.26.*

**❌ Naive**

```go
// One struct, one DB, both a strict write and a reporting read.
type OrderStore struct{ db *sql.DB }
func (s OrderStore) Place(o Order) error { /* normalized insert */ return nil }
func (s OrderStore) Dashboard() ([]Row, error) {
    return query(s.db, "SELECT ... heavy joins/aggregation ...") // on the write DB
}
```

**✅ Idiomatic**

```go
// Separate command and query handlers, each with its own store interface.
type Commands struct {
    write     WriteStore
    projector Projector
}
func (c Commands) PlaceOrder(o Order) error {
    if err := c.write.Save(o); err != nil {
        return err
    }
    return c.projector.OnPlaced(o) // update the read model
}

type Queries struct{ read ReadStore }
func (q Queries) SalesRollup() ([]Rollup, error) { return q.read.Rollup() } // fast, denormalized
```

**🧠 Tradeoff** — Two types (`Commands`, `Queries`) over two store interfaces make the split
explicit and each side independently testable and swappable — very Go. Nothing here forces event
sourcing; the "projection" can be a synchronous upsert into a read table. You own the wiring and the
consistency handling, but the read/write separation is plain and inspectable.

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// One class, one store, both the strict write and the reporting read.
public sealed class OrderStore(Db db)
{
    public Task Place(Order o) => db.Insert(o); // normalized, validated write
    public Task<List<Row>> Dashboard() =>
        db.Query("SELECT ... FROM orders JOIN items JOIN customers ..."); // heavy, on the write DB
}
```

**✅ Idiomatic**

```csharp
// A command is an immutable message; commands and queries take separate paths.
public sealed record PlaceOrder(string Sku, int Total); // imperative, returns no data

public sealed class Commands(IWriteStore write, IProjector projector)
{
    public async Task Handle(PlaceOrder cmd)
    {
        if (cmd.Total <= 0) throw new ArgumentException("empty order"); // write-side rule
        var order = await write.Save(cmd);      // normalized write model
        await projector.OnPlaced(order);        // update the read model
    }
}

public sealed class Queries(IReadStore read)
{
    public Task<SalesRollup> Dashboard() => read.Rollup(); // denormalized, ready to render
}
```

**🧠 Tradeoff** — Records make commands what they should be: immutable, equatable messages with no
behavior. Two small classes over two store interfaces are the whole pattern — in .NET this often
runs through MediatR (`IRequest`/`IRequestHandler`), but that's dispatch plumbing, not CQRS itself.
The classic .NET pairing is EF Core on the write side (rules, change tracking) and Dapper or raw
SQL on the read side (fast, shaped rows) — two data-access styles in one app, each fitting its
half. The projection step and the consistency lag are the usual price.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// One struct, one store, both the strict write and the reporting read.
struct OrderStore {
    orders: Vec<Order>,
}

impl OrderStore {
    fn place(&mut self, order: Order) {
        self.orders.push(order); // normalized write
    }
    fn dashboard(&self) -> u32 {
        self.orders.iter().map(|o| o.total).sum() // full scan on every read
    }
}
```

**✅ Idiomatic**

```rust
use std::collections::HashMap;

struct Order {
    day: String,
    total: u32,
}

struct App {
    orders: Vec<Order>,                 // write model: normalized, rule-checked
    sales_by_day: HashMap<String, u32>, // read model: denormalized projection
}

impl App {
    // Command: takes &mut self, changes state, returns no data.
    fn place_order(&mut self, order: Order) -> Result<(), String> {
        if order.total == 0 {
            return Err("empty order".into()); // write-side rule
        }
        *self.sales_by_day.entry(order.day.clone()).or_insert(0) += order.total; // project
        self.orders.push(order);
        Ok(())
    }

    // Query: takes &self, returns shaped data, cannot change anything.
    fn sales_rollup(&self, day: &str) -> u32 {
        self.sales_by_day.get(day).copied().unwrap_or(0)
    }
}

fn main() {
    let mut app = App { orders: Vec::new(), sales_by_day: HashMap::new() };
    app.place_order(Order { day: "2026-08-17".into(), total: 40 }).unwrap();
    app.place_order(Order { day: "2026-08-17".into(), total: 60 }).unwrap();
    println!("sales: {}", app.sales_rollup("2026-08-17")); // sales: 100 — a lookup, not a scan
}
```

**🧠 Tradeoff** — In Rust the split shows up in the receivers: commands take `&mut self`, queries
take `&self`, so the borrow checker *enforces* that the query side cannot write — a guarantee the
other languages leave to convention. Here the projection is a synchronous map update inside the
command, which keeps reads instantly consistent; the asynchronous version (a projector thread fed
by `std::sync::mpsc`) buys write throughput back at the price of lag. Split `App` into separate
command and query types when the two sides grow their own stores — the `&`/`&mut` discipline
carries over unchanged.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// One store serves both the write and a scan-everything report.
const OrderStore = struct {
    orders: [16]Order = undefined,
    len: usize = 0,

    fn place(self: *OrderStore, o: Order) !void {
        if (self.len == self.orders.len) return error.Full;
        self.orders[self.len] = o;
        self.len += 1;
    }
    fn dashboard(self: *const OrderStore) u64 {
        var revenue: u64 = 0;
        for (self.orders[0..self.len]) |o| revenue += o.total; // full scan on every read
        return revenue;
    }
};
```

**✅ Idiomatic**

```zig
const std = @import("std");

const Order = struct { sku: []const u8, total: u32 };

const WriteStore = struct {
    orders: [16]Order = undefined, // normalized write model (fixed-size for the demo)
    len: usize = 0,
};

const Rollup = struct { revenue: u64 = 0, count: u32 = 0 }; // denormalized read model

const Commands = struct {
    write: *WriteStore,
    rollup: *Rollup, // the projection the command side keeps current

    fn placeOrder(self: Commands, order: Order) !void {
        if (order.total == 0) return error.EmptyOrder; // write-side rule
        if (self.write.len == self.write.orders.len) return error.Full;
        self.write.orders[self.write.len] = order;
        self.write.len += 1;
        self.rollup.revenue += order.total; // project
        self.rollup.count += 1;
    }
};

const Queries = struct {
    rollup: *const Rollup, // const pointer: the query side cannot write

    fn dashboard(self: Queries) Rollup {
        return self.rollup.*; // the pre-shaped read model — no scan
    }
};

pub fn main() !void {
    var write = WriteStore{};
    var rollup = Rollup{};

    const commands = Commands{ .write = &write, .rollup = &rollup };
    const queries = Queries{ .rollup = &rollup };

    try commands.placeOrder(.{ .sku = "book", .total = 40 });
    try commands.placeOrder(.{ .sku = "pen", .total = 60 });

    const dash = queries.dashboard();
    std.debug.print("revenue {d} over {d} orders\n", .{ dash.revenue, dash.count });
    // revenue 100 over 2 orders
}
```

**🧠 Tradeoff** — The wiring is pointers, and the pointer types carry the rule: `Commands` holds
mutable `*WriteStore`/`*Rollup`, `Queries` holds `*const Rollup`, so a write through the query side
is a compile error — const-correctness doing what CQRS asks for. The projection is a synchronous
field update, which is all most Zig programs need; an asynchronous projector means `std.Thread`, a
mutex, and a queue you build yourself. No bus, no framework — CQRS in Zig is just data separation
made visible in the types.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// One class, one store, both the strict write and the reporting read.
class OrderStore {
    void place(Order o) { /* normalized, validated insert */ }

    List<Row> dashboard() { // heavy joins/aggregation, on the write DB
        return query("SELECT ... FROM orders JOIN items JOIN customers ...");
    }
}
```

**✅ Idiomatic**

```java
import java.util.ArrayList;
import java.util.List;

// Commands are records — immutable messages. The sealed interface closes the set.
sealed interface Command permits PlaceOrder, CancelOrder {}
record PlaceOrder(String sku, int total) implements Command {}
record CancelOrder(String sku) implements Command {}

record Rollup(long revenue, int count) {} // denormalized read model

class ReadStore { Rollup rollup = new Rollup(0, 0); }

class Commands {
    private final List<PlaceOrder> writeStore = new ArrayList<>(); // write model
    private final ReadStore read;

    Commands(ReadStore read) { this.read = read; }

    void handle(Command cmd) {
        switch (cmd) { // exhaustive over the sealed set — no default arm
            case PlaceOrder p -> {
                if (p.total() <= 0) throw new IllegalArgumentException("empty order"); // write rule
                writeStore.add(p);
                read.rollup = new Rollup(read.rollup.revenue() + p.total(),
                                         read.rollup.count() + 1); // project
            }
            case CancelOrder c -> writeStore.stream()
                .filter(o -> o.sku().equals(c.sku())).findFirst()
                .ifPresent(o -> {
                    writeStore.remove(o);
                    read.rollup = new Rollup(read.rollup.revenue() - o.total(),
                                             read.rollup.count() - 1);
                });
        }
    }
}

class Queries {
    private final ReadStore read;

    Queries(ReadStore read) { this.read = read; }

    Rollup dashboard() { return read.rollup; } // pre-shaped — no scan, no joins
}

public class Demo {
    public static void main(String[] args) {
        var read = new ReadStore();
        var commands = new Commands(read);
        var queries = new Queries(read);

        commands.handle(new PlaceOrder("book", 40));
        commands.handle(new PlaceOrder("pen", 60));
        System.out.println(queries.dashboard()); // Rollup[revenue=100, count=2]

        commands.handle(new CancelOrder("pen"));
        System.out.println(queries.dashboard()); // Rollup[revenue=40, count=1]
    }
}
```

**🧠 Tradeoff** — Records make commands what CQRS wants them to be: immutable, value-equal messages
with no behavior. Sealing the `Command` set adds what most languages here can't: the `switch` is
exhaustive with no default arm, so adding a `RefundOrder` command fails every handler that ignores
it at compile time. In production Java the dispatch usually runs through Spring beans or an
Axon-style command bus — that's plumbing, not the pattern — and the classic pairing is JPA on the
write side (rules, change tracking) with jOOQ, plain JDBC, or a materialized view on the read side:
two data-access styles, each fitting its half. The projection step and the consistency lag are the
usual price.

## Applications

- **High-read platforms** — e-commerce and media sites project write data into read-optimized
  stores (Elasticsearch, Redis) for fast catalogs and search (backend).
- **Dashboards & analytics** — reporting reads run off denormalized projections instead of
  contending with transactional writes (backend).
- **Collaborative apps** — separate the authoritative write model from many tailored read views per
  client (backend & frontend).
- **Event-driven systems** — CQRS is the natural read side of an event-sourced or event-streamed
  architecture (backend).
- **Task/booking systems** — strict write-side rules (no double-booking) with rich, varied read
  screens (availability, calendars) (backend).

## Related Patterns

- **Event Sourcing** — a common write side for CQRS: commands append events, projections build the
  read models from the event stream.
- **Publish–Subscribe** — the usual transport for keeping read models in sync with writes.
- **Layered / Hexagonal** — CQRS refines the application layer into distinct command and query
  paths, each with its own model and store.
