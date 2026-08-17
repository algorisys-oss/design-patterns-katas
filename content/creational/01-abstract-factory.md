---
id: abstract-factory
category: creational
sequence: 1
title: Abstract Factory
also_known_as: [Kit]
gof: true
intent: "Create families of related objects through one interface, without naming their concrete classes."
frequency: medium
difficulty: advanced
tags: [creational, object-families, consistency, cross-platform, decoupling]
related: [factory-method, builder, singleton]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Build a whole *family* of related objects that must go together — and swap the entire family in
one move — without the caller knowing the concrete classes.

Where Factory Method makes one product, Abstract Factory makes a matched set: a button *and* a
checkbox that share a look, a chair *and* a sofa in the same style. The guarantee it buys is
**consistency** — you can't accidentally mix a macOS button with a Windows checkbox.

## The Problem

Your UI toolkit renders buttons and checkboxes. Each must match the OS. If every call site
picks the OS control itself, nothing stops a macOS button rendering next to a Windows checkbox,
and switching platform means editing construction everywhere.

```
const button = os === "mac" ? new MacButton() : new WinButton();
const check  = os === "mac" ? new MacCheckbox() : new WinCheckbox();
// two decisions that must agree — but nothing enforces that they do
```

An abstract factory bundles "make a button" and "make a checkbox" into one platform object, so
one choice fixes the whole family.

## Structure

Key Components:

- **Abstract Factory** — the interface with a creator per product (`createButton`, `createCheckbox`).
- **Concrete Factories** — one per family (`MacFactory`, `WinFactory`).
- **Abstract Products** — the interfaces (`Button`, `Checkbox`).
- **Concrete Products** — the family members (`MacButton`, `WinCheckbox`, …).

## When to Use

- Objects come in families that must be used together and stay consistent.
- You want to swap the whole family (theme, platform, vendor) in one place.
- The system should be independent of how its products are created and composed.

## Advantages and Disadvantages

### Advantages
- Guarantees products from one family are used together.
- Swapping families is a single change (pick a different factory).
- Isolates concrete classes from the code that uses the products.

### Disadvantages
- Adding a new *product kind* means changing the factory interface and every factory.
- More types and indirection than Factory Method.
- Overkill when there's only one family or products don't need to match.

## Common Mistakes

- **Mixing families** — constructing individual products directly defeats the consistency
  guarantee; always go through one factory instance.
- **Confusing it with Factory Method** — one product vs a whole family. If you only make one
  kind of thing, you want Factory Method.
- **Exploding the interface** — every new product kind ripples through all factories; keep the
  family small, or reconsider the abstraction.

## Key Takeaways

- Abstract Factory = a factory of factories; it makes matched sets, not single objects.
- Its value is consistency across a family and one-line family swaps.
- Easy to add a new *family*, hard to add a new *product kind*.
- Often paired with Factory Method (each creator is one) and Singleton (the factory is shared).

## Implementations

A cross-platform UI factory making a matching `Button` and `Checkbox`.

### JavaScript

*Targets modern JavaScript (ES2015+).*

**❌ Naive**

```js
// Two independent decisions that must agree — but nothing makes them.
function buildUI(os) {
  const button = os === "mac" ? new MacButton() : new WinButton();
  const checkbox = os === "mac" ? new MacCheckbox() : new WinCheckbox();
  return { button, checkbox };
}
```

**✅ Idiomatic**

```js
// Each factory produces a whole consistent family.
class MacFactory {
  createButton() { return new MacButton(); }
  createCheckbox() { return new MacCheckbox(); }
}
class WinFactory {
  createButton() { return new WinButton(); }
  createCheckbox() { return new WinCheckbox(); }
}

// The app takes ONE factory and can't mix families.
function buildUI(factory) {
  return { button: factory.createButton(), checkbox: factory.createCheckbox() };
}

const factory = os === "mac" ? new MacFactory() : new WinFactory();
const ui = buildUI(factory);   // guaranteed all-Mac or all-Windows
```

**🧠 Tradeoff** — Passing the factory in makes the family choice explicit and singular; `buildUI`
never mentions a concrete product. Because JS has no interfaces, the "same family" contract is a
convention, not enforced — a typed language would make `Factory` an interface both concretes
implement.

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// Picking each client independently — nothing stops an AWS bucket paired with a GCP queue.
const storage = provider === "aws" ? new S3Storage(creds) : new GcsStorage(creds);
const queue = provider === "aws" ? new SqsQueue(creds) : new PubSubQueue(creds);
// two decisions that must agree, enforced by nothing
```

**✅ Idiomatic (backend)**

```js
// Each provider factory builds a matching family of clients from one config.
class AwsFactory {
  constructor(config) { this.config = config; }
  createStorage() { return new S3Storage(this.config); }
  createQueue() { return new SqsQueue(this.config); }
}
class GcpFactory {
  constructor(config) { this.config = config; }
  createStorage() { return new GcsStorage(this.config); }
  createQueue() { return new PubSubQueue(this.config); }
}

// The app is handed ONE factory at startup and can't mix clouds.
function buildInfra(factory) {
  return { storage: factory.createStorage(), queue: factory.createQueue() };
}

const factory = process.env.CLOUD === "aws" ? new AwsFactory(cfg) : new GcpFactory(cfg);
const infra = buildInfra(factory); // all-AWS or all-GCP, same creds and region
```

**🧠 Tradeoff** — On the backend the "family" is a set of provider clients that must share
credentials, region, and retry policy; the factory guarantees they're built consistently and lets
you swap clouds by swapping one object at startup. As always in JS the shared interface is
convention — a typed codebase would make `InfraFactory` an interface both providers implement.

### Python

*Targets Python 3.12.*

**❌ Naive**

```python
def build_ui(os):
    button = MacButton() if os == "mac" else WinButton()
    checkbox = MacCheckbox() if os == "mac" else WinCheckbox()
    return button, checkbox
```

**✅ Idiomatic**

```python
from typing import Protocol

class Button(Protocol):
    def render(self) -> str: ...

class Checkbox(Protocol):
    def render(self) -> str: ...

class UIFactory(Protocol):
    def create_button(self) -> Button: ...
    def create_checkbox(self) -> Checkbox: ...

class MacFactory:
    def create_button(self) -> Button: return MacButton()
    def create_checkbox(self) -> Checkbox: return MacCheckbox()

class WinFactory:
    def create_button(self) -> Button: return WinButton()
    def create_checkbox(self) -> Checkbox: return WinCheckbox()

def build_ui(factory: UIFactory):
    return factory.create_button(), factory.create_checkbox()

factory: UIFactory = MacFactory() if os == "mac" else WinFactory()
```

**🧠 Tradeoff** — `Protocol` gives you the family contract with static checking and no
inheritance — `MacFactory` doesn't subclass `UIFactory`, it just matches its shape. That keeps
the concretes decoupled while a type checker still catches a factory that forgot a method.

### Elixir

*Targets Elixir 1.18.*

**❌ Naive**

```elixir
def build_ui(os) do
  button = if os == :mac, do: MacButton.new(), else: WinButton.new()
  checkbox = if os == :mac, do: MacCheckbox.new(), else: WinCheckbox.new()
  {button, checkbox}
end
```

**✅ Idiomatic**

```elixir
# A factory is a module implementing a behaviour; each returns its family.
defmodule UIFactory do
  @callback create_button() :: term()
  @callback create_checkbox() :: term()
end

defmodule MacFactory do
  @behaviour UIFactory
  @impl true
  def create_button, do: MacButton.new()
  @impl true
  def create_checkbox, do: MacCheckbox.new()
end

defmodule App do
  # Takes a factory module — one choice fixes the whole family.
  def build_ui(factory) do
    {factory.create_button(), factory.create_checkbox()}
  end
end

factory = if os == :mac, do: MacFactory, else: WinFactory
App.build_ui(factory)
```

**🧠 Tradeoff** — The factory is a *module*, not an object, so you pass the module name and call
functions on it. The behaviour documents the family contract and warns at compile time if a
factory module misses a callback. No instance state means the factory is just a namespace of
constructors.

### Go

*Targets Go 1.26.*

**❌ Naive**

```go
func BuildUI(os string) (Button, Checkbox) {
	if os == "mac" {
		return &MacButton{}, &MacCheckbox{}
	}
	return &WinButton{}, &WinCheckbox{}
}
```

**✅ Idiomatic**

```go
package ui

type Button interface{ Render() string }
type Checkbox interface{ Render() string }

// The abstract factory: one interface, a creator per product.
type Factory interface {
	CreateButton() Button
	CreateCheckbox() Checkbox
}

type MacFactory struct{}

func (MacFactory) CreateButton() Button     { return &MacButton{} }
func (MacFactory) CreateCheckbox() Checkbox { return &MacCheckbox{} }

type WinFactory struct{}

func (WinFactory) CreateButton() Button     { return &WinButton{} }
func (WinFactory) CreateCheckbox() Checkbox { return &WinCheckbox{} }

// The app depends only on Factory, never on a concrete family.
func BuildUI(f Factory) (Button, Checkbox) {
	return f.CreateButton(), f.CreateCheckbox()
}
```

**🧠 Tradeoff** — Go's implicit interfaces make `MacFactory` and `WinFactory` satisfy `Factory`
just by having the methods. `BuildUI` takes the interface, so it's blind to the family — swap
the factory value and the whole set changes. Adding a new product kind, though, means editing
the `Factory` interface and every implementer.

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// Two independent decisions that must agree — but nothing makes them.
IButton button = os == "mac" ? new MacButton() : new WinButton();
ICheckbox checkbox = os == "mac" ? new MacCheckbox() : new WinCheckbox();
```

**✅ Idiomatic**

```csharp
// Top-level statements: the demo runs first, the types follow.
var os = "mac";

// ONE factory choice fixes the whole family.
IUIFactory factory = os == "mac" ? new MacFactory() : new WinFactory();
var (button, checkbox) = BuildUI(factory);
Console.WriteLine(button.Render());   // [mac button]
Console.WriteLine(checkbox.Render()); // [mac checkbox]

// The app depends only on the interfaces, never on a concrete family.
static (IButton, ICheckbox) BuildUI(IUIFactory f) =>
    (f.CreateButton(), f.CreateCheckbox());

public interface IButton { string Render(); }
public interface ICheckbox { string Render(); }

// The abstract factory: one interface, a creator per product.
public interface IUIFactory
{
    IButton CreateButton();
    ICheckbox CreateCheckbox();
}

public sealed class MacButton : IButton { public string Render() => "[mac button]"; }
public sealed class MacCheckbox : ICheckbox { public string Render() => "[mac checkbox]"; }
public sealed class WinButton : IButton { public string Render() => "[win button]"; }
public sealed class WinCheckbox : ICheckbox { public string Render() => "[win checkbox]"; }

public sealed class MacFactory : IUIFactory
{
    public IButton CreateButton() => new MacButton();
    public ICheckbox CreateCheckbox() => new MacCheckbox();
}

public sealed class WinFactory : IUIFactory
{
    public IButton CreateButton() => new WinButton();
    public ICheckbox CreateCheckbox() => new WinCheckbox();
}
```

**🧠 Tradeoff** — Same shape as Go, but the contract is explicit: `MacFactory` declares
`IUIFactory`, and the compiler rejects a factory that forgot a creator. The products here are
one-liners, so the class count looks heavy — remember the factory's value is the *pairing*, not
the products. You could shrink a two-product family to a record of two `Func<>`s, but past that
the interface reads better. Adding a new product kind still ripples through every factory;
that's the pattern's tax in any language.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// Two independent decisions that must agree — but nothing makes them.
fn build_ui(os: &str) -> (Box<dyn Button>, Box<dyn Checkbox>) {
    let button: Box<dyn Button> =
        if os == "mac" { Box::new(MacButton) } else { Box::new(WinButton) };
    let checkbox: Box<dyn Checkbox> =
        if os == "mac" { Box::new(MacCheckbox) } else { Box::new(WinCheckbox) };
    (button, checkbox)
}
```

**✅ Idiomatic**

```rust
trait Button { fn render(&self) -> String; }
trait Checkbox { fn render(&self) -> String; }

// The abstract factory: one trait, a creator per product.
trait UIFactory {
    fn create_button(&self) -> Box<dyn Button>;
    fn create_checkbox(&self) -> Box<dyn Checkbox>;
}

struct MacButton;
impl Button for MacButton { fn render(&self) -> String { "[mac button]".into() } }
struct MacCheckbox;
impl Checkbox for MacCheckbox { fn render(&self) -> String { "[mac checkbox]".into() } }
struct WinButton;
impl Button for WinButton { fn render(&self) -> String { "[win button]".into() } }
struct WinCheckbox;
impl Checkbox for WinCheckbox { fn render(&self) -> String { "[win checkbox]".into() } }

struct MacFactory;
impl UIFactory for MacFactory {
    fn create_button(&self) -> Box<dyn Button> { Box::new(MacButton) }
    fn create_checkbox(&self) -> Box<dyn Checkbox> { Box::new(MacCheckbox) }
}

struct WinFactory;
impl UIFactory for WinFactory {
    fn create_button(&self) -> Box<dyn Button> { Box::new(WinButton) }
    fn create_checkbox(&self) -> Box<dyn Checkbox> { Box::new(WinCheckbox) }
}

// The app depends only on the trait — swap the factory, swap the family.
fn build_ui(factory: &dyn UIFactory) -> (Box<dyn Button>, Box<dyn Checkbox>) {
    (factory.create_button(), factory.create_checkbox())
}

fn main() {
    let os = "mac";
    let factory: &dyn UIFactory = if os == "mac" { &MacFactory } else { &WinFactory };
    let (button, checkbox) = build_ui(factory);
    println!("{}", button.render());   // [mac button]
    println!("{}", checkbox.render()); // [mac checkbox]
}
```

**🧠 Tradeoff** — `&dyn UIFactory` and the boxed products buy a runtime family swap at the cost
of dynamic dispatch and heap allocation. The static alternative is a generic factory with
associated types (`type B: Button`) — zero overhead, but the family is fixed at compile time and
everything touching it grows a type parameter. Be honest about scale, too: with exactly two
known platforms, real Rust often skips the trait and picks the family with `#[cfg]` or one enum;
the trait earns its keep when families are many or arrive from outside the crate.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

const OS = enum { mac, win };

// Two independent switches that must agree — but nothing makes them.
fn buttonLabel(os: OS) []const u8 {
    return switch (os) {
        .mac => "[mac button]",
        .win => "[win button]",
    };
}

fn checkboxLabel(os: OS) []const u8 {
    return switch (os) {
        .mac => "[mac checkbox]",
        .win => "[win checkbox]",
    };
}

pub fn main() void {
    std.debug.print("{s}\n", .{buttonLabel(.mac)});
    std.debug.print("{s}\n", .{checkboxLabel(.win)}); // mixed family — compiles fine
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// No interfaces in Zig — a product carries its behavior as a function pointer.
const Button = struct { render: *const fn () []const u8 };
const Checkbox = struct { render: *const fn () []const u8 };

// The abstract factory is a struct of creator function pointers — a small vtable.
const UIFactory = struct {
    createButton: *const fn () Button,
    createCheckbox: *const fn () Checkbox,
};

fn macButtonLabel() []const u8 { return "[mac button]"; }
fn macCheckboxLabel() []const u8 { return "[mac checkbox]"; }
fn winButtonLabel() []const u8 { return "[win button]"; }
fn winCheckboxLabel() []const u8 { return "[win checkbox]"; }

fn createMacButton() Button { return .{ .render = macButtonLabel }; }
fn createMacCheckbox() Checkbox { return .{ .render = macCheckboxLabel }; }
fn createWinButton() Button { return .{ .render = winButtonLabel }; }
fn createWinCheckbox() Checkbox { return .{ .render = winCheckboxLabel }; }

const mac_factory = UIFactory{ .createButton = createMacButton, .createCheckbox = createMacCheckbox };
const win_factory = UIFactory{ .createButton = createWinButton, .createCheckbox = createWinCheckbox };

// The app takes ONE factory and can't mix families.
fn buildUI(factory: UIFactory) struct { button: Button, checkbox: Checkbox } {
    return .{ .button = factory.createButton(), .checkbox = factory.createCheckbox() };
}

const Platform = enum { mac, win };

pub fn main() void {
    const os: Platform = .mac;
    const factory = switch (os) {
        .mac => mac_factory,
        .win => win_factory,
    };
    const ui = buildUI(factory);
    std.debug.print("{s}\n", .{ui.button.render()});   // [mac button]
    std.debug.print("{s}\n", .{ui.checkbox.render()}); // [mac checkbox]
}
```

**🧠 Tradeoff** — the function-pointer factory keeps families swappable at runtime without the
compiler knowing the set, which is what the pattern promises. But notice what the naive version
got wrong wasn't the switch — it was having *two* of them. With a closed platform set, idiomatic
Zig would keep the enum and merge both creators into one exhaustive switch returning the whole
family, or pick the factory at comptime and pay nothing at runtime. Products with state would
need the `*anyopaque` + function-pointer vtable idiom `std.mem.Allocator` uses. Reach for the
pointer form only when families must arrive at runtime, from outside the compiled set.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// Two independent decisions that must agree — but nothing makes them.
Button button = os.equals("mac") ? new MacButton() : new WinButton();
Checkbox checkbox = os.equals("mac") ? new MacCheckbox() : new WinCheckbox();
```

**✅ Idiomatic**

```java
interface Button { String render(); }
interface Checkbox { String render(); }

// The abstract factory: one interface, a creator per product.
interface UIFactory {
    Button createButton();
    Checkbox createCheckbox();
}

class MacButton implements Button { public String render() { return "[mac button]"; } }
class MacCheckbox implements Checkbox { public String render() { return "[mac checkbox]"; } }
class WinButton implements Button { public String render() { return "[win button]"; } }
class WinCheckbox implements Checkbox { public String render() { return "[win checkbox]"; } }

class MacFactory implements UIFactory {
    public Button createButton() { return new MacButton(); }
    public Checkbox createCheckbox() { return new MacCheckbox(); }
}

class WinFactory implements UIFactory {
    public Button createButton() { return new WinButton(); }
    public Checkbox createCheckbox() { return new WinCheckbox(); }
}

public class Demo {
    // The app depends only on UIFactory, never on a concrete family.
    static void buildUI(UIFactory f) {
        System.out.println(f.createButton().render());
        System.out.println(f.createCheckbox().render());
    }

    public static void main(String[] args) {
        var os = "mac";
        UIFactory factory = os.equals("mac") ? new MacFactory() : new WinFactory();
        buildUI(factory); // [mac button]
                          // [mac checkbox]
    }
}
```

**🧠 Tradeoff** — this is the book's own language, and the classical form fits without
translation: interfaces, concrete families, one factory choice. Modern Java mostly trims the
edges. The factories are stateless, so an `enum` with one constant per platform can implement
`UIFactory` — each factory becomes a guaranteed singleton and the platform set becomes closed
and switchable. And each creator is just a `Supplier<Button>`, so a family can shrink to a
record of two method references when the products are this small. What no idiom removes is
the pattern's tax: a new product kind edits `UIFactory` and every factory that implements it.

## Applications

Real-world uses of Abstract Factory (from the reference article):

- **Cross-platform UI toolkits** — matching controls per OS or theme.
- **Furniture / product kits** — chair + sofa in one style (the classic GoF example).
- **Payment integrations** — a provider family (checkout + refund + webhook) per gateway.
- **Database access kits** — connection + query builder + migrator per engine.
- **Theming** — a consistent set of components per design theme.

**In modern systems:**

- **Low-code** — a renderer family: one factory yields matching input, button, and layout widgets
  for web; another the native set — one schema, consistent output per target.
- **Multi-agent** — a provider family that produces a matching model, tokenizer, and tool-formatter
  set, so they never mismatch.
- **Workflow engine** — an environment factory yielding matching store, queue, and executor for
  dev vs prod.

## Related Patterns

- **Factory Method** — the building block; each creator in an abstract factory is one.
- **Builder** — Builder assembles one complex object step by step; Abstract Factory returns
  families of finished products.
- **Singleton** — a concrete factory is usually shared as a single instance.
