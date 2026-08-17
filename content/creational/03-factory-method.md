---
id: factory-method
category: creational
sequence: 3
title: Factory Method
also_known_as: [Virtual Constructor]
gof: true
intent: "Define an interface for creating an object, but let the caller decide which concrete type to make."
frequency: high
difficulty: intermediate
tags: [creational, object-creation, polymorphism, open-closed, decoupling]
related: [abstract-factory, strategy, singleton]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Give code one way to ask for an object without hard-coding which concrete class it gets.
The decision of *what* to build moves behind a single creation point, so adding a new type
doesn't mean editing every place that constructs one.

## The Problem

You build cache backends. Everywhere you need one, you write a `switch` on a string and
`new` the right class. Add a Redis backend and you must hunt down every switch and edit it —
each one is a place to forget, and each one couples the caller to concrete classes.

```
function makeCache(kind) {
  switch (kind) {
    case "memory": return new InMemoryCache();
    case "disk":   return new DiskCache();
    // add "redis" here… and in the other three switches too
  }
}
```

That switch violates the Open/Closed Principle. A factory method centralizes creation so new
types register in one place.

## Structure

Key Components:

- **Product** — the interface the created objects share (`get`/`set`).
- **Concrete Products** — the actual types (`InMemoryCache`, `DiskCache`).
- **Factory** — the single function/method that maps a request to a concrete product.

## When to Use

- A class can't know ahead of time which concrete type it must create.
- You want to centralize and localize which implementation is chosen.
- You're repeating the same construction `switch` in several places.
- You want to add new product types without editing the callers.

## Advantages and Disadvantages

### Advantages
- Callers depend on the product interface, not concrete classes.
- New products register in one place — Open/Closed in practice.
- Construction logic (defaults, wiring) lives in one spot.

### Disadvantages
- Another layer of indirection between "I want one" and the class.
- A registry-based factory can hide which type you actually get.
- Overkill when there's a single product type that never varies.

## Common Mistakes

- **Leaving the switch everywhere** — if the `switch` is copied across the codebase, you
  haven't centralized anything; move it into one factory.
- **A factory that returns concrete types** — return the shared interface, or callers stay
  coupled to specifics.
- **Building a giant switch that breaks OCP** — prefer a registry/map so new types add an
  entry, not a new `case`.

## Key Takeaways

- Factory Method decouples "use an object" from "decide its class."
- The goal is one place that knows the concrete types; everyone else knows the interface.
- A lookup table beats a growing `switch` for extensibility.
- In languages with first-class functions, the "factory" is often just a map of constructors.

## Implementations

A factory that builds a cache backend by name.

### JavaScript

**❌ Naive**

```js
// The construction switch, copied wherever a cache is needed.
function makeCache(kind) {
  if (kind === "memory") return new InMemoryCache();
  else if (kind === "disk") return new DiskCache();
  // adding "redis" means editing this — and every other copy of it
  throw new Error(`Unknown cache: ${kind}`);
}
```

**✅ Idiomatic**

```js
class InMemoryCache { get(k) { /* … */ } set(k, v) { /* … */ } }
class DiskCache     { get(k) { /* … */ } set(k, v) { /* … */ } }

// A registry maps a name to a constructor. New types add one entry.
const registry = {
  memory: InMemoryCache,
  disk: DiskCache,
};

function createCache(kind) {
  const Ctor = registry[kind];
  if (!Ctor) throw new Error(`Unknown cache: ${kind}`);
  return new Ctor();
}

// Register a new backend without touching createCache:
registry.redis = class RedisCache { get(k) {} set(k, v) {} };
const cache = createCache("redis");
```

**🧠 Tradeoff** — A registry object turns "add a case" into "add a key", so the factory itself
never changes as products grow. The cost is a lookup that can fail at runtime rather than a
`switch` the compiler could (in a typed language) check for exhaustiveness.

### Node.js

**❌ Naive**

```js
// The channel switch, copied into every place that sends a notification.
function notify(channel, user, msg) {
  if (channel === "email") return sendEmail(user.email, msg);
  else if (channel === "sms") return sendSms(user.phone, msg);
  // adding "push" means editing this — and every other copy
  throw new Error(`Unknown channel: ${channel}`);
}
```

**✅ Idiomatic (backend)**

```js
// A registry maps a channel name to its sender. New channels add one entry.
const channels = {
  email: (user, msg) => sendEmail(user.email, msg),
  sms: (user, msg) => sendSms(user.phone, msg),
};

function notifier(channel) {
  const send = channels[channel] ?? channels[process.env.DEFAULT_CHANNEL];
  if (!send) throw new Error(`Unknown channel: ${channel}`);
  return send;
}

// Register a new channel without touching notifier():
channels.push = (user, msg) => sendPush(user.deviceToken, msg);
notifier("push")(user, "your order shipped");
```

**🧠 Tradeoff** — Keying senders in an object turns "add a channel" into "add an entry", and the
registry can be populated from config or plugins — even lazily with a dynamic `import()` for a
driver you only load when it's selected. The price is the registry's: an unknown key fails at
runtime, not at compile time.

### Python

**❌ Naive**

```python
def make_cache(kind):
    if kind == "memory":
        return InMemoryCache()
    elif kind == "disk":
        return DiskCache()
    raise ValueError(f"Unknown cache: {kind}")
```

**✅ Idiomatic**

```python
class InMemoryCache:
    def get(self, k): ...
    def set(self, k, v): ...

class DiskCache:
    def get(self, k): ...
    def set(self, k, v): ...

# Classes are first-class objects, so the registry maps names to classes.
_registry: dict[str, type] = {
    "memory": InMemoryCache,
    "disk": DiskCache,
}

def create_cache(kind: str):
    try:
        return _registry[kind]()
    except KeyError:
        raise ValueError(f"Unknown cache: {kind}") from None

# Register without editing the factory:
def register(name: str, cls: type) -> None:
    _registry[name] = cls
```

**🧠 Tradeoff** — In Python classes are values, so the registry holds the classes themselves and
`create_cache` stays a one-liner. A decorator (`@register("redis")`) can make backends
self-register at import. The GoF class hierarchy of creators is rarely needed here.

### Elixir

**❌ Naive**

```elixir
defmodule CacheFactory do
  def make(:memory), do: InMemoryCache.new()
  def make(:disk), do: DiskCache.new()
  def make(kind), do: raise("Unknown cache: #{kind}")
end
```

**✅ Idiomatic**

```elixir
# Each backend is a module implementing a shared behaviour.
defmodule Cache do
  @callback new() :: term()
  @callback get(cache :: term(), key :: term()) :: term()
end

defmodule InMemoryCache do
  @behaviour Cache
  @impl true
  def new, do: %{}
  @impl true
  def get(cache, key), do: Map.get(cache, key)
end

defmodule CacheFactory do
  # The registry is a plain map from name to module.
  @registry %{memory: InMemoryCache, disk: DiskCache}

  def create(kind) do
    case Map.fetch(@registry, kind) do
      {:ok, mod} -> mod.new()
      :error -> raise "Unknown cache: #{kind}"
    end
  end
end
```

**🧠 Tradeoff** — Elixir's "product" is a module implementing a behaviour, and the factory maps
an atom to that module. Because modules are compile-time constants, the registry is a module
attribute — fast and fixed. For runtime-extensible registries, hold the map in a process or
application config instead of a `@registry` attribute.

### Go

**❌ Naive**

```go
func MakeCache(kind string) (Cache, error) {
	switch kind {
	case "memory":
		return &InMemoryCache{}, nil
	case "disk":
		return &DiskCache{}, nil
	default:
		return nil, fmt.Errorf("unknown cache: %s", kind)
	}
}
```

**✅ Idiomatic**

```go
package cache

import "fmt"

type Cache interface {
	Get(key string) string
	Set(key, value string)
}

// The registry maps a name to a constructor function.
var registry = map[string]func() Cache{}

func Register(name string, ctor func() Cache) { registry[name] = ctor }

func Create(kind string) (Cache, error) {
	ctor, ok := registry[kind]
	if !ok {
		return nil, fmt.Errorf("unknown cache: %s", kind)
	}
	return ctor(), nil
}

// A backend registers itself in its own file's init():
func init() {
	Register("memory", func() Cache { return &InMemoryCache{} })
}
```

**🧠 Tradeoff** — A `map[string]func() Cache` lets each backend self-register in `init()`, so
adding one is a new file, not an edit to `Create`. You trade the compiler's exhaustiveness
check on a `switch` for runtime lookup, but gain open extensibility across packages.

### CSharp

**❌ Naive**

```csharp
// The construction switch, copied wherever a cache is needed.
static ICache MakeCache(string kind) => kind switch
{
    "memory" => new InMemoryCache(),
    "disk" => new DiskCache(),
    // adding "redis" means editing this — and every other copy of it
    _ => throw new ArgumentException($"Unknown cache: {kind}"),
};
```

**✅ Idiomatic**

```csharp
// Register a backend without touching Create — even from another assembly.
CacheFactory.Register("memory", () => new InMemoryCache());
CacheFactory.Register("disk", () => new DiskCache());

var cache = CacheFactory.Create("memory");
cache.Set("user:1", "cached-value");
Console.WriteLine(cache.Get("user:1")); // cached-value

public interface ICache
{
    string? Get(string key);
    void Set(string key, string value);
}

public sealed class InMemoryCache : ICache
{
    private readonly Dictionary<string, string> _data = new();
    public string? Get(string key) => _data.GetValueOrDefault(key);
    public void Set(string key, string value) => _data[key] = value;
}

public sealed class DiskCache : ICache
{
    public string? Get(string key) => null; // read-through elided
    public void Set(string key, string value) { /* write to disk */ }
}

public static class CacheFactory
{
    // The registry maps a name to a constructor delegate.
    private static readonly Dictionary<string, Func<ICache>> Registry = new();

    public static void Register(string name, Func<ICache> ctor) => Registry[name] = ctor;

    public static ICache Create(string kind) =>
        Registry.TryGetValue(kind, out var ctor)
            ? ctor()
            : throw new ArgumentException($"Unknown cache: {kind}");
}
```

**🧠 Tradeoff** — the registry holds `Func<ICache>` delegates, so there's no GoF hierarchy of
creator classes — a constructor reference is enough. As everywhere, the registry trades the
`switch` expression's compile-time exhaustiveness for runtime lookup and open registration.
And be honest about where this lands in real .NET: the factory often dissolves into the DI
container — keyed services (`GetRequiredKeyedService<ICache>("memory")`) are this exact
pattern, maintained by the framework instead of your static class.

### Rust

**❌ Naive**

```rust
// The construction match, copied wherever a cache is needed.
fn make_cache(kind: &str) -> Box<dyn Cache> {
    match kind {
        "memory" => Box::new(InMemoryCache::new()),
        "disk" => Box::new(DiskCache),
        // adding "redis" means editing this — and every other copy of it
        other => panic!("unknown cache: {other}"),
    }
}
```

**✅ Idiomatic**

```rust
use std::collections::HashMap;

trait Cache {
    fn get(&self, key: &str) -> Option<String>;
    fn set(&mut self, key: &str, value: &str);
}

struct InMemoryCache { data: HashMap<String, String> }
impl Cache for InMemoryCache {
    fn get(&self, key: &str) -> Option<String> { self.data.get(key).cloned() }
    fn set(&mut self, key: &str, value: &str) {
        self.data.insert(key.into(), value.into());
    }
}

struct DiskCache;
impl Cache for DiskCache {
    fn get(&self, _key: &str) -> Option<String> { None } // read-through elided
    fn set(&mut self, _key: &str, _value: &str) { /* write to disk */ }
}

// The registry maps a name to a constructor function.
struct CacheFactory {
    registry: HashMap<&'static str, fn() -> Box<dyn Cache>>,
}

impl CacheFactory {
    fn new() -> Self {
        let mut registry: HashMap<&'static str, fn() -> Box<dyn Cache>> = HashMap::new();
        registry.insert("memory", || Box::new(InMemoryCache { data: HashMap::new() }));
        registry.insert("disk", || Box::new(DiskCache));
        Self { registry }
    }

    fn create(&self, kind: &str) -> Result<Box<dyn Cache>, String> {
        self.registry
            .get(kind)
            .map(|ctor| ctor())
            .ok_or_else(|| format!("unknown cache: {kind}"))
    }
}

fn main() {
    let factory = CacheFactory::new();
    let mut cache = factory.create("memory").unwrap();
    cache.set("user:1", "cached-value");
    println!("{:?}", cache.get("user:1")); // Some("cached-value")
}
```

**🧠 Tradeoff** — when the set of backends is closed, idiomatic Rust skips all of this: an
`enum CacheKind` plus one exhaustive `match` gives you a factory the compiler checks — add a
variant and it lists every match to update. The string-keyed registry above buys *open*
registration (backends from config or other crates) at the price of runtime failure, so
`create` returns `Result` and the caller must face the miss. Plain `fn` pointers suffice for
constructors; switch to `Box<dyn Fn() -> Box<dyn Cache>>` when a constructor must capture
config.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// Stringly-typed construction, copied into every file that needs a cache.
fn makeCache(kind: []const u8) !Cache {
    if (std.mem.eql(u8, kind, "memory")) return .{ .memory = .{} };
    if (std.mem.eql(u8, kind, "disk")) return .{ .disk = .{} };
    return error.UnknownCache; // a typo'd name fails at runtime
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

const InMemoryCache = struct {
    entries: [16]Entry = undefined, // toy store: fixed slots, no allocator needed
    len: usize = 0,

    const Entry = struct { key: []const u8, value: []const u8 };

    fn set(self: *InMemoryCache, key: []const u8, value: []const u8) void {
        if (self.len == self.entries.len) return;
        self.entries[self.len] = .{ .key = key, .value = value };
        self.len += 1;
    }
    fn get(self: *InMemoryCache, key: []const u8) ?[]const u8 {
        for (self.entries[0..self.len]) |e| {
            if (std.mem.eql(u8, e.key, key)) return e.value;
        }
        return null;
    }
};

const DiskCache = struct {
    fn set(self: *DiskCache, key: []const u8, value: []const u8) void {
        _ = self; _ = key; _ = value; // write to disk elided
    }
    fn get(self: *DiskCache, key: []const u8) ?[]const u8 {
        _ = self; _ = key;
        return null;
    }
};

const Kind = enum { memory, disk };

// A closed set of backends: the tagged union IS the product type.
const Cache = union(Kind) {
    memory: InMemoryCache,
    disk: DiskCache,

    // The factory method: the ONE place that knows how each backend is made.
    fn create(kind: Kind) Cache {
        return switch (kind) {
            .memory => .{ .memory = .{} },
            .disk => .{ .disk = .{} },
        };
    }

    // `inline else` dispatches to each variant's methods — no vtable.
    fn set(self: *Cache, key: []const u8, value: []const u8) void {
        switch (self.*) {
            inline else => |*c| c.set(key, value),
        }
    }
    fn get(self: *Cache, key: []const u8) ?[]const u8 {
        return switch (self.*) {
            inline else => |*c| c.get(key),
        };
    }
};

pub fn main() void {
    var cache = Cache.create(.memory);
    cache.set("user:1", "cached-value");
    std.debug.print("{?s}\n", .{cache.get("user:1")}); // cached-value
}
```

**🧠 Tradeoff** — the tagged union is the honest Zig form for a closed set, and it inverts the
kata's moral: instead of a registry that keeps `create` closed to edits, adding a backend makes
the compiler flag every non-exhaustive `switch` — the Open/Closed loss *is* the safety win, and
`.redis` can't be a typo the way `"redis"` can. Dispatch through `inline else` is a compile-time
fan-out, no function pointers involved. When the set genuinely must stay open at runtime, Zig's
answer is the two-field vtable idiom (`*anyopaque` context + function pointers) that
`std.mem.Allocator` uses; when the backend is fixed per build, pass the type at comptime and the
factory disappears entirely.

### Java

**❌ Naive**

```java
// The construction switch, copied wherever a cache is needed.
static Cache makeCache(String kind) {
    return switch (kind) {
        case "memory" -> new InMemoryCache();
        case "disk" -> new DiskCache();
        // adding "redis" means editing this — and every other copy of it
        default -> throw new IllegalArgumentException("Unknown cache: " + kind);
    };
}
```

**✅ Idiomatic**

```java
import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;

interface Cache {
    String get(String key);
    void set(String key, String value);
}

class InMemoryCache implements Cache {
    private final Map<String, String> data = new HashMap<>();
    public String get(String key) { return data.get(key); }
    public void set(String key, String value) { data.put(key, value); }
}

class DiskCache implements Cache {
    public String get(String key) { return null; } // read-through elided
    public void set(String key, String value) { /* write to disk */ }
}

class CacheFactory {
    // The registry maps a name to a constructor reference.
    private static final Map<String, Supplier<Cache>> registry = new HashMap<>();

    static void register(String name, Supplier<Cache> ctor) { registry.put(name, ctor); }

    static Cache create(String kind) {
        var ctor = registry.get(kind);
        if (ctor == null) throw new IllegalArgumentException("Unknown cache: " + kind);
        return ctor.get();
    }
}

public class Demo {
    public static void main(String[] args) {
        // A constructor reference registers a backend without touching create().
        CacheFactory.register("memory", InMemoryCache::new);
        CacheFactory.register("disk", DiskCache::new);

        var cache = CacheFactory.create("memory");
        cache.set("user:1", "cached-value");
        System.out.println(cache.get("user:1")); // cached-value
    }
}
```

**🧠 Tradeoff** — nobody writes the GoF hierarchy of Creator subclasses in modern Java:
`Supplier<Cache>` is the whole factory-method contract, and a constructor reference
(`InMemoryCache::new`) is a whole concrete creator. The registry buys open registration —
backends can add themselves from anywhere, or be discovered via `ServiceLoader` — at the
usual price: an unknown name fails at runtime. When the set is closed, flip the deal back:
a sealed interface plus a pattern-matching `switch` makes the naive version the good
version, because the compiler now flags the missing case. And in framework Java the factory
often dissolves into the DI container — Spring's map-of-beans-by-name injection is exactly
this registry, maintained for you.

## Applications

Real-world uses of Factory Method (from the reference article):

- **Cache backends** — memory / disk / Redis chosen by config.
- **Delivery/partner selection** — pick a regional provider by location.
- **Document/exporter creation** — build the right serializer for a format.
- **Database drivers** — construct the driver named in a connection string.
- **UI element creation** — build the platform-appropriate widget.

**In modern systems:**

- **Low-code** — the `"type"` discriminator in each JSON node dispatched to the matching widget
  constructor. This is the engine's core dispatch: data names the type, the factory builds it.
- **Workflow engine** — a step's `"kind"` field selects which step class to instantiate.
- **Multi-agent** — a `"role"` field constructs the right agent (researcher, coder, reviewer) from
  one registry.

## Related Patterns

- **Abstract Factory** — makes *families* of related products; Factory Method makes one product
  type. Abstract Factory is often built from several factory methods.
- **Strategy** — Factory Method chooses which object to *create*; Strategy chooses which
  algorithm to *run*. They pair well: a factory constructs the strategy.
- **Singleton** — factories are frequently singletons.
