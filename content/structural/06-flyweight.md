---
id: flyweight
category: structural
sequence: 6
title: Flyweight
also_known_as: []
gof: true
intent: "Share common state across many objects to cut memory when you have huge numbers of them."
frequency: low
difficulty: advanced
tags: [structural, memory, sharing, intrinsic-extrinsic, performance]
related: [factory-method, singleton, prototype]
languages: [javascript, python, elixir, go]
---

## Intent

When you need a huge number of similar objects, stop duplicating the parts they have in common.
Flyweight splits each object's state into **intrinsic** (shared, unchanging — a glyph's font and
shape) and **extrinsic** (per-instance — its position on the page), and shares one intrinsic
object across all instances.

## The Problem

A document has a million characters. If each character object stores its font, size, and glyph
bitmap, that's a million copies of "Arial 12 bold 'a'". Memory explodes, though there are only a
few dozen distinct (char, font) combinations.

```
// a million of these, most identical in font/glyph:
{ char: "a", font: "Arial", size: 12, bitmap: <...>, x: 0, y: 0 }
{ char: "a", font: "Arial", size: 12, bitmap: <...>, x: 8, y: 0 }
```

Flyweight keeps one shared "Arial 12 'a'" glyph and passes only the position per character.

## Structure

Key Components:

- **Flyweight** — the shared object holding intrinsic (immutable, shareable) state.
- **Flyweight Factory** — returns a cached flyweight for a given intrinsic key, creating it once.
- **Extrinsic state** — passed in by the client at call time (position, color), never stored on
  the flyweight.

## When to Use

- You have a very large number of objects and memory is the constraint.
- Most of each object's state is intrinsic and shareable.
- The extrinsic (per-object) state can be passed in rather than stored.

## Advantages and Disadvantages

### Advantages
- Big memory savings when duplicates dominate.
- The shared flyweights are immutable, so sharing is safe.

### Disadvantages
- Complexity: you must separate intrinsic from extrinsic state carefully.
- Trades memory for CPU (recomputing/passing extrinsic state each call).
- Premature use is a classic over-optimization — profile first.

## Common Mistakes

- **Storing extrinsic state on the flyweight** — it must stay shared and immutable; per-instance
  data belongs to the caller.
- **Mutating a shared flyweight** — corrupts every object using it.
- **Applying it without a memory problem** — the complexity only pays off at scale.

## Key Takeaways

- Flyweight = share the intrinsic, pass in the extrinsic, cache via a factory.
- Flyweights must be immutable to share safely.
- It's a memory optimization — measure before reaching for it.

## Implementations

A glyph factory sharing tree/character objects across many positions.

### JavaScript

**❌ Naive**

```js
// Every tree stores its full type data — duplicated a million times.
class Tree {
  constructor(x, y, name, color, texture) {
    this.x = x; this.y = y;
    this.name = name; this.color = color; this.texture = texture; // heavy, shared data
  }
}
const forest = [];
for (let i = 0; i < 1_000_000; i++) forest.push(new Tree(i, 0, "Oak", "green", bigTexture));
```

**✅ Idiomatic**

```js
// Intrinsic (shared) state lives in a flyweight, cached by the factory.
class TreeType {
  constructor(name, color, texture) { this.name = name; this.color = color; this.texture = texture; }
  draw(x, y) { return `${this.name} at ${x},${y}`; } // extrinsic x,y passed in
}

const factory = new Map();
function treeType(name, color, texture) {
  const key = `${name}:${color}`;
  if (!factory.has(key)) factory.set(key, new TreeType(name, color, texture));
  return factory.get(key);   // one Oak object shared by all oaks
}

// Each tree stores only its position + a pointer to the shared type.
const forest = [];
for (let i = 0; i < 1_000_000; i++) {
  forest.push({ x: i, y: 0, type: treeType("Oak", "green", bigTexture) });
}
```

**🧠 Tradeoff** — One `TreeType` per (name,color) is shared by a million trees, so the heavy
texture exists once instead of a million times; each tree keeps only its `x,y` and a reference.
The flyweight must stay immutable — mutating the shared `TreeType` would change every tree at
once.

### Python

**❌ Naive**

```python
class Tree:
    def __init__(self, x, y, name, color, texture):
        self.x, self.y = x, y
        self.name, self.color, self.texture = name, color, texture  # duplicated

forest = [Tree(i, 0, "Oak", "green", big_texture) for i in range(1_000_000)]
```

**✅ Idiomatic**

```python
from functools import lru_cache

class TreeType:
    __slots__ = ("name", "color", "texture")  # cut per-object overhead too
    def __init__(self, name, color, texture):
        self.name, self.color, self.texture = name, color, texture
    def draw(self, x, y) -> str:
        return f"{self.name} at {x},{y}"

@lru_cache(maxsize=None)   # the factory: one TreeType per (name, color)
def tree_type(name: str, color: str) -> TreeType:
    return TreeType(name, color, load_texture(name))

forest = [(i, 0, tree_type("Oak", "green")) for i in range(1_000_000)]
```

**🧠 Tradeoff** — `lru_cache` *is* the flyweight factory — it returns the same `TreeType` for
equal arguments, memoizing construction. `__slots__` trims per-object memory further. The trees
become lightweight tuples of position plus a shared reference; profile to confirm the sharing
actually helps before adding the machinery.

### Elixir

**❌ Naive**

```elixir
# A list of a million maps, each repeating the type fields.
forest =
  for i <- 1..1_000_000 do
    %{x: i, y: 0, name: "Oak", color: "green", texture: big_texture}
  end
```

**✅ Idiomatic**

```elixir
# The BEAM shares immutable terms, and ETS gives an interned flyweight table.
defmodule TreeTypes do
  def start, do: :ets.new(:tree_types, [:set, :public, :named_table])

  def get(name, color) do
    key = {name, color}
    case :ets.lookup(:tree_types, key) do
      [{^key, type}] -> type
      [] ->
        type = %{name: name, color: color, texture: load_texture(name)}
        :ets.insert(:tree_types, {key, type})
        type
    end
  end
end

forest = for i <- 1..1_000_000, do: {i, 0, TreeTypes.get("Oak", "green")}
```

**🧠 Tradeoff** — Immutable data means a shared term is *already* stored once and referenced, so
the sharing bug (mutation) can't happen. An ETS table acts as the interning factory across
processes. The BEAM's structural sharing does a lot of Flyweight's job for free; you add the
explicit factory mainly to avoid rebuilding identical intrinsic terms.

### Go

**❌ Naive**

```go
type Tree struct {
	X, Y                 int
	Name, Color          string
	Texture              []byte // duplicated per tree
}

forest := make([]Tree, 0, 1_000_000)
for i := 0; i < 1_000_000; i++ {
	forest = append(forest, Tree{X: i, Name: "Oak", Color: "green", Texture: bigTexture})
}
```

**✅ Idiomatic**

```go
package forest

type TreeType struct {
	Name    string
	Color   string
	Texture []byte // heavy, shared
}

var cache = map[string]*TreeType{}

// TypeOf returns a shared *TreeType, created once per (name, color).
func TypeOf(name, color string) *TreeType {
	key := name + ":" + color
	if t, ok := cache[key]; ok {
		return t
	}
	t := &TreeType{Name: name, Color: color, Texture: loadTexture(name)}
	cache[key] = t
	return t
}

// Each tree stores position + a pointer to the shared type.
type Tree struct {
	X, Y int
	Type *TreeType
}
```

**🧠 Tradeoff** — A `map[string]*TreeType` caches one shared value per key; every `Tree` holds a
`*TreeType` pointer, so the texture bytes exist once. Sharing a pointer means the `TreeType` must
be treated as immutable. Guard the cache with a mutex if trees are created concurrently.

## Applications

Real-world uses of Flyweight (from the reference article):

- **Text editors** — one glyph object per (char, font) across a document.
- **Games** — shared sprite/texture/mesh across thousands of entities (trees, bullets, NPCs).
- **String interning** — one canonical instance per distinct string.
- **Connection/thread pooling** — reuse a small set of expensive objects.
- **Icon / image caches** — one decoded image shared across many UI nodes.

## Related Patterns

- **Factory Method / Singleton** — the flyweight factory caches and returns shared instances.
- **Prototype** — both deal with many objects, but Prototype copies while Flyweight shares.
- **Composite** — flyweights are often the shared leaves of a large composite tree.
