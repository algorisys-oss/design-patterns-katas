---
id: immutability
category: functional
sequence: 5
title: Immutability
also_known_as: [Persistent Data Structures, Copy-on-Write, Value Semantics]
gof: false
intent: "Never modify data in place — produce a new value with the change instead — so state is predictable, safe to share across threads, and easy to compare, snapshot, and undo."
frequency: high
difficulty: beginner
tags: [functional, immutability, purity, concurrency-safety, predictability]
related: [lens, unidirectional-data-flow, memento]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Treat data as **read-only**. To "change" something, create a **new value** that incorporates the
change and leave the original untouched. `addItem(cart, item)` returns a *new* cart; the old cart is
still exactly what it was.

Once a value can't change out from under you, whole classes of bugs disappear: no spooky action at a
distance where one holder mutates data another is using, no data races because there's nothing to
race on, and trivial change detection (did the reference change?) because a new value means a new
identity. Predictability, sharing safety, and cheap snapshots all fall out of "don't mutate."

## The Problem

Shared mutable state is the root of a surprising number of bugs:

- **Spooky action at a distance** — you pass an object to a function that mutates it, and now your
  copy changed too, because it was the same object.
- **Data races** — two threads mutating the same structure corrupt it; you reach for locks, which
  bring their own problems.
- **Hard change detection** — to know if state changed you must deep-compare, because the same object
  reference might have been mutated in place.
- **No cheap history** — undo/redo, snapshots, and time-travel need past states, but in-place mutation
  overwrites them.

## Structure

Key Components:

- **Immutable value** — data that is never modified after creation.
- **Transformation** — an operation that takes a value and returns a *new* value with the change.
- **Structural sharing** — new versions reuse the unchanged parts of the old one, so copying is cheap
  (persistent data structures), rather than deep-cloning everything.
- **Identity = value change** — a changed reference means changed data; unchanged reference means
  unchanged data (cheap equality).

```
State v1 { value: 1 } ──update(fn)──► State v2 { value: 2 }
        (v1 is unchanged; v2 is a new value, sharing v1's untouched parts)
```

## When to Use

- State is shared across components, threads, or async tasks and must not surprise-mutate.
- You need cheap change detection (React re-renders, memoization, dirty checks).
- You want undo/redo, snapshots, or time-travel from past states.
- Concurrency correctness matters and you'd rather avoid locks.

## Advantages and Disadvantages

### Advantages
- **Predictable** — a value never changes after you receive it; no action at a distance.
- **Concurrency-safe** — nothing to race on; immutable data is safely shared without locks.
- **Cheap comparison & history** — reference equality detects change; old versions are free snapshots.

### Disadvantages
- **Allocation cost** — producing new values allocates; naive deep-copying is expensive (mitigated by
  structural sharing).
- **Verbosity** — "change" becomes "copy with change," which is wordier without good spread/update
  syntax or a library.
- **Not free in mutable languages** — languages that default to mutation require discipline or
  libraries to keep it immutable, and it's easy to slip.

## Common Mistakes

- **Shallow copy, deep mutation** — spreading the top level but then mutating a nested object still
  mutates the shared inner value; copy the path you change.
- **Mutating "just this once"** — one in-place mutation in an otherwise-immutable codebase breaks the
  guarantees everything else relies on.
- **Deep-cloning everything** — copying entire large structures on every change (instead of
  structural sharing) is slow; use persistent structures or libraries.
- **Assuming built-ins are immutable** — freezing the outer object (`Object.freeze`) is shallow;
  nested data can still change.

## Key Takeaways

- Don't mutate — return a new value with the change; the original stays intact.
- You gain predictability, lock-free sharing, cheap change detection, and free snapshots.
- Copy the *path* you change (structural sharing), not the whole structure, to keep it cheap.
- Some languages give it for free (Elixir); others need discipline or libraries.

## Implementations

### JavaScript

**❌ Naive**

```js
// In-place mutation: callers holding `cart` see it change unexpectedly.
function addItem(cart, item) {
  cart.items.push(item);        // mutates the caller's array
  cart.total += item.price;     // and their total
  return cart;
}
```

**✅ Idiomatic**

```js
// Return a new value; spread copies the changed path, sharing the rest.
function addItem(cart, item) {
  return {
    ...cart,
    items: [...cart.items, item],   // new array
    total: cart.total + item.price,
  };
}
const c2 = addItem(c1, item); // c1 is unchanged; c1 !== c2 → cheap change detection

// For deep/large state, Immer lets you "mutate" a draft that produces an immutable next state:
//   const next = produce(state, (draft) => { draft.user.cart.items.push(item); });
```

**🧠 Tradeoff** — Spreading to copy the changed path keeps `c1` intact and makes `c1 !== c2` a
one-reference change check — which is exactly what powers React's re-render and memoization. The cost
is verbosity and the shallow-copy trap (you must copy each nested level you change). Immer removes the
ceremony by letting you write mutations against a draft while producing a truly immutable result.

### Node.js

**❌ Naive**

```js
// Mutating a shared config/cache object that other request handlers also hold.
function applyOverrides(config, overrides) {
  Object.assign(config, overrides); // mutates the shared config for everyone
  return config;
}
```

**✅ Idiomatic**

```js
// Return a fresh merged object; the shared base stays pristine per request.
function applyOverrides(config, overrides) {
  return { ...config, ...overrides, headers: { ...config.headers, ...overrides.headers } };
}
// each request derives its own config from a shared, never-mutated base — no cross-request bleed.
```

**🧠 Tradeoff** — Deriving a new config per request instead of `Object.assign`-ing a shared one
prevents the classic Node bug where one request mutates state another is using. Note the nested spread
(`headers`) — shallow copying isn't enough when you change nested fields. For deeply nested shared
state, `immer` or `immutable.js` (structural sharing) keep it correct and cheap.

### Python

**❌ Naive**

```python
# Mutable default + in-place mutation: shared, aliased state bites hard.
def add_item(cart, item):
    cart["items"].append(item)   # mutates the caller's dict
    cart["total"] += item.price
    return cart
```

**✅ Idiomatic**

```python
from dataclasses import dataclass, replace

@dataclass(frozen=True)          # immutable: fields can't be reassigned
class Cart:
    items: tuple
    total: float

def add_item(cart: Cart, item) -> Cart:
    return replace(cart,          # returns a new Cart
                   items=cart.items + (item,),  # new tuple
                   total=cart.total + item.price)

# c2 = add_item(c1, item); c1 is unchanged
```

**🧠 Tradeoff** — `@dataclass(frozen=True)` plus `dataclasses.replace` gives Python real immutable
values and clean "copy with change," and immutable collections (`tuple`, `frozenset`, or the `pyrsistent`
library for structural sharing) complete it. It runs against Python's mutable-by-default grain — lists
and dicts tempt you back — so it's a discipline, most valuable for shared state and value objects.
Frozen dataclasses also become hashable, so they work as dict keys and in sets.

### Elixir

**❌ Naive**

```elixir
# There's no in-place mutation to misuse — but trying to "update" by rebinding
# and expecting the old binding to change is the misconception to unlearn.
cart = %{items: [], total: 0}
# cart.items = [item]   # not valid — data is immutable
```

**✅ Idiomatic**

```elixir
# Everything is immutable; "updates" return new values, sharing the unchanged parts.
def add_item(cart, item) do
  %{cart | items: [item | cart.items], total: cart.total + item.price} # new map
end

c2 = add_item(c1, item)   # c1 is unchanged, always
# deep updates: put_in/update_in navigate and return a new nested structure
# update_in(state.user.cart.items, &[item | &1])
```

**🧠 Tradeoff** — Immutability isn't a pattern in Elixir; it's the only option. Every value is
immutable, "updates" (`%{map | ...}`, `put_in`, `update_in`) return new structures with automatic
structural sharing, and this is *why* the BEAM's concurrency is safe — processes can't corrupt shared
data because there's no shared mutable data. You pay nothing extra for it; the only adjustment is
unlearning mutation. It's the reference implementation of this pattern.

### Go

**❌ Naive**

```go
// Slices and maps are reference-like: mutating them affects all holders.
func AddItem(cart *Cart, item Item) {
    cart.Items = append(cart.Items, item) // may mutate the caller's backing array
    cart.Total += item.Price
}
```

**✅ Idiomatic**

```go
// Return a new value; copy the slice so the original's backing array is untouched.
func AddItem(cart Cart, item Item) Cart { // value receiver → cart is a copy
    items := make([]Item, len(cart.Items), len(cart.Items)+1)
    copy(items, cart.Items)               // don't share the backing array
    cart.Items = append(items, item)
    cart.Total += item.Price
    return cart                            // new value; caller's cart unchanged
}
```

**🧠 Tradeoff** — Go structs are value types, so passing and returning by value gives copy semantics
for the struct itself — but slices and maps are reference-like, so you must explicitly `copy` them to
avoid sharing the backing array (the subtle bug the naive version hides). Go has no persistent data
structures in the standard library, so immutability is a discipline with real copy costs; it's used
selectively (value objects, config) rather than pervasively.

## Applications

- **State management** — Redux and friends require immutable updates so reference equality drives
  re-renders (frontend).
- **Concurrent programming** — immutable data is shared across threads/goroutines/processes without
  locks (backend).
- **Undo/redo & time-travel** — keeping past immutable states makes history trivial (frontend).
- **Value objects (DDD)** — money, dates, and coordinates modeled as immutable values you compare and
  replace, not mutate (backend).
- **Caching & memoization** — immutable keys/results are safe to cache because they can't change under
  the cache (backend & frontend).

## Related Patterns

- **Lens** — the composable tool for updating deeply nested *immutable* data without hand-writing the
  copy-the-path spread at every level.
- **Unidirectional Data Flow** — depends on immutable state so reducers return new state and change
  detection stays cheap.
- **Memento** — immutable snapshots are natural mementos; you keep past values for undo because they
  can't change.
