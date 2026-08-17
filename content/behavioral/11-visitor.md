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
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
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

### CSharp

**❌ Naive**

```csharp
// Every new operation adds a method to every shape.
public sealed class Circle(double r)
{
    public double Area() => Math.PI * r * r;
    public string ToSvg() => $"<circle r=\"{r}\"/>"; // and BoundingBox(), ToJson()... it grows
}

public sealed class Square(double s)
{
    public double Area() => s * s;
    public string ToSvg() => $"<rect width=\"{s}\"/>";
}
```

**✅ Idiomatic**

```csharp
// Shapes accept a visitor; each operation is its own visitor class.
Shape[] shapes = [new Circle(2), new Square(3)];
var area = new AreaVisitor();
var svg = new SvgVisitor();
foreach (var s in shapes)
    Console.WriteLine($"{s.Accept(area)} {s.Accept(svg)}");
// 12.566... <circle r="2"/>
// 9 <rect width="3"/>

public interface IVisitor<out T>
{
    T VisitCircle(Circle c);
    T VisitSquare(Square s);
}

public abstract record Shape
{
    public abstract T Accept<T>(IVisitor<T> v);
}

public sealed record Circle(double R) : Shape
{
    public override T Accept<T>(IVisitor<T> v) => v.VisitCircle(this);
}

public sealed record Square(double S) : Shape
{
    public override T Accept<T>(IVisitor<T> v) => v.VisitSquare(this);
}

public sealed class AreaVisitor : IVisitor<double>
{
    public double VisitCircle(Circle c) => Math.PI * c.R * c.R;
    public double VisitSquare(Square s) => s.S * s.S;
}

public sealed class SvgVisitor : IVisitor<string>
{
    public string VisitCircle(Circle c) => $"<circle r=\"{c.R}\"/>";
    public string VisitSquare(Square s) => $"<rect width=\"{s.S}\"/>";
}
```

**🧠 Tradeoff** — the generic `Accept<T>` lets each operation pick its own result type; this is
the shape of Roslyn's `CSharpSyntaxVisitor<TResult>`, C#'s most famous visitor. But be honest
about the alternative: on a sealed hierarchy, a pattern-matching switch expression
(`shape switch { Circle c => ..., Square s => ... }`) puts one operation in one place with none
of the `Accept` ceremony. What the interface still buys is exhaustiveness — a new shape breaks
every visitor at compile time, while the switch needs a `_` arm or a runtime throw. Few
operations: match. Many operations over a stable tree: Visitor.

### Rust

**❌ Naive**

```rust
// Every new operation grows this trait — and edits every shape's impl.
trait Shape {
    fn area(&self) -> f64;
    fn to_svg(&self) -> String;
    // bounding_box()? to_json()? each addition touches every impl below
}

struct Circle { r: f64 }
impl Shape for Circle {
    fn area(&self) -> f64 { std::f64::consts::PI * self.r * self.r }
    fn to_svg(&self) -> String { format!(r#"<circle r="{}"/>"#, self.r) }
}

struct Square { s: f64 }
impl Shape for Square {
    fn area(&self) -> f64 { self.s * self.s }
    fn to_svg(&self) -> String { format!(r#"<rect width="{}"/>"#, self.s) }
}
```

**✅ Idiomatic**

```rust
// A closed set of shapes is an enum; each operation is one function with an
// exhaustive match. This IS Rust's Visitor — no accept(), no double dispatch.
enum Shape {
    Circle { r: f64 },
    Square { s: f64 },
}

fn area(shape: &Shape) -> f64 {
    match shape {
        Shape::Circle { r } => std::f64::consts::PI * r * r,
        Shape::Square { s } => s * s,
    }
}

// A new operation is a new function — the shapes never change.
fn to_svg(shape: &Shape) -> String {
    match shape {
        Shape::Circle { r } => format!(r#"<circle r="{r}"/>"#),
        Shape::Square { s } => format!(r#"<rect width="{s}"/>"#),
    }
}

fn main() {
    let shapes = [Shape::Circle { r: 2.0 }, Shape::Square { s: 3.0 }];
    for s in &shapes {
        println!("{} {}", area(s), to_svg(s));
        // 12.566... <circle r="2"/>
        // 9 <rect width="3"/>
    }
}
```

**🧠 Tradeoff** — Rust barely needs the pattern: an enum plus exhaustive `match` already gives
"one operation, one place, shapes untouched", and the compiler turns Visitor's weak spot into a
strength — add a `Triangle` variant and every `match` fails to compile until it's handled, a
checklist instead of a runtime surprise. What you give up is openness: downstream crates can't
add shapes to your enum. The trait-object route (an `accept` on `dyn Shape`) buys that openness
back, and crates like `syn` ship trait visitors for huge ASTs where default walk methods matter.
For a closed set, reach for `match` first.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

// Every new operation adds a method to every shape type.
const Circle = struct {
    r: f64,
    fn area(self: Circle) f64 {
        return std.math.pi * self.r * self.r;
    }
    fn toSvg(self: Circle) void {
        std.debug.print("<circle r=\"{d}\"/>\n", .{self.r});
    }
};

const Square = struct {
    s: f64,
    fn area(self: Square) f64 {
        return self.s * self.s;
    }
    fn toSvg(self: Square) void {
        std.debug.print("<rect width=\"{d}\"/>\n", .{self.s});
    }
};
```

**✅ Idiomatic**

```zig
const std = @import("std");

// A closed set of shapes is a tagged union; each operation is one function with
// an exhaustive switch. This is Zig's Visitor — no accept, no vtables.
const Shape = union(enum) {
    circle: struct { r: f64 },
    square: struct { s: f64 },
};

fn area(shape: Shape) f64 {
    return switch (shape) {
        .circle => |c| std.math.pi * c.r * c.r,
        .square => |s| s.s * s.s,
    };
}

// A new operation is a new function — the union never changes.
fn printSvg(shape: Shape) void {
    switch (shape) {
        .circle => |c| std.debug.print("<circle r=\"{d}\"/>\n", .{c.r}),
        .square => |s| std.debug.print("<rect width=\"{d}\"/>\n", .{s.s}),
    }
}

pub fn main() void {
    const shapes = [_]Shape{
        .{ .circle = .{ .r = 2 } },
        .{ .square = .{ .s = 3 } },
    };
    for (shapes) |s| {
        std.debug.print("{d} -> ", .{area(s)}); // 12.566... then 9
        printSvg(s);                            // <circle r="2"/> then <rect width="3"/>
    }
}
```

**🧠 Tradeoff** — same verdict as Rust, and worth saying plainly: in Zig the tagged union *is*
the pattern. A `switch` over a `union(enum)` must be exhaustive, so adding a `.triangle` breaks
every operation at compile time — the "edit every visitor" cost, converted into a compiler
checklist. There's no double dispatch because there's nothing to dispatch: the tag is right
there in the value. The classic OO Visitor only resurfaces if the shape set must stay open at
runtime — then you're building `*anyopaque` + function-pointer vtables by hand, and you should
be sure the openness is worth it.

### Java

**❌ Naive**

```java
// Every new operation adds a method to every shape.
class Circle {
    final double r;
    Circle(double r) { this.r = r; }
    double area() { return Math.PI * r * r; }
    String toSvg() { return "<circle r=\"%s\"/>".formatted(r); } // and boundingBox(), toJson()... it grows
}

class Square {
    final double s;
    Square(double s) { this.s = s; }
    double area() { return s * s; }
    String toSvg() { return "<rect width=\"%s\"/>".formatted(s); }
}
```

**✅ Idiomatic**

```java
import java.util.List;

// A closed set of shapes is a sealed interface; each operation is one
// exhaustive pattern-matching switch. This is modern Java's Visitor — no accept.
sealed interface Shape permits Circle, Square {}
record Circle(double r) implements Shape {}
record Square(double s) implements Shape {}

class Operations {
    static double area(Shape shape) {
        return switch (shape) {
            case Circle c -> Math.PI * c.r() * c.r();
            case Square sq -> sq.s() * sq.s();
        };
    }

    // A new operation is a new method — the shapes never change.
    static String toSvg(Shape shape) {
        return switch (shape) {
            case Circle c -> "<circle r=\"%s\"/>".formatted(c.r());
            case Square sq -> "<rect width=\"%s\"/>".formatted(sq.s());
        };
    }
}

// The classic double dispatch survives as the OPEN-set form: when shapes must
// be addable outside this file, accept()/visit() replaces the sealed switch.
interface Visitor<T> {
    T visitCircle(Circle c);
    T visitSquare(Square s);
}
// each shape then adds:  <T> T accept(Visitor<T> v) { return v.visitCircle(this); }

public class Demo {
    public static void main(String[] args) {
        var shapes = List.of(new Circle(2), new Square(3));
        for (Shape s : shapes)
            System.out.println(Operations.area(s) + " " + Operations.toSvg(s));
        // 12.566... <circle r="2.0"/>
        // 9.0 <rect width="3.0"/>
    }
}
```

**🧠 Tradeoff** — Be honest: sealed interfaces plus pattern-matching `switch` (Java 21) took
over Visitor's job for closed hierarchies. One operation is one exhaustive `switch`; add a
`Triangle` to the sealed set and every switch fails to compile until it handles it — the same
guarantee the `Visitor` interface used to buy with an `accept` method on every node and a
`visitX` on every operation. The classic double dispatch is now the *open-set* form: reach for
it when node types must be addable outside your sealed file, which is why javac's
`com.sun.source` tree visitors and ASM's `ClassVisitor` still work that way. GoF wrote Visitor
for languages without pattern matching; Java has it now, so start with the switch.

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
