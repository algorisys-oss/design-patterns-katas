---
id: visitor
category: behavioral
sequence: 11
title: Visitor
also_known_as: []
gof: true
intent: "Add new operations over a set of object types without changing those types."
frequency: low
difficulty: advanced
tags: [behavioral, double-dispatch, operations, ast, open-closed]
related: [composite, interpreter, iterator]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

You have a fixed set of node types (shapes, AST nodes) and a growing set of operations over them
(area, render, export, optimize). Visitor lets you add a *new operation* as a single new object,
without touching every node class. The operation lives in the visitor; each node just accepts one.

It's the answer to the "expression problem" from one side: easy to add operations, at the cost of
making it harder to add node types.

## The Problem

You have `Circle` and `Square`. Today you compute area. Tomorrow you need SVG export, then a
bounding box, then a JSON dump. If each operation is a method on the shapes, every new operation
edits every shape class — the classes swell and unrelated concerns pile up inside them.

```
class Circle {
  area() { /* ... */ }
  toSvg() { /* ... */ }     // added later
  boundingBox() { /* ... */ } // and later — Circle keeps growing with unrelated ops
}
```

Visitor moves each operation out into its own visitor, so a new operation doesn't touch the shapes.

## Structure

Key Components:

- **Element** — the node types; each has `accept(visitor)`.
- **Visitor** — one method per element type (`visitCircle`, `visitSquare`).
- **Concrete Visitors** — one per operation (AreaVisitor, SvgVisitor).
- **Double dispatch** — `accept` calls back the visitor's type-specific method, so the right code
  runs based on *both* the element type and the visitor.

## When to Use

- The set of element types is stable, but you keep adding operations over them.
- Operations don't belong inside the elements (they'd bloat unrelated classes).
- You want related operations grouped together in one visitor.

## Advantages and Disadvantages

### Advantages
- Add a new operation without touching the element classes (Open/Closed for operations).
- Related behavior for all element types lives together in one visitor.

### Disadvantages
- Adding a new *element type* means editing every visitor — the opposite tradeoff.
- Verbose (double dispatch, `accept` boilerplate) in OO languages.
- Visitors may need access to element internals, weakening encapsulation.

## Common Mistakes

- **Using it when element types change often** — every new type breaks every visitor; then a method
  on the element is better.
- **Skipping double dispatch** — a single `switch` on type in one place is simpler than Visitor and
  often enough; only reach for Visitor when operations genuinely multiply.
- **Confusing "easy to add" axis** — Visitor makes operations easy and types hard; a plain method
  makes types easy and operations hard. Pick by what actually changes.

## Key Takeaways

- Visitor = add operations without editing the element classes, via double dispatch.
- Trades "easy to add types" for "easy to add operations" — choose by what varies.
- In functional languages, pattern matching gives Visitor's benefits without the ceremony.

## Implementations

Operations (area, SVG) over a stable shape hierarchy.

### JavaScript

**❌ Naive**

```js
// Every new operation adds a method to every shape.
class Circle {
  constructor(r) { this.r = r; }
  area() { return Math.PI * this.r ** 2; }
  toSvg() { return `<circle r="${this.r}"/>`; }   // and boundingBox(), toJson()... classes grow
}
class Square {
  constructor(s) { this.s = s; }
  area() { return this.s ** 2; }
  toSvg() { return `<rect width="${this.s}"/>`; }
}
```

**✅ Idiomatic (frontend)**

```js
// Shapes accept a visitor; operations are separate visitor objects.
class Circle { constructor(r) { this.r = r; } accept(v) { return v.circle(this); } }
class Square { constructor(s) { this.s = s; } accept(v) { return v.square(this); } }

const AreaVisitor = {
  circle: (c) => Math.PI * c.r ** 2,
  square: (s) => s.s ** 2,
};
const SvgVisitor = {
  circle: (c) => `<circle r="${c.r}"/>`,
  square: (s) => `<rect width="${s.s}"/>`,
};

const shapes = [new Circle(2), new Square(3)];
shapes.map(s => s.accept(AreaVisitor));   // areas — no shape method added
shapes.map(s => s.accept(SvgVisitor));    // SVG — added as a new visitor, shapes untouched
```

**🧠 Tradeoff** — `accept` dispatches to the visitor's per-type method (double dispatch), so a new
operation is a new visitor object and the shapes never change. The flip side: adding a `Triangle`
means adding a `triangle` method to *every* visitor. Use it when operations grow and types are
stable — the reverse of a normal method.

### Node.js

**❌ Naive**

```js
// One big switch that grows with every AST node AND every operation.
function evaluate(node) {
  switch (node.type) {
    case "num": return node.value;
    case "add": return evaluate(node.left) + evaluate(node.right);
    // serialize()? optimize()? each is another switch copied elsewhere
  }
}
```

**✅ Idiomatic (backend)**

```js
// AST nodes accept visitors; each operation (eval, print) is its own visitor.
const num = (value) => ({ accept: (v) => v.num(value) });
const add = (left, right) => ({ accept: (v) => v.add(left, right) });

const Evaluate = {
  num: (value) => value,
  add: (l, r) => l.accept(Evaluate) + r.accept(Evaluate),
};
const Print = {
  num: (value) => String(value),
  add: (l, r) => `(${l.accept(Print)} + ${r.accept(Print)})`,
};

const tree = add(num(1), add(num(2), num(3)));
tree.accept(Evaluate);   // 6
tree.accept(Print);      // "(1 + (2 + 3))"
```

**🧠 Tradeoff** — On the backend, Visitor is the classic way to run many operations (evaluate,
serialize, type-check, optimize) over an AST without stuffing them all into the node types. Each
operation is a self-contained visitor. The known cost — adding a node kind touches every visitor —
is why compilers weigh Visitor against a plain recursive switch or pattern matching.

### Python

**❌ Naive**

```python
class Circle:
    def __init__(self, r): self.r = r
    def area(self): return 3.14159 * self.r ** 2
    def to_svg(self): return f'<circle r="{self.r}"/>'  # every op edits every shape

class Square:
    def __init__(self, s): self.s = s
    def area(self): return self.s ** 2
    def to_svg(self): return f'<rect width="{self.s}"/>'
```

**✅ Idiomatic**

```python
from functools import singledispatch

class Circle:
    def __init__(self, r): self.r = r
class Square:
    def __init__(self, s): self.s = s

# Each operation is a single-dispatch function — add ops without touching the classes.
@singledispatch
def area(shape) -> float:
    raise NotImplementedError

@area.register
def _(shape: Circle) -> float: return 3.14159 * shape.r ** 2
@area.register
def _(shape: Square) -> float: return shape.s ** 2

area(Circle(2))   # dispatches on type — no accept() boilerplate
```

**🧠 Tradeoff** — `functools.singledispatch` gives Visitor's benefit — add an operation over a type
family in one place — without the `accept`/double-dispatch ceremony. Registering a new type's
handler is one function; adding a whole new operation is a new `singledispatch` function. It's the
Pythonic Visitor, and it reads far cleaner than the classic OO form.

### Elixir

**❌ Naive**

```elixir
# Operations bundled awkwardly; adding one means editing this module for every shape.
defmodule Shape do
  def area(%{type: :circle, r: r}), do: 3.14159 * r * r
  def area(%{type: :square, s: s}), do: s * s
  def to_svg(%{type: :circle, r: r}), do: ~s(<circle r="#{r}"/>)
  def to_svg(%{type: :square, s: s}), do: ~s(<rect width="#{s}"/>)
end
```

**✅ Idiomatic**

```elixir
# Each operation is its own module of pattern-matched clauses — the functional Visitor.
defmodule Circle, do: defstruct [:r]
defmodule Square, do: defstruct [:s]

defmodule Area do
  def visit(%Circle{r: r}), do: 3.14159 * r * r
  def visit(%Square{s: s}), do: s * s
end

defmodule Svg do
  def visit(%Circle{r: r}), do: ~s(<circle r="#{r}"/>)
  def visit(%Square{s: s}), do: ~s(<rect width="#{s}"/>)
end

Enum.map([%Circle{r: 2}, %Square{s: 3}], &Area.visit/1)
```

**🧠 Tradeoff** — Pattern matching *is* double dispatch here: each operation module matches on the
struct type, so adding an operation is a new module and the structs never change — Visitor's goal
with none of the `accept` boilerplate. A protocol (`defprotocol`) is the alternative when you want
the operation extensible per-type across files. Either way the functional form is far lighter than
the OO one.

### Go

**❌ Naive**

```go
type Circle struct{ R float64 }

func (c Circle) Area() float64  { return math.Pi * c.R * c.R }
func (c Circle) ToSVG() string  { return fmt.Sprintf(`<circle r="%g"/>`, c.R) }
// every new operation adds a method to every shape type
```

**✅ Idiomatic**

```go
package shapes

type Visitor interface {
	VisitCircle(c Circle) any
	VisitSquare(s Square) any
}

type Shape interface{ Accept(v Visitor) any }

type Circle struct{ R float64 }
func (c Circle) Accept(v Visitor) any { return v.VisitCircle(c) }

type Square struct{ S float64 }
func (s Square) Accept(v Visitor) any { return v.VisitSquare(s) }

// Each operation is a visitor:
type AreaVisitor struct{}
func (AreaVisitor) VisitCircle(c Circle) any { return math.Pi * c.R * c.R }
func (AreaVisitor) VisitSquare(s Square) any { return s.S * s.S }
```

**🧠 Tradeoff** — Go has no method overloading, so Visitor uses the explicit `Accept`/`VisitX`
double dispatch to add operations without editing the shapes. In practice Go code often prefers a
plain `switch v := shape.(type)` type switch — simpler, and fine when operations are few. Reach for
the full Visitor interface when you have many operations and want each grouped and type-checked.

## Applications

Where Visitor shows up in practice:

- **Frontend** — operations over a shape/scene graph (render, hit-test, export), DOM tree
  transforms.
- **Backend** — compilers and interpreters (evaluate, type-check, optimize, serialize an AST),
  document tree processing, static analysis.
- **Both** — any stable node hierarchy with a growing set of operations.

**In modern systems:**

- **Low-code** — one pass over the JSON node tree per operation: validate, compile to a form,
  estimate render cost — add an operation without touching the node types.
- **Workflow engine** — walk a workflow graph to type-check, price, or visualize it, each as its
  own visitor over the same node set.
- **Multi-agent** — traverse a plan tree to collect every tool it will call before executing any
  of them, e.g. for a dry-run or a permission check.

## Related Patterns

- **Composite** — Visitor commonly walks a composite tree, applying an operation to each node.
- **Interpreter** — Visitor is the usual way to add operations (evaluate, print) over an
  interpreter's expression tree.
- **Iterator** — traverses the structure that a visitor operates on.
