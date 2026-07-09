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
languages: [javascript, node-js, python, elixir, go]
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
