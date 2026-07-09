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
languages: [javascript, python, elixir, go]
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

### Python

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

## Applications

Real-world uses of Abstract Factory (from the reference article):

- **Cross-platform UI toolkits** — matching controls per OS or theme.
- **Furniture / product kits** — chair + sofa in one style (the classic GoF example).
- **Payment integrations** — a provider family (checkout + refund + webhook) per gateway.
- **Database access kits** — connection + query builder + migrator per engine.
- **Theming** — a consistent set of components per design theme.

## Related Patterns

- **Factory Method** — the building block; each creator in an abstract factory is one.
- **Builder** — Builder assembles one complex object step by step; Abstract Factory returns
  families of finished products.
- **Singleton** — a concrete factory is usually shared as a single instance.
