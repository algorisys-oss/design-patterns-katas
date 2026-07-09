---
id: identity-map
category: data
sequence: 3
title: Identity Map
also_known_as: []
gof: false
intent: "Keep a map of objects already loaded in a session so each database row is loaded once and represented by exactly one in-memory object — avoiding duplicate loads and inconsistent copies."
frequency: medium
difficulty: intermediate
tags: [data, persistence, caching, consistency, identity]
related: [data-mapper, unit-of-work, cache-aside]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Within a session (a request, a transaction, a unit of work), keep a **map from identity to loaded
object**. Before loading a row from the database, check the map: if that id is already loaded, return the
existing object; otherwise load it, store it in the map, and return it. Each row becomes exactly **one**
object for the duration.

This does two things. It **avoids redundant loads** — asking for user 42 five times hits the database
once. And it **guarantees consistency** — every part of the code that references user 42 gets the *same*
object, so a change made through one reference is visible through all of them, with no divergent copies
to reconcile.

## The Problem

Loading the same entity multiple times in one session causes duplication and inconsistency:

- **Redundant queries** — different parts of a request each load user 42, issuing the same query
  repeatedly.
- **Duplicate objects** — those loads create *separate* in-memory objects for the same row.
- **Inconsistent state** — code changes one copy of user 42 and another copy still shows the old value;
  which one is "the truth"?
- **Wasteful & confusing** — memory holds multiple copies, and equality/identity checks (`===`) surprise
  you because two "same" users aren't the same object.

## Structure

Key Components:

- **Identity Map** — a map from (type, id) to the loaded object, scoped to a session/unit of work.
- **Session / Unit of Work** — the boundary the map lives within; a new session starts a fresh map.
- **Load path** — check the map first; on a miss, load from the database and register the object.
- **Registration** — every loaded/created object is put in the map keyed by its identity.

```
Session ──get(id)──► [ Identity Map { id → object } ]
                          │ hit → return the SAME object
                          │ miss
                          ▼
                     Database ──load once──► register in map ──► object
```

## When to Use

- One session/request loads the same entities multiple times.
- You need reference consistency: everyone working with entity X shares one object.
- You want to cut redundant queries within a transaction.
- You're building or using a Data Mapper / ORM session (it usually needs this).

## Advantages and Disadvantages

### Advantages
- **One object per identity** — consistent state; a change is seen everywhere in the session.
- **Fewer queries** — repeated loads of the same row hit the database once.
- **Correct identity semantics** — reference equality works for "the same entity."

### Disadvantages
- **Scope management** — the map must be per-session and cleared at its end, or it leaks and serves stale
  data across requests.
- **Staleness within scope** — while the object is held, the underlying row may change; the map serves
  the loaded version.
- **Memory** — holding every loaded entity for the session's duration costs memory for large working
  sets.

## Common Mistakes

- **A global/long-lived map** — an identity map that outlives the session serves stale objects to later
  requests and leaks memory; scope it to the unit of work.
- **Forgetting to register on create** — new objects not put in the map get re-loaded as duplicates;
  register both loaded *and* newly-created entities.
- **Sharing the map across concurrent requests** — one request mutating a shared object corrupts another;
  each request/session needs its own map.
- **Treating it as a real cache** — it's a per-session consistency mechanism, not a cross-request cache
  (that's Cache-Aside); don't rely on it for performance across requests.

## Key Takeaways

- Keep a per-session map of loaded objects so each row is one object for that session.
- It gives reference consistency (a change is seen everywhere) and cuts redundant queries.
- Scope it tightly to the unit of work and clear it at the boundary, or it leaks and goes stale.
- ORMs implement it inside their session/context; you rarely build it by hand.

## Implementations

### JavaScript

**❌ Naive**

```js
// Each call loads a fresh copy — duplicate objects, repeated queries, inconsistent edits.
async function loadUser(id) {
  const row = await db.query("SELECT * FROM users WHERE id=?", [id]);
  return new User(row); // user 42 loaded here !== user 42 loaded elsewhere
}
```

**✅ Idiomatic**

```js
// A per-session identity map: load once, return the same object thereafter.
class Session {
  constructor() { this.identityMap = new Map(); } // scoped to this session/request
  async user(id) {
    const key = `User:${id}`;
    if (this.identityMap.has(key)) return this.identityMap.get(key); // same object
    const row = await db.query("SELECT * FROM users WHERE id=?", [id]);
    const user = new User(row);
    this.identityMap.set(key, user);               // register
    return user;
  }
}
// within one Session: (await s.user(42)) === (await s.user(42))  → true
```

**🧠 Tradeoff** — A `Map` keyed by type+id inside a `Session` gives you one object per identity and a
single query per row for that request. Reference equality now works and edits stay consistent. The
critical discipline is lifecycle: a `Session` per request, discarded at the end — a shared/global map
would leak and serve stale objects. In practice an ORM's session provides this for you.

### Node.js

**❌ Naive**

```js
// A request loads the same order in several places, each a separate query and object.
const a = await Order.find(id); // query 1
const b = await Order.find(id); // query 2 — a and b are different objects
```

**✅ Idiomatic**

```js
// Tie the identity map to the request via AsyncLocalStorage (the request is the session).
const { AsyncLocalStorage } = require("node:async_hooks");
const session = new AsyncLocalStorage();

async function withSession(fn) { return session.run({ map: new Map() }, fn); } // per request

async function loadOrder(id) {
  const { map } = session.getStore();
  const key = `Order:${id}`;
  if (map.has(key)) return map.get(key);           // hit → same object
  const order = await Order.find(id);
  map.set(key, order);
  return order;
}
// wrap each request in withSession(...) → the map lives exactly one request
```

**🧠 Tradeoff** — Binding the identity map to `AsyncLocalStorage` makes "the request" the session
boundary, so any code in the request's async chain shares one object per id without threading a session
around — and the map is naturally discarded when the request ends. It's the same request-scope mechanism
as the Provider pattern. ORMs (Prisma, MikroORM's identity map) do this internally; hand-rolling it is
for when you're not using one.

### Python

**❌ Naive**

```python
# Repeated loads create distinct objects; edits to one don't reflect in another.
a = load_user(id)   # query + new object
b = load_user(id)   # query + another new object; a is not b
```

**✅ Idiomatic**

```python
# SQLAlchemy's Session has a built-in identity map — same PK → same instance.
user_a = session.get(User, 42)   # loads and registers
user_b = session.get(User, 42)   # returns the SAME object from the identity map
assert user_a is user_b          # True — one object per identity

# a hand-rolled version for a custom mapper:
class UnitOfWork:
    def __init__(self): self._identity = {}
    def get(self, cls, id):
        key = (cls, id)
        if key not in self._identity:
            self._identity[key] = load(cls, id)   # load once, register
        return self._identity[key]
```

**🧠 Tradeoff** — SQLAlchemy's `Session` implements the identity map natively: `session.get(User, 42)`
twice returns the *same* instance, guaranteeing consistency and one query. You rarely build it yourself in
Python because the ORM handles it; the hand-rolled `UnitOfWork` shows the mechanism. As always, the
`Session`'s lifetime is the map's scope — one per request/transaction, closed at the end.

### Elixir

**❌ Naive**

```elixir
# Repeated Repo.get calls each hit the DB and return separate structs.
a = Repo.get(User, 42)   # query
b = Repo.get(User, 42)   # another query; a and b are distinct copies
```

**✅ Idiomatic**

```elixir
# Ecto has no session-level identity map (immutability changes the picture); use an
# explicit request-scoped cache when you want load-once semantics.
defmodule Loader do
  # a per-request map threaded through, or held in a process/Agent for the request
  def get_user(cache, id) do
    case Map.fetch(cache, {User, id}) do
      {:ok, user} -> {user, cache}                       # hit → same value
      :error ->
        user = Repo.get(User, id)
        {user, Map.put(cache, {User, id}, user)}          # load once, register
    end
  end
end
```

**🧠 Tradeoff** — Elixir is different by design: Ecto deliberately has *no* identity map, because immutable
structs make "one shared mutable object per id" meaningless — there's nothing to keep consistent, since you
can't mutate a struct in place. The value of the pattern here is only *avoiding repeated queries*, which
you get with an explicit request-scoped cache (a threaded map or an Agent). The consistency half of the
pattern is moot on the BEAM; the query-dedup half you add when it pays.

### Go

**❌ Naive**

```go
// Every call queries and allocates a new object for the same row.
a, _ := repo.Find(id) // query
b, _ := repo.Find(id) // another query; different pointers, divergent edits
```

**✅ Idiomatic**

```go
// A per-request identity map keyed by id; return the same pointer on repeat loads.
type Session struct {
    repo  UserRepo
    ident map[int]*User // scoped to this session/request
}

func (s *Session) User(id int) (*User, error) {
    if u, ok := s.ident[id]; ok {
        return u, nil // hit → same pointer
    }
    u, err := s.repo.Find(id)
    if err != nil {
        return nil, err
    }
    s.ident[id] = u // load once, register
    return u, nil
}
// new Session per request; discard at the end
```

**🧠 Tradeoff** — A `map[int]*User` on a per-request `Session` gives Go one pointer per id, so edits
through any reference are consistent and repeated loads hit the DB once. Go has no ORM session doing this
by default (GORM has limited support), so it's an explicit, hand-rolled boundary — which fits Go's taste
for visible lifecycles. The rule is the same everywhere: one `Session` per request, never shared across
goroutines/requests.

## Applications

- **ORM sessions** — Hibernate, SQLAlchemy, and Entity Framework maintain an identity map per
  session/context (backend).
- **Request-scoped loading** — deduplicating repeated entity loads within one web request (backend).
- **Object graph loading** — loading a graph where the same entity is referenced from many places, kept as
  one object (backend).
- **GraphQL dataloaders** — batching and de-duplicating loads per request is a close cousin (backend).
- **Consistency within a transaction** — ensuring all references to an entity in a unit of work see the
  same state (backend).

## Related Patterns

- **Data Mapper** — a mapper uses an identity map so a loaded row maps to one object; they're almost always
  paired inside an ORM.
- **Unit of Work** — the identity map's natural scope; the unit of work owns the session that holds the map.
- **Cache-Aside** — superficially similar (check-before-load) but different in purpose: identity map is
  per-session consistency, cache-aside is cross-request performance.
