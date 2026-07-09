---
id: bridge
category: structural
sequence: 2
title: Bridge
also_known_as: [Handle/Body]
gof: true
intent: "Split an abstraction from its implementation so the two can vary independently."
frequency: low
difficulty: advanced
tags: [structural, decoupling, composition, two-dimensions, abstraction]
related: [abstract-factory, adapter, strategy]
languages: [javascript, python, elixir, go]
---

## Intent

When a thing varies in two independent directions at once, don't multiply subclasses for every
combination — put one direction behind an interface and *compose* the two. Bridge separates an
**abstraction** (what the caller uses) from its **implementation** (how it's done underneath) so
each side grows on its own.

## The Problem

You have shapes (circle, square) that must render on multiple backends (SVG, Canvas). Model it
with inheritance and you get a class per pair: `SvgCircle`, `CanvasCircle`, `SvgSquare`,
`CanvasSquare`. Add a shape or a backend and the count multiplies.

```
class SvgCircle {}   class CanvasCircle {}
class SvgSquare {}    class CanvasSquare {}
// add Triangle → 2 more; add WebGL → 3 more. shapes × backends explodes.
```

Bridge makes `Shape` hold a `Renderer`, so shapes and renderers vary separately: shapes × 1 +
renderers × 1, composed at runtime.

## Structure

Key Components:

- **Abstraction** — the high-level type the client uses (`Shape`), holding an implementor.
- **Refined Abstraction** — variants of the abstraction (`Circle`, `Square`).
- **Implementor** — the interface for the other dimension (`Renderer`).
- **Concrete Implementors** — `SvgRenderer`, `CanvasRenderer`.

## When to Use

- A type varies along two (or more) independent dimensions.
- You want to avoid a combinatorial explosion of subclasses.
- Both the abstraction and its implementation should be extensible separately.
- You want to switch implementations at runtime.

## Advantages and Disadvantages

### Advantages
- Abstraction and implementation evolve independently (no combinatorial subclasses).
- Swap the implementation at runtime.
- Cleaner than deep inheritance for two-axis variation.

### Disadvantages
- More indirection and up-front design; over-engineering for one dimension.
- The extra layer can be confusing if the two axes aren't truly independent.

## Common Mistakes

- **Using it when there's only one axis of change** — that's just Strategy or a plain interface.
- **Confusing it with Adapter** — Bridge is designed up front to separate two dimensions;
  Adapter reconciles two existing interfaces after the fact.
- **Leaking implementor details** through the abstraction, re-coupling the two sides.

## Key Takeaways

- Bridge = "prefer composition over inheritance" applied to two independent dimensions.
- The abstraction *has-a* implementor and delegates the how.
- Structurally close to Strategy; the intent is decoupling two hierarchies, not swapping one
  algorithm.

## Implementations

Shapes (abstraction) that render via a `Renderer` (implementation).

### JavaScript

**❌ Naive**

```js
// A class per (shape × backend) — multiplies with every new option.
class SvgCircle { draw() { return "<circle/>"; } }
class CanvasCircle { draw() { return "canvas.arc()"; } }
class SvgSquare { draw() { return "<rect/>"; } }
class CanvasSquare { draw() { return "canvas.rect()"; } }
```

**✅ Idiomatic**

```js
// Implementor dimension: renderers.
class SvgRenderer { circle() { return "<circle/>"; } square() { return "<rect/>"; } }
class CanvasRenderer { circle() { return "canvas.arc()"; } square() { return "canvas.rect()"; } }

// Abstraction dimension: shapes hold a renderer and delegate the "how".
class Circle {
  constructor(renderer) { this.renderer = renderer; }
  draw() { return this.renderer.circle(); }
}
class Square {
  constructor(renderer) { this.renderer = renderer; }
  draw() { return this.renderer.square(); }
}

// Compose the two axes freely:
new Circle(new SvgRenderer()).draw();     // <circle/>
new Square(new CanvasRenderer()).draw();  // canvas.rect()
```

**🧠 Tradeoff** — Shapes and renderers now vary independently: adding a Triangle is one class,
adding WebGL is one renderer, no combinatorial blowup. The cost is the up-front split — worth it
only when both axes really change; for a single axis this is just needless indirection.

### Python

**❌ Naive**

```python
class SvgCircle:
    def draw(self): return "<circle/>"
class CanvasCircle:
    def draw(self): return "canvas.arc()"
class SvgSquare:
    def draw(self): return "<rect/>"
class CanvasSquare:
    def draw(self): return "canvas.rect()"
```

**✅ Idiomatic**

```python
from typing import Protocol

class Renderer(Protocol):
    def circle(self) -> str: ...
    def square(self) -> str: ...

class SvgRenderer:
    def circle(self) -> str: return "<circle/>"
    def square(self) -> str: return "<rect/>"

class CanvasRenderer:
    def circle(self) -> str: return "canvas.arc()"
    def square(self) -> str: return "canvas.rect()"

class Circle:
    def __init__(self, renderer: Renderer): self._r = renderer
    def draw(self) -> str: return self._r.circle()

class Square:
    def __init__(self, renderer: Renderer): self._r = renderer
    def draw(self) -> str: return self._r.square()

Circle(SvgRenderer()).draw()      # <circle/>
Square(CanvasRenderer()).draw()   # canvas.rect()
```

**🧠 Tradeoff** — The `Renderer` `Protocol` is the bridge; a shape composes one and delegates.
Structurally identical to the JS version — Python's contribution is the type-checked implementor
contract without forcing an inheritance relationship between renderers.

### Elixir

**❌ Naive**

```elixir
defmodule SvgCircle do
  def draw, do: "<circle/>"
end
defmodule CanvasCircle do
  def draw, do: "canvas.arc()"
end
# ...one module per shape×backend pair
```

**✅ Idiomatic**

```elixir
# Implementor: a renderer behaviour.
defmodule Renderer do
  @callback circle() :: String.t()
  @callback square() :: String.t()
end

defmodule SvgRenderer do
  @behaviour Renderer
  @impl true
  def circle, do: "<circle/>"
  @impl true
  def square, do: "<rect/>"
end

# Abstraction: a shape struct carrying its renderer module.
defmodule Shape do
  defstruct [:kind, :renderer]

  def draw(%Shape{kind: :circle, renderer: r}), do: r.circle()
  def draw(%Shape{kind: :square, renderer: r}), do: r.square()
end

Shape.draw(%Shape{kind: :circle, renderer: SvgRenderer})
```

**🧠 Tradeoff** — The renderer behaviour is the implementor axis (a module), and a `Shape` struct
holds which renderer to use; `draw/1` pattern-matches the shape kind and delegates. Both axes
extend independently — a new renderer module or a new `draw/1` clause — without a class matrix.

### Go

**❌ Naive**

```go
type SvgCircle struct{}
func (SvgCircle) Draw() string { return "<circle/>" }
type CanvasCircle struct{}
func (CanvasCircle) Draw() string { return "canvas.arc()" }
// ...struct per pair
```

**✅ Idiomatic**

```go
package shapes

// Implementor axis.
type Renderer interface {
	Circle() string
	Square() string
}

type SvgRenderer struct{}
func (SvgRenderer) Circle() string { return "<circle/>" }
func (SvgRenderer) Square() string { return "<rect/>" }

type CanvasRenderer struct{}
func (CanvasRenderer) Circle() string { return "canvas.arc()" }
func (CanvasRenderer) Square() string { return "canvas.rect()" }

// Abstraction axis — each shape embeds a Renderer.
type Circle struct{ R Renderer }
func (c Circle) Draw() string { return c.R.Circle() }

type Square struct{ R Renderer }
func (s Square) Draw() string { return s.R.Square() }

// Circle{R: SvgRenderer{}}.Draw()  →  <circle/>
```

**🧠 Tradeoff** — A shape struct holds a `Renderer` interface value and delegates; the two axes
compose without inheritance (Go has none anyway). Because interfaces are implicit, adding a
renderer or a shape is fully independent — the canonical "composition over a subclass matrix."

## Applications

Real-world uses of Bridge (from the reference article):

- **Rendering** — shapes/UI over multiple graphics backends (SVG, Canvas, WebGL).
- **Devices & remotes** — a remote abstraction over TV/radio implementations.
- **Persistence** — a repository abstraction over SQL/NoSQL drivers.
- **Notifications** — message types over delivery channels.
- **Cross-platform toolkits** — one widget API over native platform implementations.

## Related Patterns

- **Abstract Factory** — can create matched abstraction+implementor pairs for a Bridge.
- **Adapter** — reconciles interfaces after the fact; Bridge is planned decoupling up front.
- **Strategy** — one-axis behavior swap; Bridge decouples two whole hierarchies.
