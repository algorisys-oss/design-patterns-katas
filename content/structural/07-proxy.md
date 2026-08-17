---
id: proxy
category: structural
sequence: 7
title: Proxy
also_known_as: [Surrogate]
gof: true
intent: "Stand in for another object to control access to it — lazily, remotely, or with guards."
frequency: medium
difficulty: intermediate
tags: [structural, access-control, lazy-loading, caching, wrapper]
related: [decorator, adapter, facade]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Put a stand-in in front of a real object that shares its interface but controls access to it.
The proxy can defer creating the real thing until it's needed (virtual), check permissions
(protection), cache results, count calls, or talk to a remote object — all invisible to the
caller, who thinks it's talking to the real thing.

## The Problem

A high-res image is expensive to load. If you build every image object eagerly, a gallery of a
hundred images loads a hundred files up front, even ones the user never scrolls to.

```
const images = urls.map(u => new HighResImage(u)); // loads ALL of them immediately
render(images[0]);                                  // but you only needed the first
```

A virtual proxy holds the URL and loads the real image only when `display()` is first called.

## Structure

Key Components:

- **Subject** — the interface shared by the real object and the proxy (`display()`).
- **Real Subject** — the actual object doing the work (`HighResImage`).
- **Proxy** — same interface; holds/creates the real subject and adds access control.

## When to Use

- **Virtual** — defer expensive creation until first use (lazy load).
- **Protection** — check permissions before forwarding.
- **Caching** — memoize expensive results.
- **Remote** — represent an object in another process/machine.
- **Logging/monitoring** — observe access to the real object.

## Advantages and Disadvantages

### Advantages
- Adds access control transparently — callers use the same interface.
- Enables lazy loading, caching, and remote access without changing the real object.
- Single Responsibility: the cross-cutting concern lives in the proxy.

### Disadvantages
- Another indirection; a chatty proxy can hide latency.
- A caching/lazy proxy adds state and lifecycle to reason about.
- Overlaps in shape with Decorator — easy to conflate.

## Common Mistakes

- **Confusing it with Decorator** — same wrapping shape, different intent: Proxy *controls
  access*; Decorator *adds behavior*.
- **Leaking the real subject** — handing out a direct reference bypasses the proxy's control.
- **A proxy that changes the interface** — that's an Adapter, not a proxy.

## Key Takeaways

- Proxy = same interface as the real object, but it governs access.
- Common flavors: virtual (lazy), protection (auth), caching, remote.
- Keep the interface identical so the proxy is a drop-in.

## Implementations

A virtual proxy that lazy-loads an expensive image.

### JavaScript

*Targets modern JavaScript (ES2015+).*

**❌ Naive**

```js
// Every image loads its file immediately, whether shown or not.
class HighResImage {
  constructor(url) {
    this.url = url;
    this.data = loadFromDisk(url); // expensive — runs at construction
  }
  display() { return `showing ${this.url}`; }
}

const gallery = urls.map(u => new HighResImage(u)); // loads all of them up front
```

**✅ Idiomatic**

```js
class HighResImage {
  constructor(url) { this.url = url; this.data = loadFromDisk(url); } // expensive
  display() { return `showing ${this.url}`; }
}

// Same interface, but defers the real object until first display().
class ImageProxy {
  constructor(url) { this.url = url; this.real = null; }
  display() {
    if (!this.real) this.real = new HighResImage(this.url); // load on demand
    return this.real.display();
  }
}

const gallery = urls.map(u => new ImageProxy(u)); // nothing loaded yet
gallery[0].display();  // only THIS image loads
```

**🧠 Tradeoff** — The proxy shares `display()` so it's a drop-in for `HighResImage`, but loads
lazily — a hundred proxies cost nothing until shown. JS also has a built-in `Proxy` object for
intercepting property access (validation, reactivity); that's the same idea at the language
level.

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// Every read goes to the database, even for the same id fetched a moment ago.
class UserRepo {
  constructor(db) { this.db = db; }
  get(id) { return this.db.query("SELECT * FROM users WHERE id = $1", [id]); }
}
```

**✅ Idiomatic (backend)**

```js
// Same get(id) interface, but a caching proxy short-circuits repeat reads.
class CachingUserRepo {
  constructor(inner, ttl = 30_000) { this.inner = inner; this.ttl = ttl; this.cache = new Map(); }
  async get(id) {
    const hit = this.cache.get(id);
    if (hit && hit.expires > Date.now()) return hit.value; // served from cache
    const value = await this.inner.get(id);
    this.cache.set(id, { value, expires: Date.now() + this.ttl });
    return value;
  }
}

// Drop-in: callers still just call get(id).
const users = new CachingUserRepo(new UserRepo(db));
```

**🧠 Tradeoff** — The proxy shares `get(id)`, so it substitutes for the real repo while adding
caching that callers never see — the same slot where an access-control or rate-limit proxy would
go. The hard part is invalidation: a TTL is the simple choice, but stale reads are possible, so tune
the window or clear entries on write.

### Python

*Targets Python 3.12.*

**❌ Naive**

```python
class HighResImage:
    def __init__(self, url):
        self.url = url
        self.data = load_from_disk(url)  # eager, expensive

    def display(self) -> str:
        return f"showing {self.url}"

gallery = [HighResImage(u) for u in urls]  # loads every file now
```

**✅ Idiomatic**

```python
class HighResImage:
    def __init__(self, url: str):
        self.url = url
        self.data = load_from_disk(url)
    def display(self) -> str:
        return f"showing {self.url}"

class ImageProxy:
    def __init__(self, url: str):
        self._url = url
        self._real: HighResImage | None = None
    def display(self) -> str:
        if self._real is None:
            self._real = HighResImage(self._url)  # lazy load
        return self._real.display()

gallery = [ImageProxy(u) for u in urls]  # nothing loaded yet
```

**🧠 Tradeoff** — The proxy matches `display()` and creates the real image on first use. Python
can also do this with `functools.cached_property` for lazy attributes or `__getattr__` to forward
arbitrary calls to a lazily-built subject — handy when the interface is large and you don't want
to hand-forward every method.

### Elixir

*Targets Elixir 1.18.*

**❌ Naive**

```elixir
# Building the struct loads the data eagerly for every image.
defmodule HighResImage do
  defstruct [:url, :data]
  def new(url), do: %HighResImage{url: url, data: load_from_disk(url)}
  def display(%HighResImage{url: url}), do: "showing #{url}"
end

gallery = Enum.map(urls, &HighResImage.new/1)  # loads all files
```

**✅ Idiomatic**

```elixir
# The proxy holds only the url; the data loads on first display and is cached
# in the returned struct (functional "memoization" — return the updated value).
defmodule ImageProxy do
  defstruct [:url, :real]

  def new(url), do: %ImageProxy{url: url, real: nil}

  def display(%ImageProxy{real: nil, url: url} = proxy) do
    real = load_from_disk(url)
    {"showing #{url}", %{proxy | real: real}}   # hand back the loaded proxy
  end

  def display(%ImageProxy{url: url} = proxy), do: {"showing #{url}", proxy}
end

gallery = Enum.map(urls, &ImageProxy.new/1)      # nothing loaded
{_out, loaded} = ImageProxy.display(hd(gallery)) # only this one loads
```

**🧠 Tradeoff** — With immutable data there's no in-place caching, so a lazy proxy returns the
loaded value alongside its result and the caller keeps the updated struct. For transparent lazy
state that persists across calls, back the proxy with a `GenServer` (or `Task`/`Agent`) instead
— the process holds the loaded data.

### Go

*Targets Go 1.26.*

**❌ Naive**

```go
type HighResImage struct {
	url  string
	data []byte
}

func NewHighResImage(url string) *HighResImage {
	return &HighResImage{url: url, data: loadFromDisk(url)} // eager
}

func (i *HighResImage) Display() string { return "showing " + i.url }
```

**✅ Idiomatic**

```go
package gallery

type Image interface{ Display() string }

type highRes struct {
	url  string
	data []byte
}

func (i *highRes) Display() string { return "showing " + i.url }

// Proxy: same Image interface, builds the real one on first Display().
type imageProxy struct {
	url  string
	real *highRes
}

func NewImage(url string) Image { return &imageProxy{url: url} }

func (p *imageProxy) Display() string {
	if p.real == nil {
		p.real = &highRes{url: p.url, data: loadFromDisk(p.url)} // lazy
	}
	return p.real.Display()
}
```

**🧠 Tradeoff** — `imageProxy` and `highRes` both satisfy `Image`, so the proxy is a drop-in and
callers hold `Image` without knowing which they have. The lazy field makes it stateful — guard
with a `sync.Once` or mutex if a proxy may be displayed from multiple goroutines.

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
string[] urls = ["a.png", "b.png"];
var gallery = urls.Select(u => new HighResImage(u)).ToList(); // loads ALL of them now

public sealed class HighResImage(string url)
{
    private readonly byte[] _data = LoadFromDisk(url); // expensive — runs at construction
    public string Display() => $"showing {url}";
}
```

**✅ Idiomatic**

```csharp
string[] urls = ["a.png", "b.png"];
var gallery = urls.Select(IImage (u) => new ImageProxy(u)).ToList(); // nothing loaded yet
Console.WriteLine(gallery[0].Display()); // showing a.png — only this one loads

public interface IImage
{
    string Display();
}

public sealed class HighResImage(string url) : IImage
{
    private readonly byte[] _data = LoadFromDisk(url); // eager, expensive
    public string Display() => $"showing {url}";
}

// Same interface; Lazy<T> builds the real image on first Display().
public sealed class ImageProxy(string url) : IImage
{
    private readonly Lazy<HighResImage> _real = new(() => new HighResImage(url));
    public string Display() => _real.Value.Display();
}
```

**🧠 Tradeoff** — `Lazy<T>` owns the hard parts of the lazy slot — initialize once,
thread-safe by default — so the proxy stays two lines. .NET also ships `DispatchProxy`,
which generates an interface implementation at runtime and funnels every call through one
`Invoke`; that's the route for cross-cutting proxies (logging, retries) over wide
interfaces. For one small interface, the hand-written wrapper is clearer and faster.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
struct HighResImage {
    url: String,
    data: Vec<u8>,
}

impl HighResImage {
    fn new(url: &str) -> Self {
        Self { url: url.to_string(), data: load_from_disk(url) } // eager, expensive
    }
    fn display(&self) -> String {
        format!("showing {}", self.url)
    }
}

fn main() {
    let urls = ["a.png", "b.png"];
    // loads every file now
    let gallery: Vec<HighResImage> = urls.into_iter().map(HighResImage::new).collect();
    println!("{}", gallery[0].display());
}
```

**✅ Idiomatic**

```rust
use std::cell::OnceCell;

trait Image {
    fn display(&self) -> String;
}

struct HighResImage {
    url: String,
    data: Vec<u8>,
}

impl HighResImage {
    fn new(url: &str) -> Self {
        Self { url: url.to_string(), data: load_from_disk(url) } // eager
    }
}

impl Image for HighResImage {
    fn display(&self) -> String {
        format!("showing {}", self.url)
    }
}

// Same trait; OnceCell defers the real image until first display().
struct ImageProxy {
    url: String,
    real: OnceCell<HighResImage>,
}

impl Image for ImageProxy {
    fn display(&self) -> String {
        self.real.get_or_init(|| HighResImage::new(&self.url)).display()
    }
}

fn main() {
    let urls = ["a.png", "b.png"];
    let gallery: Vec<Box<dyn Image>> = urls
        .into_iter()
        .map(|u| Box::new(ImageProxy { url: u.to_string(), real: OnceCell::new() }) as Box<dyn Image>)
        .collect(); // nothing loaded yet
    println!("{}", gallery[0].display()); // showing a.png — only this one loads
}
```

**🧠 Tradeoff** — `OnceCell` is the lazy slot: it lets `display(&self)` fill the cache
through a shared reference, no `&mut` needed, and `get_or_init` runs the load exactly
once (use `OnceLock` when proxies cross threads). `Box<dyn Image>` keeps the proxy a
drop-in next to real images. Rust's standard library is itself full of proxies — `Rc`,
`MutexGuard`, and every `Deref` impl stand in front of a value and govern access to it.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

const HighResImage = struct {
    url: []const u8,
    data: []const u8,

    pub fn init(allocator: std.mem.Allocator, url: []const u8) !HighResImage {
        return .{ .url = url, .data = try loadFromDisk(allocator, url) }; // eager
    }
    pub fn display(self: *const HighResImage) void {
        std.debug.print("showing {s}\n", .{self.url});
    }
};

pub fn main() !void {
    const allocator = std.heap.page_allocator;
    const urls = [_][]const u8{ "a.png", "b.png" };
    var gallery: [urls.len]HighResImage = undefined;
    for (urls, 0..) |url, i| {
        gallery[i] = try HighResImage.init(allocator, url); // loads every file now
    }
    gallery[0].display();
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

const HighResImage = struct {
    url: []const u8,
    data: []const u8,

    pub fn init(allocator: std.mem.Allocator, url: []const u8) !HighResImage {
        return .{ .url = url, .data = try loadFromDisk(allocator, url) }; // expensive
    }
    pub fn display(self: *const HighResImage) void {
        std.debug.print("showing {s}\n", .{self.url});
    }
};

// Same call shape; the optional holds the real image, built on first display().
const ImageProxy = struct {
    allocator: std.mem.Allocator,
    url: []const u8,
    real: ?HighResImage = null,

    pub fn display(self: *ImageProxy) !void {
        if (self.real == null) {
            self.real = try HighResImage.init(self.allocator, self.url); // lazy
        }
        self.real.?.display();
    }
};

pub fn main() !void {
    const allocator = std.heap.page_allocator;
    var gallery = [_]ImageProxy{
        .{ .allocator = allocator, .url = "a.png" },
        .{ .allocator = allocator, .url = "b.png" },
    }; // nothing loaded yet

    try gallery[0].display(); // showing a.png — only this one loads
}
```

**🧠 Tradeoff** — The `?HighResImage` optional is Zig's lazy slot, and the error union
makes the laziness honest: `display` can fail with a load error, so its signature says
`!void` and callers `try` it — no invisible I/O behind an innocent-looking call, which is
exactly what the other languages' proxies hide. When callers must hold real-or-proxy
behind one type, reach for a tagged union with an exhaustive `switch` (closed set), or
the `*anyopaque` + function-pointer vtable when the set must stay open.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// Every image loads its file immediately, whether shown or not.
class HighResImage {
    private final String url;
    private final byte[] data;

    HighResImage(String url) {
        this.url = url;
        this.data = loadFromDisk(url); // expensive — runs at construction
    }

    String display() { return "showing " + url; }
}

// var gallery = urls.stream().map(HighResImage::new).toList(); // loads ALL of them now
```

**✅ Idiomatic**

```java
interface Image {
    String display();
}

class HighResImage implements Image {
    private final String url;
    private final byte[] data;

    HighResImage(String url) {
        this.url = url;
        this.data = loadFromDisk(url); // eager, expensive
    }

    public String display() { return "showing " + url; }
}

// Same interface; builds the real image on first display().
class ImageProxy implements Image {
    private final String url;
    private HighResImage real;

    ImageProxy(String url) { this.url = url; }

    public String display() {
        if (real == null) real = new HighResImage(url); // lazy
        return real.display();
    }
}

public class Demo {
    public static void main(String[] args) {
        var gallery = java.util.stream.Stream.of("a.png", "b.png")
            .<Image>map(ImageProxy::new)
            .toList(); // nothing loaded yet

        System.out.println(gallery.get(0).display()); // showing a.png — only this one loads
    }
}
```

**🧠 Tradeoff** — the hand-written wrapper is the right form for one small interface: a lazy
field behind the shared `Image` type, nothing more (make the null-check a `synchronized` block
or hold the real image in a `Supplier`-based memoizer if proxies cross threads). Java also
ships the dynamic route: `java.lang.reflect.Proxy` fabricates an implementation of any
interface at runtime and funnels every call through one `InvocationHandler` — it's how Spring
AOP and Hibernate lazy entities proxy wide interfaces without writing a forwarding method per
call. Reach for it when the concern is cross-cutting; the reflection toll and the debugging fog
aren't worth it for a two-method interface.

## Applications

Real-world uses of Proxy (from the reference article):

- **Virtual/lazy loading** — defer expensive images, documents, or connections.
- **Protection** — role/permission checks before forwarding a call.
- **Caching** — memoize expensive computations or API responses.
- **Remote proxy** — a local stand-in for a service across the network (RPC clients).
- **Reactivity / data binding** — intercept reads/writes (JS `Proxy`, Vue reactivity).
- **Logging & monitoring** — count or trace access to an object.

**In modern systems:**

- **Multi-agent** — a caching/rate-limiting proxy in front of a model, or a remote-agent proxy
  that looks local to the orchestrator while the work runs elsewhere.
- **Low-code** — a lazy datasource proxy that fetches only when a bound field first renders.
- **Workflow engine** — a proxy step that enforces quota or auth before delegating to the real
  one.

## Related Patterns

- **Decorator** — identical wrapping shape; Decorator adds behavior, Proxy controls access.
- **Adapter** — changes the interface; Proxy keeps it identical.
- **Facade** — simplifies a subsystem; a proxy stands in for a single object.
