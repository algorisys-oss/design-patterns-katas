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
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
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

*Targets modern JavaScript (ES2015+).*

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

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// A new pool per request — connections balloon until the database refuses more.
export function handler(req, res) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }); // every request!
  return pool.query("SELECT 1").then((r) => res.json(r.rows));
}
```

**✅ Idiomatic (backend)**

```js
// db.js — the pool is created once when the module first loads, then shared.
import { Pool } from "pg";
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// handler.js — every importer reuses the same pool.
import { pool } from "./db.js";
export function handler(req, res) {
  return pool.query("SELECT 1").then((r) => res.json(r.rows));
}
```

**🧠 Tradeoff** — Node caches each module after first evaluation, so an exported instance is a
per-process singleton — the standard way to share a pool, config, or logger. The catch is
"per-process": under `cluster` or multiple workers each process gets its own pool, and serverless
cold starts reset it, so anything that must be single *across* processes (a lock, a counter) needs
external coordination like Redis.

### Python

*Targets Python 3.12.*

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

*Targets Elixir 1.18.*

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

*Targets Go 1.26.*

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

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// Anyone can `new` a cache — nothing enforces "one".
var a = new CacheManager();
var b = new CacheManager();
a.Set("token", "abc");
Console.WriteLine(b.Get("token") ?? "null"); // null — different instances

public class CacheManager
{
    private readonly Dictionary<string, string> _store = [];
    public void Set(string key, string value) => _store[key] = value;
    public string? Get(string key) => _store.GetValueOrDefault(key);
}
```

**✅ Idiomatic**

```csharp
using System.Collections.Concurrent;

// Every access point returns the same lazily-built instance.
CacheManager.Instance.Set("token", "abc");
Console.WriteLine(CacheManager.Instance.Get("token")); // abc — shared everywhere
Console.WriteLine(ReferenceEquals(CacheManager.Instance, CacheManager.Instance)); // True

public sealed class CacheManager
{
    // Lazy<T> is thread-safe by default: the factory runs exactly once,
    // even when two threads race to be first.
    private static readonly Lazy<CacheManager> Holder = new(() => new CacheManager());
    public static CacheManager Instance => Holder.Value;

    private readonly ConcurrentDictionary<string, string> _store = new();
    private CacheManager() { } // no `new` from outside

    public void Set(string key, string value) => _store[key] = value;
    public string? Get(string key) => _store.GetValueOrDefault(key);
}
```

**🧠 Tradeoff** — `Lazy<T>` gives thread-safe, once-only construction without hand-rolled
double-checked locking, and the private constructor makes "one instance" a compile-time
fact. But modern .NET rarely writes this class: `services.AddSingleton<CacheManager>()`
gets the same lifetime from the DI container with the dependency *injected* — visible in
constructors, swappable in tests. That's the smell to name: a `static` singleton is global
mutable state, so callers depend on it invisibly and tests share its leftovers. Keep the
static form for truly ambient facts, the way `TimeProvider.System` is.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
use std::collections::HashMap;

struct CacheManager {
    store: HashMap<String, String>,
}

impl CacheManager {
    // A constructor — so every caller builds their own cache.
    fn new() -> Self {
        Self { store: HashMap::new() }
    }
}

fn main() {
    let mut a = CacheManager::new();
    let b = CacheManager::new();
    a.store.insert("token".into(), "abc".into());
    println!("{:?}", b.store.get("token")); // None — different caches
}
```

**✅ Idiomatic**

```rust
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

// One process-wide cache, built on first touch. A static is visible to every
// thread, so Rust REQUIRES the Mutex — unsynchronized globals don't compile.
static CACHE: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn set(key: &str, value: &str) {
    CACHE.lock().unwrap().insert(key.to_string(), value.to_string());
}

fn get(key: &str) -> Option<String> {
    CACHE.lock().unwrap().get(key).cloned()
}

fn main() {
    set("token", "abc");
    println!("{:?}", get("token")); // Some("abc") — every caller sees the same cache
}
```

**🧠 Tradeoff** — Rust puts the singleton's cost in plain sight: a `static` is reachable
from every thread, so the compiler forces the state behind a `Mutex` (or something else
`Sync`) — the data race other languages let you write is a compile error here. `LazyLock`
handles lazy once-only init; reach for `OnceLock::get_or_init` when construction needs
runtime data. Read the ceremony as the lesson: global mutable state is exactly what
ownership exists to discourage. Passing `&cache` (or an `Arc`) down keeps the dependency
visible and tests isolated; keep statics for genuine process-wide facts like parsed config.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

const CacheManager = struct {
    store: std.StringHashMap([]const u8),

    fn init(allocator: std.mem.Allocator) CacheManager {
        return .{ .store = std.StringHashMap([]const u8).init(allocator) };
    }
};

pub fn main() !void {
    const allocator = std.heap.page_allocator;

    // Each init() builds a separate cache — nothing is shared.
    var a = CacheManager.init(allocator);
    var b = CacheManager.init(allocator);
    try a.store.put("token", "abc");
    std.debug.print("{?s}\n", .{b.store.get("token")}); // null — different caches
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

const CacheManager = struct {
    store: std.StringHashMap([]const u8),

    fn init(allocator: std.mem.Allocator) CacheManager {
        return .{ .store = std.StringHashMap([]const u8).init(allocator) };
    }
};

// File-scope state is one-per-process by construction. The only work left
// is guarding the first init, since it needs a runtime allocator.
var instance: ?CacheManager = null;
var init_mutex: std.Io.Mutex = .init;

// Blocking is a capability here, so the guard needs an `io` — the accessor
// names both things it uses, exactly as it names its allocator.
fn cache(io: std.Io, allocator: std.mem.Allocator) !*CacheManager {
    try init_mutex.lock(io);
    defer init_mutex.unlock(io);
    if (instance == null) instance = CacheManager.init(allocator);
    return &instance.?;
}

pub fn main() !void {
    const allocator = std.heap.page_allocator;
    var threaded: std.Io.Threaded = .init(allocator, .{});
    defer threaded.deinit();
    const io = threaded.io();

    const a = try cache(io, allocator);
    try a.store.put("token", "abc");

    const b = try cache(io, allocator);
    std.debug.print("{s}\n", .{b.store.get("token").?}); // abc — same cache
}
```

**🧠 Tradeoff** — Zig needs no pattern for "exists once": a file-scope `var` already is
one per process. The only real work is guarding first initialization — a mutex when init
needs runtime data (here, an allocator), or nothing at all when the initial value is known
at compile time (`var instance = CacheManager{ ... }` exists before `main` runs). Note the
mutex itself now takes a `std.Io`: blocking is a capability you pass in, the same move the
language already makes with allocators. What the
guard can't fix is the smell: file-scope mutable state is a global, so callers reach it
without declaring it and tests stomp each other's entries. Zig's own std shows the better
default — allocators are threaded through every call as parameters. Do that with your
cache unless it's truly ambient.

### Java

*Targets Java 25.*

**❌ Naive**

```java
import java.util.HashMap;
import java.util.Map;

// The classic lazy getter — two threads can both see null and build two caches.
class CacheManager {
    private static CacheManager instance;
    private final Map<String, String> store = new HashMap<>();

    private CacheManager() {}

    static CacheManager getInstance() {
        if (instance == null) {            // thread A and thread B both pass this check…
            instance = new CacheManager(); // …and each builds its own "singleton"
        }
        return instance;
    }
}
```

**✅ Idiomatic**

```java
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

// The holder idiom: the JVM initializes Holder on first use, exactly once,
// under its own class-loading lock — lazy and thread-safe with no sync code.
final class CacheManager {
    private final Map<String, String> store = new ConcurrentHashMap<>();
    private CacheManager() {} // no `new` from outside

    private static final class Holder {
        static final CacheManager INSTANCE = new CacheManager();
    }

    static CacheManager instance() { return Holder.INSTANCE; }

    void set(String key, String value) { store.put(key, value); }
    String get(String key) { return store.get(key); }
}

// The enum form: one constant, proof against serialization and reflection too.
enum Cache {
    INSTANCE;

    private final Map<String, String> store = new ConcurrentHashMap<>();

    public void set(String key, String value) { store.put(key, value); }
    public String get(String key) { return store.get(key); }
}

public class Demo {
    public static void main(String[] args) {
        CacheManager.instance().set("token", "abc");
        System.out.println(CacheManager.instance().get("token")); // abc — shared everywhere

        Cache.INSTANCE.set("token", "xyz");
        System.out.println(Cache.INSTANCE.get("token")); // xyz — one instance, guaranteed
    }
}
```

**🧠 Tradeoff** — both idioms let the JVM do the guarding. The holder rides class loading:
`Holder` isn't initialized until `instance()` first touches it, and class initialization is
already once-only and thread-safe, so the double-init race from the naive version can't
happen. The enum goes further — the JVM enforces one instance even against serialization
and reflection, which is why Effective Java calls it the best singleton. But name the
reality: most Java singletons today aren't hand-rolled at all. They're container lifetimes —
a Spring bean is a singleton by default — with the dependency visible in constructors and
swappable in tests, which fixes exactly what the static form breaks. Keep these idioms for
genuinely ambient facts; let the container handle the rest.

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
