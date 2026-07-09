---
id: interface-segregation
category: foundations
kind: principle
sequence: 4
title: Interface Segregation Principle
also_known_as: [ISP]
gof: false
intent: "No client should be forced to depend on methods it doesn't use — prefer small, focused interfaces."
frequency: medium
difficulty: intermediate
tags: [solid, isp, interfaces, cohesion, decoupling]
related: [single-responsibility, liskov-substitution, dependency-inversion]
languages: [javascript, python, elixir, go]
---

## The Principle

> Clients shouldn't be forced to depend on interfaces they don't use.

Many small, role-focused interfaces beat one fat interface. When a type must implement methods it
has no use for — stubbing them out or throwing — the interface is too big. Split it so each
client depends only on the slice it actually calls.

ISP is SRP applied to interfaces: one interface, one role.

## The Smell

A fat interface that forces implementers to fake methods they can't support:

```
interface Machine {
  print(doc); scan(doc); fax(doc);
}
class SimplePrinter implements Machine {
  print(doc) { /* ok */ }
  scan(doc) { throw new Error("no scanner"); }  // forced to implement what it can't do
  fax(doc)  { throw new Error("no fax"); }
}
```

`SimplePrinter` depends on `scan` and `fax` it will never provide — and callers can't trust them.

## Why It Matters

- Implementers only build what they actually support — no throwing stubs.
- Clients depend on a small surface, so changes to unrelated methods don't touch them.
- Ties directly to LSP: small honest interfaces are easy to substitute.

## Benefits and Cautions

### Benefits
- Focused interfaces reduce coupling and stub-and-throw code.
- Easier to implement, mock, and reason about.

### Cautions
- Too many micro-interfaces can fragment the design.
- Split by *client role*, not arbitrarily.

## Common Mistakes

- **The fat "manager" interface** — one interface every implementer must fully satisfy.
- **Stub-and-throw methods** — a sign the interface bundles unrelated roles.
- **Splitting without a client** — inventing role interfaces no caller actually needs.

## Key Takeaways

- ISP = small, role-focused interfaces over one fat one.
- Let the client's actual needs define the interface boundary.
- Compose small interfaces where a type genuinely plays several roles.

## Implementations

Splitting a fat `Machine` into `Printer`, `Scanner`, `Fax`.

### JavaScript

**❌ Naive**

```js
// Fat contract — every device must "implement" all three (JS via duck typing).
class SimplePrinter {
  print(doc) { return `printing ${doc}`; }
  scan(doc) { throw new Error("no scanner"); }  // forced, useless
  fax(doc) { throw new Error("no fax"); }
}
```

**✅ Idiomatic**

```js
// Separate roles; a device implements only what it does.
class SimplePrinter {
  print(doc) { return `printing ${doc}`; }
}
class AllInOne {
  print(doc) { return `printing ${doc}`; }
  scan(doc) { return `scanning ${doc}`; }
  fax(doc) { return `faxing ${doc}`; }
}

// Clients depend only on the capability they need:
function printAll(printer, docs) { return docs.map(d => printer.print(d)); }
printAll(new SimplePrinter(), ["a"]);  // no scan/fax stubs in sight
```

**🧠 Note** — JS has no formal interfaces, so ISP is about which *methods a client requires*.
`printAll` needs only `print`, so a `SimplePrinter` suffices — nothing forces it to fake a
scanner. The role boundary lives in what the function asks for, not in a declared interface.

### Python

**❌ Naive**

```python
from abc import ABC, abstractmethod

class Machine(ABC):
    @abstractmethod
    def print(self, doc): ...
    @abstractmethod
    def scan(self, doc): ...
    @abstractmethod
    def fax(self, doc): ...

class SimplePrinter(Machine):
    def print(self, doc): return f"printing {doc}"
    def scan(self, doc): raise NotImplementedError  # forced
    def fax(self, doc): raise NotImplementedError   # forced
```

**✅ Idiomatic**

```python
from typing import Protocol

class Printer(Protocol):
    def print(self, doc: str) -> str: ...

class Scanner(Protocol):
    def scan(self, doc: str) -> str: ...

class SimplePrinter:
    def print(self, doc: str) -> str:
        return f"printing {doc}"

class AllInOne:
    def print(self, doc: str) -> str: return f"printing {doc}"
    def scan(self, doc: str) -> str: return f"scanning {doc}"

def print_all(printer: Printer, docs: list[str]) -> list[str]:
    return [printer.print(d) for d in docs]
```

**🧠 Note** — Small `Protocol`s per role are the Pythonic ISP: `print_all` asks for `Printer`,
so `SimplePrinter` fits without pretending to scan. A device that does more just satisfies more
protocols — composition of roles, not one fat ABC with throwing stubs.

### Elixir

**❌ Naive**

```elixir
# One behaviour forces all three callbacks on every device.
defmodule Machine do
  @callback print(doc :: term()) :: term()
  @callback scan(doc :: term()) :: term()
  @callback fax(doc :: term()) :: term()
end

defmodule SimplePrinter do
  @behaviour Machine
  @impl true
  def print(doc), do: "printing #{doc}"
  @impl true
  def scan(_doc), do: raise("no scanner")  # forced stub
  @impl true
  def fax(_doc), do: raise("no fax")
end
```

**✅ Idiomatic**

```elixir
# One behaviour per role; a module adopts only the roles it fills.
defmodule Printer do
  @callback print(doc :: term()) :: term()
end

defmodule Scanner do
  @callback scan(doc :: term()) :: term()
end

defmodule SimplePrinter do
  @behaviour Printer
  @impl true
  def print(doc), do: "printing #{doc}"
end

defmodule AllInOne do
  @behaviour Printer
  @behaviour Scanner
  @impl Printer
  def print(doc), do: "printing #{doc}"
  @impl Scanner
  def scan(doc), do: "scanning #{doc}"
end
```

**🧠 Note** — Elixir behaviours segregate cleanly: define one per role and a module lists exactly
the behaviours it implements. `AllInOne` adopts both `Printer` and `Scanner`; `SimplePrinter`
only `Printer` — no module is forced to stub a callback it can't honor.

### Go

**❌ Naive**

```go
// A fat interface every device must satisfy in full.
type Machine interface {
	Print(doc string) string
	Scan(doc string) string
	Fax(doc string) string
}

type SimplePrinter struct{}

func (SimplePrinter) Print(doc string) string { return "printing " + doc }
func (SimplePrinter) Scan(string) string      { panic("no scanner") } // forced
func (SimplePrinter) Fax(string) string       { panic("no fax") }
```

**✅ Idiomatic**

```go
package office

// Tiny, role-focused interfaces — the Go way.
type Printer interface{ Print(doc string) string }
type Scanner interface{ Scan(doc string) string }

type SimplePrinter struct{}

func (SimplePrinter) Print(doc string) string { return "printing " + doc }

type AllInOne struct{}

func (AllInOne) Print(doc string) string { return "printing " + doc }
func (AllInOne) Scan(doc string) string  { return "scanning " + doc }

// A client asks only for what it uses:
func PrintAll(p Printer, docs []string) []string {
	out := make([]string, len(docs))
	for i, d := range docs {
		out[i] = p.Print(d)
	}
	return out
}
```

**🧠 Note** — ISP is idiomatic Go: interfaces are small (often one method — `io.Reader`,
`io.Writer`), and `PrintAll` accepts the narrowest interface it needs. `SimplePrinter` satisfies
`Printer` and nothing forces a `Scan`. Larger capabilities compose by embedding small interfaces.

## Applications

Where ISP shows up in practice:

- **`io.Reader`/`io.Writer`** — the canonical small-interface design.
- **Device drivers** — printer/scanner/fax as separate capabilities.
- **Repositories** — a read-only `Reader` vs a read-write `Store` for callers that only read.
- **Service clients** — narrow interfaces per consumer, not one god client.

## Related Principles & Patterns

- **Single Responsibility** — ISP is SRP for interfaces.
- **Liskov Substitution** — small interfaces are easier to substitute honestly.
- **Dependency Inversion** — clients depend on the narrow abstraction they actually need.
