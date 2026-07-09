---
id: liskov-substitution
category: foundations
kind: principle
sequence: 3
title: Liskov Substitution Principle
also_known_as: [LSP]
gof: false
intent: "Subtypes must be usable anywhere their base type is expected, without surprising the caller."
frequency: medium
difficulty: advanced
tags: [solid, lsp, subtyping, contracts, polymorphism]
related: [open-closed, interface-segregation, strategy]
languages: [javascript, python, elixir, go]
---

## The Principle

> If S is a subtype of T, objects of type T may be replaced with objects of type S without
> breaking the program.

A subtype must honor the *contract* of its base: accept the same inputs, return compatible
outputs, keep the same invariants, and not throw where the base promised not to. If code that
works with the base breaks when handed a subtype, the subtype is lying about being one.

The classic trap: modeling with "is-a" from the real world when the *behavior* doesn't match.

## The Smell

A subclass that overrides a method to do less, throw, or violate an assumption the base made:

```
class Rectangle {
  setWidth(w) { this.w = w; }
  setHeight(h) { this.h = h; }   // width and height independent
}
class Square extends Rectangle {
  setWidth(w) { this.w = this.h = w; }   // changes BOTH — breaks the base's contract
}
// code that sets width=5, height=4, expects area 20 — a Square gives 16
```

`Square` "is-a" `Rectangle` in geometry, but not in *behavior*, so it fails substitution.

## Why It Matters

- Polymorphic code stays correct no matter which subtype it gets.
- OCP depends on it: extending behind an abstraction only works if subtypes are honest.
- It catches inheritance that models the wrong relationship.

## Benefits and Cautions

### Benefits
- Substitutable subtypes make polymorphism trustworthy.
- Forces you to model behavior, not just taxonomy.

### Cautions
- Real-world "is-a" can mislead — prefer composition when behavior diverges.
- Strengthening preconditions or weakening postconditions in a subtype is a silent violation.

## Common Mistakes

- **Overriding to throw `NotSupported`** — the subtype can't do what the base promised.
- **Tightening input rules** — the base accepts any int, the subtype rejects negatives; callers
  break.
- **Changing invariants** — the Square/Rectangle bind of two independent fields.

## Key Takeaways

- LSP = a subtype must be a drop-in for its base, behaviorally.
- Honor the base's contract: inputs, outputs, invariants, exceptions.
- When behavior diverges, use composition or a shared interface, not inheritance.

## Implementations

The bird that can't fly — model capability by behavior, not taxonomy.

### JavaScript

**❌ Naive**

```js
// Base promises fly(); a subtype can't honor it.
class Bird {
  fly() { return "flying"; }
}
class Penguin extends Bird {
  fly() { throw new Error("penguins can't fly"); } // breaks any code calling bird.fly()
}

function migrate(birds) { return birds.map(b => b.fly()); } // explodes on a Penguin
```

**✅ Idiomatic**

```js
// Split the capability; only flyers promise to fly.
class Bird { eat() { return "eating"; } }
class FlyingBird extends Bird { fly() { return "flying"; } }

class Sparrow extends FlyingBird {}
class Penguin extends Bird {}   // honestly not a FlyingBird

// migrate only accepts what can actually fly:
function migrate(flyers) { return flyers.map(f => f.fly()); }
migrate([new Sparrow()]);       // fine — Penguin was never eligible
```

**🧠 Note** — The fix is to model the *ability* (`FlyingBird`), so a `Penguin` is never handed to
code that expects flight. Nothing overrides a method into a lie. When behavior doesn't fit the
hierarchy, change the hierarchy — or use a capability interface — rather than throwing.

### Python

**❌ Naive**

```python
class Bird:
    def fly(self) -> str:
        return "flying"

class Penguin(Bird):
    def fly(self) -> str:
        raise NotImplementedError("penguins can't fly")  # violates the base contract
```

**✅ Idiomatic**

```python
from typing import Protocol

class Flyer(Protocol):
    def fly(self) -> str: ...

class Bird:
    def eat(self) -> str:
        return "eating"

class Sparrow(Bird):
    def fly(self) -> str:
        return "flying"

class Penguin(Bird):
    pass  # simply isn't a Flyer

def migrate(flyers: list[Flyer]) -> list[str]:
    return [f.fly() for f in flyers]
```

**🧠 Note** — A `Flyer` `Protocol` types the *capability*; `Sparrow` matches it structurally,
`Penguin` doesn't, and the type checker keeps a `Penguin` out of `migrate`. Behavioral typing
lets ability, not ancestry, decide substitutability — very much the Pythonic answer to LSP.

### Elixir

**❌ Naive**

```elixir
# One behaviour forces every "bird" to implement fly/1, even those that can't.
defmodule Bird do
  @callback fly(bird :: term()) :: String.t()
end

defmodule Penguin do
  @behaviour Bird
  @impl true
  def fly(_), do: raise("penguins can't fly")  # a lie forced by the contract
end
```

**✅ Idiomatic**

```elixir
# Segregate the capability into its own behaviour/protocol.
defprotocol Flyer do
  def fly(flyer)
end

defmodule Sparrow do
  defstruct []
end

defimpl Flyer, for: Sparrow do
  def fly(_), do: "flying"
end

defmodule Penguin do
  defstruct []   # no Flyer impl — cannot be passed where flight is required
end

# migrate/1 works on anything implementing Flyer; a Penguin can't reach it.
def migrate(flyers), do: Enum.map(flyers, &Flyer.fly/1)
```

**🧠 Note** — Elixir has no inheritance, so LSP shows up in *behaviour/protocol* contracts. By
giving flight its own protocol and implementing it only for types that truly fly, a `Penguin`
is never substitutable where a `Flyer` is expected — the contract is honest by construction.

### Go

**❌ Naive**

```go
type Bird interface{ Fly() string }

type Penguin struct{}

func (Penguin) Fly() string { panic("penguins can't fly") } // satisfies Bird but lies
```

**✅ Idiomatic**

```go
package birds

// Segregate the capability into its own interface.
type Flyer interface{ Fly() string }

type Sparrow struct{}

func (Sparrow) Fly() string { return "flying" }

type Penguin struct{} // no Fly method — not a Flyer

// Migrate accepts only Flyers; a Penguin won't compile in here.
func Migrate(flyers []Flyer) []string {
	out := make([]string, len(flyers))
	for i, f := range flyers {
		out[i] = f.Fly()
	}
	return out
}
```

**🧠 Note** — Go's implicit interfaces make LSP almost automatic: a type is a `Flyer` only if it
actually has `Fly()`. Not giving `Penguin` a `Fly` method means the compiler refuses to
substitute it where a `Flyer` is required — the honest relationship is enforced at build time.

## Applications

Where LSP shows up in practice:

- **Collection/stream types** — a read-only view that overrides `add()` to throw violates it.
- **Payment methods** — a "gift card" that can't refund breaks a `Refundable` contract.
- **Storage backends** — a backend that silently drops writes isn't substitutable.
- **Shape/geometry hierarchies** — the Square/Rectangle classic.

## Related Principles & Patterns

- **Open/Closed** — only works if the subtypes you extend with are substitutable.
- **Interface Segregation** — smaller interfaces make honest substitution easier.
- **Strategy** — capability-as-object sidesteps inheritance traps entirely.
