---
id: lens
category: functional
sequence: 6
title: Lens
also_known_as: [Functional Reference, Optic]
gof: false
intent: "Package a getter and an immutable setter for one focus into a composable value, so you can read and 'update' deeply nested immutable data without hand-writing the copy at every level."
frequency: low
difficulty: advanced
tags: [functional, immutability, nested-data, composition, optics]
related: [immutability, function-composition, provider]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

A **lens** bundles two functions that focus on one piece of a structure: a **getter** (`get(s) → a`)
and an **immutable setter** (`set(s, a) → s'` that returns a new whole with that piece replaced). The
pair is a first-class value you can pass around — and, crucially, **compose**: a lens onto `user`
composed with a lens onto `address` composed with a lens onto `zip` gives one lens onto
`user.address.zip`.

The point is updating deeply nested **immutable** data. Without lenses, "set the zip" means spreading
a copy at every level from the root down (`{...s, user: {...s.user, address: {...}}}`). A composed
lens does that path-copy for you, so nested immutable updates become a single, reusable, readable
operation.

## The Problem

Immutable updates to nested data are verbose and error-prone:

- **Spread pyramids** — changing one deep field requires copying every level above it:
  `{ ...s, a: { ...s.a, b: { ...s.a.b, c: newVal } } }` — tedious and easy to get wrong.
- **Miss a level, mutate by accident** — forget to copy one intermediate object and you mutate shared
  state instead of producing a new value.
- **No reuse** — the path-copy logic for `user.address.zip` is rewritten at every call site.
- **Reading and writing diverge** — the read path (`s.a.b.c`) and the write path (the spread pyramid)
  look nothing alike, so they drift.

## Structure

Key Components:

- **Lens** — a pair `{ get, set }` focused on one part `A` of a whole `S`.
- **Getter** — `get(s) → a`: extract the focused part.
- **Immutable setter** — `set(s, a) → s'`: return a *new* whole with the part replaced (never mutates).
- **over / modify** — apply a function to the focus: `over(lens, f, s) = set(s, f(get(s)))`.
- **Composition** — `compose(outer, inner)` yields a lens onto the nested focus, chaining the
  path-copy.

```
Lens<S, A> = { get(s) → a,  set(s, a) → s' }     (s' is a new copy)
compose( lensUser, compose(lensAddress, lensZip) )  ──►  Lens<State, Zip>
over(zipLens, up, state)  =  a new state with only the zip transformed
```

## When to Use

- You update deeply nested **immutable** structures and the spread pyramids are hurting.
- The same nested path is read and written in many places (reuse the lens).
- You want to pass "a focus into a structure" around as a value (parameterize by which field).
- You're already committed to immutability (lenses are pointless over mutable data).

## Advantages and Disadvantages

### Advantages
- **Composable focus** — build a deep lens from small ones; reuse it for get, set, and modify.
- **Clean nested updates** — one operation replaces the copy-at-every-level spread pyramid.
- **First-class** — a lens is a value: store it, pass it, parameterize behavior by which field.

### Disadvantages
- **Abstraction weight** — lenses are a real concept to learn; overkill for shallow data.
- **Library-dependent ergonomics** — without a lens library the boilerplate to build them can exceed
  what they save.
- **Debuggability** — heavily composed optics can be hard to follow and to trace when a value is wrong.

## Common Mistakes

- **Using lenses over mutable data** — lenses exist to make *immutable* updates ergonomic; over
  mutable data they add ceremony for nothing.
- **A setter that mutates** — the whole contract is that `set` returns a new structure; a setter that
  mutates `s` breaks immutability and every guarantee built on it.
- **Reaching for lenses on shallow data** — for one or two levels, a spread or a simple helper is
  clearer than the optics machinery.
- **Reinventing a buggy lens library** — hand-rolled composition is easy to get subtly wrong; use a
  vetted library for anything beyond simple cases.

## Key Takeaways

- A lens is a composable `{ get, set }` pair focused on one part of an immutable whole.
- Compose small lenses into a deep one; use it to get, set, and `over` (modify) nested data.
- It replaces spread pyramids for nested immutable updates and makes the focus reusable.
- Worth it for deep, frequently-updated immutable structures; overkill for shallow data.

## Implementations

### JavaScript

*Targets modern JavaScript (ES2015+).*

**❌ Naive**

```js
// Nested immutable update: copy every level from the root down — a spread pyramid.
function setZip(state, zip) {
  return {
    ...state,
    user: {
      ...state.user,
      address: { ...state.user.address, zip }, // miss a level → accidental mutation
    },
  };
}
```

**✅ Idiomatic**

```js
// A lens is { get, set }; compose focuses deeper; over modifies.
const lens = (get, set) => ({ get, set });
const prop = (k) => lens((s) => s[k], (s, v) => ({ ...s, [k]: v })); // lens onto one key
const compose = (o, i) =>
  lens((s) => i.get(o.get(s)), (s, v) => o.set(s, i.set(o.get(s), v))); // chain the path-copy
const over = (l, f, s) => l.set(s, f(l.get(s)));

const zipL = compose(prop("user"), compose(prop("address"), prop("zip")));
const s2 = zipL.set(state, "94016");        // deep immutable set, no pyramid
const s3 = over(zipL, (z) => z.trim(), state); // deep modify
```

**🧠 Tradeoff** — A tiny `lens`/`compose`/`over` kit turns the spread pyramid into a reusable `zipL`
you can `get`, `set`, and `over`. Libraries (Ramda's `lensPath`, Optics-ts, monocle-ts) provide typed,
richer optics (prisms, traversals). It's genuinely useful for deep, often-updated immutable state —
but for one or two levels the spread or `immer` is simpler, so reserve lenses for where the depth
earns them.

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// Updating a deep config field immutably by hand at every call site.
const next = {
  ...config,
  server: { ...config.server, tls: { ...config.server.tls, minVersion: "1.3" } },
};
```

**✅ Idiomatic**

```js
// Reuse a composed lens (or Ramda) for the deep path across the codebase.
const R = require("ramda");
const tlsMinVersion = R.lensPath(["server", "tls", "minVersion"]);

const next = R.set(tlsMinVersion, "1.3", config); // deep immutable set
const bumped = R.over(tlsMinVersion, (v) => v ?? "1.2", config); // deep modify
// the same `tlsMinVersion` lens is reused wherever that field is read or written.
```

**🧠 Tradeoff** — Ramda's `lensPath`/`set`/`over` give production-ready optics without hand-rolling
them: define the deep path once and reuse it for read, write, and modify. It keeps immutable config
updates honest and DRY. The dependency and the concept are the cost; for a codebase that rarely
touches deep nesting, a small helper or `structuredClone`-then-edit-a-draft (Immer) may be lighter.

### Python

*Targets Python 3.12.*

**❌ Naive**

```python
# Immutable deep update by hand — replace at each level.
def set_zip(state, zip):
    return replace(state,
        user=replace(state.user,
            address=replace(state.user.address, zip=zip)))  # verbose, repeated
```

**✅ Idiomatic**

```python
# A lens as a (get, set) pair; compose for depth. (Libraries: 'lenses', 'python-lenses'.)
from dataclasses import replace

def lens(get, set_):
    return (get, set_)

def attr(name):
    return lens(lambda s: getattr(s, name),
                lambda s, v: replace(s, **{name: v}))

def compose(outer, inner):
    og, os_ = outer; ig, is_ = inner
    return lens(lambda s: ig(og(s)),
                lambda s, v: os_(s, is_(og(s), v)))

zip_l = compose(attr("user"), compose(attr("address"), attr("zip")))
_, set_zip_l = zip_l
s2 = set_zip_l(state, "94016")   # deep immutable set
```

**🧠 Tradeoff** — Built on frozen dataclasses and `replace`, a small `lens`/`compose` gives Python
composable focuses, and the `lenses` library provides a full, ergonomic implementation. It's a
niche tool in Python — most code reaches for `replace` nesting or a helper — but for deep, immutable
domain models updated in many places, lenses remove real repetition. For shallow data it's overkill.

### Elixir

*Targets Elixir 1.18.*

**❌ Naive**

```elixir
# Manual nested update — but Elixir already ships path-based helpers.
%{state | user: %{state.user | address: %{state.user.address | zip: "94016"}}}
```

**✅ Idiomatic**

```elixir
# put_in / update_in / get_in ARE lens-like path optics, built into the language.
put_in(state.user.address.zip, "94016")          # deep immutable set
update_in(state.user.address.zip, &String.trim/1) # deep modify (over)
get_in(state, [:user, :address, :zip])            # deep get, dynamic path

# reusable "lens": capture a path as data and reuse it
zip_path = [Access.key(:user), Access.key(:address), Access.key(:zip)]
get_in(state, zip_path)
update_in(state, zip_path, &String.trim/1)
```

**🧠 Tradeoff** — Elixir builds the lens idea into the standard library: `get_in`/`put_in`/`update_in`
plus the `Access` behaviour are composable path optics over immutable data, and an `Access` path is a
reusable value — a lens by another name. You rarely need a lens *library* because the language covers
the common case natively. For richer optics (prisms, traversals) libraries exist, but the everyday
"focus and update nested immutable data" is first-class.

### Go

*Targets Go 1.26.*

**❌ Naive**

```go
// Deep immutable update by copying each level — verbose and easy to get wrong.
func SetZip(s State, zip string) State {
    u := s.User          // copy
    a := u.Address       // copy
    a.Zip = zip
    u.Address = a
    s.User = u
    return s
}
```

**✅ Idiomatic**

```go
// A lens as a getter/setter pair using generics; compose for depth.
type Lens[S, A any] struct {
    Get func(S) A
    Set func(S, A) S
}

func Compose[S, B, A any](o Lens[S, B], i Lens[B, A]) Lens[S, A] {
    return Lens[S, A]{
        Get: func(s S) A { return i.Get(o.Get(s)) },
        Set: func(s S, a A) S { return o.Set(s, i.Set(o.Get(s), a)) },
    }
}
// userL := Lens[State, User]{...}; addrL := Lens[User, Address]{...}; zipL := Lens[Address,string]{...}
// zip := Compose(userL, Compose(addrL, zipL)); s2 := zip.Set(state, "94016")
```

**🧠 Tradeoff** — Generics make a typed `Lens[S, A]` and `Compose` possible, but each leaf lens still
needs a hand-written getter/setter (Go has no field-access reflection sugar), so the boilerplate is
heavy. Idiomatic Go usually just copies structs by value at each level (the naive version, written
carefully) rather than building optics — value semantics make shallow copies cheap, and Go culture
favors explicitness over the abstraction. Lenses are a curiosity here more than a staple.

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// `with` copies one level, so a deep update nests a `with` per level.
var next = state with
{
    User = state.User with
    {
        Address = state.User.Address with { Zip = "94016" }
    }
};
```

**✅ Idiomatic**

```csharp
var state = new State(new User("Ann", new Address("SF", "94103")), "pro");

var userL = new Lens<State, User>(s => s.User, (s, u) => s with { User = u });
var addrL = new Lens<User, Address>(u => u.Address, (u, a) => u with { Address = a });
var zipL  = new Lens<Address, string>(a => a.Zip, (a, z) => a with { Zip = z });

var zip = userL.Then(addrL).Then(zipL);   // one lens onto state.User.Address.Zip
var s2 = zip.Set(state, "94016");         // deep immutable set, no pyramid
var s3 = zip.Over(state, z => z.Trim());  // deep modify

public sealed record Address(string City, string Zip);
public sealed record User(string Name, Address Address);
public sealed record State(User User, string Plan);

public sealed record Lens<S, A>(Func<S, A> Get, Func<S, A, S> Set)
{
    public S Over(S s, Func<A, A> f) => Set(s, f(Get(s)));
    public Lens<S, B> Then<B>(Lens<A, B> inner) =>
        new(s => inner.Get(Get(s)),
            (s, b) => Set(s, inner.Set(Get(s), b)));
}
```

**🧠 Tradeoff** — a lens in C# is just a record of two `Func`s, and `Then` chains the path-copy, so
a deep path becomes one reusable, type-checked value. But be honest about the bar: records already
give you `with`, so the "naive" nested version is what most C# teams write, and at two levels it's
perfectly clear. Each leaf lens is hand-written boilerplate (no field-reference sugar), so the
abstraction pays only when the same deep path is read and written across many call sites — otherwise
nested `with` wins.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// Struct update syntax (`..base`) is Rust's `with` — and it pyramids the same way.
fn set_zip(s: &State, zip: String) -> State {
    State {
        user: User {
            address: Address { zip, ..s.user.address.clone() },
            ..s.user.clone()
        },
        ..s.clone()
    }
}
```

**✅ Idiomatic**

```rust
#[derive(Clone)]
struct Address { city: String, zip: String }

#[derive(Clone)]
struct User { name: String, address: Address }

#[derive(Clone)]
struct State { user: User, plan: String }

// Clone once, then mutate the owned copy — the original can't be touched.
fn set_zip(s: &State, zip: &str) -> State {
    let mut next = s.clone();
    next.user.address.zip = zip.to_string();
    next
}

// let s2 = set_zip(&s1, "94016");
// println!("{} {}", s1.user.address.zip, s2.user.address.zip); // 94103 94016
```

**🧠 Tradeoff** — Rust's ownership dissolves most of the lens's job. Clone-then-mutate gives exactly
the guarantee a lens setter promises — a new value, the original untouched — because mutating an
owned copy *cannot* reach the caller's `s1`, and the write path reads like the read path. The naive
pyramid clones each level anyway, so it buys nothing over one `clone`. A real `Lens` type (get/set
function pairs) is writable but fights the borrow checker over references versus values for little
gain; lens crates earn their keep mainly in GUI data-binding (druid), where a focus must travel as a
value. Elsewhere, skip the abstraction.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// Rebuilding every level by hand, spread-style — unnecessary in Zig.
fn setZip(s: State, zip: []const u8) State {
    return .{
        .user = .{
            .name = s.user.name,
            .address = .{ .city = s.user.address.city, .zip = zip },
        },
        .plan = s.plan,
    };
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

const Address = struct { city: []const u8, zip: []const u8 };
const User = struct { name: []const u8, address: Address };
const State = struct { user: User, plan: []const u8 };

// Structs are values: the copy is one assignment; poke the copy and return it.
fn setZip(s: State, zip: []const u8) State {
    var next = s; // parameters are immutable; this copies every level
    next.user.address.zip = zip;
    return next;
}

pub fn main() void {
    const s1 = State{
        .user = .{ .name = "Ann", .address = .{ .city = "SF", .zip = "94103" } },
        .plan = "pro",
    };
    const s2 = setZip(s1, "94016");
    std.debug.print("{s} {s}\n", .{ s1.user.address.zip, s2.user.address.zip }); // 94103 94016
}
```

**🧠 Tradeoff** — Zig's value semantics dissolve the problem lenses solve: `var next = s` copies the
whole nested struct in one assignment, the write path looks exactly like the read path, and the
original is untouched because `next` is a genuinely separate value. There is no spread pyramid to
escape. You *could* build a reusable focus with comptime field-name paths and `@field`, but it would
be machinery in search of a problem — a lens abstraction isn't worth it in Zig. The one caveat: slice
and pointer fields (the strings here) are shared views, so the value copy is shallow for them — fine
while they're treated as read-only, `dupe` them explicitly if not.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// No `with` in Java — a deep update rebuilds every level by hand, listing every field.
static State setZip(State s, String zip) {
    return new State(
        new User(s.user().name(),
            new Address(s.user().address().city(), zip)),
        s.plan());
}
```

**✅ Idiomatic**

```java
import java.util.function.BiFunction;
import java.util.function.Function;
import java.util.function.UnaryOperator;

public class Demo {
    public static void main(String[] args) {
        var userL = new Lens<State, User>(State::user, (s, u) -> new State(u, s.plan()));
        var addrL = new Lens<User, Address>(User::address, (u, a) -> new User(u.name(), a));
        var zipL  = new Lens<Address, String>(Address::zip, (a, z) -> new Address(a.city(), z));

        var zip = userL.then(addrL).then(zipL);  // one lens onto state.user.address.zip
        var s1 = new State(new User("Ann", new Address("SF", "94103")), "pro");
        var s2 = zip.set(s1, "94016");           // deep immutable set, no pyramid
        var s3 = zip.over(s1, String::trim);     // deep modify
        System.out.println(s1.user().address().zip() + " " + s2.user().address().zip()); // 94103 94016
    }
}

record Address(String city, String zip) {}
record User(String name, Address address) {}
record State(User user, String plan) {}

record Lens<S, A>(Function<S, A> get, BiFunction<S, A, S> set) {
    S set(S s, A a) { return set.apply(s, a); }
    S over(S s, UnaryOperator<A> f) { return set.apply(s, f.apply(get.apply(s))); }
    <B> Lens<S, B> then(Lens<A, B> inner) {
        return new Lens<>(
            s -> inner.get().apply(get().apply(s)),
            (s, b) -> set().apply(s, inner.set().apply(get().apply(s), b)));
    }
}
```

**🧠 Tradeoff** — the `Lens` record is small and `then` chains the path-copy into one reusable,
type-checked value. But be honest about what it's built from: Java has no `with` expression, so every
leaf setter rebuilds its record by listing every field — `(u, a) -> new User(u.name(), a)` — which is
exactly the boilerplate the lens was supposed to remove, now relocated. That's why Java teams
overwhelmingly write the nested-rebuild helper (the naive version), name it `withZip`, and move on —
at two or three levels it's perfectly clear. A lens type earns its keep only when the same deep path
is read and written across many call sites, or when the focus must travel as a value. If derived
record creation (`with`) lands in a future Java, plain rebuilds win even more often.

## Applications

- **Deep immutable state** — updating nested Redux/store state without spread pyramids, via
  `lensPath`/optics (frontend).
- **Config management** — reading and updating deep configuration fields immutably and reusably
  (backend).
- **Domain models** — updating nested value objects (an order's shipping address's zip) in DDD
  (backend).
- **Form state** — focusing and updating nested form fields, with the lens parameterizing which field
  (frontend).
- **Data transformation** — targeting specific paths in nested JSON/records for transformation
  (backend).

## Related Patterns

- **Immutability** — lenses exist to make *immutable* nested updates ergonomic; they're meaningless
  over mutable data.
- **Function Composition** — a lens is composable by design; composing lenses is composition applied to
  focuses rather than to plain functions.
- **Provider / Context** — both are about reaching into a structure; a provider shares a value down a
  tree, a lens focuses on a value within a data structure.
