---
id: singleton
category: creational
sequence: 5
title: Singleton
also_known_as: []
gof: true
intent: "Ensure a class has exactly one instance and give the whole program one point of access to it."
frequency: high
difficulty: beginner
tags: [creational, single-instance, global-access, shared-state, lazy-init]
related: [factory-method, abstract-factory]
languages: [javascript, python, elixir, go]
---

## Intent

Guarantee that a thing exists exactly once — one config object, one connection pool, one cache
— and give everyone the same handle to it.

Singleton is the most used and most argued-about pattern. Used well it models something that is
genuinely single (the process's config, a shared pool). Used badly it's a global variable in a
nicer coat, and it makes code hard to test because the single instance leaks state between tests.
Reach for it when *there really is only one*, not just to avoid passing an argument.

## The Problem

You have a cache. Two parts of the app each construct their own, so they don't share entries —
now there are two caches pretending to be one, and a write in one is invisible to the other.

```
const a = new Cache();  // part A
const b = new Cache();  // part B — a different object, empty
a.set("k", 1);
b.get("k");             // undefined — they aren't the same cache
```

You want every caller to reach the *same* cache, created once, on first use.

## Structure

Key Components:

- **Singleton** — the class or module that controls its own single instance and hands it back.
- **Access point** — a static method, module, or getter that returns that one instance,
  creating it lazily the first time.

## When to Use

- Exactly one instance must coordinate access to a shared resource (pool, cache, config, logger).
- You need lazy, once-only initialization with a global access point.
- A plain module-level value would work but you want controlled construction.

Prefer passing the dependency in (dependency injection) when you can — it keeps code testable.
Use Singleton when a single shared instance is a real invariant, not a convenience.

## Advantages and Disadvantages

### Advantages
- One instance, guaranteed — no accidental duplicates of a shared resource.
- Lazy initialization: created on first use, not at import.
- A single, obvious access point.

### Disadvantages
- Global state in disguise — hidden dependencies and test pollution between cases.
- Hard to substitute a fake in tests unless you design a reset or injection seam.
- Can hide coupling: callers depend on the singleton without saying so in their signature.

## Common Mistakes

- **Using it as a global variable** — if the thing isn't genuinely single, you've just made
  state global and coupling invisible.
- **No test seam** — a singleton with no way to reset or replace it leaks state across tests.
- **Thread/async races on first init** — two callers can both see "not created yet" and build
  two. Guard the first construction.
- **Storing request-scoped data in it** — a singleton is process-wide; per-request state in it
  bleeds across requests.

## Key Takeaways

- Singleton = one instance + one access point + lazy creation.
- In module-based languages, a module often *is* a singleton — you may not need the ceremony.
- Its cost is testability; design a reset or prefer injection when you can.
- Ask "is this truly singular?" before reaching for it.

## Implementations

A `CacheManager` that the whole app shares.

### JavaScript

**❌ Naive**

```js
// A plain class — every `new` makes another cache. Nothing is shared.
class CacheManager {
  constructor() { this.store = new Map(); }
  set(k, v) { this.store.set(k, v); }
  get(k) { return this.store.get(k); }
}

const a = new CacheManager();
const b = new CacheManager();
a.set("token", "abc");
b.get("token");             // undefined — a and b are different objects
```

**✅ Idiomatic**

```js
// A module-scoped instance, created once, exported. The module system
// guarantees a single evaluation — this IS the singleton.
class CacheManager {
  #store = new Map();
  set(k, v) { this.#store.set(k, v); return this; }
  get(k) { return this.#store.get(k); }
}

export const cache = new CacheManager();

// Every importer gets the same `cache`:
import { cache } from "./cache.js";
cache.set("token", "abc");
cache.get("token");         // "abc" — shared everywhere
```

**🧠 Tradeoff** — In modern JS a module is evaluated once, so an exported instance is the
simplest correct singleton — no lazy-guard needed. Use a class with a static `getInstance()`
only if construction must be deferred past import or take arguments. Private fields (`#store`)
keep the internals from being poked at.

### Python

**❌ Naive**

```python
# A normal class — each call constructs a separate cache.
class CacheManager:
    def __init__(self):
        self.store = {}


a = CacheManager()
b = CacheManager()
a.store["token"] = "abc"
print(b.store.get("token"))   # None — different instances
```

**✅ Idiomatic**

```python
# A module is imported once, so a module-level instance is a singleton.
class CacheManager:
    def __init__(self) -> None:
        self._store: dict[str, object] = {}

    def set(self, key: str, value: object) -> None:
        self._store[key] = value

    def get(self, key: str) -> object | None:
        return self._store.get(key)


cache = CacheManager()   # created once at import

# In any module:  from cachemgr import cache
cache.set("token", "abc")
print(cache.get("token"))     # abc
```

**🧠 Tradeoff** — The Pythonic singleton is a module-level object; import machinery does the
"once" for you. The `__new__` override or a metaclass singleton exist but are rarely worth the
surprise — they break subclassing and confuse `isinstance` intuitions. If you need lazy
creation, wrap it in a function with `functools.lru_cache` or a module-level `_instance` guard.

### Elixir

**❌ Naive**

```elixir
# Spawning a new Agent each time gives you N independent caches, not one.
{:ok, a} = Agent.start_link(fn -> %{} end)
{:ok, b} = Agent.start_link(fn -> %{} end)
Agent.update(a, &Map.put(&1, "token", "abc"))
Agent.get(b, &Map.get(&1, "token"))   # nil — a and b are separate processes
```

**✅ Idiomatic**

```elixir
# A named process IS the singleton: one name, one instance, supervised.
defmodule CacheManager do
  use Agent

  def start_link(_opts \\ []) do
    Agent.start_link(fn -> %{} end, name: __MODULE__)
  end

  def set(key, value), do: Agent.update(__MODULE__, &Map.put(&1, key, value))
  def get(key), do: Agent.get(__MODULE__, &Map.get(&1, key))
end

# Started once in the supervision tree; every caller uses the module name.
CacheManager.set("token", "abc")
CacheManager.get("token")   # "abc"
```

**🧠 Tradeoff** — Elixir has no global mutable objects, so a singleton is a *named process*
(a `GenServer`/`Agent` registered under `__MODULE__`) started once by a supervisor. The "one
instance" guarantee comes from the name registry, and you get supervision and crash-recovery
for free — but state lives in a process you must start, not a value you can just import.

### Go

**❌ Naive**

```go
// NewCache returns a fresh cache each call — callers don't share one.
type Cache struct{ store map[string]string }

func NewCache() *Cache { return &Cache{store: map[string]string{}} }

func main() {
	a := NewCache()
	b := NewCache()
	a.store["token"] = "abc"
	_ = b.store["token"] // "" — a and b are different caches
}
```

**✅ Idiomatic**

```go
package cache

import "sync"

type manager struct {
	mu    sync.RWMutex
	store map[string]string
}

var (
	instance *manager
	once     sync.Once
)

// Instance returns the one shared cache, built lazily and safely.
func Instance() *manager {
	once.Do(func() {
		instance = &manager{store: make(map[string]string)}
	})
	return instance
}

func (m *manager) Set(k, v string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.store[k] = v
}

func (m *manager) Get(k string) string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.store[k]
}
```

**🧠 Tradeoff** — `sync.Once` is the idiomatic Go singleton: it guarantees the initializer runs
exactly once even under concurrent access, solving the double-init race that naive lazy code
has. The unexported type keeps callers going through `Instance()`. For a package-wide value with
no lazy requirement, a plain package-level variable initialized in `init()` is simpler.

## Applications

Real-world uses of Singleton (from the reference article):

- **Configuration** — one parsed config object read across the app.
- **Caching** — a single shared cache / memoization store.
- **Connection pools** — one DB or HTTP pool for the process.
- **Logging** — one logger sink with shared formatting and level.
- **Service registry / router** — a single URL router or service locator.

## Related Patterns

- **Factory Method / Abstract Factory** — a factory is often itself a singleton, and factories
  sometimes return singletons.
- **Monostate** — an alternative where all instances share the same state via class-level data,
  instead of restricting to one instance.
