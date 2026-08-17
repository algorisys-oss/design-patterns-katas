---
id: adapter
category: structural
sequence: 1
title: Adapter
also_known_as: [Wrapper]
gof: true
intent: "Convert one interface into another so classes that couldn't work together now can."
frequency: high
difficulty: beginner
tags: [structural, interface-conversion, wrapper, integration, legacy]
related: [facade, decorator, bridge, proxy]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Wrap an object so its interface matches what the caller expects. The adapter translates between
two shapes that were designed apart — a legacy API and your new code, a third-party SDK and your
domain — without changing either side.

## The Problem

Your checkout code calls `pay(amountInDollars)`. You integrate Stripe, whose SDK exposes
`charge(cents)`. The signatures and units don't match, so either you scatter conversion logic at
every call site, or you edit your checkout to speak Stripe — coupling it to one vendor.

```
// your code expects:  gateway.pay(50.0)
// Stripe gives you:    stripe.charge(5000)   // cents, different name
```

An adapter presents a `pay(dollars)` face and translates to `charge(cents)` inside.

## Structure

Key Components:

- **Target** — the interface the client expects (`pay(dollars)`).
- **Adaptee** — the existing/foreign object (`stripe.charge(cents)`).
- **Adapter** — implements Target, holds an Adaptee, and translates calls.

## When to Use

- You want to use an existing class whose interface doesn't match what you need.
- You're integrating a third-party or legacy component behind your own interface.
- You want to isolate the rest of the code from a foreign API's quirks.

## Advantages and Disadvantages

### Advantages
- Reuse existing/foreign code without modifying it.
- Isolates vendor quirks in one place; swapping vendors touches one adapter.
- Follows Single Responsibility: conversion lives apart from business logic.

### Disadvantages
- Another layer of indirection.
- Too many adapters can signal mismatched abstractions across the system.
- A "leaky" adapter that exposes the adaptee's quirks defeats the purpose.

## Common Mistakes

- **Adapting in the caller** — scattering conversion at call sites instead of one adapter.
- **Leaking the adaptee** — exposing vendor-specific types/errors through the target interface.
- **Confusing it with Facade** — Adapter changes an interface to a *specific expected* one;
  Facade simplifies a *whole subsystem* behind a new, easier one.

## Key Takeaways

- Adapter = translate interface A into interface B, wrapping without editing either.
- Keep the translation (names, units, error shapes) fully inside the adapter.
- It's the go-to pattern for integrating legacy and third-party code.

## Implementations

Adapting a Stripe-style `charge(cents)` gateway to a `pay(dollars)` interface.

### JavaScript

**❌ Naive**

```js
// Checkout is coupled to Stripe's shape and does unit math inline.
class Checkout {
  constructor(stripe) { this.stripe = stripe; }
  buy(dollars) {
    return this.stripe.charge(Math.round(dollars * 100)); // vendor leak + repeated math
  }
}
```

**✅ Idiomatic**

```js
// Target: what our code speaks.  Adapter: makes Stripe speak it.
class StripeAdapter {
  constructor(stripe) { this.stripe = stripe; }
  pay(dollars) {
    return this.stripe.charge(Math.round(dollars * 100)); // translation lives here
  }
}

class Checkout {
  constructor(gateway) { this.gateway = gateway; } // depends on pay(), not Stripe
  buy(dollars) { return this.gateway.pay(dollars); }
}

const checkout = new Checkout(new StripeAdapter(stripe));
// Swapping to PayPal = a new adapter; Checkout is untouched.
```

**🧠 Tradeoff** — The adapter centralizes the name and unit translation, so `Checkout` depends
only on `pay(dollars)` and never sees Stripe. The cost is one wrapper class per vendor — cheap,
and it's exactly where a vendor swap is isolated.

### Node.js

**❌ Naive**

```js
// The upload code is welded to the S3 SDK's shape.
class Uploader {
  constructor(s3) { this.s3 = s3; }
  save(key, data) {
    return this.s3.putObject({ Bucket: "uploads", Key: key, Body: data }).promise();
  }
}
```

**✅ Idiomatic (backend)**

```js
// One port our code speaks: save(key, data) / load(key). Adapters make each SDK speak it.
class S3Adapter {
  constructor(s3, bucket) { this.s3 = s3; this.bucket = bucket; }
  save(key, data) { return this.s3.putObject({ Bucket: this.bucket, Key: key, Body: data }).promise(); }
  load(key) { return this.s3.getObject({ Bucket: this.bucket, Key: key }).promise().then((r) => r.Body); }
}
class FsAdapter {
  constructor(dir) { this.dir = dir; }
  save(key, data) { return fs.promises.writeFile(`${this.dir}/${key}`, data); }
  load(key) { return fs.promises.readFile(`${this.dir}/${key}`); }
}

// Uploader depends on save/load, not on any SDK.
class Uploader {
  constructor(storage) { this.storage = storage; }
  put(key, data) { return this.storage.save(key, data); }
}
const uploader = new Uploader(
  process.env.NODE_ENV === "prod" ? new S3Adapter(s3, "uploads") : new FsAdapter("/tmp"),
);
```

**🧠 Tradeoff** — Each adapter absorbs one SDK's method names and argument shapes, so `Uploader`
never sees S3 and local disk becomes a drop-in for tests. The cost is one wrapper per backend.
Node's own `util.promisify` is this pattern at the language level — an adapter from callback style
to promises.

### Python

**❌ Naive**

```python
class Checkout:
    def __init__(self, stripe):
        self.stripe = stripe

    def buy(self, dollars):
        return self.stripe.charge(round(dollars * 100))  # coupled to Stripe
```

**✅ Idiomatic**

```python
from typing import Protocol

class Gateway(Protocol):
    def pay(self, dollars: float) -> str: ...

class StripeAdapter:
    def __init__(self, stripe) -> None:
        self._stripe = stripe

    def pay(self, dollars: float) -> str:
        return self._stripe.charge(round(dollars * 100))  # translate here

class Checkout:
    def __init__(self, gateway: Gateway) -> None:
        self._gateway = gateway

    def buy(self, dollars: float) -> str:
        return self._gateway.pay(dollars)

checkout = Checkout(StripeAdapter(stripe))
```

**🧠 Tradeoff** — A `Protocol` states the `Gateway` shape without inheritance, so any adapter that
has `pay` satisfies it and the type checker verifies the fit. Duck typing means the adapter is
minimal; the `Protocol` just documents and enforces the contract for readers and tools.

### Elixir

**❌ Naive**

```elixir
defmodule Checkout do
  # Reaches straight into Stripe's function and unit convention.
  def buy(dollars), do: Stripe.charge(round(dollars * 100))
end
```

**✅ Idiomatic**

```elixir
# Target contract as a behaviour; the adapter implements it over Stripe.
defmodule Gateway do
  @callback pay(dollars :: number) :: term()
end

defmodule StripeAdapter do
  @behaviour Gateway
  @impl true
  def pay(dollars), do: Stripe.charge(round(dollars * 100))  # translation here
end

defmodule Checkout do
  # Takes any module implementing Gateway.
  def buy(gateway, dollars), do: gateway.pay(dollars)
end

Checkout.buy(StripeAdapter, 50.0)
```

**🧠 Tradeoff** — The adapter is a module implementing a behaviour, passed to `Checkout` by name.
Swapping to another provider is a new module; `Checkout` depends only on the `Gateway` callback.
Since there's no object to hold the adaptee, config (API keys) lives in application config or is
passed alongside.

### Go

**❌ Naive**

```go
type Checkout struct{ stripe *Stripe }

func (c *Checkout) Buy(dollars float64) error {
	return c.stripe.Charge(int(dollars*100 + 0.5)) // coupled to *Stripe
}
```

**✅ Idiomatic**

```go
package pay

// Target: the interface our code depends on.
type Gateway interface {
	Pay(dollars float64) error
}

// Adapter: wraps the Stripe client and satisfies Gateway.
type StripeAdapter struct{ Client *Stripe }

func (a StripeAdapter) Pay(dollars float64) error {
	return a.Client.Charge(int(dollars*100 + 0.5)) // translate name + units
}

type Checkout struct{ Gateway Gateway } // depends on the interface

func (c Checkout) Buy(dollars float64) error { return c.Gateway.Pay(dollars) }
```

**🧠 Tradeoff** — `StripeAdapter` satisfies `Gateway` implicitly by having `Pay`, so `Checkout`
never imports Stripe. Go's structural interfaces make adapters especially natural — you can even
adapt with a function type when the target has a single method. One adapter per foreign client
keeps the translation contained.

### CSharp

**❌ Naive**

```csharp
// Checkout knows Stripe's method name and unit convention.
public sealed class Checkout(Stripe stripe)
{
    public string Buy(decimal dollars) =>
        stripe.Charge((int)Math.Round(dollars * 100)); // vendor leak + inline math
}
```

**✅ Idiomatic**

```csharp
// Top-level demo first, types after.
var checkout = new Checkout(new StripeAdapter(new Stripe()));
Console.WriteLine(checkout.Buy(50.00m)); // charged 5000 cents

public sealed class Stripe
{
    public string Charge(int cents) => $"charged {cents} cents";
}

// Target: the interface our code depends on.
public interface IGateway
{
    string Pay(decimal dollars);
}

// Adapter: makes Stripe speak IGateway (primary constructor holds the adaptee).
public sealed class StripeAdapter(Stripe stripe) : IGateway
{
    public string Pay(decimal dollars) => stripe.Charge((int)Math.Round(dollars * 100));
}

public sealed class Checkout(IGateway gateway)
{
    public string Buy(decimal dollars) => gateway.Pay(dollars);
}
```

**🧠 Tradeoff** — `IGateway` is checked at compile time, so `Checkout` can't quietly depend on
a Stripe-only member; a vendor swap is one new adapter class. When the target has a single
method, modern C# can shrink the adapter to a `Func<decimal, string>` — an inline lambda doing
the same translation. The class earns its place once the adapter carries config or a second method.

### Rust

**❌ Naive**

```rust
struct Checkout {
    stripe: Stripe,
}

impl Checkout {
    // Coupled to Stripe's method name and unit convention.
    fn buy(&self, dollars: f64) -> String {
        self.stripe.charge((dollars * 100.0).round() as u32)
    }
}
```

**✅ Idiomatic**

```rust
struct Stripe;
impl Stripe {
    fn charge(&self, cents: u32) -> String {
        format!("charged {cents} cents")
    }
}

// Target: the contract our code speaks.
trait Gateway {
    fn pay(&self, dollars: f64) -> String;
}

// Adapter: wraps Stripe and translates name + units.
struct StripeAdapter {
    stripe: Stripe,
}

impl Gateway for StripeAdapter {
    fn pay(&self, dollars: f64) -> String {
        self.stripe.charge((dollars * 100.0).round() as u32)
    }
}

// Checkout depends on the trait, not on Stripe.
struct Checkout<G: Gateway> {
    gateway: G,
}

impl<G: Gateway> Checkout<G> {
    fn buy(&self, dollars: f64) -> String {
        self.gateway.pay(dollars)
    }
}

fn main() {
    let checkout = Checkout { gateway: StripeAdapter { stripe: Stripe } };
    println!("{}", checkout.buy(50.0)); // charged 5000 cents
}
```

**🧠 Tradeoff** — the adapter is a thin wrapper struct plus one `impl` — Rust's everyday
newtype habit, so the pattern feels native. `Checkout<G: Gateway>` monomorphizes: zero
dispatch cost, but the vendor is fixed at compile time. Choose `Box<dyn Gateway>` instead
when the gateway is picked at runtime (config, feature flags) — Rust makes you spell out
the choice that Go's interface values hide.

### Zig

**❌ Naive**

```zig
const std = @import("std");

const Stripe = struct {
    fn charge(_: Stripe, cents: u32) void {
        std.debug.print("charged {d} cents\n", .{cents});
    }
};

// Checkout reaches straight into Stripe's name and unit convention.
const Checkout = struct {
    stripe: Stripe,

    fn buy(self: Checkout, dollars: f64) void {
        self.stripe.charge(@intFromFloat(@round(dollars * 100.0)));
    }
};
```

**✅ Idiomatic**

```zig
const std = @import("std");

const Stripe = struct {
    fn charge(_: Stripe, cents: u32) void {
        std.debug.print("charged {d} cents\n", .{cents});
    }
};

// Adapter: wraps Stripe and translates pay(dollars) → charge(cents).
const StripeAdapter = struct {
    stripe: Stripe,

    fn pay(self: StripeAdapter, dollars: f64) void {
        self.stripe.charge(@intFromFloat(@round(dollars * 100.0)));
    }
};

// Checkout is generic over any gateway type with pay() — checked at comptime.
fn Checkout(comptime Gateway: type) type {
    return struct {
        gateway: Gateway,

        fn buy(self: @This(), dollars: f64) void {
            self.gateway.pay(dollars);
        }
    };
}

pub fn main() void {
    const checkout = Checkout(StripeAdapter){ .gateway = .{ .stripe = .{} } };
    checkout.buy(50.0); // charged 5000 cents
}
```

**🧠 Tradeoff** — `Checkout(comptime Gateway: type)` is duck typing at compile time: the
compiler verifies `pay` exists the moment `Checkout(StripeAdapter)` is instantiated, and
dispatch costs nothing. The catch is that each gateway makes a distinct `Checkout` type, so
picking a vendor at runtime needs the two-field vtable idiom (`*anyopaque` context + function
pointer) that `std.mem.Allocator` uses. For a vendor known at build time, comptime is the
honest form.

### Java

**❌ Naive**

```java
// Checkout knows Stripe's method name and unit convention.
class Checkout {
    private final Stripe stripe;

    Checkout(Stripe stripe) { this.stripe = stripe; }

    String buy(double dollars) {
        return stripe.charge((int) Math.round(dollars * 100)); // vendor leak + inline math
    }
}
```

**✅ Idiomatic**

```java
class Stripe {
    String charge(int cents) { return "charged %d cents".formatted(cents); }
}

// Target: the interface our code depends on.
interface Gateway {
    String pay(double dollars);
}

// Adapter: makes Stripe speak Gateway; the translation lives here.
class StripeAdapter implements Gateway {
    private final Stripe stripe;

    StripeAdapter(Stripe stripe) { this.stripe = stripe; }

    public String pay(double dollars) {
        return stripe.charge((int) Math.round(dollars * 100));
    }
}

class Checkout {
    private final Gateway gateway; // depends on pay(), not Stripe

    Checkout(Gateway gateway) { this.gateway = gateway; }

    String buy(double dollars) { return gateway.pay(dollars); }
}

public class Demo {
    public static void main(String[] args) {
        var checkout = new Checkout(new StripeAdapter(new Stripe()));
        System.out.println(checkout.buy(50.0)); // charged 5000 cents
    }
}
```

**🧠 Tradeoff** — the classical form fits Java with no translation: interface, wrapper class,
constructor injection. The standard library is full of it — `InputStreamReader` is an adapter
from bytes to characters. Since `Gateway` has one method, it's a functional interface: a lambda
`dollars -> stripe.charge((int) Math.round(dollars * 100))` is the whole adapter. Write the
class when the adapter carries config or a second method; otherwise the lambda is the modern
floor.

## Applications

Real-world uses of Adapter (from the reference article):

- **Payment gateways** — unify Stripe/PayPal/Razorpay behind one interface (name + unit fixes).
- **Legacy printers/devices** — wrap an old API to fit a modern interface.
- **Notification channels** — email/SMS/webhook adapters behind one `send`.
- **Storage backends** — S3/GCS/local disk behind a common blob interface.
- **Logging libraries** — adapt a third-party logger to your logging contract.

**In modern systems:**

- **Multi-agent** — wrap heterogeneous tool and model APIs behind one uniform `call` interface the
  orchestrator expects, so a new provider is a new adapter, not a rewrite.
- **Low-code** — adapt an external REST endpoint to the datasource interface a JSON binding
  assumes.
- **Workflow engine** — adapt a third-party service to the step contract so it drops into a
  pipeline unchanged.

## Related Patterns

- **Facade** — simplifies a whole subsystem behind a new interface; Adapter converts one object
  to a specific expected interface.
- **Decorator** — same wrapping shape, but adds behavior while keeping the interface; Adapter
  changes the interface.
- **Bridge** — designed up front to vary two sides; Adapter reconciles interfaces after the fact.
