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
languages: [javascript, node-js, python, elixir, go]
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
