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
languages: [javascript, python, elixir, go]
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

## Applications

Real-world uses of Adapter (from the reference article):

- **Payment gateways** — unify Stripe/PayPal/Razorpay behind one interface (name + unit fixes).
- **Legacy printers/devices** — wrap an old API to fit a modern interface.
- **Notification channels** — email/SMS/webhook adapters behind one `send`.
- **Storage backends** — S3/GCS/local disk behind a common blob interface.
- **Logging libraries** — adapt a third-party logger to your logging contract.

## Related Patterns

- **Facade** — simplifies a whole subsystem behind a new interface; Adapter converts one object
  to a specific expected interface.
- **Decorator** — same wrapping shape, but adds behavior while keeping the interface; Adapter
  changes the interface.
- **Bridge** — designed up front to vary two sides; Adapter reconciles interfaces after the fact.
