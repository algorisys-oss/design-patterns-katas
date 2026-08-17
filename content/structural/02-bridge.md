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
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
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

### Node.js

**❌ Naive**

```js
// A class per (message type × transport) — the grid grows with every addition.
class AlertEmail { send() { /* format alert, send email */ } }
class AlertSms { send() { /* format alert, send sms */ } }
class ReminderEmail { send() { /* … */ } }
class ReminderSms { send() { /* … */ } }
```

**✅ Idiomatic (backend)**

```js
// Implementor axis: transports.
class EmailTransport { deliver(to, text) { return sendEmail(to, text); } }
class SmsTransport { deliver(to, text) { return sendSms(to, text); } }

// Abstraction axis: message types hold a transport and format the body.
class Alert {
  constructor(transport) { this.transport = transport; }
  send(to, subject) { return this.transport.deliver(to, `🚨 ALERT: ${subject}`); }
}
class Reminder {
  constructor(transport) { this.transport = transport; }
  send(to, subject) { return this.transport.deliver(to, `Reminder: ${subject}`); }
}

// Compose the axes freely:
new Alert(new SmsTransport()).send(user.phone, "server down");
new Reminder(new EmailTransport()).send(user.email, "invoice due");
```

**🧠 Tradeoff** — Message types and transports now vary independently: a new message type is one
class, a new transport (Slack, push) is one class, with no combinatorial explosion. The split earns
its keep only because both axes really grow here — for a single transport it would be needless
indirection.

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

### CSharp

**❌ Naive**

```csharp
// A class per (shape × backend) — the grid grows with every addition.
public sealed class SvgCircle { public string Draw() => "<circle/>"; }
public sealed class CanvasCircle { public string Draw() => "canvas.arc()"; }
public sealed class SvgSquare { public string Draw() => "<rect/>"; }
public sealed class CanvasSquare { public string Draw() => "canvas.rect()"; }
```

**✅ Idiomatic**

```csharp
// Compose the two axes freely:
Console.WriteLine(new Circle(new SvgRenderer()).Draw());    // <circle/>
Console.WriteLine(new Square(new CanvasRenderer()).Draw()); // canvas.rect()

// Implementor axis: renderers.
public interface IRenderer
{
    string Circle();
    string Square();
}

public sealed class SvgRenderer : IRenderer
{
    public string Circle() => "<circle/>";
    public string Square() => "<rect/>";
}

public sealed class CanvasRenderer : IRenderer
{
    public string Circle() => "canvas.arc()";
    public string Square() => "canvas.rect()";
}

// Abstraction axis — each shape holds a renderer and delegates the "how".
public sealed class Circle(IRenderer renderer)
{
    public string Draw() => renderer.Circle();
}

public sealed class Square(IRenderer renderer)
{
    public string Draw() => renderer.Square();
}
```

**🧠 Tradeoff** — same split as the JS version, but `IRenderer` is compile-time checked and
primary constructors make each shape a three-line class. The warning carries over unchanged:
the bridge pays only when both axes really grow. With a single renderer, `Circle(IRenderer)`
is indirection with nothing to show for it.

### Rust

**❌ Naive**

```rust
// A struct per (shape × backend) — multiplies with every new option.
struct SvgCircle;
impl SvgCircle {
    fn draw(&self) -> String { "<circle/>".into() }
}
struct CanvasCircle;
impl CanvasCircle {
    fn draw(&self) -> String { "canvas.arc()".into() }
}
// ...and the same again for every square
```

**✅ Idiomatic**

```rust
// Implementor axis: the renderer trait.
trait Renderer {
    fn circle(&self) -> String;
    fn square(&self) -> String;
}

struct SvgRenderer;
impl Renderer for SvgRenderer {
    fn circle(&self) -> String { "<circle/>".into() }
    fn square(&self) -> String { "<rect/>".into() }
}

struct CanvasRenderer;
impl Renderer for CanvasRenderer {
    fn circle(&self) -> String { "canvas.arc()".into() }
    fn square(&self) -> String { "canvas.rect()".into() }
}

// Abstraction axis — each shape owns its renderer.
struct Circle<R: Renderer> {
    renderer: R,
}
impl<R: Renderer> Circle<R> {
    fn draw(&self) -> String { self.renderer.circle() }
}

struct Square<R: Renderer> {
    renderer: R,
}
impl<R: Renderer> Square<R> {
    fn draw(&self) -> String { self.renderer.square() }
}

fn main() {
    println!("{}", Circle { renderer: SvgRenderer }.draw());    // <circle/>
    println!("{}", Square { renderer: CanvasRenderer }.draw()); // canvas.rect()
}
```

**🧠 Tradeoff** — `Circle<R: Renderer>` monomorphizes the bridge: `Circle<SvgRenderer>` and
`Circle<CanvasRenderer>` are distinct, fully inlined types. That's free at runtime but binds
the backend at compile time — a scene mixing backends in one `Vec` needs `Box<dyn Renderer>`
fields instead, paying dynamic dispatch for the flexibility. Rust makes you name when the
axis binds; Go and JS decide it for you.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// A struct per (shape × backend) — the grid grows with every addition.
const SvgCircle = struct {
    fn draw(_: SvgCircle) []const u8 { return "<circle/>"; }
};
const CanvasCircle = struct {
    fn draw(_: CanvasCircle) []const u8 { return "canvas.arc()"; }
};
// ...and the same again for every square
```

**✅ Idiomatic**

```zig
const std = @import("std");

// Implementor axis: each renderer is a plain struct with the same method names.
const SvgRenderer = struct {
    fn circle(_: SvgRenderer) []const u8 { return "<circle/>"; }
    fn square(_: SvgRenderer) []const u8 { return "<rect/>"; }
};

const CanvasRenderer = struct {
    fn circle(_: CanvasRenderer) []const u8 { return "canvas.arc()"; }
    fn square(_: CanvasRenderer) []const u8 { return "canvas.rect()"; }
};

// Abstraction axis — a shape is generic over its renderer (comptime bridge).
fn Circle(comptime R: type) type {
    return struct {
        renderer: R,
        fn draw(self: @This()) []const u8 { return self.renderer.circle(); }
    };
}

fn Square(comptime R: type) type {
    return struct {
        renderer: R,
        fn draw(self: @This()) []const u8 { return self.renderer.square(); }
    };
}

pub fn main() void {
    const c = Circle(SvgRenderer){ .renderer = .{} };
    const s = Square(CanvasRenderer){ .renderer = .{} };
    std.debug.print("{s}\n{s}\n", .{ c.draw(), s.draw() }); // <circle/>  canvas.rect()
}
```

**🧠 Tradeoff** — the comptime-generic shape is a static bridge: the compiler checks each
renderer has `circle`/`square` at instantiation and inlines every call. Choosing a backend at
runtime needs the vtable idiom (`*anyopaque` context + function pointers) instead. And when
the renderer set is closed and small, a tagged union plus `switch` inside each shape is
plainer Zig — take the bridge only when the backend axis genuinely keeps growing.

### Java

**❌ Naive**

```java
// A class per (shape × backend) — the grid grows with every addition.
class SvgCircle { String draw() { return "<circle/>"; } }
class CanvasCircle { String draw() { return "canvas.arc()"; } }
class SvgSquare { String draw() { return "<rect/>"; } }
class CanvasSquare { String draw() { return "canvas.rect()"; } }
```

**✅ Idiomatic**

```java
// Implementor axis: renderers.
interface Renderer {
    String circle();
    String square();
}

class SvgRenderer implements Renderer {
    public String circle() { return "<circle/>"; }
    public String square() { return "<rect/>"; }
}

class CanvasRenderer implements Renderer {
    public String circle() { return "canvas.arc()"; }
    public String square() { return "canvas.rect()"; }
}

// Abstraction axis — each shape holds a renderer and delegates the "how".
abstract class Shape {
    protected final Renderer renderer;

    Shape(Renderer renderer) { this.renderer = renderer; }

    abstract String draw();
}

class Circle extends Shape {
    Circle(Renderer renderer) { super(renderer); }
    String draw() { return renderer.circle(); }
}

class Square extends Shape {
    Square(Renderer renderer) { super(renderer); }
    String draw() { return renderer.square(); }
}

public class Demo {
    public static void main(String[] args) {
        // Compose the two axes freely:
        System.out.println(new Circle(new SvgRenderer()).draw());    // <circle/>
        System.out.println(new Square(new CanvasRenderer()).draw()); // canvas.rect()
    }
}
```

**🧠 Tradeoff** — this is the GoF diagram verbatim, and Java holds it comfortably: an abstract
`Shape` owns a `Renderer` and the two hierarchies grow apart. AWT's peer classes were exactly
this bridge — one widget API over per-platform implementors. Modern Java can trim the ceremony
(a `record Circle(Renderer r)` per shape drops the abstract base), but the shape of the pattern
doesn't change. The real caution is older than the syntax: with one renderer, the split is
indirection with nothing to show for it.

## Applications

Real-world uses of Bridge (from the reference article):

- **Rendering** — shapes/UI over multiple graphics backends (SVG, Canvas, WebGL).
- **Devices & remotes** — a remote abstraction over TV/radio implementations.
- **Persistence** — a repository abstraction over SQL/NoSQL drivers.
- **Notifications** — message types over delivery channels.
- **Cross-platform toolkits** — one widget API over native platform implementations.

**In modern systems:**

- **Low-code** — the component abstraction sits apart from its renderer, so one JSON schema drives
  web, native, or PDF output by swapping the implementor.
- **Multi-agent** — the agent logic decoupled from the model backend (hosted, local, mock) behind
  an implementor interface, so you test the reasoning against a fake.
- **Workflow engine** — the workflow model decoupled from the execution backend (in-process,
  queue, serverless).

## Related Patterns

- **Abstract Factory** — can create matched abstraction+implementor pairs for a Bridge.
- **Adapter** — reconciles interfaces after the fact; Bridge is planned decoupling up front.
- **Strategy** — one-axis behavior swap; Bridge decouples two whole hierarchies.
