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
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
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

*Targets modern JavaScript (ES2015+).*

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

*Targets Node.js 24.*

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

*Targets Python 3.12.*

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

*Targets Elixir 1.18.*

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

*Targets Go 1.26.*

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

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// The service writes SQL inline — untestable without a database.
public sealed class UserService(NpgsqlDataSource db)
{
    public Task PromoteAsync(string id) =>
        db.ExecuteAsync("UPDATE users SET role='admin' WHERE id=@id", new { id });
}
```

**✅ Idiomatic**

```csharp
// The service depends on the interface; each store is one implementation.
public record User(string Id, string Role);

public interface IUserRepository
{
    Task<User?> ByIdAsync(string id);
    Task SaveAsync(User user);
}

public sealed class UserService(IUserRepository users)
{
    public async Task PromoteAsync(string id)
    {
        var user = await users.ByIdAsync(id) ?? throw new UserNotFoundException(id);
        await users.SaveAsync(user with { Role = "admin" });
    }
}

// The test double is a dictionary behind the same interface.
public sealed class InMemoryUsers : IUserRepository
{
    private readonly Dictionary<string, User> _users = new();

    public Task<User?> ByIdAsync(string id) => Task.FromResult(_users.GetValueOrDefault(id));
    public Task SaveAsync(User user) { _users[user.Id] = user; return Task.CompletedTask; }
}
```

**🧠 Tradeoff** — Records make the domain object immutable: `user with { Role = "admin" }`
produces a new value to save, so nothing outside the repository ever mutates stored state in
place. The honest C# caveat is EF Core — `DbSet<User>` is already repository-shaped, and wrapping
it in `IUserRepository` is a classic over-abstraction. Add the interface when you want the domain
free of EF types or genuinely expect a second store; skip it when EF *is* the persistence story.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// The service holds the connection and inline SQL — no database, no tests.
struct UserService { db: postgres::Client }

impl UserService {
    fn promote(&mut self, id: &str) -> Result<(), postgres::Error> {
        self.db.execute("UPDATE users SET role='admin' WHERE id=$1", &[&id])?;
        Ok(())
    }
}
```

**✅ Idiomatic**

```rust
use std::collections::HashMap;

#[derive(Clone)]
struct User { id: String, role: String }

trait UserRepo {                        // the contract the service depends on
    fn by_id(&self, id: &str) -> Option<User>;
    fn save(&mut self, user: User);
}

struct UserService<R: UserRepo> { users: R }

impl<R: UserRepo> UserService<R> {
    fn promote(&mut self, id: &str) -> Result<(), String> {
        let mut user = self.users.by_id(id).ok_or("not found")?;
        user.role = "admin".to_string();
        self.users.save(user);
        Ok(())
    }
}

// In tests (or a small app) the store is a HashMap behind the same trait.
struct InMemoryUsers(HashMap<String, User>);

impl UserRepo for InMemoryUsers {
    fn by_id(&self, id: &str) -> Option<User> { self.0.get(id).cloned() }
    fn save(&mut self, user: User) { self.0.insert(user.id.clone(), user); }
}

// A sqlx/postgres implementation is another impl UserRepo — the service never changes.
```

**🧠 Tradeoff** — Ownership makes the repository seam unusually sharp: `by_id` returns a *cloned*
`User`, so callers can never hold a live reference into storage, and the clone is the mapping
cost made visible. The trait keeps the domain crate free of any database dependency — sqlx and
diesel stay in the adapter crate. As usual Rust makes the dispatch explicit: `UserService<R>` is
static and monomorphized; reach for `Box<dyn UserRepo>` only when the store is chosen at runtime.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// The service talks to the store type directly — swap the store, edit the service.
const UserService = struct {
    db: *PostgresClient,

    pub fn promote(self: UserService, id: []const u8) !void {
        try self.db.exec("UPDATE users SET role='admin' WHERE id=$1", .{id});
    }
};
```

**✅ Idiomatic**

```zig
const std = @import("std");

const User = struct { id: []const u8, role: []const u8 };

// No interfaces: the service is generic over any repo with byId/save.
fn UserService(comptime Repo: type) type {
    return struct {
        users: *Repo,

        pub fn promote(self: @This(), id: []const u8) !void {
            var user = self.users.byId(id) orelse return error.NotFound;
            user.role = "admin";
            try self.users.save(user);
        }
    };
}

// An in-memory repo satisfies the shape just by having the methods.
const InMemoryUsers = struct {
    map: std.StringHashMap(User),

    pub fn byId(self: *InMemoryUsers, id: []const u8) ?User {
        return self.map.get(id);
    }
    pub fn save(self: *InMemoryUsers, user: User) !void {
        try self.map.put(user.id, user);
    }
};

pub fn main() !void {
    var gpa: std.heap.DebugAllocator(.{}) = .init;
    defer _ = gpa.deinit();
    var repo = InMemoryUsers{ .map = std.StringHashMap(User).init(gpa.allocator()) };
    defer repo.map.deinit();
    try repo.map.put("u1", .{ .id = "u1", .role = "user" });

    const svc = UserService(InMemoryUsers){ .users = &repo };
    try svc.promote("u1");
    std.debug.print("{s}\n", .{repo.map.get("u1").?.role}); // admin
}
```

**🧠 Tradeoff** — The comptime generic gives a duck-typed repository: any type with `byId` and
`save` fits, checked at the instantiation site, with static dispatch and zero indirection. What
you give up is a named contract — nothing in the source says "this is the repository interface,"
so the expected shape lives in a comment (or a `comptime` assertion). If the store must be picked
at runtime, switch to the `*anyopaque` + function-pointer vtable from the hexagonal kata. And
since Zig has no ORM to escape, the repository here isn't about framework independence at all —
it's purely the test seam, which is reason enough.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// The service writes SQL inline — untestable without a database.
class UserService {
    void promote(String id) throws SQLException {
        try (var conn = DriverManager.getConnection(DB_URL);
             var stmt = conn.prepareStatement("UPDATE users SET role='admin' WHERE id = ?")) {
            stmt.setString(1, id);
            stmt.executeUpdate();
        }
    }
}
```

**✅ Idiomatic**

```java
import java.util.HashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;

record User(String id, String role) {}

interface UserRepository {                  // the contract the domain depends on
    Optional<User> byId(String id);
    void save(User user);
}

class UserService {
    private final UserRepository users;
    UserService(UserRepository users) { this.users = users; }

    void promote(String id) {
        var user = users.byId(id).orElseThrow(() -> new NoSuchElementException("user " + id));
        users.save(new User(user.id(), "admin")); // records are immutable — save a new value
    }
}

// The test double is a map behind the same interface.
class InMemoryUsers implements UserRepository {
    private final Map<String, User> map = new HashMap<>();

    public Optional<User> byId(String id) { return Optional.ofNullable(map.get(id)); }
    public void save(User user) { map.put(user.id(), user); }
}

public class Demo {
    public static void main(String[] args) {
        var repo = new InMemoryUsers();
        repo.save(new User("u1", "user"));
        new UserService(repo).promote("u1");
        System.out.println(repo.byId("u1").orElseThrow().role()); // admin
    }
}
```

**🧠 Tradeoff** — Java made this pattern famous, and Spring Data made it almost free: declare
`interface UserRepository extends CrudRepository<User, String>` with a `findByEmail(String email)`
signature and the framework derives the query from the method *name* — you write the interface
and never the implementation. The honest caveat mirrors C#'s EF: JPA's `EntityManager` is already
repository-shaped, so hand-wrapping it adds the layer Spring Data exists to delete. Hand-rolled
as here, the value is the seam itself — `UserService` tests against a `HashMap` — plus one quiet
win from records: `byId` returns an immutable value, so callers can never mutate stored state
behind the repository's back.

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
