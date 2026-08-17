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
languages: [javascript, python, elixir, go, csharp, rust, zig, java]
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

### CSharp

**❌ Naive**

```csharp
// Reopened for every new shape.
static double Area(Shape shape) => shape.Type switch
{
    "circle" => Math.PI * shape.R * shape.R,
    "square" => shape.Side * shape.Side,
    _ => throw new ArgumentException($"unknown shape: {shape.Type}"),
};
```

**✅ Idiomatic**

```csharp
List<IShape> shapes = [new Circle(2), new Square(3)];
Console.WriteLine(shapes.Sum(s => s.Area())); // 21.566370614359172

public interface IShape
{
    double Area();
}

public sealed record Circle(double R) : IShape
{
    public double Area() => Math.PI * R * R;
}

public sealed record Square(double Side) : IShape
{
    public double Area() => Side * Side;
}

// New shape = new record; the Sum above never changes.
public sealed record Triangle(double B, double H) : IShape
{
    public double Area() => 0.5 * B * H;
}
```

**🧠 Note** — Records with primary constructors make each shape a two-liner, and LINQ's `Sum`
is the whole `TotalArea`. C# could also close the set — a sealed hierarchy plus a pattern-match
`switch` — but that puts the central switch back; pick the interface when new shapes should
arrive as new files, the switch when the set genuinely won't grow.

### Rust

**❌ Naive**

```rust
enum Shape {
    Circle { r: f64 },
    Square { side: f64 },
}

// Adding a Triangle reopens this match — and every other match on Shape.
fn area(shape: &Shape) -> f64 {
    match shape {
        Shape::Circle { r } => std::f64::consts::PI * r * r,
        Shape::Square { side } => side * side,
    }
}
```

**✅ Idiomatic**

```rust
trait Shape {
    fn area(&self) -> f64;
}

struct Circle {
    r: f64,
}
impl Shape for Circle {
    fn area(&self) -> f64 {
        std::f64::consts::PI * self.r * self.r
    }
}

struct Square {
    side: f64,
}
impl Shape for Square {
    fn area(&self) -> f64 {
        self.side * self.side
    }
}

fn total_area(shapes: &[Box<dyn Shape>]) -> f64 {
    shapes.iter().map(|s| s.area()).sum()
}

fn main() {
    let shapes: Vec<Box<dyn Shape>> = vec![
        Box::new(Circle { r: 2.0 }),
        Box::new(Square { side: 3.0 }),
    ];
    println!("{}", total_area(&shapes)); // 21.566370614359172
}
// A Triangle with `impl Shape` plugs in — total_area is untouched.
```

**🧠 Note** — Be fair to the "naive" version: in Rust an enum with an exhaustive `match` is
often the *right* call for a closed set, because adding a variant makes the compiler walk you
to every match that needs updating — modification, but safe modification. Reach for the trait
(and pay the `Box<dyn>` heap allocation and dynamic dispatch) when shapes must come from code
you don't own — other crates can `impl Shape` but can't add variants to your enum.

### Zig

**❌ Naive**

```zig
const std = @import("std");

const Shape = union(enum) {
    circle: struct { r: f64 },
    square: struct { side: f64 },
};

// Adding a triangle reopens this switch — and every other switch on Shape.
fn area(shape: Shape) f64 {
    return switch (shape) {
        .circle => |c| std.math.pi * c.r * c.r,
        .square => |s| s.side * s.side,
    };
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// Zig has no interfaces — the open contract is the two-field vtable
// idiom (context pointer + function pointer), like std.mem.Allocator.
const Shape = struct {
    ctx: *const anyopaque,
    areaFn: *const fn (ctx: *const anyopaque) f64,

    pub fn area(self: Shape) f64 {
        return self.areaFn(self.ctx);
    }
};

const Circle = struct {
    r: f64,

    pub fn shape(self: *const Circle) Shape {
        return .{ .ctx = self, .areaFn = area };
    }
    fn area(ctx: *const anyopaque) f64 {
        const self: *const Circle = @ptrCast(@alignCast(ctx));
        return std.math.pi * self.r * self.r;
    }
};

const Square = struct {
    side: f64,

    pub fn shape(self: *const Square) Shape {
        return .{ .ctx = self, .areaFn = area };
    }
    fn area(ctx: *const anyopaque) f64 {
        const self: *const Square = @ptrCast(@alignCast(ctx));
        return self.side * self.side;
    }
};

fn totalArea(shapes: []const Shape) f64 {
    var sum: f64 = 0;
    for (shapes) |s| sum += s.area();
    return sum;
}

pub fn main() void {
    const circle = Circle{ .r = 2 };
    const square = Square{ .side = 3 };
    const shapes = [_]Shape{ circle.shape(), square.shape() };
    std.debug.print("{d}\n", .{totalArea(&shapes)}); // 21.566370614359172
}
// A Triangle that hands out a Shape plugs in — totalArea is untouched.
```

**🧠 Note** — Same honesty as Rust: the tagged union + exhaustive `switch` *is* idiomatic Zig
for a closed set — zero indirection, and the compiler flags every unhandled case. The vtable
buys openness at the cost of a pointer indirection and the `@ptrCast` boilerplate, so reach
for it only when new shapes must arrive without touching the switch. When the set is known at
compile time, `anytype`/comptime generics give the same openness with static dispatch.

### Java

**❌ Naive**

```java
// One central switch, reopened for every new shape.
sealed interface Shape permits Circle, Square {}
record Circle(double r) implements Shape {}
record Square(double side) implements Shape {}

class Geometry {
    static double area(Shape shape) {
        return switch (shape) {
            case Circle c -> Math.PI * c.r() * c.r();
            case Square s -> s.side() * s.side();
        };
    }
    // adding a Triangle reopens this switch — and every other switch on Shape
}
```

**✅ Idiomatic**

```java
import java.util.List;

// Each shape owns its area; nothing central changes as shapes are added.
interface Shape {
    double area();
}

record Circle(double r) implements Shape {
    public double area() { return Math.PI * r * r; }
}

record Square(double side) implements Shape {
    public double area() { return side * side; }
}

public class Demo {
    public static void main(String[] args) {
        List<Shape> shapes = List.of(new Circle(2), new Square(3));
        System.out.println(shapes.stream().mapToDouble(Shape::area).sum()); // 21.566370614359172
    }
}
// New shape = new record implementing Shape; the stream never changes.
```

**🧠 Note** — same honesty Rust asks for: the "naive" version is a legitimate modern-Java form.
`sealed` declares the set closed, and the pattern-matching `switch` is exhaustive with no
`default` — add `Triangle` to `permits` and the compiler walks you to every switch that must
now handle it. That's modification, but safe, compiler-guided modification. Choose the open
interface when new shapes should arrive from packages you don't control; choose sealed + switch
when the set genuinely won't grow and it's the *operations* that vary.

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
