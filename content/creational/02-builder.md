---
id: builder
category: creational
sequence: 2
title: Builder
also_known_as: []
gof: true
intent: "Construct a complex object step by step, separating how it's built from what it becomes."
frequency: medium
difficulty: intermediate
tags: [creational, step-by-step, fluent-api, immutability, optional-params]
related: [abstract-factory, factory-method]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Assemble a complex object in steps, so the same construction process can produce different
results and the object never exists in a half-configured, invalid state.

Builder shines when a constructor would otherwise take a long list of mostly-optional arguments.
Instead of `new Thing(a, null, null, true, null, "x")`, you name each step and build up the
object piece by piece, then finalize it once.

## The Problem

A request object has a URL, method, headers, body, timeout, retries — most optional. A
single constructor becomes a wall of positional arguments nobody can read, and every new option
means another parameter and another `null` at every call site.

```
new HttpRequest("https://api", "POST", null, body, 30, 3, false, null);
// which arg is the timeout? what's that trailing null? nobody knows
```

A builder names each part and produces the finished request in one `build()`.

## Structure

Key Components:

- **Product** — the complex object being assembled (`HttpRequest`).
- **Builder** — collects the parts through named steps, often returning itself to chain.
- **build()** — validates and produces the finished, immutable product.
- **(Director)** — optional; encapsulates a common build recipe.

## When to Use

- An object has many optional or configurable parts.
- You want to avoid telescoping constructors (many overloads / long arg lists).
- Construction should happen in steps, possibly in different orders.
- You want the finished object to be immutable and always valid.

## Advantages and Disadvantages

### Advantages
- Readable, self-documenting construction (each step is named).
- The product can be immutable — set everything in `build()`, then freeze.
- The same steps can build different representations.

### Disadvantages
- More code than a plain constructor for simple objects.
- A mutable builder holds partial state until `build()`.
- Easy to over-apply to objects that don't need it.

## Common Mistakes

- **Using it for simple objects** — two or three fields don't need a builder; a constructor or
  literal is clearer.
- **A builder that returns an invalid product** — validate in `build()`, not scattered across
  setters.
- **Leaking the mutable builder as the result** — return the finished product, not the builder,
  so callers can't mutate it after build.

## Key Takeaways

- Builder trades a telescoping constructor for named, chainable steps.
- `build()` is the one place to validate and produce an immutable result.
- The fluent (`return this`) style reads well but isn't required.
- Languages with keyword arguments (Python) often don't need it at all.

## Implementations

Building an `HttpRequest` with several optional parts.

### JavaScript

**❌ Naive**

```js
// Telescoping constructor — positional, unreadable, null-padded.
class HttpRequest {
  constructor(url, method, headers, body, timeout, retries) {
    this.url = url; this.method = method; this.headers = headers;
    this.body = body; this.timeout = timeout; this.retries = retries;
  }
}

new HttpRequest("https://api", "POST", null, "{}", 30, 3);
// what does each argument mean at a glance? unclear.
```

**✅ Idiomatic**

```js
class HttpRequestBuilder {
  #req = { method: "GET", headers: {}, timeout: 10, retries: 0 };

  url(u) { this.#req.url = u; return this; }
  method(m) { this.#req.method = m; return this; }
  header(k, v) { this.#req.headers[k] = v; return this; }
  body(b) { this.#req.body = b; return this; }
  timeout(t) { this.#req.timeout = t; return this; }

  build() {
    if (!this.#req.url) throw new Error("url is required");
    return Object.freeze({ ...this.#req });   // immutable, validated
  }
}

const request = new HttpRequestBuilder()
  .url("https://api")
  .method("POST")
  .header("content-type", "application/json")
  .body("{}")
  .build();
```

**🧠 Tradeoff** — Returning `this` from each step gives the fluent chain; `build()` centralizes
validation and freezes the result so it can't be mutated afterward. The cost is a second class
and a mutable staging object; for a two-field object this ceremony isn't worth it.

### Node.js

**❌ Naive**

```js
// Concatenating SQL by hand — unreadable, and one step from an injection hole.
function findUsers(filters) {
  let sql = "SELECT * FROM users";
  if (filters.country) sql += ` WHERE country = '${filters.country}'`; // 🚨 interpolated value
  if (filters.limit) sql += ` LIMIT ${filters.limit}`;
  return sql;
}
```

**✅ Idiomatic (backend)**

```js
// A fluent builder assembles a parameterized query — values never touch the string.
class QueryBuilder {
  #table; #wheres = []; #params = []; #limit;
  from(t) { this.#table = t; return this; }
  where(col, value) {
    this.#params.push(value);
    this.#wheres.push(`${col} = $${this.#params.length}`);
    return this;
  }
  limit(n) { this.#limit = n; return this; }
  build() {
    let text = `SELECT * FROM ${this.#table}`;
    if (this.#wheres.length) text += ` WHERE ${this.#wheres.join(" AND ")}`;
    if (this.#limit) text += ` LIMIT ${this.#limit}`;
    return { text, values: this.#params }; // ready for node-postgres
  }
}

const query = new QueryBuilder().from("users").where("country", "US").limit(10).build();
// { text: "SELECT * FROM users WHERE country = $1 LIMIT 10", values: ["US"] }
```

**🧠 Tradeoff** — The builder keeps values in a params array and emits only placeholders, so the
query is safe by construction and reads in the order you think about it — this is the shape of Knex
and most query builders. The cost is the builder class; for a fixed one-line query a plain
parameterized string is simpler.

### Python

**❌ Naive**

```python
class HttpRequest:
    def __init__(self, url, method, headers, body, timeout, retries):
        self.url = url
        self.method = method
        self.headers = headers
        self.body = body
        self.timeout = timeout
        self.retries = retries

HttpRequest("https://api", "POST", None, "{}", 30, 3)  # positional soup
```

**✅ Idiomatic**

```python
from dataclasses import dataclass, field

# Python has keyword args and defaults, so a dataclass usually replaces the builder.
@dataclass(frozen=True)
class HttpRequest:
    url: str
    method: str = "GET"
    headers: dict[str, str] = field(default_factory=dict)
    body: str | None = None
    timeout: int = 10
    retries: int = 0

request = HttpRequest(
    url="https://api",
    method="POST",
    headers={"content-type": "application/json"},
    body="{}",
)
```

**🧠 Tradeoff** — Keyword arguments with defaults give you named, optional construction for free,
and `frozen=True` makes the result immutable — so idiomatic Python rarely needs a separate
builder class. Reach for a real builder only when construction is multi-step, stateful, or
conditional (assembling a query across method calls), not merely "many optional fields."

### Elixir

**❌ Naive**

```elixir
# A positional new/6 — unreadable and rigid.
defmodule HttpRequest do
  def new(url, method, headers, body, timeout, retries) do
    %{url: url, method: method, headers: headers,
      body: body, timeout: timeout, retries: retries}
  end
end
```

**✅ Idiomatic**

```elixir
defmodule HttpRequest do
  defstruct url: nil, method: "GET", headers: %{}, body: nil, timeout: 10, retries: 0

  def new(url), do: %HttpRequest{url: url}

  # Each step returns an updated struct — pipe them together.
  def method(req, m), do: %{req | method: m}
  def header(req, k, v), do: %{req | headers: Map.put(req.headers, k, v)}
  def body(req, b), do: %{req | body: b}

  def build(%HttpRequest{url: nil}), do: raise("url is required")
  def build(%HttpRequest{} = req), do: req
end

request =
  HttpRequest.new("https://api")
  |> HttpRequest.method("POST")
  |> HttpRequest.header("content-type", "application/json")
  |> HttpRequest.body("{}")
  |> HttpRequest.build()
```

**🧠 Tradeoff** — The pipe operator *is* the fluent builder: each step takes a struct and returns
a new one (data is immutable, so there's no mutable staging object at all). `build/1` pattern-
matches to validate. For simple cases you'd just write a struct literal or `struct!/2`; the step
functions earn their place when construction is conditional or spread across a pipeline.

### Go

**❌ Naive**

```go
// A constructor with a long positional signature.
func NewHttpRequest(url, method string, headers map[string]string,
	body string, timeout, retries int) *HttpRequest {
	return &HttpRequest{url, method, headers, body, timeout, retries}
}
```

**✅ Idiomatic**

```go
package httpreq

import "errors"

type Request struct {
	url     string
	method  string
	headers map[string]string
	body    string
	timeout int
}

type Builder struct{ r Request }

func New(url string) *Builder {
	return &Builder{r: Request{url: url, method: "GET", headers: map[string]string{}, timeout: 10}}
}

func (b *Builder) Method(m string) *Builder     { b.r.method = m; return b }
func (b *Builder) Header(k, v string) *Builder  { b.r.headers[k] = v; return b }
func (b *Builder) Body(s string) *Builder       { b.r.body = s; return b }

func (b *Builder) Build() (Request, error) {
	if b.r.url == "" {
		return Request{}, errors.New("url is required")
	}
	return b.r, nil
}
```

**🧠 Tradeoff** — The fluent builder works in Go, but the more common idiom is *functional
options* (`New(url, WithMethod("POST"), WithTimeout(30))`) — variadic `func(*Request)` values
that keep the constructor open to new options without growing its signature. Use the builder
when steps are ordered or validated together; use options for "many optional settings."

### CSharp

**❌ Naive**

```csharp
// Telescoping construction — positional, null-padded, unreadable.
var request = new HttpRequest("https://api", "POST", null, "{}", 30, 3);
// which int is the timeout? which is retries? the call site won't say

public sealed record HttpRequest(string Url, string Method,
    Dictionary<string, string>? Headers, string? Body, int Timeout, int Retries);
```

**✅ Idiomatic**

```csharp
var request = new HttpRequestBuilder("https://api")
    .Method("POST")
    .Header("content-type", "application/json")
    .Body("{}")
    .Build();

Console.WriteLine($"{request.Method} {request.Url}"); // POST https://api

// The product is an immutable record — nothing to mutate after Build().
public sealed record HttpRequest(string Url, string Method,
    IReadOnlyDictionary<string, string> Headers, string? Body, int Timeout);

// Primary constructor takes the one required part; every option is a named step.
public sealed class HttpRequestBuilder(string url)
{
    private string _method = "GET";
    private readonly Dictionary<string, string> _headers = new();
    private string? _body;
    private int _timeout = 10;

    public HttpRequestBuilder Method(string m) { _method = m; return this; }
    public HttpRequestBuilder Header(string k, string v) { _headers[k] = v; return this; }
    public HttpRequestBuilder Body(string b) { _body = b; return this; }
    public HttpRequestBuilder Timeout(int t) { _timeout = t; return this; }

    public HttpRequest Build() =>
        string.IsNullOrWhiteSpace(url)
            ? throw new InvalidOperationException("url is required")
            : new(url, _method, _headers.AsReadOnly(), _body, _timeout);
}
```

**🧠 Tradeoff** — like Python, C# covers "many optional fields" without a builder: object
initializers with `required` and `init` members give named, compiler-checked construction
(`new HttpRequest { Url = "…" }` won't compile without `Url`). So the fluent class above earns
its place only when construction is staged, conditional, or validated as a whole — which is
exactly what the builders you meet in .NET (`StringBuilder`, `ConfigurationBuilder`,
`HostApplicationBuilder`) are doing: accumulating state across calls, not naming parameters.

### Rust

**❌ Naive**

```rust
// A constructor with a long positional signature.
fn new_request(
    url: &str, method: &str, headers: Vec<(String, String)>,
    body: Option<String>, timeout: u32, retries: u32,
) -> HttpRequest {
    // ...
}

let request = new_request("https://api", "POST", vec![], Some("{}".into()), 30, 3);
// which u32 is the timeout? which is retries? nobody can tell
```

**✅ Idiomatic**

```rust
use std::collections::HashMap;

struct HttpRequest {
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    timeout: u32,
}

struct HttpRequestBuilder {
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    timeout: u32,
}

impl HttpRequestBuilder {
    fn new(url: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            method: "GET".into(),
            headers: HashMap::new(),
            body: None,
            timeout: 10,
        }
    }

    // Each step takes and returns the builder by value — chains without cloning.
    fn method(mut self, m: &str) -> Self { self.method = m.into(); self }
    fn header(mut self, k: &str, v: &str) -> Self {
        self.headers.insert(k.into(), v.into());
        self
    }
    fn body(mut self, b: &str) -> Self { self.body = Some(b.into()); self }

    // Validation lives here; an invalid request is unrepresentable.
    fn build(self) -> Result<HttpRequest, String> {
        if self.url.is_empty() {
            return Err("url is required".into());
        }
        Ok(HttpRequest {
            url: self.url, method: self.method, headers: self.headers,
            body: self.body, timeout: self.timeout,
        })
    }
}

fn main() {
    let request = HttpRequestBuilder::new("https://api")
        .method("POST")
        .header("content-type", "application/json")
        .body("{}")
        .build()
        .unwrap();
    println!("{} {}", request.method, request.url); // POST https://api
}
```

**🧠 Tradeoff** — Rust has no default or named arguments, so the builder is genuinely
load-bearing here — it's all over std (`Command`, `OpenOptions`, `thread::Builder`). The
consuming style (`mut self` in, `Self` out) chains without borrows and makes a used-up builder
unusable again, which the borrow checker enforces for free; switch to `&mut self` steps when you
need to apply steps conditionally in a loop. `build()` returning `Result` makes "invalid
request" a path the caller must handle, not a runtime surprise.

### Zig

**❌ Naive**

```zig
// A positional init — the call site is number soup.
fn newRequest(url: []const u8, method: []const u8, body: ?[]const u8,
    timeout_s: u32, retries: u32) HttpRequest {
    return .{ .url = url, .method = method, .body = body,
              .timeout_s = timeout_s, .retries = retries };
}

const request = newRequest("https://api", "POST", "{}", 30, 3);
// which u32 is the timeout? which is retries? the call won't tell you
```

**✅ Idiomatic**

```zig
const std = @import("std");

const Header = struct { name: []const u8, value: []const u8 };

const HttpRequest = struct {
    url: []const u8, // no default — omitting it is a compile error
    method: []const u8 = "GET",
    headers: []const Header = &.{},
    body: ?[]const u8 = null,
    timeout_s: u32 = 10,
    retries: u32 = 0,
};

pub fn main() void {
    // Named fields with defaults: the struct literal IS the builder.
    const request = HttpRequest{
        .url = "https://api",
        .method = "POST",
        .headers = &.{.{ .name = "content-type", .value = "application/json" }},
        .body = "{}",
    };
    std.debug.print("{s} {s} (timeout {d}s)\n", .{
        request.method, request.url, request.timeout_s,
    }); // POST https://api (timeout 10s)
}
```

**🧠 Tradeoff** — Zig's struct literal already does most of the builder's job: fields are named,
defaults fill the gaps, and a field without a default (like `url`) *must* appear or the program
doesn't compile — stronger than the JS builder's runtime throw, and it costs nothing. So don't
write a builder class here; that would be cargo-culting. A real builder struct earns its place
when construction is staged at runtime — say, accumulating headers in a growable list — and then
it carries an explicit allocator, a `deinit`, and a `try build()` returning an error union for
the paths that can fail.

### Java

**❌ Naive**

```java
// Telescoping constructor — positional, null-padded, unreadable.
var request = new HttpRequest("https://api", "POST", null, "{}", 30, 3);
// which int is the timeout? which is retries? the call site won't say
```

**✅ Idiomatic**

```java
import java.util.HashMap;
import java.util.Map;

// The product is a record — immutable, equality and accessors for free.
record HttpRequest(String url, String method, Map<String, String> headers,
                   String body, int timeout) {

    static Builder builder(String url) { return new Builder(url); }

    // The builder takes the one required part; every option is a named step.
    static final class Builder {
        private final String url;
        private String method = "GET";
        private final Map<String, String> headers = new HashMap<>();
        private String body;
        private int timeout = 10;

        Builder(String url) { this.url = url; }

        Builder method(String m) { this.method = m; return this; }
        Builder header(String k, String v) { headers.put(k, v); return this; }
        Builder body(String b) { this.body = b; return this; }
        Builder timeout(int t) { this.timeout = t; return this; }

        HttpRequest build() {
            if (url == null || url.isBlank()) throw new IllegalStateException("url is required");
            return new HttpRequest(url, method, Map.copyOf(headers), body, timeout);
        }
    }
}

public class Demo {
    public static void main(String[] args) {
        var request = HttpRequest.builder("https://api")
                .method("POST")
                .header("content-type", "application/json")
                .body("{}")
                .build();
        System.out.println(request.method() + " " + request.url()); // POST https://api
    }
}
```

**🧠 Tradeoff** — Java has no named or default arguments, so the fluent builder is genuinely
load-bearing — this is Effective Java's Item 2, and the JDK itself ships it
(`HttpRequest.newBuilder()`, `Stream.builder()`). Records changed the product's half of the
deal, not the builder's: `HttpRequest` gets immutability and equality for free, but its
canonical constructor is still positional, so the builder still supplies the names, defaults,
and the `Map.copyOf` defensive copy. In practice much of this class is generated — Lombok's
`@Builder` writes it from one annotation — which tells you two things: the ceremony is real,
and nobody wants to type it.

## Applications

Real-world uses of Builder (from the reference article):

- **HTTP request / query builders** — assemble URL, headers, body, params fluently.
- **UI construction** — a modal or form built up part by part.
- **SQL query builders** — `select().where().orderBy().build()`.
- **Configuration objects** — many optional settings with sane defaults.
- **Test data builders** — construct valid fixtures with a few overrides.

**In modern systems:**

- **Low-code** — assemble a form or page step by step from its JSON schema, validating each
  section as it attaches.
- **Multi-agent** — build a model request: system prompt + tools + memory + params composed before
  the call, with defaults filled in.
- **Workflow engine** — a fluent DSL that builds a workflow graph (`.step().then().branch()`).

## Related Patterns

- **Abstract Factory** — returns families of products immediately; Builder assembles one complex
  product over several steps.
- **Factory Method** — a single-call creator; Builder is multi-step and stateful.
- **Fluent Interface** — the chaining style Builder often uses, but a builder is about staged
  construction, not just chaining.
