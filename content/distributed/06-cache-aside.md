---
id: cache-aside
category: distributed
sequence: 6
title: Cache-Aside
also_known_as: [Lazy Loading, Read-Through (variant)]
gof: false
intent: "Check a cache before the database; on a miss, load from the database, populate the cache, and return — so hot data is served fast without caching everything up front."
frequency: high
difficulty: beginner
tags: [distributed, caching, performance, read-heavy, invalidation]
related: [repository, circuit-breaker, cqrs]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Keep the cache **beside** the datastore, not in front of it. On a read, the application looks in
the cache first; on a **hit** it returns immediately, on a **miss** it loads from the database,
writes the value into the cache, and returns it. The cache fills **lazily** — only with data that's
actually requested.

The application owns the caching logic, so the cache and database stay independent: the cache can
fail or be flushed and the app still works (just slower). It's the default caching strategy for
read-heavy workloads because it's simple and only caches what's hot.

## The Problem

Serving every read straight from the database doesn't scale for hot data:

- **Repeated expensive reads** — the same popular rows are fetched thousands of times a second,
  each a full query, when the answer rarely changes.
- **Database as bottleneck** — read load saturates the primary; you scale hardware to serve queries
  whose results are identical.
- **Caching everything wastes memory** — pre-loading the whole dataset caches cold data that's
  never read.
- **High latency on hot paths** — a network round-trip and query on every read when a memory lookup
  would do.

## Structure

Key Components:

- **Cache** — a fast key-value store (in-memory, Redis, Memcached) holding recently-read values.
- **Database** — the system of record; the source of truth on a miss.
- **Application** — owns the logic: check cache → on miss, load + populate → return.
- **TTL / invalidation** — how entries expire or get evicted so the cache doesn't serve stale data.

```
                1. read
Client ──► [ Cache ] ──hit──► return
                │ miss
                ▼ 2. load
           [ Database ] ──► 3. populate cache ──► return
```

## When to Use

- Read-heavy workloads where the same data is requested far more than it changes.
- Reads are expensive (complex queries, remote calls) and results are cacheable.
- Some staleness is acceptable, bounded by a TTL.
- You want the app to keep working (degraded) if the cache is unavailable.

## Advantages and Disadvantages

### Advantages
- **Only caches what's used** — lazy population keeps the cache to the hot set.
- **Resilient to cache failure** — a cache outage falls back to the database; the app still serves.
- **Simple and general** — plain read logic, works with any cache and datastore.

### Disadvantages
- **Stale reads** — between a database write and the cache expiring/invalidating, reads can be stale.
- **First-hit latency** — every miss pays the full database cost, plus a cache write.
- **Invalidation is hard** — keeping the cache consistent with writes is the perennially tricky part.

## Common Mistakes

- **No TTL and no invalidation** — entries never expire and writes don't evict them, so the cache
  serves stale data forever; always bound staleness.
- **Cache stampede on miss** — a hot key expiring lets thousands of concurrent requests all miss and
  hit the database at once; use a lock/single-flight to load once.
- **Caching write failures or nulls carelessly** — caching a "not found" without thought can mask a
  later insert; be deliberate about negative caching.
- **Trusting the cache blindly** — treating a possibly-stale cache as truth for critical reads
  (balances, permissions) instead of reading through to the source.

## Key Takeaways

- Check cache → on miss load from DB, populate, return; the cache fills lazily with hot data.
- The app owns the logic, so a cache failure degrades to the database rather than breaking.
- The hard part is invalidation/staleness — bound it with TTLs and evict on write.
- Guard hot keys against stampedes with single-flight loading.

## Implementations

### JavaScript

**❌ Naive**

```js
// Every read hits the database, even for the same hot record.
async function getProduct(id) {
  return db.query("SELECT * FROM products WHERE id = ?", [id]); // no cache
}
```

**✅ Idiomatic**

```js
// Cache-aside: look up, load on miss, populate with a TTL.
async function getProduct(id) {
  const key = `product:${id}`;
  const cached = await cache.get(key);
  if (cached) return JSON.parse(cached);          // hit

  const product = await db.query("SELECT * FROM products WHERE id = ?", [id]); // miss → load
  if (product) await cache.set(key, JSON.stringify(product), { EX: 300 });     // populate, 5m TTL
  return product;
}
// on write: await cache.del(`product:${id}`)  // invalidate so the next read reloads
```

**🧠 Tradeoff** — The read path is a few lines: hit returns fast, miss loads and populates with a
TTL. The TTL bounds staleness cheaply, and deleting the key on write keeps it fresh. What's not
shown is the stampede risk — if a hot key expires under load, many requests miss at once; a
single-flight lock around the load fixes it when traffic warrants.

### Node.js

**❌ Naive**

```js
// Route queries Postgres on every request for data that rarely changes.
app.get("/config", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM app_config");
  res.json(rows);
});
```

**✅ Idiomatic**

```js
// Redis cache-aside with single-flight to avoid a stampede on the hot key.
const inflight = new Map();

async function getConfig() {
  const cached = await redis.get("app_config");
  if (cached) return JSON.parse(cached);

  if (inflight.has("app_config")) return inflight.get("app_config"); // coalesce concurrent misses
  const p = (async () => {
    const { rows } = await pool.query("SELECT * FROM app_config");
    await redis.set("app_config", JSON.stringify(rows), "EX", 60);
    return rows;
  })().finally(() => inflight.delete("app_config"));

  inflight.set("app_config", p);
  return p;
}
```

**🧠 Tradeoff** — Adding an in-process `inflight` map so concurrent misses share one database load
prevents the classic stampede where a hot key's expiry unleashes a query flood. Redis holds the
value across instances; the `inflight` coalescing is per-instance. It's a bit more code than a bare
get/set, justified precisely for hot keys under load.

### Python

**❌ Naive**

```python
# Hits the database on every call, repeatedly, for the same value.
def get_user(user_id):
    return db.query("SELECT * FROM users WHERE id = %s", (user_id,))
```

**✅ Idiomatic**

```python
import json

def get_user(user_id, ttl=300):
    key = f"user:{user_id}"
    cached = redis.get(key)
    if cached:
        return json.loads(cached)               # hit

    user = db.query("SELECT * FROM users WHERE id = %s", (user_id,))  # miss → load
    if user:
        redis.set(key, json.dumps(user), ex=ttl)  # populate with TTL
    return user

def update_user(user_id, **fields):
    db.update_user(user_id, **fields)
    redis.delete(f"user:{user_id}")             # invalidate on write
```

**🧠 Tradeoff** — The get/load/populate shape plus an explicit `delete` on write is idiomatic and
clear. For local, per-process caching of pure computations, `functools.lru_cache` is a one-line
alternative — but it has no TTL and no cross-process sharing, so Redis (or Memcached) is the choice
for shared, invalidatable data. Stampede protection (a Redis lock) is the add-on for very hot keys.

### Elixir

**❌ Naive**

```elixir
# Every call queries the Repo for slowly-changing data.
def get_settings, do: Repo.all(Setting)
```

**✅ Idiomatic**

```elixir
# ETS (in-memory) or a library like Cachex gives cache-aside with TTL + de-duped loads.
def get_settings do
  case Cachex.get(:cache, :settings) do
    {:ok, nil} ->
      settings = Repo.all(Setting)                          # miss → load
      Cachex.put(:cache, :settings, settings, ttl: :timer.minutes(5))
      settings
    {:ok, settings} ->
      settings                                              # hit
  end
end
# invalidate on write: Cachex.del(:cache, :settings)
# (Cachex.fetch/4 does check-load-store atomically, coalescing concurrent misses)
```

**🧠 Tradeoff** — `Cachex` (over ETS) gives idiomatic cache-aside with TTLs, and its
`fetch/4` performs the check-load-store as one operation that coalesces concurrent misses — built-in
stampede protection. Raw ETS works too for the simplest cases. The BEAM makes a fast in-node cache
trivial; for cross-node sharing you still reach for Redis or a distributed cache.

### Go

**❌ Naive**

```go
// Queries the DB on every call for the same rows.
func GetProduct(id string) (Product, error) {
    return queryProduct(db, id) // no cache
}
```

**✅ Idiomatic**

```go
// Cache-aside with singleflight so concurrent misses trigger exactly one DB load.
var group singleflight.Group

func GetProduct(ctx context.Context, id string) (Product, error) {
    if p, ok := cache.Get(id); ok {
        return p.(Product), nil // hit
    }
    v, err, _ := group.Do(id, func() (any, error) { // coalesce concurrent misses on this key
        p, err := queryProduct(ctx, db, id)          // miss → load
        if err == nil {
            cache.SetWithTTL(id, p, 5*time.Minute)   // populate
        }
        return p, err
    })
    if err != nil {
        return Product{}, err
    }
    return v.(Product), nil
}
```

**🧠 Tradeoff** — Go's `golang.org/x/sync/singleflight` is purpose-built for the stampede problem:
`group.Do` ensures one in-flight load per key while others wait for its result. Combined with a TTL
cache (Ristretto, or a simple map+mutex), it's a robust cache-aside in a few lines. As usual you
wire the cache and invalidation explicitly, which keeps the behavior obvious.

### CSharp

**❌ Naive**

```csharp
// Every call queries the database, even for the same hot row.
async Task<Product> GetProductAsync(string id) =>
    await QueryProductAsync(id); // no cache
```

**✅ Idiomatic**

```csharp
// In-process cache-aside: a ConcurrentDictionary with per-entry expiry.
var cache = new ConcurrentDictionary<string, (Product Value, DateTime Expires)>();

async Task<Product> GetProductAsync(string id)
{
    if (cache.TryGetValue(id, out var hit) && hit.Expires > DateTime.UtcNow)
        return hit.Value;                                     // hit

    var product = await QueryProductAsync(id);                // miss → load
    cache[id] = (product, DateTime.UtcNow.AddMinutes(5));     // populate with TTL
    return product;
}

async Task UpdateProductAsync(Product p)
{
    await SaveProductAsync(p);
    cache.TryRemove(p.Id, out _); // invalidate so the next read reloads
}
```

**🧠 Tradeoff** — A `ConcurrentDictionary` with a `(Value, Expires)` tuple is thread-safe
cache-aside with lazy expiry — stale entries are simply overwritten on the next miss. What
it lacks is single-flight: two callers can miss together and both hit the database. The C#
idiom for that is caching a `Lazy<Task<Product>>` via `GetOrAdd`, so the factory runs once
and every caller awaits the same task. In production, `IMemoryCache` — or `HybridCache`,
which has stampede protection built in — covers TTL and eviction so you keep only the
aside logic.

### Rust

**❌ Naive**

```rust
// Every call queries the database for the same hot row.
fn get_product(id: &str) -> Product {
    query_product(id) // no cache
}
```

**✅ Idiomatic**

```rust
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Clone)]
struct Product { id: u32, name: String }

struct Cache {
    entries: Mutex<HashMap<String, (Product, Instant)>>,
    ttl: Duration,
}

impl Cache {
    fn get_product(&self, id: &str) -> Product {
        if let Some((p, expires)) = self.entries.lock().unwrap().get(id) {
            if Instant::now() < *expires {
                return p.clone(); // hit — clone out so the lock releases
            }
        }
        let product = query_product(id); // miss → load (the real database call)
        self.entries.lock().unwrap().insert(
            id.to_string(),
            (product.clone(), Instant::now() + self.ttl), // populate with TTL
        );
        product
    }

    fn invalidate(&self, id: &str) {
        self.entries.lock().unwrap().remove(id); // evict on write
    }
}
```

**🧠 Tradeoff** — `Mutex<HashMap>` is the whole cache, std only. Cloning on a hit looks
wasteful but is the point: you can't return a reference into the map without holding the
lock, so the borrow checker forces a choice — clone out, or serialize every reader. Two
threads can still race a miss and load twice; harmless here, and the std fix (an entry
holding `Arc<OnceLock<Product>>` so one loader wins) is single-flight without dependencies.
For shared or cross-process caching you still reach for Redis, exactly as in the other tabs.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// Every call queries the database for the same hot row.
fn getProduct(key: []const u8) !Product {
    return queryProduct(key); // no cache
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

const Product = struct { id: u32, name: []const u8 };

const Cache = struct {
    const Entry = struct { value: Product, expires: std.Io.Timestamp };

    entries: std.StringHashMap(Entry),
    io: std.Io, // the clock capability, threaded in like the allocator
    ttl: std.Io.Duration,

    fn init(allocator: std.mem.Allocator, io: std.Io, ttl: std.Io.Duration) Cache {
        return .{ .entries = std.StringHashMap(Entry).init(allocator), .io = io, .ttl = ttl };
    }

    fn deinit(self: *Cache) void {
        self.entries.deinit();
    }

    fn getProduct(self: *Cache, key: []const u8) !Product {
        const now = std.Io.Timestamp.now(self.io, .awake); // monotonic clock
        if (self.entries.get(key)) |entry| {
            if (now.compare(.lt, entry.expires)) return entry.value; // hit
        }
        const product = try queryProduct(key); // miss → load
        try self.entries.put(key, .{
            .value = product,
            .expires = now.addDuration(self.ttl),
        }); // populate with TTL
        return product;
    }

    fn invalidate(self: *Cache, key: []const u8) void {
        _ = self.entries.remove(key); // evict on write
    }
};

fn queryProduct(key: []const u8) !Product {
    _ = key; // stands in for the real database call
    return .{ .id = 42, .name = "keyboard" };
}

pub fn main() !void {
    var threaded: std.Io.Threaded = .init(std.heap.page_allocator, .{});
    defer threaded.deinit();

    var cache = Cache.init(std.heap.page_allocator, threaded.io(), .fromMilliseconds(5 * std.time.ms_per_min));
    defer cache.deinit();

    _ = try cache.getProduct("product:42"); // miss → database, then cached
    _ = try cache.getProduct("product:42"); // hit → served from the map
    cache.invalidate("product:42");         // after a write
}
```

**🧠 Tradeoff** — The allocator is a parameter, so the cache's memory is an explicit budget
you pick and release (`defer cache.deinit()`) rather than ambient heap a GC deals with. As
of 0.17 the clock works the same way: there's no ambient `milliTimestamp()` anymore — the
cache holds a `std.Io` and asks *it* for the time, an explicit capability exactly like the
allocator. One sharp edge: `StringHashMap` stores the key *slice* you pass — hand it stable
memory or `dupe` the key with the allocator, or the entry outlives its key. Expiry is lazy
(checked on read) and eviction-on-write bounds staleness, same as the other tabs; wrap the
map in a `std.Io.Mutex` before sharing it across threads.

### Java

**❌ Naive**

```java
// Check-then-load: two threads can miss together and both hit the database.
Product getProduct(String id) {
    var p = cache.get(id);
    if (p == null) {
        p = queryProduct(id); // both loaders run — the stampede in miniature
        cache.put(id, p);
    }
    return p;
}
```

**✅ Idiomatic**

```java
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

// Cache-aside on a ConcurrentHashMap: computeIfAbsent loads once per missing key.
final class ProductCache {
    private record Entry(Product value, Instant expires) {}

    private final ConcurrentHashMap<String, Entry> cache = new ConcurrentHashMap<>();
    private final Duration ttl = Duration.ofMinutes(5);

    Product getProduct(String id) {
        var entry = cache.get(id);
        if (entry != null && entry.expires().isAfter(Instant.now()))
            return entry.value();                       // hit

        if (entry != null)
            cache.remove(id, entry);                    // drop the expired entry
        return cache.computeIfAbsent(id, key ->         // miss → exactly one loader per key
            new Entry(queryProduct(key), Instant.now().plus(ttl))).value();
    }

    void invalidate(String id) {
        cache.remove(id); // evict on write
    }
}
```

**🧠 Tradeoff** — `computeIfAbsent` is the line that matters: it runs the mapping function
once per absent key while concurrent callers block and receive the same result —
single-flight built into the map, where the naive check-then-load lets every concurrent
miss query the database. The catch is the same mechanism: the loader runs under the map's
internal bin lock, so keep it to the one query and never touch the same map inside it.
TTL is hand-rolled here (lazy expiry, evict on write, like the other tabs); in production
Caffeine covers it — `expireAfterWrite`, size-based eviction, and the same one-loader-per-key
coalescing — and Redis remains the answer once the cache must be shared across processes.

## Applications

- **Web session & profile data** — user/session objects read on every request cached to spare the
  database (backend).
- **Product catalogs & config** — slowly-changing reference data served from Redis/Memcached with a
  TTL (backend).
- **CDNs** — edge caching of static assets and pages is cache-aside at the network layer (frontend).
- **API response caching** — expensive aggregations cached so repeat requests skip recomputation
  (backend).
- **ORM & query caches** — second-level caches (Hibernate, etc.) sit beside the database for hot
  entities (backend).

## Related Patterns

- **Repository** — the natural home for cache-aside: the repository checks the cache, loads from the
  store on a miss, and invalidates on write, hiding it from callers.
- **CQRS** — a read model *is* a maintained cache; cache-aside is the lighter-weight, lazily-filled
  cousin without a separate projection.
- **Circuit Breaker** — protects the cache or database call so a slow backing store fails fast rather
  than hanging the read path.
