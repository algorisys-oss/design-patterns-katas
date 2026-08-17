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
languages: [javascript, python, elixir, go, csharp, rust, zig, java]
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

## ISP and API Evolution

Interface size is also an **evolution** problem, not just a coupling one. Every method on an
interface is a promise to every client and every implementer — and the wider that promise, the
harder it is to change without breaking someone. This is where ISP meets versioning and backward
compatibility.

- **Widening breaks implementers.** Add a method to a fat interface and *every* implementer must
  now provide it — existing code stops compiling, or starts throwing. Small interfaces localize
  the change: a new capability becomes a *new* interface that only the types needing it adopt.
- **Changing a signature breaks callers.** Turning `charge(amount)` into `charge(amount, currency)`
  breaks every existing call. Backward-compatible evolution is **additive**: keep the old method
  and add a new, specific one, or accept an options/request object so new fields stay optional.
  Old callers keep working; new callers opt in.
- **Version at the seam.** When a contract genuinely must change incompatibly, *version* it
  (`PaymentV2`, `/v2/...`) and deprecate the old one on a schedule rather than mutating it under
  live clients. Segregated interfaces make this cheap — you version the one small role that
  changed, not a god interface every client touches.

The through-line: **prefer many specific methods/interfaces over one broad, mutable one.**
Specific signatures are stable — you extend the surface with new members instead of reshaping
existing ones — which is exactly what keeps published APIs and shared libraries compatible.

```
// ❌ breaking — every existing caller of charge(amount) must now change
charge(amount, currency)

// ✅ additive — old callers keep working; new capability is a new, specific method
charge(amount)                     // unchanged, still valid
chargeInCurrency(amount, currency) // new
// or accept an options object so new fields are optional:
charge({ amount, currency })       // { currency } can be added later without breaking anyone
```

This is the same instinct as overloading a function with specific argument sets instead of
piling optional flags onto one signature: narrow, purpose-built entry points are easier to keep
stable than one wide one that keeps growing parameters.

## Common Mistakes

- **The fat "manager" interface** — one interface every implementer must fully satisfy.
- **Stub-and-throw methods** — a sign the interface bundles unrelated roles.
- **Splitting without a client** — inventing role interfaces no caller actually needs.
- **Evolving a fat interface in place** — adding methods to (or changing signatures on) a
  widely-implemented interface is a breaking change; grow the API with new specific
  methods/interfaces and version incompatible changes instead of reshaping the contract.

## Key Takeaways

- ISP = small, role-focused interfaces over one fat one.
- Let the client's actual needs define the interface boundary.
- Compose small interfaces where a type genuinely plays several roles.
- Small interfaces evolve safely: extend with new specific methods/interfaces (or optional
  fields) and version incompatible changes, rather than widening or reshaping a contract
  everyone depends on.

## Implementations

Splitting a fat `Machine` into `Printer`, `Scanner`, `Fax`.

### JavaScript

*Targets modern JavaScript (ES2015+).*

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

*Targets Python 3.12.*

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

*Targets Elixir 1.18.*

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

*Targets Go 1.26.*

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

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// One fat interface every device must satisfy in full.
public interface IMachine
{
    string Print(string doc);
    string Scan(string doc);
    string Fax(string doc);
}

public sealed class SimplePrinter : IMachine
{
    public string Print(string doc) => $"printing {doc}";
    public string Scan(string doc) => throw new NotSupportedException("no scanner"); // forced
    public string Fax(string doc) => throw new NotSupportedException("no fax");
}
```

**✅ Idiomatic**

```csharp
// The client asks for the role it needs — no stubs anywhere.
Console.WriteLine(PrintAll(new SimplePrinter(), ["a"])[0]); // printing a

static List<string> PrintAll(IPrinter printer, List<string> docs) =>
    [.. docs.Select(printer.Print)];

// One interface per role.
public interface IPrinter { string Print(string doc); }
public interface IScanner { string Scan(string doc); }

public sealed class SimplePrinter : IPrinter
{
    public string Print(string doc) => $"printing {doc}";
}

// A device that does more implements more roles.
public sealed class AllInOne : IPrinter, IScanner
{
    public string Print(string doc) => $"printing {doc}";
    public string Scan(string doc) => $"scanning {doc}";
}
```

**🧠 Note** — a C# class can implement any number of interfaces, so ISP costs nothing: declare
one interface per role and let each device pick its set. `PrintAll` takes `IPrinter`, checked at
compile time — through that parameter a caller can't even see `Scan`. The classic .NET smell is
the `ISomethingManager` with a dozen members; split it by who calls what, not by what the
implementing class happens to contain.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// One fat trait every device must implement in full.
trait Machine {
    fn print(&self, doc: &str) -> String;
    fn scan(&self, doc: &str) -> String;
    fn fax(&self, doc: &str) -> String;
}

struct SimplePrinter;
impl Machine for SimplePrinter {
    fn print(&self, doc: &str) -> String {
        format!("printing {doc}")
    }
    fn scan(&self, _doc: &str) -> String {
        unimplemented!("no scanner") // forced stub
    }
    fn fax(&self, _doc: &str) -> String {
        unimplemented!("no fax")
    }
}
```

**✅ Idiomatic**

```rust
// One small trait per role — the same Go-style segregation, made explicit.
trait Printer {
    fn print(&self, doc: &str) -> String;
}
trait Scanner {
    fn scan(&self, doc: &str) -> String;
}

struct SimplePrinter;
impl Printer for SimplePrinter {
    fn print(&self, doc: &str) -> String {
        format!("printing {doc}")
    }
}

struct AllInOne;
impl Printer for AllInOne {
    fn print(&self, doc: &str) -> String {
        format!("printing {doc}")
    }
}
impl Scanner for AllInOne {
    fn scan(&self, doc: &str) -> String {
        format!("scanning {doc}")
    }
}

// The client bounds on exactly the role it uses.
fn print_all(printer: &impl Printer, docs: &[&str]) -> Vec<String> {
    docs.iter().map(|d| printer.print(d)).collect()
}

fn main() {
    println!("{:?}", print_all(&SimplePrinter, &["a"])); // ["printing a"]
}
```

**🧠 Note** — small traits are how Rust's std already works: `Read`, `Write`, and `Display` are
each one role, and you bound on exactly what you call. Unlike Go's implicit satisfaction, an
`impl` block states which roles a type plays — the compiler rejects a `SimplePrinter` handed
where a `Scanner` is needed. Where a client genuinely needs two roles, ask for the pair at that
one seam (`P: Printer + Scanner`) rather than gluing them into a fat supertrait everyone
inherits.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

// Zig has no interfaces — a fat vtable is the closest thing, and it forces stubs.
const Machine = struct {
    printFn: *const fn (doc: []const u8) void,
    scanFn: *const fn (doc: []const u8) void,
    faxFn: *const fn (doc: []const u8) void,
};

fn printerPrint(doc: []const u8) void {
    std.debug.print("printing {s}\n", .{doc});
}
fn noScanner(doc: []const u8) void {
    _ = doc;
    @panic("no scanner"); // forced stub
}
fn noFax(doc: []const u8) void {
    _ = doc;
    @panic("no fax");
}

const simple_printer = Machine{ .printFn = printerPrint, .scanFn = noScanner, .faxFn = noFax };
```

**✅ Idiomatic**

```zig
const std = @import("std");

// The "interface" is whatever methods the client actually calls — checked at compile time.
fn printAll(printer: anytype, docs: []const []const u8) void {
    for (docs) |doc| printer.print(doc);
}

const SimplePrinter = struct {
    pub fn print(_: SimplePrinter, doc: []const u8) void {
        std.debug.print("printing {s}\n", .{doc});
    }
};

const AllInOne = struct {
    pub fn print(_: AllInOne, doc: []const u8) void {
        std.debug.print("printing {s}\n", .{doc});
    }
    pub fn scan(_: AllInOne, doc: []const u8) void {
        std.debug.print("scanning {s}\n", .{doc});
    }
};

pub fn main() void {
    printAll(SimplePrinter{}, &.{ "a", "b" }); // printing a / printing b
    printAll(AllInOne{}, &.{"c"});             // printing c — extra roles unused
}
```

**🧠 Note** — with `anytype`, `printAll` compiles against exactly the methods it calls, so the
role boundary is the call site itself — segregation for free, though the contract is implicit
and a missing `print` only surfaces as a compile error where the function is instantiated. When
dispatch must be runtime, keep each vtable role-sized the way `std.mem.Allocator` does one job —
never one fat vtable padded with panicking function pointers.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// One fat interface every device must satisfy in full.
interface Machine {
    String print(String doc);
    String scan(String doc);
    String fax(String doc);
}

class SimplePrinter implements Machine {
    public String print(String doc) { return "printing " + doc; }
    public String scan(String doc) { throw new UnsupportedOperationException("no scanner"); } // forced
    public String fax(String doc) { throw new UnsupportedOperationException("no fax"); }
}
```

**✅ Idiomatic**

```java
import java.util.List;

// One interface per role; a device implements exactly its set.
interface Printer { String print(String doc); }
interface Scanner { String scan(String doc); }

class SimplePrinter implements Printer {
    public String print(String doc) { return "printing " + doc; }
}

class AllInOne implements Printer, Scanner {
    public String print(String doc) { return "printing " + doc; }
    public String scan(String doc) { return "scanning " + doc; }
}

public class Demo {
    // The client asks only for the role it calls.
    static List<String> printAll(Printer printer, List<String> docs) {
        return docs.stream().map(printer::print).toList();
    }

    public static void main(String[] args) {
        System.out.println(printAll(new SimplePrinter(), List.of("a"))); // [printing a]
        System.out.println(printAll(new AllInOne(), List.of("b")));      // [printing b] — extra roles unused
    }
}
```

**🧠 Note** — a role interface with one method is a functional interface, so a test double is a
lambda: `printAll(doc -> "fake " + doc, docs)` — no mocking library needed. Java also shows what
it costs to grow a wide interface anyway: default methods exist because `Collection` had to gain
`stream()` without breaking every implementer in the world — additive evolution bolted onto the
language. Segregation makes that machinery mostly unnecessary: small role interfaces grow by
adding new interfaces, not by patching old ones.

## Applications

Where ISP shows up in practice:

- **`io.Reader`/`io.Writer`** — the canonical small-interface design.
- **Device drivers** — printer/scanner/fax as separate capabilities.
- **Repositories** — a read-only `Reader` vs a read-write `Store` for callers that only read.
- **Service clients** — narrow interfaces per consumer, not one god client.
- **Public & library APIs** — additive changes (new methods, optional params, versioned
  interfaces like `v1`/`v2`) keep existing clients working; ISP keeps each versioned surface
  small, so a breaking change touches one role instead of everyone.

## Related Principles & Patterns

- **Single Responsibility** — ISP is SRP for interfaces.
- **Liskov Substitution** — small interfaces are easier to substitute honestly.
- **Dependency Inversion** — clients depend on the narrow abstraction they actually need.
