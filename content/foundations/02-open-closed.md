---
id: open-closed
category: foundations
kind: principle
sequence: 2
title: Open/Closed Principle
also_known_as: [OCP]
gof: false
intent: "Software entities should be open for extension but closed for modification."
frequency: high
difficulty: intermediate
tags: [solid, ocp, extensibility, polymorphism, plugin]
related: [single-responsibility, dependency-inversion, strategy, factory-method]
languages: [javascript, python, elixir, go]
---

## The Principle

> Open for extension, closed for modification.

You should be able to add new behavior without editing code that already works. In practice that
means new requirements arrive as *new* code (a new class, function, or module), not as another
`else if` bolted onto a function you keep reopening and re-testing.

The lever is polymorphism: depend on an abstraction, and add implementations behind it.

## The Smell

A function you edit every time a new case appears — the growing `switch`:

```
function area(shape) {
  if (shape.type === "circle") return Math.PI * shape.r ** 2;
  else if (shape.type === "square") return shape.side ** 2;
  // add "triangle" → reopen and edit this function again, re-test everything
}
```

Every new shape modifies `area`, risking the cases that already worked.

## Why It Matters

- New features don't put existing, tested code at risk.
- Extensions can live in their own files, even their own packages/plugins.
- Fewer merge conflicts and regressions around a hot central function.

## Benefits and Cautions

### Benefits
- Add behavior by adding code, not editing proven code.
- Encourages stable abstractions and pluggable implementations.

### Cautions
- Guessing the wrong extension axis adds abstraction you never use.
- Apply it where change actually happens — don't pre-abstract everything.

## Common Mistakes

- **Abstracting speculatively** — building plugin points for variation that never comes.
- **Leaving the switch** — adding an interface but still branching on a type tag elsewhere.
- **Closing the wrong axis** — making shapes pluggable when it's the *operations* that vary
  (that's a Visitor problem).

## Key Takeaways

- OCP = extend by adding, not by editing.
- Achieved via polymorphism / an abstraction you add implementations behind.
- Wait for the second or third variation before choosing the extension axis.

## Implementations

Computing shape area without editing a central function per new shape.

### JavaScript

**❌ Naive**

```js
// Reopened for every new shape.
function area(shape) {
  if (shape.type === "circle") return Math.PI * shape.r ** 2;
  else if (shape.type === "square") return shape.side ** 2;
  throw new Error(`Unknown shape: ${shape.type}`);
}
```

**✅ Idiomatic**

```js
// Each shape owns its area; `area` never changes as shapes are added.
class Circle { constructor(r) { this.r = r; } area() { return Math.PI * this.r ** 2; } }
class Square { constructor(s) { this.s = s; } area() { return this.s ** 2; } }

function totalArea(shapes) { return shapes.reduce((sum, s) => sum + s.area(), 0); }

// New shape = new class, no edit to totalArea:
class Triangle { constructor(b, h) { this.b = b; this.h = h; } area() { return 0.5 * this.b * this.h; } }
```

**🧠 Note** — `totalArea` depends on the `area()` abstraction, so a Triangle plugs in without
touching it. The `switch` is gone. The judgment: this pays off because shapes clearly vary; if
only ever two existed and never grew, the branch would be simpler.

### Python

**❌ Naive**

```python
def area(shape):
    if shape["type"] == "circle":
        return 3.14159 * shape["r"] ** 2
    elif shape["type"] == "square":
        return shape["side"] ** 2
    raise ValueError("unknown shape")
```

**✅ Idiomatic**

```python
from typing import Protocol

class Shape(Protocol):
    def area(self) -> float: ...

class Circle:
    def __init__(self, r: float): self.r = r
    def area(self) -> float: return 3.14159 * self.r ** 2

class Square:
    def __init__(self, side: float): self.side = side
    def area(self) -> float: return self.side ** 2

def total_area(shapes: list[Shape]) -> float:
    return sum(s.area() for s in shapes)

# Add Triangle without editing total_area.
```

**🧠 Note** — A `Shape` `Protocol` fixes the extension point; new shapes just implement `area`.
`functools.singledispatch` is another Pythonic OCP tool — register a new type's handler without
editing the generic function.

### Elixir

**❌ Naive**

```elixir
defmodule Geometry do
  def area(%{type: :circle, r: r}), do: 3.14159 * r * r
  def area(%{type: :square, side: s}), do: s * s
  # add a clause here for every new shape — editing this module each time
end
```

**✅ Idiomatic**

```elixir
# A protocol is dispatched on data type; new shapes add an impl, not an edit.
defprotocol Shape do
  def area(shape)
end

defmodule Circle do
  defstruct [:r]
end

defimpl Shape, for: Circle do
  def area(%Circle{r: r}), do: 3.14159 * r * r
end

defmodule Square do
  defstruct [:side]
end

defimpl Shape, for: Square do
  def area(%Square{side: s}), do: s * s
end

# A Triangle module + defimpl adds support with zero edits to existing code.
```

**🧠 Note** — Elixir *protocols* are the language's OCP mechanism: `defimpl Shape, for: Triangle`
extends `Shape.area/1` to a new type in a new file, without reopening the protocol or existing
implementations. This is cleaner than adding `area/1` clauses to one module.

### Go

**❌ Naive**

```go
func Area(shape Shape) float64 {
	switch shape.Type {
	case "circle":
		return math.Pi * shape.R * shape.R
	case "square":
		return shape.Side * shape.Side
	}
	return 0
}
```

**✅ Idiomatic**

```go
package geometry

import "math"

type Shape interface{ Area() float64 }

type Circle struct{ R float64 }

func (c Circle) Area() float64 { return math.Pi * c.R * c.R }

type Square struct{ Side float64 }

func (s Square) Area() float64 { return s.Side * s.Side }

func TotalArea(shapes []Shape) float64 {
	sum := 0.0
	for _, s := range shapes {
		sum += s.Area()
	}
	return sum
}
// A Triangle type with an Area() method plugs in — TotalArea is untouched.
```

**🧠 Note** — `TotalArea` depends on the `Shape` interface; any type with `Area()` satisfies it,
so new shapes extend the system without editing existing code. Go's implicit interfaces make the
extension point cheap — no shape needs to declare it implements `Shape`.

## Applications

Where OCP shows up in practice:

- **Payment/notification providers** — add a provider without editing the dispatcher.
- **Plugin architectures** — drop-in modules discovered at runtime.
- **Serializers/exporters** — new format = new implementation.
- **Validation rules** — add a rule object rather than another `if`.

## Related Principles & Patterns

- **Strategy / Factory Method** — the usual vehicles for OCP: swap or construct implementations.
- **Dependency Inversion** — depend on the abstraction OCP extends behind.
- **Visitor** — when it's the operations, not the types, that must stay open.
