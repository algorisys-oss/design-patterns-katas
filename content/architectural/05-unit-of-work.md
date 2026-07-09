---
id: unit-of-work
category: architectural
sequence: 5
title: Unit of Work
also_known_as: [Change Tracker]
gof: false
intent: "Track every change made during a business transaction and commit them to the datastore as a single atomic unit — or roll them all back."
frequency: medium
difficulty: intermediate
tags: [architecture, persistence, transaction, atomicity, consistency]
related: [repository, layered, hexagonal]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Collect all the reads and writes of one business operation into a **Unit of Work** that remembers
what was created, modified, and deleted, and then writes them out **together** — inside a single
transaction — on `commit`, or discards them all on `rollback`.

It gives a business operation an all-or-nothing boundary. Either every change lands or none does,
so the datastore never ends up in the half-updated state that a crash between two separate writes
would leave.

## The Problem

Save each change the moment it happens and a multi-step operation has no atomicity:

- **Partial writes** — "transfer money" debits one account, then the process crashes before
  crediting the other; the money vanishes.
- **No rollback** — once you've hit the database three times, undoing the first two on the fourth's
  failure is manual and error-prone.
- **Chatty I/O** — writing each object separately is many round-trips when one batched commit would do.
- **Scattered transaction handling** — every service opens and manages its own transaction, so the
  boundary is inconsistent and easy to get wrong.

## Structure

Key Components:

- **Unit of Work** — tracks new, dirty (modified), and removed objects; exposes `commit`/`rollback`.
- **Registration** — objects (usually via repositories) register their changes with the unit.
- **Commit** — opens one transaction, flushes all tracked changes in order, commits or rolls back.
- **Client** — a service runs its whole operation against the unit, then commits once at the end.

```
Service ──uses──► UnitOfWork  { new, dirty, removed }
                     │ tracks
                     ▼
                 Repository ──► Database   (one transaction on commit)
                     commit() → all changes flushed together, or rollback()
```

## When to Use

- A business operation spans several objects/tables and must be all-or-nothing.
- You want one consistent transaction boundary instead of per-write transactions.
- Batching writes into a single commit reduces round-trips meaningfully.
- Several repositories participate in one operation and must commit together.

## Advantages and Disadvantages

### Advantages
- **Atomicity** — the whole operation commits or rolls back as one; no half-applied state.
- **Fewer round-trips** — changes accumulate and flush in one batched commit.
- **One transaction boundary** — a single, consistent place that owns commit/rollback.

### Disadvantages
- **Complexity** — change tracking, ordering (respecting foreign keys), and identity management
  are real work.
- **Memory & scope** — holding a large set of changes in one unit is heavy; long-lived units risk
  stale data and lock contention.
- **Often built-in already** — most ORMs ship a unit of work (the "session"), so rolling your own
  can duplicate the framework.

## Common Mistakes

- **Committing per change anyway** — registering changes but flushing each immediately defeats the
  atomicity you built the unit for.
- **Ignoring flush order** — writing a child before its parent violates foreign keys; the unit must
  order inserts/updates/deletes correctly.
- **Long-lived units** — keeping one unit open across a whole request (or user session) holds locks
  and accumulates stale state; scope it to one operation.
- **Swallowing rollback** — catching the commit failure without rolling back leaves a dangling
  transaction and inconsistent state.

## Key Takeaways

- A unit of work makes a multi-object operation atomic: one commit, or a full rollback.
- It tracks new/dirty/removed objects and flushes them in one transaction.
- Scope it tightly to a single business operation to avoid lock and staleness problems.
- Most ORMs already implement it as the "session"/"context" — reach for that first.

## Implementations

### JavaScript

**❌ Naive**

```js
// Each save hits the DB immediately; a failure midway leaves partial state.
async function transfer(from, to, amount) {
  await db.query("UPDATE accounts SET balance = balance - ? WHERE id=?", [amount, from]);
  // crash here → money debited but never credited
  await db.query("UPDATE accounts SET balance = balance + ? WHERE id=?", [amount, to]);
}
```

**✅ Idiomatic**

```js
// A unit of work collects changes and flushes them in one transaction.
class UnitOfWork {
  constructor(db) { this.db = db; this.ops = []; }
  register(fn) { this.ops.push(fn); }            // defer the write
  async commit() {
    const tx = await this.db.begin();
    try {
      for (const op of this.ops) await op(tx);   // flush all, in order
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }
}

// const uow = new UnitOfWork(db);
// uow.register((tx) => tx.query("UPDATE ... balance - ? ...", [amount, from]));
// uow.register((tx) => tx.query("UPDATE ... balance + ? ...", [amount, to]));
// await uow.commit();  // both or neither
```

**🧠 Tradeoff** — Deferring writes into a unit and flushing them inside one `begin/commit/rollback`
makes the transfer atomic with a small helper. In JS you're leaning on the driver's transaction
API; the unit adds the *tracking* and a single boundary. For one two-statement operation a raw
transaction is enough — the unit earns its keep when many repositories contribute changes.

### Node.js

**❌ Naive**

```js
// Two separate awaited queries, no shared transaction.
async function placeOrder(order, items) {
  const { rows } = await pool.query("INSERT INTO orders ... RETURNING id", [order.total]);
  for (const it of items) {
    await pool.query("INSERT INTO order_items(order_id, sku) VALUES ($1,$2)", [rows[0].id, it.sku]);
  } // a failure here orphans the order row
}
```

**✅ Idiomatic**

```js
// One pooled client = one transaction; the callback is the unit of work.
async function withUnitOfWork(pool, work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);   // all writes use this client
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
// await withUnitOfWork(pool, async (tx) => {
//   const { rows } = await tx.query("INSERT INTO orders ... RETURNING id", [order.total]);
//   for (const it of items) await tx.query("INSERT INTO order_items ...", [rows[0].id, it.sku]);
// });
```

**🧠 Tradeoff** — Binding every write in an operation to one checked-out client and wrapping it in
`BEGIN/COMMIT/ROLLBACK` is the idiomatic Node unit of work — the callback scopes it and `finally`
guarantees the client returns to the pool. It's explicit rather than tracked (you pass `tx`
around), which is simpler to reason about but less automatic than an ORM session.

### Python

**❌ Naive**

```python
# Committing after each save — no atomic boundary across the operation.
def register(user, profile):
    db.add(user); db.commit()      # user persisted
    db.add(profile); db.commit()   # if this fails, a user exists with no profile
```

**✅ Idiomatic**

```python
# SQLAlchemy's Session IS a unit of work; the context manager is the boundary.
from contextlib import contextmanager

@contextmanager
def unit_of_work(Session):
    session = Session()
    try:
        yield session          # register changes: session.add(...), obj.attr = ...
        session.commit()       # flush everything in one transaction
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

# with unit_of_work(Session) as uow:
#     uow.add(user)
#     uow.add(profile)     # both committed together, or neither
```

**🧠 Tradeoff** — SQLAlchemy's `Session` already tracks new/dirty/deleted objects and flushes them
in dependency order on `commit` — it's a textbook unit of work, so you mostly *wrap* it in a
context manager for a clean boundary rather than build tracking yourself. The lesson: when the ORM
gives you a session, use it; hand-rolling change tracking duplicates a solved problem.

### Elixir

**❌ Naive**

```elixir
# Two separate Repo calls; a failure between them leaves partial state.
Repo.insert!(%Order{total: total})
Enum.each(items, &Repo.insert!(%OrderItem{order_id: order.id, sku: &1.sku}))
```

**✅ Idiomatic**

```elixir
# Ecto.Multi accumulates operations and runs them in one transaction.
alias Ecto.Multi

Multi.new()
|> Multi.insert(:order, %Order{total: total})
|> Multi.merge(fn %{order: order} ->
  Enum.reduce(items, Multi.new(), fn item, multi ->
    Multi.insert(multi, {:item, item.sku}, %OrderItem{order_id: order.id, sku: item.sku})
  end)
end)
|> Repo.transaction()   # all steps commit together, or the whole thing rolls back
```

**🧠 Tradeoff** — `Ecto.Multi` is the functional take on unit of work: you *build up* a data
structure of named operations and hand it to `Repo.transaction/1`, which runs them atomically and
returns `{:ok, results}` or `{:error, failed_step, changes_so_far}`. Because it's a value, the unit
is composable and inspectable before it runs — very Elixir. The cost is learning Multi's API for
anything beyond simple chains.

### Go

**❌ Naive**

```go
// Independent Exec calls with no shared transaction.
func placeOrder(db *sql.DB, o Order, items []Item) error {
    res, _ := db.Exec("INSERT INTO orders(total) VALUES($1)", o.Total)
    id, _ := res.LastInsertId()
    for _, it := range items {
        db.Exec("INSERT INTO order_items(order_id, sku) VALUES($1,$2)", id, it.SKU) // may fail alone
    }
    return nil
}
```

**✅ Idiomatic**

```go
// *sql.Tx is the unit of work; a helper scopes commit/rollback.
func withTx(db *sql.DB, work func(*sql.Tx) error) (err error) {
    tx, err := db.Begin()
    if err != nil {
        return err
    }
    defer func() {
        if p := recover(); p != nil {
            tx.Rollback()
            panic(p)
        } else if err != nil {
            tx.Rollback()
        } else {
            err = tx.Commit()
        }
    }()
    return work(tx) // all writes use tx
}
// withTx(db, func(tx *sql.Tx) error { /* insert order + items via tx */ })
```

**🧠 Tradeoff** — Go's `*sql.Tx` is the unit of work; the `withTx` helper (with a `defer` that
rolls back on error or panic and commits otherwise) gives one clean boundary. It's explicit — you
thread `tx` through every write — which is verbose but leaves the transaction scope unmistakable.
Change *tracking* (auto-detecting dirty objects) isn't idiomatic Go; you register writes directly.

## Applications

- **Money & inventory** — transfers, orders, and stock adjustments that must apply every change or
  none (backend).
- **ORM sessions** — Hibernate, SQLAlchemy, Entity Framework, and Ecto implement unit of work as
  their session/context/Multi (backend).
- **Multi-aggregate operations** — a DDD command touching several aggregates commits them together
  behind one unit (backend).
- **Batch imports** — accumulating many inserts and flushing in one transaction for speed and
  all-or-nothing semantics (backend).
- **Saga step boundaries** — each local step of a distributed saga is itself a unit of work; the
  saga coordinates across them (backend).

## Related Patterns

- **Repository** — repositories register their creates/updates/deletes with the unit of work, which
  owns the transaction spanning them.
- **Saga** — where a single transaction can't span services, a saga strings together per-service
  units of work with compensating actions.
- **Layered / Hexagonal** — the unit of work lives at the application-service boundary, where a use
  case's transaction naturally begins and ends.
