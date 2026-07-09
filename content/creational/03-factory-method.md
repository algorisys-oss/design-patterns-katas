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
languages: [javascript, node-js, python, elixir, go]
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

## Applications

Real-world uses of Factory Method (from the reference article):

- **Cache backends** — memory / disk / Redis chosen by config.
- **Delivery/partner selection** — pick a regional provider by location.
- **Document/exporter creation** — build the right serializer for a format.
- **Database drivers** — construct the driver named in a connection string.
- **UI element creation** — build the platform-appropriate widget.

## Related Patterns

- **Abstract Factory** — makes *families* of related products; Factory Method makes one product
  type. Abstract Factory is often built from several factory methods.
- **Strategy** — Factory Method chooses which object to *create*; Strategy chooses which
  algorithm to *run*. They pair well: a factory constructs the strategy.
- **Singleton** — factories are frequently singletons.
