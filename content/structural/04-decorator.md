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
languages: [javascript, python, elixir, go]
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

## Applications

Real-world uses of Decorator (from the reference article):

- **HTTP middleware** — logging, auth, compression wrapping a handler.
- **I/O streams** — buffering/encryption/compression layered on a base stream.
- **Caching / retry / rate-limit** wrappers around a service call.
- **UI components** — borders, scroll, shadow added by wrapping.
- **Feature toggles & i18n** — wrap a renderer to add behavior conditionally.

## Related Patterns

- **Proxy** — same wrapping shape; Proxy controls access, Decorator adds behavior.
- **Adapter** — changes the interface; Decorator keeps it.
- **Composite** — decorators are often a degenerate composite (one child); both rely on a shared
  component interface.
- **Chain of Responsibility** — also a chain of wrappers, but each may stop the request; a
  decorator always forwards.
