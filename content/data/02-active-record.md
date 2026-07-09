---
id: active-record
category: data
sequence: 2
title: Active Record
also_known_as: []
gof: false
intent: "Wrap a database row in an object that carries both the data and the methods to persist it — the object knows how to find, save, and delete itself."
frequency: high
difficulty: beginner
tags: [data, persistence, orm, crud, simplicity]
related: [data-mapper, repository, unit-of-work]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Make each object correspond to **one row** in a table, and give it the persistence methods too:
`user.save()`, `User.find(id)`, `user.delete()`. The object holds the row's data as fields *and* knows
how to read and write itself to the database. Data and database access live together in one class.

For straightforward CRUD, this is the shortest path from "I have an object" to "it's in the database."
There's no separate mapper or repository — the model is the persistence layer, so the common operations
are right there on the object. It's the philosophy behind Rails, Django, Eloquent, and Sequelize.

## The Problem

For simple, table-shaped data, a full Data Mapper is more machinery than the job needs:

- **Ceremony for CRUD** — a separate mapper/repository per entity, plus two-way translation, is a lot of
  code when the object just mirrors the table.
- **Indirection to save** — `mapper.save(user)` is a step removed from the intuitive `user.save()`.
- **Boilerplate** — hand-writing finders and inserts for every table that's essentially the same shape.
- **Slow to move** — for a CRUD app or prototype, the "clean domain" separation delays shipping without
  a payoff, because there's little domain complexity to protect.

## Structure

Key Components:

- **Active Record class** — maps 1:1 to a table; instance fields mirror columns.
- **Instance persistence** — `save()`, `delete()`, `update()` on the object act on its row.
- **Class-level finders** — `find(id)`, `where(...)`, `all()` as static/class methods returning records.
- **Direct SQL ownership** — the class generates its own queries (usually via an ORM base class).

```
User (Active Record) { name, email; save(), delete(), find() }
        │  maps 1:1, owns its own SQL
        ▼
   users table { rows }
```

## When to Use

- CRUD-heavy applications where objects naturally mirror tables 1:1.
- Prototypes and apps prioritizing development speed over domain purity.
- The domain logic is thin — mostly validation and persistence, little rich behavior.
- The team wants a conventional, batteries-included ORM (Rails/Django style).

## Advantages and Disadvantages

### Advantages
- **Simple & fast** — the shortest path to persistence; minimal boilerplate for CRUD.
- **Intuitive** — `user.save()` reads exactly as it means; finders live on the model.
- **Convention-driven** — mature frameworks (Rails, Django, Eloquent) automate the mapping.

### Disadvantages
- **Couples domain to schema** — the object's shape is the table's shape; hard to model a rich domain.
- **Untestable in isolation** — business logic on the record can't run without a database.
- **Fat models** — as logic grows, mixing rules with persistence produces God-object models.

## Common Mistakes

- **Piling business logic onto records** — as domain complexity grows, an Active Record becomes a fat,
  untestable God object; extract rules into services/POROs or move to Data Mapper.
- **Persistence in tight loops** — calling `save()` per object in a loop hits the DB N times; batch or
  use a Unit of Work.
- **N+1 queries** — lazy per-record association loading in a loop; eager-load related data.
- **Using it for a rich domain** — forcing a complex domain into table-shaped records fights the model;
  that's Data Mapper territory.

## Key Takeaways

- One object per row, with the persistence methods on the object itself (`save`, `find`, `delete`).
- It's the simplest, fastest approach for table-shaped CRUD — the Rails/Django philosophy.
- The trade-off is coupling: the domain is bound to the schema and hard to test without a DB.
- When domain complexity outgrows the table shape, reach for Data Mapper.

## Implementations

### JavaScript

**❌ Naive**

```js
// Scattered ad-hoc SQL for the same entity across the codebase.
const rows = await db.query("SELECT * FROM users WHERE id=?", [id]);
await db.query("UPDATE users SET name=? WHERE id=?", [name, id]); // repeated everywhere
```

**✅ Idiomatic**

```js
// A model that maps to a row and knows how to persist itself.
class User {
  constructor({ id, name, email }) { Object.assign(this, { id, name, email }); }

  static async find(id) {
    const row = await db.query("SELECT * FROM users WHERE id=?", [id]);
    return row && new User(row);
  }
  async save() {
    await db.query("UPDATE users SET name=?, email=? WHERE id=?", [this.name, this.email, this.id]);
    return this;
  }
  async delete() { await db.query("DELETE FROM users WHERE id=?", [this.id]); }
}
// const u = await User.find(1); u.name = "Ada"; await u.save();
```

**🧠 Tradeoff** — Putting `find`/`save`/`delete` on `User` gives the intuitive `u.save()` and centralizes
the entity's SQL — fast and readable for CRUD. The cost is that `User` now depends on `db`, so testing
its behavior means a database (or heavy mocking), and any real domain logic added here mixes with
persistence. Sequelize/Objection give this style with far less hand-written SQL.

### Node.js

**❌ Naive**

```js
// Repeating query logic per route; no single home for the entity.
app.post("/posts", async (req, res) => {
  await pool.query("INSERT INTO posts(title, body) VALUES($1,$2)", [req.body.title, req.body.body]);
});
```

**✅ Idiomatic**

```js
// Sequelize model = Active Record: define once, persist via instance/class methods.
const Post = sequelize.define("Post", {
  title: DataTypes.STRING,
  body: DataTypes.TEXT,
});

// create + save on the instance; find on the class:
const post = await Post.create({ title, body }); // INSERT
post.title = "Updated";
await post.save();                                // UPDATE
const found = await Post.findByPk(id);            // SELECT
```

**🧠 Tradeoff** — Sequelize (and TypeORM's Active Record mode) gives Node this style: a model definition
generates the SQL, and `create`/`save`/`findByPk` live on the model — minimal code for CRUD. It's ideal
for straightforward apps and prototypes. The same caveats hold: the model couples to the schema and
grows fat if you keep loading it with business logic; MikroORM's Data Mapper mode is the alternative for
richer domains.

### Python

**❌ Naive**

```python
# Hand-written SQL scattered across views for the same table.
cur.execute("INSERT INTO articles (title, body) VALUES (%s, %s)", (title, body))
cur.execute("UPDATE articles SET title=%s WHERE id=%s", (title, id))
```

**✅ Idiomatic**

```python
# Django's Model IS Active Record: fields + persistence on one class.
class Article(models.Model):
    title = models.CharField(max_length=200)
    body = models.TextField()

    def publish(self):            # thin domain behavior + persistence together
        self.published_at = timezone.now()
        self.save()

# a = Article.objects.create(title="Hi", body="...")   # INSERT
# a.title = "Edited"; a.save()                          # UPDATE
# Article.objects.filter(published=True)                # class-level finders
```

**🧠 Tradeoff** — Django's ORM is the canonical Active Record: `Model` subclasses map to tables, and
`.save()`/`.objects` provide persistence with almost no boilerplate — hugely productive for CRUD web
apps. It's why Django ships fast. The flip side is the well-known "fat model" pull and coupling to the
schema; teams with rich domains move logic into services or adopt SQLAlchemy's Data Mapper. Convenience
vs. purity, chosen per app.

### Elixir

**❌ Naive**

```elixir
# Raw SQL via Postgrex scattered around, no entity abstraction.
Postgrex.query!(conn, "UPDATE users SET name = $1 WHERE id = $2", [name, id])
```

**✅ Idiomatic**

```elixir
# Elixir/Ecto is Data Mapper, not Active Record — there's no user.save().
# The closest "record-like" convenience is a schema + a thin context, but persistence
# stays explicit through Repo (deliberately):
schema = Repo.get(User, id)
schema
|> Ecto.Changeset.change(name: name)
|> Repo.update!()     # persistence is a separate step, by design
```

**🧠 Tradeoff** — Elixir is the odd one out: Ecto is intentionally a **Data Mapper**, so there is no
Active Record `save()` on the struct — persistence always goes through `Repo`, and immutability means a
struct can't "save itself" anyway. This is a deliberate design stance (explicit over convenient). The
lesson lands by contrast: Active Record fits mutable, object-oriented languages; the functional, immutable
BEAM naturally leads to Data Mapper instead.

### Go

**❌ Naive**

```go
// Repeated inline SQL for the same entity across handlers.
db.Exec("INSERT INTO users(name, email) VALUES($1,$2)", name, email)
db.Exec("UPDATE users SET name=$1 WHERE id=$2", name, id)
```

**✅ Idiomatic**

```go
// GORM offers Active Record: a struct with tags, persistence via methods on the DB handle.
type User struct {
    ID    uint
    Name  string
    Email string
}

db.Create(&user)                 // INSERT
user.Name = "Ada"
db.Save(&user)                   // UPDATE
db.First(&found, id)             // SELECT
db.Delete(&user)                 // DELETE
```

**🧠 Tradeoff** — GORM brings an Active-Record-style ORM to Go: struct tags define the mapping and
`Create`/`Save`/`First`/`Delete` handle persistence with little code — convenient for CRUD services.
But Go's community leans strongly the other way, preferring explicit Data Mapper (`database/sql`, `sqlc`)
for visible SQL and no reflection magic. So Active Record exists in Go but runs against the grain; it's a
convenience trade many Go teams decline in favor of explicitness.

## Applications

- **CRUD web apps** — Rails, Django, Laravel/Eloquent, and Phoenix-with-schemas build admin panels and
  content apps fast (backend).
- **Prototypes & MVPs** — the quickest way to get persistence working when speed matters most (backend).
- **Thin-domain services** — apps that are mostly forms over tables with light validation (backend).
- **Scaffolding & generators** — framework generators produce Active Record models, controllers, and
  views from a schema (backend).
- **Internal tools** — CRUD dashboards where domain complexity is low and convenience is king (backend).

## Related Patterns

- **Data Mapper** — the opposite trade-off: pure domain objects with persistence in a separate mapper;
  more code, but decoupled and testable for rich domains.
- **Repository** — often layered over Active Record or Data Mapper to present a collection-like interface
  and hide query details from callers.
- **Unit of Work** — batches the many `save()` calls Active Record encourages into one transaction to
  avoid per-object round-trips.
