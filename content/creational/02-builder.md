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
languages: [javascript, node-js, python, elixir, go]
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

## Applications

Real-world uses of Builder (from the reference article):

- **HTTP request / query builders** — assemble URL, headers, body, params fluently.
- **UI construction** — a modal or form built up part by part.
- **SQL query builders** — `select().where().orderBy().build()`.
- **Configuration objects** — many optional settings with sane defaults.
- **Test data builders** — construct valid fixtures with a few overrides.

## Related Patterns

- **Abstract Factory** — returns families of products immediately; Builder assembles one complex
  product over several steps.
- **Factory Method** — a single-call creator; Builder is multi-step and stateful.
- **Fluent Interface** — the chaining style Builder often uses, but a builder is about staged
  construction, not just chaining.
