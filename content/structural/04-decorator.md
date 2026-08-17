---
id: decorator
category: structural
sequence: 4
title: Decorator
also_known_as: [Wrapper]
gof: true
intent: "Add behavior to an object by wrapping it, without changing its class or other instances."
frequency: high
difficulty: intermediate
tags: [structural, wrapper, composition, open-closed, layering]
related: [adapter, proxy, composite, chain-of-responsibility]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Wrap an object in another object that adds behavior, keeping the same interface, so you can
stack features one layer at a time. Where subclassing bakes a combination in at compile time,
decorators compose behaviors at runtime — logging *and* caching *and* retry, in any order.

## The Problem

You have a data source with a `read()` method. You want optional logging, caching, and retry.
Subclassing every combination explodes: `LoggingCachingSource`, `CachingRetrySource`,
`LoggingCachingRetrySource`… A flag-laden class becomes a tangle of `if this.logging` checks.

```
class Source {
  read() {
    if (this.logging) { /* … */ }
    if (this.caching) { /* … */ }   // one class trying to be every combination
  }
}
```

Decorators let you wrap `Source` with a `LoggingSource`, then a `CachingSource`, composing only
the features you want.

## Structure

Key Components:

- **Component** — the interface both real objects and decorators share (`read()`).
- **Concrete Component** — the base object being decorated.
- **Decorator** — holds a Component, forwards to it, and adds behavior before/after.

## When to Use

- You want to add responsibilities to individual objects, not the whole class.
- Features should be combinable and stackable in different orders.
- Subclassing every combination would explode.
- You want to add/remove behavior at runtime.

## Advantages and Disadvantages

### Advantages
- Compose behaviors at runtime instead of a class per combination.
- Each decorator has a single responsibility.
- Open/Closed: add a new behavior as a new decorator, don't edit the component.

### Disadvantages
- Many small wrapper objects; a deep stack is harder to debug.
- Order can matter (cache-then-log vs log-then-cache differ).
- Removing a specific decorator from the middle of a stack is awkward.

## Common Mistakes

- **Breaking the interface** — a decorator must present the same interface as what it wraps, or
  callers can't treat them uniformly.
- **Forgetting to forward** — a decorator that doesn't delegate to the wrapped object drops
  behavior.
- **Confusing it with Proxy** — Decorator *adds* behavior; Proxy *controls access* (same shape,
  different intent).

## Key Takeaways

- Decorator = wrap-same-interface to add behavior, stackable at runtime.
- Prefer it over a subclass-per-combination explosion.
- Watch stacking order; each layer should do one thing and forward the rest.
- In FP languages it's just function composition.

## Implementations

Wrapping a `fetch`-like data source with logging and caching.

### JavaScript

**❌ Naive**

```js
// One class trying to be every combination via flags.
class DataSource {
  constructor({ logging = false, caching = false } = {}) {
    this.logging = logging; this.caching = caching; this.cache = new Map();
  }
  read(key) {
    if (this.caching && this.cache.has(key)) return this.cache.get(key);
    if (this.logging) console.log("read", key);
    const value = `value:${key}`;
    if (this.caching) this.cache.set(key, value);
    return value;
  }
}
```

**✅ Idiomatic**

```js
// Base component.
class DataSource {
  read(key) { return `value:${key}`; }
}

// Decorators share read(key), wrap a source, add one behavior.
class LoggingSource {
  constructor(inner) { this.inner = inner; }
  read(key) { console.log("read", key); return this.inner.read(key); }
}
class CachingSource {
  constructor(inner) { this.inner = inner; this.cache = new Map(); }
  read(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    const value = this.inner.read(key);
    this.cache.set(key, value);
    return value;
  }
}

// Compose only what you need, in the order you want:
const source = new LoggingSource(new CachingSource(new DataSource()));
source.read("a");
```

**🧠 Tradeoff** — Each decorator is a single-responsibility wrapper sharing `read(key)`, so
features compose at runtime and new ones don't touch existing classes. The price is a chain of
objects and order sensitivity — here logging sees every call, caching short-circuits repeats.

### Node.js

**❌ Naive**

```js
// One client carrying flags for every cross-cutting concern.
class HttpClient {
  constructor({ retry = false, log = false, token } = {}) { Object.assign(this, { retry, log, token }); }
  async request(opts) {
    if (this.log) console.log(opts.method, opts.url);
    if (this.token) opts.headers = { ...opts.headers, authorization: `Bearer ${this.token}` };
    // retry logic tangled in here too…
    return fetch(opts.url, opts);
  }
}
```

**✅ Idiomatic (backend)**

```js
// Base client, then one wrapper per concern — all sharing request(opts).
class HttpClient { request(opts) { return fetch(opts.url, opts); } }

class WithAuth {
  constructor(inner, token) { this.inner = inner; this.token = token; }
  request(opts) {
    return this.inner.request({
      ...opts,
      headers: { ...opts.headers, authorization: `Bearer ${this.token}` },
    });
  }
}
class WithRetry {
  constructor(inner, tries = 3) { this.inner = inner; this.tries = tries; }
  async request(opts) {
    for (let i = 1; ; i++) {
      try { return await this.inner.request(opts); }
      catch (e) { if (i >= this.tries) throw e; }
    }
  }
}

// Compose in the order you want the behavior:
const client = new WithRetry(new WithAuth(new HttpClient(), token));
client.request({ url: "/orders", method: "GET" });
```

**🧠 Tradeoff** — Each wrapper adds one concern and shares `request(opts)`, so features compose at
runtime and order is meaningful — here retry wraps auth, so every retry re-sends the token. This is
the object cousin of Express middleware; when the concerns are purely functional, a middleware chain
(Chain of Responsibility) is the lighter expression of the same idea.

### Python

**❌ Naive**

```python
class DataSource:
    def __init__(self, logging=False, caching=False):
        self.logging, self.caching, self.cache = logging, caching, {}

    def read(self, key):
        if self.caching and key in self.cache:
            return self.cache[key]
        if self.logging:
            print("read", key)
        value = f"value:{key}"
        if self.caching:
            self.cache[key] = value
        return value
```

**✅ Idiomatic**

```python
# Object decorators (the GoF form): wrap same interface, add behavior.
class DataSource:
    def read(self, key: str) -> str:
        return f"value:{key}"

class LoggingSource:
    def __init__(self, inner):
        self._inner = inner
    def read(self, key: str) -> str:
        print("read", key)
        return self._inner.read(key)

class CachingSource:
    def __init__(self, inner):
        self._inner, self._cache = inner, {}
    def read(self, key: str) -> str:
        if key not in self._cache:
            self._cache[key] = self._inner.read(key)
        return self._cache[key]

source = LoggingSource(CachingSource(DataSource()))
```

**🧠 Tradeoff** — This is the object-decorator form. Python also has *function* decorators
(`@lru_cache`, `@retry`) — the same wrap-and-forward idea applied to callables with `@` syntax.
Use function decorators for cross-cutting concerns on functions; use object decorators when the
thing you're layering is a stateful component.

### Elixir

**❌ Naive**

```elixir
defmodule DataSource do
  def read(key, opts) do
    if opts[:logging], do: IO.puts("read #{key}")
    # caching in a stateless function needs external state — awkward with flags
    "value:#{key}"
  end
end
```

**✅ Idiomatic**

```elixir
# Decoration is function composition — each wrapper takes and returns a reader fn.
defmodule Source do
  def base, do: fn key -> "value:#{key}" end

  def with_logging(reader) do
    fn key ->
      IO.puts("read #{key}")
      reader.(key)
    end
  end

  def with_caching(reader) do
    {:ok, cache} = Agent.start_link(fn -> %{} end)
    fn key ->
      Agent.get_and_update(cache, fn c ->
        case c do
          %{^key => v} -> {v, c}
          _ -> v = reader.(key); {v, Map.put(c, key, v)}
        end
      end)
    end
  end
end

read = Source.base() |> Source.with_caching() |> Source.with_logging()
read.("a")
```

**🧠 Tradeoff** — In Elixir a decorator is a higher-order function wrapping another function, and
the pipe composes them — no wrapper objects at all. Stateful decoration (caching) needs a process
to hold the state, since functions are pure; that's the one place the functional form costs more
than an object field.

### Go

**❌ Naive**

```go
type DataSource struct {
	Logging, Caching bool
	cache            map[string]string
}

func (d *DataSource) Read(key string) string {
	if d.Caching {
		if v, ok := d.cache[key]; ok {
			return v
		}
	}
	if d.Logging {
		fmt.Println("read", key)
	}
	// flags multiply; one method does everything
	return "value:" + key
}
```

**✅ Idiomatic**

```go
package source

import "fmt"

type Source interface{ Read(key string) string }

type base struct{}

func (base) Read(key string) string { return "value:" + key }

type logging struct{ inner Source }

func (l logging) Read(key string) string {
	fmt.Println("read", key)
	return l.inner.Read(key)
}

type caching struct {
	inner Source
	cache map[string]string
}

func Caching(inner Source) Source { return &caching{inner, map[string]string{}} }
func Logging(inner Source) Source { return logging{inner} }

func (c *caching) Read(key string) string {
	if v, ok := c.cache[key]; ok {
		return v
	}
	v := c.inner.Read(key)
	c.cache[key] = v
	return v
}

// source := Logging(Caching(base{}))
```

**🧠 Tradeoff** — Each decorator satisfies `Source` and holds an inner `Source`, so they nest
freely via the constructor functions. Go's implicit interfaces make this clean; for single-method
components you can also decorate with a `func` type (the common middleware pattern in `net/http`).

### CSharp

**❌ Naive**

```csharp
// One class trying to be every combination via flags.
public sealed class DataSource(bool logging = false, bool caching = false)
{
    private readonly Dictionary<string, string> _cache = new();

    public string Read(string key)
    {
        if (caching && _cache.TryGetValue(key, out var hit)) return hit;
        if (logging) Console.WriteLine($"read {key}");
        var value = $"value:{key}";
        if (caching) _cache[key] = value;
        return value;
    }
}
```

**✅ Idiomatic**

```csharp
// Compose only what you need, in the order you want:
ISource source = new LoggingSource(new CachingSource(new DataSource()));
source.Read("a"); // read a  → miss, hits the base source
source.Read("a"); // read a  → caching layer short-circuits

public interface ISource
{
    string Read(string key);
}

public sealed class DataSource : ISource
{
    public string Read(string key) => $"value:{key}";
}

// One decorator per concern — each wraps an ISource and shares its shape.
public sealed class LoggingSource(ISource inner) : ISource
{
    public string Read(string key)
    {
        Console.WriteLine($"read {key}");
        return inner.Read(key);
    }
}

public sealed class CachingSource(ISource inner) : ISource
{
    private readonly Dictionary<string, string> _cache = new();

    public string Read(string key) =>
        _cache.TryGetValue(key, out var hit) ? hit : _cache[key] = inner.Read(key);
}
```

**🧠 Tradeoff** — each wrapper implements `ISource`, holds its inner source via a primary
constructor, and adds one concern; order still matters (logging sees every call, caching
short-circuits repeats). The BCL ships this exact shape as `DelegatingHandler` chains in
`HttpClient`. For a single-method contract you could stack `Func<string, string>` wrappers
instead, but the classes read better once a decorator carries state like the cache.

### Rust

**❌ Naive**

```rust
struct DataSource {
    logging: bool,
    caching: bool,
    cache: HashMap<String, String>,
}

impl DataSource {
    // Flags multiply; one method does everything.
    fn read(&mut self, key: &str) -> String {
        if self.caching {
            if let Some(v) = self.cache.get(key) {
                return v.clone();
            }
        }
        if self.logging {
            println!("read {key}");
        }
        format!("value:{key}")
    }
}
```

**✅ Idiomatic**

```rust
use std::collections::HashMap;

trait Source {
    fn read(&mut self, key: &str) -> String;
}

struct DataSource;
impl Source for DataSource {
    fn read(&mut self, key: &str) -> String {
        format!("value:{key}")
    }
}

// Each decorator owns its inner source as a boxed trait object.
struct Logging {
    inner: Box<dyn Source>,
}
impl Source for Logging {
    fn read(&mut self, key: &str) -> String {
        println!("read {key}");
        self.inner.read(key)
    }
}

struct Caching {
    inner: Box<dyn Source>,
    cache: HashMap<String, String>,
}
impl Source for Caching {
    fn read(&mut self, key: &str) -> String {
        if let Some(v) = self.cache.get(key) {
            return v.clone();
        }
        let v = self.inner.read(key);
        self.cache.insert(key.to_string(), v.clone());
        v
    }
}

fn main() {
    let mut source = Logging {
        inner: Box::new(Caching { inner: Box::new(DataSource), cache: HashMap::new() }),
    };
    source.read("a"); // read a  → miss, hits the base source
    source.read("a"); // read a  → caching layer short-circuits
}
```

**🧠 Tradeoff** — `Box<dyn Source>` lets decorators nest to any depth chosen at runtime, one
heap allocation per layer; a closed wrapper set could use an enum instead. Note the signature:
`read` takes `&mut self` because caching genuinely mutates — Rust pushes the hidden state into
the contract, where Go tucks it behind a pointer receiver. If callers need `&self`, wrap the
cache in `RefCell` (or `Mutex` across threads) and accept the runtime borrow check.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

// One struct carrying flags for every concern; read() branches on all of them.
const DataSource = struct {
    logging: bool = false,
    caching: bool = false,
    cache: std.StringHashMap([]const u8),
    allocator: std.mem.Allocator,

    fn read(self: *DataSource, key: []const u8) ![]const u8 {
        if (self.caching) {
            if (self.cache.get(key)) |hit| return hit;
        }
        if (self.logging) std.debug.print("read {s}\n", .{key});
        const value = try std.fmt.allocPrint(self.allocator, "value:{s}", .{key});
        if (self.caching) try self.cache.put(key, value);
        return value;
    }
};
```

**✅ Idiomatic**

```zig
const std = @import("std");

// The component contract, Allocator-style: context pointer + function pointer.
const Source = struct {
    ctx: *anyopaque,
    readFn: *const fn (ctx: *anyopaque, key: []const u8) anyerror![]const u8,

    fn read(self: Source, key: []const u8) ![]const u8 {
        return self.readFn(self.ctx, key);
    }
};

const DataSource = struct {
    allocator: std.mem.Allocator,

    fn read(ctx: *anyopaque, key: []const u8) anyerror![]const u8 {
        const self: *DataSource = @ptrCast(@alignCast(ctx));
        return std.fmt.allocPrint(self.allocator, "value:{s}", .{key});
    }

    fn source(self: *DataSource) Source {
        return .{ .ctx = self, .readFn = read };
    }
};

// Each decorator holds an inner Source and adds one behavior.
const LoggingSource = struct {
    inner: Source,

    fn read(ctx: *anyopaque, key: []const u8) anyerror![]const u8 {
        const self: *LoggingSource = @ptrCast(@alignCast(ctx));
        std.debug.print("read {s}\n", .{key});
        return self.inner.read(key);
    }

    fn source(self: *LoggingSource) Source {
        return .{ .ctx = self, .readFn = read };
    }
};

const CachingSource = struct {
    inner: Source,
    cache: std.StringHashMap([]const u8),

    fn read(ctx: *anyopaque, key: []const u8) anyerror![]const u8 {
        const self: *CachingSource = @ptrCast(@alignCast(ctx));
        if (self.cache.get(key)) |hit| return hit;
        const value = try self.inner.read(key);
        try self.cache.put(key, value);
        return value;
    }

    fn source(self: *CachingSource) Source {
        return .{ .ctx = self, .readFn = read };
    }
};

pub fn main() !void {
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit(); // one free for everything the chain allocated
    const allocator = arena.allocator();

    var base = DataSource{ .allocator = allocator };
    var caching = CachingSource{
        .inner = base.source(),
        .cache = std.StringHashMap([]const u8).init(allocator),
    };
    var logging = LoggingSource{ .inner = caching.source() };
    const source = logging.source();

    _ = try source.read("a"); // read a  → miss, base source builds the value
    _ = try source.read("a"); // read a  → caching layer short-circuits
}
```

**🧠 Tradeoff** — runtime-stackable decorators need runtime dispatch, and Zig's honest form
is the two-field vtable (`*anyopaque` context + function pointer), the same shape as
`std.mem.Allocator`. The allocator is explicit because building and caching values allocates;
the arena turns cleanup into one `defer`. If the wrapper set is closed, a tagged union with a
`switch` inside `read` drops the indirection — the vtable pays off only when new decorators
arrive from outside.

### Java

**❌ Naive**

```java
// One class trying to be every combination via flags.
class DataSource {
    private final boolean logging, caching;
    private final Map<String, String> cache = new HashMap<>();

    DataSource(boolean logging, boolean caching) {
        this.logging = logging;
        this.caching = caching;
    }

    String read(String key) {
        if (caching && cache.containsKey(key)) return cache.get(key);
        if (logging) System.out.println("read " + key);
        var value = "value:" + key;
        if (caching) cache.put(key, value);
        return value;
    }
}
```

**✅ Idiomatic**

```java
import java.util.HashMap;
import java.util.Map;

interface Source {
    String read(String key);
}

class DataSource implements Source {
    public String read(String key) { return "value:" + key; }
}

// One decorator per concern — each wraps a Source and shares its shape.
class LoggingSource implements Source {
    private final Source inner;

    LoggingSource(Source inner) { this.inner = inner; }

    public String read(String key) {
        System.out.println("read " + key);
        return inner.read(key);
    }
}

class CachingSource implements Source {
    private final Source inner;
    private final Map<String, String> cache = new HashMap<>();

    CachingSource(Source inner) { this.inner = inner; }

    public String read(String key) {
        return cache.computeIfAbsent(key, inner::read);
    }
}

public class Demo {
    public static void main(String[] args) {
        // Compose only what you need, in the order you want:
        Source source = new LoggingSource(new CachingSource(new DataSource()));
        source.read("a"); // read a  → miss, hits the base source
        source.read("a"); // read a  → caching layer short-circuits
    }
}
```

**🧠 Tradeoff** — `java.io` IS this pattern: `new BufferedInputStream(new
GZIPInputStream(new FileInputStream(f)))` is a decorator stack, and it has shipped in the
standard library since 1.0 — Java programmers use Decorator daily without naming it. The form
above is the same idea for our source: one concern per wrapper, order chosen at composition
time, `computeIfAbsent` with a method reference doing the cache-or-forward in one line. The
known cost carries over from the streams too — deep stacks are awkward to unwind, and you close
the outermost object trusting it to cascade.

## Applications

Real-world uses of Decorator (from the reference article):

- **HTTP middleware** — logging, auth, compression wrapping a handler.
- **I/O streams** — buffering/encryption/compression layered on a base stream.
- **Caching / retry / rate-limit** wrappers around a service call.
- **UI components** — borders, scroll, shadow added by wrapping.
- **Feature toggles & i18n** — wrap a renderer to add behavior conditionally.

**In modern systems:**

- **Multi-agent** — wrap a raw model call with retry, caching, guardrail, and logging layers, each
  added independently and removable without touching the core call.
- **Workflow engine** — a step wrapped with timing, tracing, and idempotency without editing the
  step's own logic.
- **Low-code** — a field decorated by permission and formatting layers declared in its JSON.

## Related Patterns

- **Proxy** — same wrapping shape; Proxy controls access, Decorator adds behavior.
- **Adapter** — changes the interface; Decorator keeps it.
- **Composite** — decorators are often a degenerate composite (one child); both rely on a shared
  component interface.
- **Chain of Responsibility** — also a chain of wrappers, but each may stop the request; a
  decorator always forwards.
