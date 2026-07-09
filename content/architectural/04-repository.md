---
id: repository
category: architectural
sequence: 4
title: Repository
also_known_as: [Collection-Oriented Data Access]
gof: false
intent: "Hide data access behind a collection-like interface, so the rest of the app stores and queries domain objects without knowing about SQL, an ORM, or an HTTP API."
frequency: high
difficulty: beginner
tags: [architecture, persistence, data-access, abstraction, testability]
related: [unit-of-work, hexagonal, layered]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Give the domain a **collection-like interface** for its objects — `find`, `save`, `remove`,
`all` — and put every detail of *how* they're stored behind it. Callers ask a repository for a
`User`; whether that user comes from Postgres, an in-memory map, or a REST call is the
repository's private business.

The repository is a seam. It keeps persistence concerns out of the business logic and gives you a
single, swappable place where storage lives — which also makes the domain testable against a fake
that never touches a database.

## The Problem

Scatter data access through the codebase and queries end up everywhere:

- **Query duplication** — the same "find active users" SQL is copy-pasted into five services, so
  a schema change means five edits.
- **Domain coupled to storage** — business logic imports the ORM/SQL client, so you can't test it
  without a database and can't change datastores without touching rules.
- **Leaky models** — raw rows and ORM entities flow into the domain, coupling it to the schema.
- **Inconsistent access** — every caller queries slightly differently, so caching, logging, and
  auth checks on data access have no single home.

## Structure

Key Components:

- **Repository interface** — the collection-like contract the domain depends on (`find`, `save`…).
- **Concrete Repositories** — implementations for each backing store (SQL, in-memory, HTTP).
- **Domain objects / entities** — what the repository stores and returns; storage models stay hidden.
- **Client** — services and use cases that depend only on the interface.

```
Service ──uses──► «UserRepository»  find(id) / save(u)
                        △ implements
              ┌─────────┴──────────┐
      SqlUserRepository     InMemoryUserRepository
```

## When to Use

- Business logic should be testable without a real datastore.
- You want one place for a given entity's persistence (queries, mapping, caching).
- The backing store might change, or you need multiple (SQL in prod, in-memory in tests).
- Domain models and storage models should stay decoupled.

## Advantages and Disadvantages

### Advantages
- **Testability** — swap a real repository for an in-memory fake; the domain never notices.
- **Centralized access** — one home per entity for queries, mapping, caching, and access rules.
- **Storage independence** — change or add a backing store by writing a new implementation.

### Disadvantages
- **Abstraction cost** — for simple CRUD over one database, a repository can be ceremony over the ORM.
- **Leaky queries** — complex reporting queries resist a tidy collection interface and tempt you
  to expose the query language anyway.
- **N+1 and performance blind spots** — a naive per-object interface hides expensive access
  patterns behind innocent-looking calls.

## Common Mistakes

- **Exposing the query language** — a `query(sql)` method on the repository leaks the storage
  detail it was meant to hide; offer intention-revealing finders instead.
- **A generic repository for everything** — `Repository<T>` with only `getById`/`save` forces
  business queries into services or leaks them; add entity-specific methods.
- **Returning storage models** — handing back ORM rows re-couples callers to the schema; map to
  domain objects at the boundary.
- **One method per screen** — letting the UI drive dozens of bespoke finders bloats the interface;
  keep it about the domain, not the views.

## Key Takeaways

- A repository is a collection-like façade over storage; the domain depends on the interface only.
- Its biggest everyday win is testability — an in-memory implementation replaces the database.
- Give it intention-revealing finders; don't leak SQL or return raw rows.
- It pairs with Unit of Work when several repository changes must commit atomically.

## Implementations

### JavaScript

**❌ Naive**

```js
// Service holds SQL inline — logic coupled to the database, untestable without one.
class UserService {
  async promote(id) {
    const rows = await db.query("SELECT * FROM users WHERE id=?", [id]);
    if (!rows.length) throw new Error("not found");
    await db.query("UPDATE users SET role='admin' WHERE id=?", [id]);
  }
}
```

**✅ Idiomatic**

```js
// The service depends on a repository shape; storage lives behind it.
class UserService {
  constructor(users) { this.users = users; } // repository
  async promote(id) {
    const user = await this.users.findById(id);
    if (!user) throw new Error("not found");
    user.role = "admin";
    await this.users.save(user);
  }
}

// infrastructure/sql-user-repo.js
const sqlUserRepo = {
  findById: (id) => db.query("SELECT * FROM users WHERE id=?", [id]).then((r) => r[0] && toUser(r[0])),
  save: (u) => db.query("UPDATE users SET role=? WHERE id=?", [u.role, u.id]),
};
// tests: new UserService(new Map(...) wrapped as a repo) — no database
```

**🧠 Tradeoff** — Injecting a `users` repository frees `UserService` from SQL, so it tests against
a `Map`-backed fake and could switch datastores without edits. The cost is an extra object and a
mapping (`toUser`) between rows and domain objects — negligible next to the testability, but real
overhead for a one-query CRUD endpoint.

### Node.js

**❌ Naive**

```js
// Every route reaches into the pool with ad-hoc SQL — duplication everywhere.
app.get("/products/active", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM products WHERE active = true");
  res.json(rows);
});
```

**✅ Idiomatic**

```js
// A repository module owns product persistence; routes call intention-revealing finders.
function makeProductRepo(pool) {
  return {
    active: () => pool.query("SELECT * FROM products WHERE active = true").then((r) => r.rows.map(toProduct)),
    byId: (id) => pool.query("SELECT * FROM products WHERE id=$1", [id]).then((r) => r.rows[0] && toProduct(r.rows[0])),
    save: (p) => pool.query("INSERT ... ON CONFLICT (id) DO UPDATE ...", [p.id, p.name]),
  };
}
// app.get("/products/active", (_req, res) => products.active().then((p) => res.json(p)));
```

**🧠 Tradeoff** — Naming finders (`active`, `byId`) instead of scattering SQL gives one place to
tune queries, add caching, or swap `pg` for another driver, and keeps routes thin. Node has no
repository framework, so you hand-roll the module — lighter than a full ORM's repository layer, but
you own the mapping and the connection handling.

### Python

**❌ Naive**

```python
# Business logic peppered with ORM queries — the domain depends on Django's ORM.
def deactivate_stale():
    for u in User.objects.filter(last_login__lt=cutoff()):
        u.active = False
        u.save()
```

**✅ Idiomatic**

```python
from typing import Protocol

class UserRepository(Protocol):
    def stale(self) -> list["User"]: ...
    def save(self, user: "User") -> None: ...

class Deactivate:                            # domain logic, storage-agnostic
    def __init__(self, users: UserRepository):
        self.users = users
    def __call__(self) -> None:
        for user in self.users.stale():
            user.active = False
            self.users.save(user)

class DjangoUserRepository:                   # one implementation
    def stale(self): return [to_user(m) for m in User.objects.filter(last_login__lt=cutoff())]
    def save(self, user): UserModel.objects.filter(id=user.id).update(active=user.active)
```

**🧠 Tradeoff** — A `Protocol` describes the repository and the domain depends on it, so
`Deactivate` tests with an in-memory list and never imports the ORM. It's clean and type-checked,
but in Django especially the ORM's own manager/queryset *is* a repository-ish layer, so an extra
repository can feel redundant — worth it when you want the domain framework-free, less so for
ORM-centric apps.

### Elixir

**❌ Naive**

```elixir
# Business functions call Repo directly, spreading Ecto through the domain.
def promote(id) do
  user = Repo.get!(User, id)
  user |> Ecto.Changeset.change(role: "admin") |> Repo.update!()
end
```

**✅ Idiomatic**

```elixir
# A behaviour defines the repository; a context module implements it over Ecto.
defmodule Users do
  @callback get(id :: term) :: User.t() | nil
  @callback save(User.t()) :: {:ok, User.t()} | {:error, term}
end

defmodule Accounts do                         # domain logic, depends on the behaviour
  def promote(users \\ Users.Ecto, id) do
    case users.get(id) do
      nil -> {:error, :not_found}
      user -> users.save(%{user | role: "admin"})
    end
  end
end

defmodule Users.Ecto do                        # implementation
  @behaviour Users
  @impl true
  def get(id), do: Repo.get(User, id)
  @impl true
  def save(user), do: user |> Ecto.Changeset.change() |> Repo.update()
end
```

**🧠 Tradeoff** — A **behaviour** as the repository contract lets `Accounts.promote` take the
implementation as an argument (defaulting to the Ecto one), so tests pass `Users.InMemory`. It's
idiomatic, but Elixir teams often treat the **context** module itself as the repository boundary
and skip the extra behaviour — fine until you actually need to swap or fake the store.

### Go

**❌ Naive**

```go
// Service takes a *sql.DB and writes SQL inline — can't test without a database.
type UserService struct{ db *sql.DB }
func (s UserService) Promote(id string) error {
    _, err := s.db.Exec("UPDATE users SET role='admin' WHERE id=$1", id)
    return err
}
```

**✅ Idiomatic**

```go
// The service depends on a small repository interface it defines.
type UserRepo interface {
    ByID(id string) (User, error)
    Save(User) error
}

type UserService struct{ users UserRepo }

func (s UserService) Promote(id string) error {
    u, err := s.users.ByID(id)
    if err != nil {
        return err
    }
    u.Role = "admin"
    return s.users.Save(u)
}

// infrastructure implements UserRepo over *sql.DB; tests pass an in-memory map.
```

**🧠 Tradeoff** — A tiny `UserRepo` interface, defined where it's used, lets `UserService` test
against a map and swap SQL for anything satisfying the interface — very idiomatic Go (small,
consumer-defined interfaces). The explicit mapping between DB rows and `User`, and the hand-wiring
in `main`, are the costs; there's no ORM magic, but also no magic to fight.

## Applications

- **Domain-driven design** — the canonical persistence boundary in DDD; aggregates are loaded and
  saved through repositories (backend).
- **Testable services** — swapping a real repository for an in-memory one is the standard way to
  unit-test business logic fast (backend).
- **Multi-source data** — one interface fronting a database plus a cache plus a remote API, hiding
  the composition from callers (backend).
- **Framework boundaries** — keeping application logic independent of Rails/Django/Ecto so the ORM
  can change without a rewrite (backend).
- **Offline-first clients** — a repository fronting local storage and a remote API, syncing behind
  one interface (frontend).

## Related Patterns

- **Unit of Work** — coordinates changes across several repositories so they commit or roll back
  as one transaction.
- **Hexagonal (Ports & Adapters)** — a repository interface is the archetypal driven port; the
  concrete repository is its adapter.
- **Data Mapper** — the repository often sits atop a mapper that translates between domain objects
  and database rows.
