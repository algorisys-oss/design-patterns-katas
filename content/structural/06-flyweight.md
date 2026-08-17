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
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
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

*Targets modern JavaScript (ES2015+).*

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

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// Compiling the validator on every request — CPU and memory burned re-creating the same thing.
function validate(schema, payload) {
  const validator = ajv.compile(schema); // expensive, identical each call
  return validator(payload);
}
```

**✅ Idiomatic (backend)**

```js
// The compiled validator is intrinsic, shared state cached by a factory; the payload is extrinsic.
const cache = new Map();
function validatorFor(schema) {
  const key = JSON.stringify(schema);
  if (!cache.has(key)) cache.set(key, ajv.compile(schema)); // compiled once per schema
  return cache.get(key);
}

function validate(schema, payload) {
  return validatorFor(schema)(payload); // reuse the shared compiled validator
}
```

**🧠 Tradeoff** — One compiled validator per schema is shared across every request that uses it, so
the expensive compile happens once instead of per call — the same trick backs prepared-statement
caches and compiled-regex reuse. The shared object must stay immutable, and watch the cache key: an
unbounded map keyed by dynamic schemas is a memory leak, so bound it or key by a stable id.

### Python

*Targets Python 3.12.*

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

*Targets Elixir 1.18.*

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

*Targets Go 1.26.*

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

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// Every tree carries its own copy of the heavy type data.
var forest = new List<Tree>();
for (var i = 0; i < 1_000_000; i++)
    forest.Add(new Tree(i, 0, "Oak", "green", bigTexture)); // duplicated per tree

public sealed record Tree(int X, int Y, string Name, string Color, byte[] Texture);
```

**✅ Idiomatic**

```csharp
using System.Collections.Concurrent;

// One shared TreeType per (name, color); each tree keeps only its position.
var forest = new List<Tree>(capacity: 1_000_000);
for (var i = 0; i < 1_000_000; i++)
    forest.Add(new Tree(i, 0, TreeTypes.Get("Oak", "green")));

Console.WriteLine(forest[0].Type.Draw(forest[0].X, forest[0].Y)); // Oak at 0,0

// Records are immutable by default — safe to share.
public sealed record TreeType(string Name, string Color, byte[] Texture)
{
    public string Draw(int x, int y) => $"{Name} at {x},{y}"; // extrinsic x,y passed in
}

// Each tree is position + a reference to the shared type.
public readonly record struct Tree(int X, int Y, TreeType Type);

public static class TreeTypes
{
    private static readonly ConcurrentDictionary<string, TreeType> Cache = new();

    public static TreeType Get(string name, string color) =>
        Cache.GetOrAdd($"{name}:{color}", _ => new TreeType(name, color, LoadTexture(name)));
}
```

**🧠 Tradeoff** — `GetOrAdd` makes the factory thread-safe in one line, and a `record`
makes the flyweight immutable by default — `with` expressions copy instead of mutating,
so the shared-state bug is hard to even write. The runtime plays the same trick itself:
`string.Intern` is a flyweight factory for strings. Bound the cache if the key space is
open-ended, or it becomes a leak.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
struct Tree {
    x: u32,
    y: u32,
    name: String,
    color: String,
    texture: Vec<u8>, // duplicated per tree
}

fn main() {
    // a million clones of the same texture bytes
    let forest: Vec<Tree> = (0..1_000_000)
        .map(|i| Tree {
            x: i,
            y: 0,
            name: "Oak".to_string(),
            color: "green".to_string(),
            texture: big_texture.clone(),
        })
        .collect();
}
```

**✅ Idiomatic**

```rust
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

struct TreeType {
    name: String,
    color: String,
    texture: Vec<u8>, // heavy, shared
}

impl TreeType {
    fn draw(&self, x: u32, y: u32) -> String {
        format!("{} at {x},{y}", self.name) // extrinsic x,y passed in
    }
}

// The factory interns one &'static TreeType per (name, color) — leaked once, shared forever.
fn tree_type(name: &str, color: &str) -> &'static TreeType {
    static CACHE: OnceLock<Mutex<HashMap<String, &'static TreeType>>> = OnceLock::new();
    let mut cache = CACHE.get_or_init(|| Mutex::new(HashMap::new())).lock().unwrap();
    *cache.entry(format!("{name}:{color}")).or_insert_with(|| {
        Box::leak(Box::new(TreeType {
            name: name.to_string(),
            color: color.to_string(),
            texture: load_texture(name),
        }))
    })
}

struct Tree {
    x: u32,
    y: u32,
    kind: &'static TreeType, // just a pointer — the texture exists once
}

fn main() {
    let forest: Vec<Tree> = (0..1_000_000)
        .map(|i| Tree { x: i, y: 0, kind: tree_type("Oak", "green") })
        .collect();
    println!("{}", forest[0].kind.draw(0, 0)); // Oak at 0,0
}
```

**🧠 Tradeoff** — `Box::leak` is the honest form for flyweights that live as long as the
process: every tree holds a plain `&'static TreeType` — no reference counting, no
lifetime plumbing. And where other languages ask for discipline, Rust enforces the rule:
a shared `&T` cannot be mutated, so "corrupt every oak at once" doesn't compile. If the
flyweights must ever be dropped, swap `&'static` for `Rc` (or `Arc` across threads) and
accept the count.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

const Tree = struct {
    x: i32,
    y: i32,
    name: []const u8,
    color: []const u8,
    texture: []const u8, // duplicated per tree
};

pub fn main() !void {
    const allocator = std.heap.page_allocator;
    const forest = try allocator.alloc(Tree, 1_000_000);
    for (forest, 0..) |*tree, i| {
        // a million copies of the same texture bytes
        tree.* = .{
            .x = @intCast(i),
            .y = 0,
            .name = "Oak",
            .color = "green",
            .texture = try loadTexture(allocator, "Oak"),
        };
    }
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

const TreeType = struct {
    name: []const u8,
    color: []const u8,
    texture: []const u8, // heavy, shared

    pub fn draw(self: *const TreeType, x: i32, y: i32) void {
        std.debug.print("{s} at {d},{d}\n", .{ self.name, x, y }); // extrinsic x,y passed in
    }
};

// Each tree is position + a pointer to the shared type.
const Tree = struct { x: i32, y: i32, kind: *const TreeType };

// The factory interns one TreeType per "name:color" key.
const TreeTypes = struct {
    allocator: std.mem.Allocator,
    cache: std.StringHashMap(*TreeType),

    pub fn init(allocator: std.mem.Allocator) TreeTypes {
        return .{ .allocator = allocator, .cache = std.StringHashMap(*TreeType).init(allocator) };
    }

    pub fn get(self: *TreeTypes, name: []const u8, color: []const u8) !*const TreeType {
        const key = try std.fmt.allocPrint(self.allocator, "{s}:{s}", .{ name, color });
        const entry = try self.cache.getOrPut(key);
        if (entry.found_existing) {
            self.allocator.free(key); // already interned — drop the duplicate key
        } else {
            const t = try self.allocator.create(TreeType);
            t.* = .{ .name = name, .color = color, .texture = try loadTexture(self.allocator, name) };
            entry.value_ptr.* = t;
        }
        return entry.value_ptr.*;
    }
};

pub fn main() !void {
    var types = TreeTypes.init(std.heap.page_allocator);

    const oak_a = try types.get("Oak", "green");
    const oak_b = try types.get("Oak", "green");
    std.debug.print("shared: {}\n", .{oak_a == oak_b}); // shared: true

    const tree = Tree{ .x = 0, .y = 0, .kind = oak_a };
    tree.kind.draw(tree.x, tree.y); // Oak at 0,0
}
```

**🧠 Tradeoff** — The explicit allocator is the point: Flyweight is a memory pattern, and
Zig makes you look at every allocation it saves. Sharing is `*const TreeType` — read-only
at the type level. The subtle part is ownership of the interned keys: a cache hit must
free its duplicate key, bookkeeping that GC languages hide. Back the factory with a
`std.heap.ArenaAllocator` and the whole cache — keys, structs, textures — frees in one
`deinit`.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// Every tree carries its own copy of the heavy type data.
record Tree(int x, int y, String name, String color, byte[] texture) {}

public class Naive {
    public static void main(String[] args) {
        var forest = new java.util.ArrayList<Tree>();
        for (int i = 0; i < 1_000_000; i++)
            forest.add(new Tree(i, 0, "Oak", "green", bigTexture)); // duplicated per tree
    }
}
```

**✅ Idiomatic**

```java
import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

// The flyweight — a record, immutable by construction, safe to share.
record TreeType(String name, String color, byte[] texture) {
    String draw(int x, int y) { return "%s at %d,%d".formatted(name, x, y); } // extrinsic x,y passed in
}

// Each tree is position + a reference to the shared type.
record Tree(int x, int y, TreeType type) {}

class TreeTypes {
    private static final Map<String, TreeType> CACHE = new ConcurrentHashMap<>();

    static TreeType get(String name, String color) {
        return CACHE.computeIfAbsent(name + ":" + color,
            key -> new TreeType(name, color, loadTexture(name)));
    }
}

public class Demo {
    public static void main(String[] args) {
        var forest = new ArrayList<Tree>(1_000_000);
        for (int i = 0; i < 1_000_000; i++)
            forest.add(new Tree(i, 0, TreeTypes.get("Oak", "green")));

        System.out.println(forest.get(0).type().draw(0, 0)); // Oak at 0,0
        System.out.println(forest.get(0).type() == forest.get(1).type()); // true — shared
    }
}
```

**🧠 Tradeoff** — the JDK runs this pattern under your feet: `Integer.valueOf` returns
cached instances for -128..127, and `String.intern()` is a flyweight factory for strings —
that's why `Integer.valueOf(100) == Integer.valueOf(100)` is true and `new Integer(100)`
was deprecated into removal. Here, `computeIfAbsent` on a `ConcurrentHashMap` is the whole
thread-safe factory, and a record makes the flyweight immutable so sharing is safe by
construction. One caveat records don't fix: the `byte[]` inside is still mutable — wrap it
or copy on the way out if callers can't be trusted. Bound the cache if the key space is
open-ended.

## Applications

Real-world uses of Flyweight (from the reference article):

- **Text editors** — one glyph object per (char, font) across a document.
- **Games** — shared sprite/texture/mesh across thousands of entities (trees, bullets, NPCs).
- **String interning** — one canonical instance per distinct string.
- **Connection/thread pooling** — reuse a small set of expensive objects.
- **Icon / image caches** — one decoded image shared across many UI nodes.

**In modern systems:**

- **Low-code** — one shared widget definition per `type` reused across thousands of rendered
  instances; only per-instance state (value, position) differs.
- **Multi-agent** — a tool schema or system prompt shared by reference across many agent instances
  instead of copied into each.
- **Workflow engine** — step definitions interned once and referenced by every running instance,
  not re-parsed per run.

## Related Patterns

- **Factory Method / Singleton** — the flyweight factory caches and returns shared instances.
- **Prototype** — both deal with many objects, but Prototype copies while Flyweight shares.
- **Composite** — flyweights are often the shared leaves of a large composite tree.
