---
id: prototype
category: creational
sequence: 4
title: Prototype
also_known_as: [Clone]
gof: true
intent: "Create new objects by cloning an existing instance instead of building one from scratch."
frequency: low
difficulty: intermediate
tags: [creational, cloning, copy, deep-copy, object-template]
related: [factory-method, abstract-factory]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Make new objects by copying a prototype, not by calling a constructor. When an object is
expensive to build or you want a ready-made template to tweak, cloning is faster and simpler
than reconstructing the whole thing.

The catch that dominates this pattern in every language is **shallow vs deep copy**: a copy that
shares nested references with its source isn't independent — mutating the copy corrupts the
original.

## The Problem

You have a fully configured object — a form with default fields, a game entity with stats — and
you need many similar ones. Rebuilding each from scratch repeats expensive setup. So you copy…
but a shallow copy shares the nested objects, and editing one clone silently changes the others.

```
const base = { name: "", features: { theme: "dark" } };
const a = { ...base };          // shallow copy
a.features.theme = "light";
base.features.theme;            // "light" — the shared nested object leaked
```

Prototype is about cloning *correctly* so each copy is independent.

## Structure

Key Components:

- **Prototype** — the object that knows how to copy itself (or that you copy).
- **clone()** — produces a new, independent object; deep where nested state must not be shared.
- **Client** — asks a prototype for a copy and customizes it.

## When to Use

- Constructing an object is costly and you have a ready template to copy.
- You need many objects that are variations on a base configuration.
- You want to snapshot an object's current state as a starting point.

## Advantages and Disadvantages

### Advantages
- Skips expensive re-construction; copy and tweak.
- A configured instance acts as a live template.
- Can produce new objects without depending on their concrete class.

### Disadvantages
- Deep-copying object graphs with cycles or shared resources is tricky.
- Shallow copies leak shared references — a subtle, common bug.
- Cloning objects that hold handles (sockets, files) needs care.

## Common Mistakes

- **Shallow-copying when you needed deep** — nested objects stay shared; the #1 Prototype bug.
- **Deep-copying things that shouldn't be** — copying a DB connection or file handle instead of
  sharing it.
- **Forgetting cycles** — a naive deep copy of a graph with a cycle loops forever.
- **Relying on `JSON.parse(JSON.stringify(x))`** — drops functions, `Date`, `undefined`, `Map`,
  and breaks on cycles.

## Key Takeaways

- Prototype = create by cloning, not constructing.
- The whole game is copy depth: share what's meant to be shared, copy what isn't.
- Each language has an idiomatic deep-copy tool — know its limits.
- Rare in modern code, but the deep-vs-shallow lesson is everywhere.

## Implementations

Cloning a configured object that has nested state.

### JavaScript

**❌ Naive**

```js
// Spread is a SHALLOW copy — nested objects are shared, not copied.
const base = { name: "player", stats: { hp: 100, mp: 50 } };

const clone = { ...base };
clone.stats.hp = 10;
base.stats.hp;          // 10 — the nested `stats` leaked into the original
```

**✅ Idiomatic**

```js
const base = { name: "player", stats: { hp: 100, mp: 50 }, skills: ["dash"] };

// structuredClone does a true deep copy (handles nested objects, arrays, Maps, cycles).
const clone = structuredClone(base);
clone.stats.hp = 10;
clone.skills.push("blink");

base.stats.hp;          // 100 — untouched
base.skills;            // ["dash"] — independent
```

**🧠 Tradeoff** — `structuredClone` (built into modern runtimes) deep-copies nested data and
even cycles, replacing the fragile `JSON.parse(JSON.stringify(x))` trick — but it throws on
functions and class instances. When you only need to *reset* a template, a shallow spread with
fresh nested literals is fine; reach for the deep copy exactly when nested state must be
independent.

### Node.js

**❌ Naive**

```js
// A shared default object reused across requests — mutations leak between them.
const defaultJob = { attempts: 0, options: { priority: "normal" } };

function enqueue(overrides) {
  const job = defaultJob;                            // same object every call
  job.options.priority = overrides.priority ?? job.options.priority;
  return job;                                        // one request's change bleeds into the next
}
```

**✅ Idiomatic (backend)**

```js
// structuredClone (Node 17+) gives each request an independent deep copy of the template.
const defaultJob = { attempts: 0, options: { priority: "normal", retries: 3 } };

function enqueue(overrides) {
  const job = structuredClone(defaultJob);           // request-scoped, isolated
  Object.assign(job.options, overrides);
  return job;
}

enqueue({ priority: "high" }).options.priority; // "high"
defaultJob.options.priority;                    // "normal" — template untouched
```

**🧠 Tradeoff** — Cloning a template per request is the fix for a classic Node bug: shared mutable
state leaking across requests. `structuredClone` deep-copies nested objects and even cycles, but
throws on functions and class instances — for objects with methods, give them a `clone()` method
or a copy constructor instead.

### Python

**❌ Naive**

```python
import copy

base = {"name": "player", "stats": {"hp": 100, "mp": 50}}

clone = copy.copy(base)      # SHALLOW — nested dict is shared
clone["stats"]["hp"] = 10
print(base["stats"]["hp"])   # 10 — leaked
```

**✅ Idiomatic**

```python
import copy

base = {"name": "player", "stats": {"hp": 100, "mp": 50}, "skills": ["dash"]}

clone = copy.deepcopy(base)  # true recursive copy, handles cycles
clone["stats"]["hp"] = 10
clone["skills"].append("blink")

print(base["stats"]["hp"])   # 100 — untouched
print(base["skills"])        # ['dash']
```

**🧠 Tradeoff** — `copy.deepcopy` recursively copies arbitrary object graphs and tracks already-
seen objects so cycles terminate. It's the right default for independence, but it's slower than a
shallow `copy.copy`, and a class can customize both via `__copy__`/`__deepcopy__` when copying a
resource handle needs special handling.

### Elixir

**❌ Naive**

```elixir
# In Elixir data is immutable — there is nothing to accidentally share-mutate.
base = %{name: "player", stats: %{hp: 100, mp: 50}}

# "Cloning" by rebinding does not copy; both names point at the same immutable term.
clone = base
# clone.stats.hp = 10   # not even possible — you can't mutate a map in place
```

**✅ Idiomatic**

```elixir
base = %{name: "player", stats: %{hp: 100, mp: 50}, skills: ["dash"]}

# A "clone with changes" is just a new term derived from the old one.
clone = put_in(base, [:stats, :hp], 10)
clone = update_in(clone, [:skills], &["blink" | &1])

base.stats.hp   # 100 — the original term is unchanged, always
clone.stats.hp  # 10
```

**🧠 Tradeoff** — Prototype barely exists as a *problem* in Elixir: values are immutable, so
there's no shared-mutation bug to guard against, and "deep copy" is meaningless — you can share
the original freely. The pattern collapses into ordinary functional update (`put_in`,
`update_in`, struct update `%{s | k: v}`), which returns a new term while leaving the source
intact.

### Go

**❌ Naive**

```go
// Struct assignment copies value fields but NOT what maps/slices/pointers point to.
type Stats struct{ HP, MP int }
type Player struct {
	Name   string
	Skills []string // slice header is copied; backing array is shared
}

orig := Player{Name: "player", Skills: []string{"dash"}}
clone := orig            // shallow: Skills shares the same backing array
clone.Skills[0] = "hack"
_ = orig.Skills[0]       // "hack" — leaked through the shared slice
```

**✅ Idiomatic**

```go
package player

type Player struct {
	Name   string
	Stats  Stats
	Skills []string
}

// Clone deep-copies the reference-typed fields explicitly.
func (p Player) Clone() Player {
	cp := p // copies value fields (Name, Stats)
	cp.Skills = make([]string, len(p.Skills))
	copy(cp.Skills, p.Skills) // independent backing array
	return cp
}
```

**🧠 Tradeoff** — Go has no built-in deep copy: value fields copy on assignment, but slices,
maps, and pointers copy only their headers, so you clone reference fields by hand in a `Clone`
method. That's explicit and fast, but easy to get wrong as the struct grows — add a field, and
you must remember to copy it. For deep graphs, a generics helper or serialization round-trip is
the fallback.

## Applications

Real-world uses of Prototype (from the reference article):

- **Form field templates** — clone a configured field and tweak per instance.
- **Game entities** — spawn many enemies from one configured prototype.
- **Document / config defaults** — copy a default template, then customize.
- **Editor objects** — duplicate a shape or component on the canvas.
- **Snapshots** — clone current state as a starting point for edits.

**In modern systems:**

- **Low-code** — a saved template node cloned to seed a new form section, then tweaked — no
  re-parsing the schema from scratch.
- **Multi-agent** — clone a configured agent as a starting point and adjust its prompt or tools per
  task, rather than rebuilding it.
- **Workflow engine** — duplicate a workflow definition as the base for a variant.

## Related Patterns

- **Factory Method / Abstract Factory** — create via a factory call; Prototype creates via
  copying an existing instance. A factory can *return* clones of a prototype.
- **Memento** — also captures object state, but to restore it later, not to spawn new objects.
