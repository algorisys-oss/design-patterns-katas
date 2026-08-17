---
id: data-mapper
category: data
sequence: 1
title: Data Mapper
also_known_as: []
gof: false
intent: "Keep domain objects completely unaware of the database by moving all persistence into a separate mapper that translates between objects and rows in both directions."
frequency: high
difficulty: intermediate
tags: [data, persistence, orm, separation-of-concerns, domain-model]
related: [active-record, repository, identity-map]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Put a **mapper** between your domain objects and the database. The mapper knows how to build a domain
object from a row (`toDomain`) and how to write a domain object back as rows (`toRow`); the domain
object itself knows *nothing* about tables, SQL, or the ORM. Persistence lives entirely in the mapper.

This total separation lets the domain model be shaped by the business — rich behavior, value objects,
whatever fits — while the mapper absorbs the impedance mismatch with the relational schema. The two can
evolve independently: refactor the object graph without touching the schema, or change the storage
without touching the rules.

## The Problem

When domain objects carry their own persistence, the two concerns fuse:

- **Coupled to the schema** — the object's structure is dictated by the table; you can't model the
  domain freely (value objects, inheritance, aggregates) without fighting the ORM.
- **Untestable domain** — business rules can't run without a database, because the objects *are* the
  persistence.
- **Leaky mapping** — SQL and column names bleed into domain code, so a schema change ripples through
  the business logic.
- **Hard to evolve independently** — the object model and the database can't change on their own
  schedules because they're the same thing.

## Structure

Key Components:

- **Domain Object** — pure business model: fields and rules, no persistence code.
- **Data Mapper** — moves data between domain objects and the database; owns all SQL/ORM details.
- **Database** — the relational store with its own schema.
- **Mapping** — the translation logic in both directions (`toDomain(row)`, `toRow(object)`).

```
Data Mapper ──constructs──► Domain Object   (pure, no DB knowledge)
     │
     └──reads/writes rows──► Database        (schema, SQL live here)
```

## When to Use

- The domain is complex enough to deserve a rich model independent of the schema.
- Business rules must be testable without a database.
- The object model and database schema should evolve separately.
- You're doing domain-driven design with aggregates, value objects, or inheritance.

## Advantages and Disadvantages

### Advantages
- **Clean domain** — business objects are pure and unit-testable with no database.
- **Independent evolution** — schema and object model change on their own schedules.
- **Handles complexity** — supports rich models (value objects, inheritance) the schema doesn't mirror.

### Disadvantages
- **More code** — a separate mapper per aggregate, plus the translation both ways.
- **Indirection** — reads/writes go through a layer, less immediate than "object.save()".
- **Overkill for simple CRUD** — where objects mirror tables 1:1, the ceremony buys little (see Active
  Record).

## Common Mistakes

- **Leaking DB models into the domain** — returning ORM entities as "domain objects" quietly recouples
  them to the schema; the mapper must produce pure domain types.
- **Persistence logic creeping into domain objects** — a `save()` method on the domain object turns it
  into Active Record; keep persistence in the mapper.
- **Anemic domain** — using Data Mapper but leaving objects as field bags forfeits the point; the freed
  domain should hold real behavior.
- **One mega-mapper** — a single mapper for the whole schema; scope mappers to aggregates.

## Key Takeaways

- The mapper owns all persistence; domain objects know nothing about the database.
- This keeps the domain pure and testable and lets schema and model evolve independently.
- It's the heavyweight ORM philosophy (Hibernate, SQLAlchemy, Ecto) — great for rich domains.
- For 1:1 table-to-object CRUD, Active Record is lighter; Data Mapper earns its keep with complexity.

## Implementations

### JavaScript

**❌ Naive**

```js
// The domain object carries its own SQL — coupled to the schema, untestable without a DB.
class User {
  constructor(row) { this.id = row.id; this.name = row.name; }
  async save() { await db.query("UPDATE users SET name=? WHERE id=?", [this.name, this.id]); }
}
```

**✅ Idiomatic**

```js
// Pure domain object; a mapper translates both ways.
class User {                    // no persistence code — just data + rules
  constructor(id, name) { this.id = id; this.name = name; }
  rename(name) { if (!name) throw new Error("empty"); this.name = name; }
}

const UserMapper = {
  toDomain: (row) => new User(row.id, row.name),
  toRow: (u) => ({ id: u.id, name: u.name }),
  async find(id) {
    const row = await db.query("SELECT * FROM users WHERE id=?", [id]);
    return row && UserMapper.toDomain(row);
  },
  async save(user) {
    const r = UserMapper.toRow(user);
    await db.query("UPDATE users SET name=? WHERE id=?", [r.name, r.id]);
  },
};
```

**🧠 Tradeoff** — `User` is now a pure object you can unit-test (`rename` throws) with no database, and
`UserMapper` owns the SQL and the row↔object translation. You write more code than a `user.save()`, and
the payoff is a domain model free to be as rich as the business needs. For trivial CRUD it's more than
you need; for real rules it's the clean separation.

### Node.js

**❌ Naive**

```js
// Handlers pass ORM rows around as if they were domain objects — schema leaks everywhere.
const row = await pool.query("SELECT * FROM orders WHERE id=$1", [id]);
res.json({ total: row.total_cents / 100 }); // domain shaping smeared into the handler
```

**✅ Idiomatic**

```js
// A mapper builds domain objects with behavior; persistence stays in the mapper.
class Order {
  constructor(id, totalCents, status) { this.id = id; this.totalCents = totalCents; this.status = status; }
  get total() { return this.totalCents / 100; }        // domain behavior
  ship() { if (this.status !== "paid") throw new Error("not paid"); this.status = "shipped"; }
}
const OrderMapper = {
  toDomain: (r) => new Order(r.id, r.total_cents, r.status),
  find: (id) => pool.query("SELECT * FROM orders WHERE id=$1", [id]).then((r) => r.rows[0] && OrderMapper.toDomain(r.rows[0])),
  save: (o) => pool.query("UPDATE orders SET status=$1 WHERE id=$2", [o.status, o.id]),
};
```

**🧠 Tradeoff** — Mapping `total_cents` → an `Order` with a `total` getter and `ship()` rule keeps the
schema (columns, cents) out of the handlers and gives the domain real behavior. Node ORMs like MikroORM
implement Data Mapper (vs. Sequelize's Active Record). The extra mapper is the cost; the payoff is
handlers and rules that never see a column name.

### Python

**❌ Naive**

```python
# Django's Model is Active Record — the domain object IS the row, coupled to the table.
class User(models.Model):
    name = models.CharField(max_length=100)
    def promote(self):        # business logic living on the persistence object
        self.role = "admin"; self.save()
```

**✅ Idiomatic**

```python
# SQLAlchemy's classical mapping (or a hand mapper): pure domain + a mapper/session.
from dataclasses import dataclass

@dataclass
class User:                          # pure domain object — no ORM base class
    id: int
    name: str
    def rename(self, name):          # behavior, testable with no DB
        if not name: raise ValueError("empty")
        self.name = name

class UserMapper:
    def __init__(self, session): self.session = session
    def find(self, id):
        row = self.session.execute(select(users).where(users.c.id == id)).first()
        return User(row.id, row.name) if row else None
    def save(self, user):
        self.session.execute(update(users).where(users.c.id == user.id).values(name=user.name))
```

**🧠 Tradeoff** — SQLAlchemy is famous for supporting *both* styles; its Core + a mapper (or classical
mapping) gives true Data Mapper, keeping `User` a plain dataclass with testable behavior. The contrast
with Django's Active Record `Model` is the whole lesson: Data Mapper trades convenience for a domain
model unbound from the schema. Choose it when the domain is rich; Active Record when objects mirror
tables.

### Elixir

**❌ Naive**

```elixir
# Scattering Repo calls and treating Ecto schema structs as the domain everywhere.
user = Repo.get(User, id)                 # an Ecto schema struct
user |> Ecto.Changeset.change(name: n) |> Repo.update!()  # persistence mixed into flow
```

**✅ Idiomatic**

```elixir
# Ecto separates schema (mapping) from Repo (the mapper) and your context (domain).
# schema = the mapping definition; context module = domain + mapper boundary
defmodule Accounts do
  def get_user(id) do
    case Repo.get(User, id) do
      nil -> nil
      schema -> to_domain(schema)         # translate to a plain domain struct
    end
  end
  def save_user(%DomainUser{} = u), do: u |> to_changeset() |> Repo.insert_or_update()

  defp to_domain(%User{} = s), do: %DomainUser{id: s.id, name: s.name}   # mapping
end
```

**🧠 Tradeoff** — Ecto is a Data Mapper by design: schemas define the row↔struct mapping, `Repo` is the
mapper that talks to the database, and there's no `user.save()` — persistence is explicit and separate.
Many Elixir apps use the Ecto schema struct *as* the domain (pragmatic), but for a rich domain you add a
translation to plain structs in the context. The separation is idiomatic; the extra mapping is opt-in
per complexity.

### Go

**❌ Naive**

```go
// A struct with tags and methods that run SQL — persistence welded to the model.
type User struct {
    ID   int
    Name string
}
func (u *User) Save(db *sql.DB) error { // Active-Record-ish: model knows the DB
    _, err := db.Exec("UPDATE users SET name=$1 WHERE id=$2", u.Name, u.ID)
    return err
}
```

**✅ Idiomatic**

```go
// Plain domain struct; a mapper (repository) owns the SQL and the scan.
type User struct {
    ID   int
    Name string
}
func (u *User) Rename(name string) error { // behavior, no DB
    if name == "" { return errors.New("empty") }
    u.Name = name; return nil
}

type UserMapper struct{ db *sql.DB }
func (m UserMapper) Find(id int) (*User, error) {
    var u User
    err := m.db.QueryRow("SELECT id, name FROM users WHERE id=$1", id).Scan(&u.ID, &u.Name) // mapping
    if err != nil { return nil, err }
    return &u, nil
}
func (m UserMapper) Save(u *User) error {
    _, err := m.db.Exec("UPDATE users SET name=$1 WHERE id=$2", u.Name, u.ID)
    return err
}
```

**🧠 Tradeoff** — Idiomatic Go keeps the struct a plain value with behavior and puts scanning/SQL in a
mapper (usually called a repository) — the standard-library `database/sql` style, and what `sqlc`
generates. Go's culture strongly favors this explicit Data-Mapper approach over Active-Record ORMs
(GORM offers the latter). The manual `Scan` mapping is the cost; the benefit is a domain struct with no
database dependency and SQL you can see.

### CSharp

**❌ Naive**

```csharp
// The model writes itself into the store — schema knowledge welded to the domain.
public sealed class User(int id, string name)
{
    public int Id { get; } = id;
    public string Name { get; set; } = name;

    public void Save(Dictionary<int, string> table) => table[Id] = Name; // model knows storage
}
```

**✅ Idiomatic**

```csharp
// Top-level statements: the demo runs first, the types follow.
var mapper = new UserMapper();
mapper.Save(new User(1, "Ada"));         // seed the in-memory "users table"

var user = mapper.Find(1)!;
user.Rename("Grace");                    // pure domain behavior — no storage in sight
mapper.Save(user);
Console.WriteLine(mapper.Find(1)!.Name); // Grace

// Pure domain object — fields and rules, nothing about rows.
public sealed class User(int id, string name)
{
    public int Id { get; } = id;
    public string Name { get; private set; } = name;

    public void Rename(string name) =>
        Name = string.IsNullOrEmpty(name) ? throw new ArgumentException("empty") : name;
}

// The row shape belongs to storage, not the domain.
public sealed record UserRow(int Id, string Name);

// The mapper owns the table and the translation in both directions.
public sealed class UserMapper
{
    private readonly Dictionary<int, UserRow> _table = new(); // stands in for the database

    private static User ToDomain(UserRow row) => new(row.Id, row.Name);
    private static UserRow ToRow(User u) => new(u.Id, u.Name);

    public User? Find(int id) => _table.TryGetValue(id, out var row) ? ToDomain(row) : null;
    public void Save(User u) => _table[u.Id] = ToRow(u);
}
```

**🧠 Tradeoff** — EF Core *is* a Data Mapper: entities are plain classes and the `DbContext` does the
translating and tracking, so C# teams usually get this pattern from the framework — the hand mapper
shows what that machinery does. The type system makes the split visible: `UserRow` is an immutable
`record` snapshot of storage, `User` is a mutable class with behavior, and only the mapper knows both.
The cost is two types plus translation per aggregate; the payoff is that `Rename` unit-tests with no
storage at all.

### Rust

**❌ Naive**

```rust
use std::collections::HashMap;

// The model writes itself into the store — persistence welded to the struct.
struct User { id: u32, name: String }

impl User {
    fn save(&self, table: &mut HashMap<u32, String>) {
        table.insert(self.id, self.name.clone()); // model knows the storage shape
    }
}
```

**✅ Idiomatic**

```rust
use std::collections::HashMap;

// Pure domain struct — fields and rules, no storage in sight.
struct User { id: u32, name: String }

impl User {
    fn rename(&mut self, name: &str) -> Result<(), String> {
        if name.is_empty() { return Err("empty".into()); }
        self.name = name.to_string();
        Ok(())
    }
}

// The row shape belongs to storage, not the domain.
struct UserRow { id: u32, name: String }

// The mapper owns the table and the translation both ways.
struct UserMapper { table: HashMap<u32, UserRow> } // stands in for the database

impl UserMapper {
    fn to_domain(row: &UserRow) -> User { User { id: row.id, name: row.name.clone() } }
    fn to_row(u: &User) -> UserRow { UserRow { id: u.id, name: u.name.clone() } }

    fn find(&self, id: u32) -> Option<User> { self.table.get(&id).map(Self::to_domain) }
    fn save(&mut self, u: &User) { self.table.insert(u.id, Self::to_row(u)); }
}

fn main() {
    let mut mapper = UserMapper { table: HashMap::new() };
    mapper.save(&User { id: 1, name: "Ada".into() }); // seed the in-memory "users table"

    let mut user = mapper.find(1).unwrap();
    user.rename("Grace").unwrap();               // pure behavior, testable with no store
    mapper.save(&user);
    println!("{}", mapper.find(1).unwrap().name); // Grace
}
```

**🧠 Tradeoff** — ownership makes Data Mapper the natural Rust shape: `find` hands you an *owned*
`User` translated out of the row, nothing links it back to the table, and only an explicit `save`
writes it home. There's no fight with the borrow checker because the pattern never asks for shared
mutable state between object and store — which is exactly why Rust's ORMs (Diesel, SeaORM) are
mapper-shaped rather than Active Record. The `clone()`s in the translation are the visible price of
that copy-in/copy-out contract.

### Zig

**❌ Naive**

```zig
const std = @import("std");

// The model writes itself into the store — persistence welded to the struct.
const Table = struct { names: [8]?[]const u8 };

const User = struct {
    id: u32,
    name: []const u8,

    fn save(self: User, table: *Table) void {
        table.names[self.id] = self.name; // the "domain" knows the storage layout
    }
};
```

**✅ Idiomatic**

```zig
const std = @import("std");

// Pure domain struct — fields and rules, nothing about storage.
const User = struct {
    id: u32,
    name: []const u8,

    fn rename(self: *User, name: []const u8) !void {
        if (name.len == 0) return error.EmptyName;
        self.name = name;
    }
};

// The row shape belongs to storage, not the domain.
const UserRow = struct { id: u32, name: []const u8 };

// The mapper owns the table and the translation both ways.
const UserMapper = struct {
    rows: [8]?UserRow = @splat(null), // the "users table", keyed by id

    fn toDomain(row: UserRow) User {
        return .{ .id = row.id, .name = row.name };
    }
    fn toRow(u: User) UserRow {
        return .{ .id = u.id, .name = u.name };
    }

    fn find(self: UserMapper, id: u32) ?User {
        const row = self.rows[id] orelse return null;
        return toDomain(row);
    }
    fn save(self: *UserMapper, u: User) void {
        self.rows[u.id] = toRow(u);
    }
};

pub fn main() !void {
    var mapper = UserMapper{};
    mapper.save(.{ .id = 1, .name = "Ada" }); // seed the in-memory "users table"

    var user = mapper.find(1).?;
    try user.rename("Grace");                 // pure behavior, testable with no store
    mapper.save(user);
    std.debug.print("{s}\n", .{mapper.find(1).?.name}); // Grace
}
```

**🧠 Tradeoff** — in Zig, Data Mapper is less a technique than a filing decision: a row struct, a
domain struct, and two small translation functions, with no ORM to hide any of it. `find` returns a
copy by value — which is precisely the pattern's contract, not a workaround. The honest caveat: for a
struct this small, `User` and `UserRow` are identical shapes and the split reads as ceremony; it earns
its keep once the storage layout (packed fields, foreign keys) and the domain shape start to diverge.

### Java

**❌ Naive**

```java
import java.util.Map;

// The model writes itself into the store — schema knowledge welded to the domain.
class User {
    int id;
    String name;

    void save(Map<Integer, String> table) { table.put(id, name); } // model knows storage
}
```

**✅ Idiomatic**

```java
import java.util.HashMap;
import java.util.Map;

// Pure domain object — fields and rules, nothing about rows.
class User {
    final int id;
    private String name;

    User(int id, String name) { this.id = id; this.name = name; }

    String name() { return name; }
    void rename(String name) {
        if (name == null || name.isEmpty()) throw new IllegalArgumentException("empty");
        this.name = name;
    }
}

// The row shape belongs to storage, not the domain.
record UserRow(int id, String name) {}

// The mapper owns the table and the translation in both directions.
class UserMapper {
    private final Map<Integer, UserRow> table = new HashMap<>(); // stands in for the database

    private static User toDomain(UserRow row) { return new User(row.id(), row.name()); }
    private static UserRow toRow(User u) { return new UserRow(u.id, u.name()); }

    User find(int id) {
        var row = table.get(id);
        return row == null ? null : toDomain(row);
    }
    void save(User u) { table.put(u.id, toRow(u)); }
}

public class Demo {
    public static void main(String[] args) {
        var mapper = new UserMapper();
        mapper.save(new User(1, "Ada"));           // seed the in-memory "users table"

        var user = mapper.find(1);
        user.rename("Grace");                      // pure domain behavior — no storage in sight
        mapper.save(user);
        System.out.println(mapper.find(1).name()); // Grace
    }
}
```

**🧠 Tradeoff** — this is Hibernate's home ground: JPA's `EntityManager` is a Data Mapper plus a Unit
of Work — entities are plain classes, `find`/`persist` do the translating, and the mapping lives in
annotations instead of a hand-written `toRow`. The hand mapper shows the machinery the framework hides.
The `record` makes the split visible: `UserRow` is an immutable storage snapshot, `User` a mutable
object with behavior, and only the mapper knows both. The cost is two types plus translation per
aggregate; the payoff — `rename` unit-tests with no database — is the argument Hibernate has been
making since 2001.

## Applications

- **Domain-driven design** — the standard persistence approach for rich domains with aggregates and
  value objects (backend).
- **Heavyweight ORMs** — Hibernate/JPA, SQLAlchemy (classical), MikroORM, and Ecto implement Data Mapper
  (backend).
- **Testable business logic** — pure domain objects mapped separately so rules test without a database
  (backend).
- **Schema/model divergence** — systems where the object graph deliberately differs from the tables
  (backend).
- **Polyglot persistence** — mapping the same domain to different stores by swapping mappers (backend).

## Related Patterns

- **Active Record** — the opposite trade-off: the object *is* the row and carries its own persistence;
  lighter for simple CRUD, more coupled.
- **Repository** — often sits atop a Data Mapper, presenting a collection-like domain interface while the
  mapper handles row translation.
- **Identity Map** — a Data Mapper typically uses an Identity Map so the same row maps to the same
  in-memory object within a session.
