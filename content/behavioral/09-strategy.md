---
id: strategy
category: behavioral
sequence: 9
title: Strategy
also_known_as: [Policy]
gof: true
intent: "Define a family of algorithms, encapsulate each one, and make them interchangeable at runtime."
frequency: medium
difficulty: intermediate
tags: [behavioral, algorithms, open-closed, runtime-swap, composition]
related: [state, template-method, factory-method]
languages: [javascript, node-js, python, elixir, go, java, csharp, rust, zig]
---

## Intent

Define a family of algorithms, put each one behind a common interface, and make them
swappable at runtime.

Strategy lets a caller pick *how* a piece of work gets done without knowing the details, and
lets you add a new way of doing it without touching the caller. It's the pattern you reach for
the moment a method starts sprouting `if method === 'a' … else if method === 'b'` branches
that each hold a different algorithm.

## The Problem

You need to pay for an order. First there's just credit cards, so you write a method. Then
PayPal shows up, so you add a branch. Then crypto, then store credit. Now one method holds
four unrelated algorithms, every new payment type means editing code that already works, and
you can't test one path without dragging in the others.

```
pay(method, amount):
    if method == "credit":  ...credit logic...
    elif method == "paypal": ...paypal logic...
    elif method == "crypto": ...crypto logic...   # editing this method again
```

That method violates the Open/Closed Principle: it should be *open to extension* (new payment
types) but *closed to modification*. Strategy fixes this by pulling each algorithm into its
own object (or function) behind one interface.

## Structure

Key Components:

- **Context** — holds a reference to a strategy and delegates the work to it. Never contains
  the algorithm itself.
- **Strategy interface** — the common shape every algorithm implements (e.g. `pay(amount)`).
- **Concrete Strategies** — the interchangeable implementations, one per algorithm.

```
        ┌──────────────┐        strategy      ┌──────────────────┐
        │   Context    │────────────────────▶ │  «interface»     │
        │  pay(amount) │                       │   Strategy       │
        └──────────────┘                       │   pay(amount)    │
                                               └────────▲─────────┘
                                                        │
                                   ┌────────────────────┼────────────────────┐
                             ┌───────────┐        ┌───────────┐        ┌───────────┐
                             │CreditCard │        │  PayPal   │        │  Crypto   │
                             │pay(amount)│        │pay(amount)│        │pay(amount)│
                             └───────────┘        └───────────┘        └───────────┘
```

## When to Use

- You have several variants of one algorithm and want to switch between them at runtime.
- A class has a big conditional that selects behavior — each branch is a candidate strategy.
- You want to isolate an algorithm's details from the code that uses it.
- Different callers need different variants of the same operation (sort orders, validators,
  compressors, pricing rules).

## Advantages and Disadvantages

### Advantages
- Swap algorithms at runtime without touching the context.
- New strategies don't modify existing code — Open/Closed in practice.
- Each algorithm is isolated, so it's easy to test in isolation.
- Replaces sprawling conditionals with small, named objects or functions.

### Disadvantages
- More moving parts — a class or function per algorithm.
- The caller must know enough to pick the right strategy.
- Overkill when there are only one or two variants that never change. Don't reach for it to
  abstract a single `if`.

## Common Mistakes

- **Putting the algorithm in the context** — the context should only delegate. If it holds a
  branch that decides *what* to do, you haven't applied the pattern.
- **A strategy that needs the context's private state** — if the algorithm can't run from its
  inputs alone, the boundary is wrong. Pass what it needs as arguments.
- **Reaching for it too early** — one or two stable variants don't justify the ceremony. This
  pays off when variants multiply or change often.
- **Confusing it with State** — same structure, different intent. Strategy variants are picked
  by the caller and don't know about each other; State transitions itself between states.

## Key Takeaways

- Strategy = one interface, many interchangeable algorithms, chosen at runtime.
- The context delegates; it never contains the algorithm.
- It's the direct cure for "a method that's really four algorithms behind a conditional."
- In languages with first-class functions, a strategy is often just a function — no class
  hierarchy required.

## Implementations

The same example in every language: a payment context that delegates to a payment strategy.

### JavaScript

**❌ Naive**

```js
// One method, many algorithms, edited for every new payment type.
class PaymentProcessor {
  pay(method, amount) {
    if (method === "credit") {
      return `Paid ${amount} using Credit Card.`;
    } else if (method === "paypal") {
      return `Paid ${amount} using PayPal.`;
    }
    // Adding crypto means editing this class — it violates Open/Closed.
    throw new Error(`Unknown payment method: ${method}`);
  }
}

const processor = new PaymentProcessor();
console.log(processor.pay("credit", 100));
console.log(processor.pay("paypal", 200));
```

**✅ Idiomatic**

```js
// Each algorithm is its own object behind a shared shape: pay(amount).
class CreditCardPayment {
  pay(amount) { return `Paid ${amount} using Credit Card.`; }
}
class PayPalPayment {
  pay(amount) { return `Paid ${amount} using PayPal.`; }
}

class PaymentContext {
  constructor(strategy) { this.strategy = strategy; }
  setStrategy(strategy) { this.strategy = strategy; }
  pay(amount) { return this.strategy.pay(amount); }
}

const context = new PaymentContext(new CreditCardPayment());
console.log(context.pay(100));          // Paid 100 using Credit Card.

context.setStrategy(new PayPalPayment());
console.log(context.pay(200));          // Paid 200 using PayPal.

// Adding a new method never touches PaymentContext:
class CryptoPayment {
  pay(amount) { return `Paid ${amount} using Crypto.`; }
}
context.setStrategy(new CryptoPayment());
console.log(context.pay(300));          // Paid 300 using Crypto.
```

**🧠 Tradeoff** — JS has no interfaces, so the "contract" is just the duck-typed `pay(amount)`
method. That's flexible but unenforced: nothing stops you passing an object without a `pay`.
For a single-method strategy you could skip classes entirely and pass a plain function — the
class version pays off when a strategy carries its own configuration or state.

### Node.js

**❌ Naive**

```js
// A route handler switching on the payment method — the same conditional, server-side.
app.post("/pay", (req, res) => {
  const { method, amount } = req.body;
  switch (method) {
    case "credit": return res.send(`Charged ${amount} to card`);
    case "paypal": return res.send(`Sent ${amount} via PayPal`);
    default: return res.status(400).send(`Unknown method: ${method}`);
  }
  // every new gateway edits this handler
});
```

**✅ Idiomatic (backend)**

```js
// Strategies are functions in a registry, selected by key at request time.
const gateways = {
  credit: (amount) => `Charged ${amount} to card`,
  paypal: (amount) => `Sent ${amount} via PayPal`,
  crypto: (amount) => `Sent ${amount} in crypto`, // add a gateway: one entry, no handler edits
};

app.post("/pay", (req, res) => {
  const { method, amount } = req.body;
  const charge = gateways[method];
  if (!charge) return res.status(400).send(`Unknown method: ${method}`);
  res.send(charge(amount));
});
```

**🧠 Tradeoff** — On the backend a strategy is usually just a function keyed in an object, so
"add a strategy" becomes "add a key" — no classes, no context object. This is how Passport.js
registers auth strategies (`passport.use(new LocalStrategy(...))`) and how payment SDKs dispatch
gateways. The looseness is the same duck-typing bargain: an unknown key must be handled
explicitly, since nothing verifies the map is complete.

### Python

**❌ Naive**

```python
# The same conditional, now in Python.
class PaymentProcessor:
    def pay(self, method, amount):
        if method == "credit":
            return f"Paid {amount} using Credit Card."
        elif method == "paypal":
            return f"Paid {amount} using PayPal."
        raise ValueError(f"Unknown payment method: {method}")


processor = PaymentProcessor()
print(processor.pay("credit", 100))
print(processor.pay("paypal", 200))
```

**✅ Idiomatic**

```python
# Functions are first-class in Python, so a strategy is just a callable.
from typing import Callable

Strategy = Callable[[float], str]


def credit_card(amount: float) -> str:
    return f"Paid {amount} using Credit Card."


def paypal(amount: float) -> str:
    return f"Paid {amount} using PayPal."


class PaymentContext:
    def __init__(self, strategy: Strategy) -> None:
        self._strategy = strategy

    def set_strategy(self, strategy: Strategy) -> None:
        self._strategy = strategy

    def pay(self, amount: float) -> str:
        return self._strategy(amount)


context = PaymentContext(credit_card)
print(context.pay(100))                 # Paid 100 using Credit Card.

context.set_strategy(paypal)
print(context.pay(200))                 # Paid 200 using PayPal.

# A new strategy is a new function — nothing else changes.
context.set_strategy(lambda amount: f"Paid {amount} using Crypto.")
print(context.pay(300))                 # Paid 300 using Crypto.
```

**🧠 Tradeoff** — In Python the class-per-strategy hierarchy from the GoF book is usually
overkill: a function *is* the strategy. Reach for a `Protocol` or an `abc.ABC` only when a
strategy needs to bundle state or several related methods, or when you want the type checker
to enforce the contract. For one method, a callable is the Pythonic choice.

### Elixir

**❌ Naive**

```elixir
# A case expression standing in for the conditional.
defmodule PaymentProcessor do
  def pay(:credit, amount), do: "Paid #{amount} using Credit Card."
  def pay(:paypal, amount), do: "Paid #{amount} using PayPal."
  def pay(method, _amount), do: raise("Unknown payment method: #{method}")
end

IO.puts(PaymentProcessor.pay(:credit, 100))
IO.puts(PaymentProcessor.pay(:paypal, 200))
```

**✅ Idiomatic**

```elixir
# A strategy is a function value; the context just calls it.
defmodule Checkout do
  @doc "strategy is any function (amount -> String.t())"
  def pay(strategy, amount), do: strategy.(amount)
end

credit_card = fn amount -> "Paid #{amount} using Credit Card." end
paypal = fn amount -> "Paid #{amount} using PayPal." end

IO.puts(Checkout.pay(credit_card, 100))   # Paid 100 using Credit Card.
IO.puts(Checkout.pay(paypal, 200))        # Paid 200 using PayPal.

# A new strategy is a new function passed in — Checkout never changes.
crypto = fn amount -> "Paid #{amount} using Crypto." end
IO.puts(Checkout.pay(crypto, 300))        # Paid 300 using Crypto.
```

When you want a *named, compile-checked* contract instead of a bare function, use a behaviour:

```elixir
defmodule Payment do
  @callback pay(amount :: number) :: String.t()
end

defmodule CreditCard do
  @behaviour Payment
  @impl true
  def pay(amount), do: "Paid #{amount} using Credit Card."
end

# Checkout.pay/2 then takes the module: Payment.pay via CreditCard.pay(100)
```

**🧠 Tradeoff** — Elixir has no objects to hold a mutable `strategy` field, so there's no
"context with a setStrategy" — you pass the strategy on each call, or store it in the state of
a process/`GenServer` if it must persist. Functions are the lightweight idiom; behaviours add
a named contract and a compile-time warning when a module forgets to implement a callback, at
the cost of one module per strategy.

### Go

**❌ Naive**

```go
package main

import (
	"fmt"
)

// A switch that grows with every new payment type.
func Pay(method string, amount int) (string, error) {
	switch method {
	case "credit":
		return fmt.Sprintf("Paid %d using Credit Card.", amount), nil
	case "paypal":
		return fmt.Sprintf("Paid %d using PayPal.", amount), nil
	default:
		return "", fmt.Errorf("unknown payment method: %s", method)
	}
}

func main() {
	out, _ := Pay("credit", 100)
	fmt.Println(out)
	out, _ = Pay("paypal", 200)
	fmt.Println(out)
}
```

**✅ Idiomatic**

```go
package main

import "fmt"

// The strategy interface — anything with a Pay method satisfies it implicitly.
type PaymentStrategy interface {
	Pay(amount int) string
}

type CreditCard struct{}

func (CreditCard) Pay(amount int) string {
	return fmt.Sprintf("Paid %d using Credit Card.", amount)
}

type PayPal struct{}

func (PayPal) Pay(amount int) string {
	return fmt.Sprintf("Paid %d using PayPal.", amount)
}

type PaymentContext struct {
	strategy PaymentStrategy
}

func (c *PaymentContext) SetStrategy(s PaymentStrategy) { c.strategy = s }
func (c *PaymentContext) Pay(amount int) string         { return c.strategy.Pay(amount) }

func main() {
	ctx := &PaymentContext{strategy: CreditCard{}}
	fmt.Println(ctx.Pay(100)) // Paid 100 using Credit Card.

	ctx.SetStrategy(PayPal{})
	fmt.Println(ctx.Pay(200)) // Paid 200 using PayPal.
}
```

**🧠 Tradeoff** — Go interfaces are satisfied *implicitly*: `CreditCard` never declares it
implements `PaymentStrategy`, it just has the method. That keeps strategies decoupled from the
interface. For a single-method strategy you can skip the structs and use a function type
(`type PaymentStrategy func(int) string`), which is often the leaner Go form — use the
interface when a strategy needs fields or more than one method.

### CSharp

**❌ Naive**

```csharp
// A switch that grows with every new payment type.
Console.WriteLine(Pay("credit", 100));
Console.WriteLine(Pay("paypal", 200));

static string Pay(string method, int amount) => method switch
{
    "credit" => $"Paid {amount} using Credit Card.",
    "paypal" => $"Paid {amount} using PayPal.",
    _ => throw new ArgumentException($"Unknown payment method: {method}"),
};
```

**✅ Idiomatic**

```csharp
// Top-level statements: the demo runs first, the types follow.
var context = new PaymentContext(new CreditCard());
Console.WriteLine(context.Pay(100)); // Paid 100 using Credit Card.

context.SetStrategy(new PayPal());
Console.WriteLine(context.Pay(200)); // Paid 200 using PayPal.

public interface IPaymentStrategy
{
    string Pay(int amount);
}

public sealed class CreditCard : IPaymentStrategy
{
    public string Pay(int amount) => $"Paid {amount} using Credit Card.";
}

public sealed class PayPal : IPaymentStrategy
{
    public string Pay(int amount) => $"Paid {amount} using PayPal.";
}

// Primary constructor — the context takes its starting strategy up front.
public sealed class PaymentContext(IPaymentStrategy strategy)
{
    private IPaymentStrategy _strategy = strategy;

    public void SetStrategy(IPaymentStrategy s) => _strategy = s;
    public string Pay(int amount) => _strategy.Pay(amount);
}
```

**🧠 Tradeoff** — unlike JS duck typing, `IPaymentStrategy` is checked at compile time:
you cannot hand the context an object without a `Pay`. The classical form above earns its
keep when a strategy carries configuration or several members. For a single method, modern
C# often skips the interface entirely and stores a `Func<int, string>` — the pattern
collapses into a delegate, which is Strategy in all but name.

### Rust

**❌ Naive**

```rust
// A match that grows with every new payment type.
fn pay(method: &str, amount: u32) -> String {
    match method {
        "credit" => format!("Paid {amount} using Credit Card."),
        "paypal" => format!("Paid {amount} using PayPal."),
        other => panic!("unknown payment method: {other}"),
    }
}

fn main() {
    println!("{}", pay("credit", 100));
    println!("{}", pay("paypal", 200));
}
```

**✅ Idiomatic**

```rust
// The strategy contract is a trait.
trait PaymentStrategy {
    fn pay(&self, amount: u32) -> String;
}

struct CreditCard;
impl PaymentStrategy for CreditCard {
    fn pay(&self, amount: u32) -> String {
        format!("Paid {amount} using Credit Card.")
    }
}

struct PayPal;
impl PaymentStrategy for PayPal {
    fn pay(&self, amount: u32) -> String {
        format!("Paid {amount} using PayPal.")
    }
}

// Box<dyn ...> so the strategy can be swapped at runtime.
struct PaymentContext {
    strategy: Box<dyn PaymentStrategy>,
}

impl PaymentContext {
    fn set_strategy(&mut self, strategy: Box<dyn PaymentStrategy>) {
        self.strategy = strategy;
    }
    fn pay(&self, amount: u32) -> String {
        self.strategy.pay(amount)
    }
}

fn main() {
    let mut context = PaymentContext { strategy: Box::new(CreditCard) };
    println!("{}", context.pay(100)); // Paid 100 using Credit Card.

    context.set_strategy(Box::new(PayPal));
    println!("{}", context.pay(200)); // Paid 200 using PayPal.
}
```

**🧠 Tradeoff** — `Box<dyn PaymentStrategy>` buys runtime swapping at the cost of a heap
allocation and dynamic dispatch. A generic `PaymentContext<S: PaymentStrategy>` compiles
each strategy to zero-overhead code but fixes it at compile time — Rust makes you pick,
where Go and C# hide the choice. And when the set of strategies is closed, plain Rust
often prefers an enum with a `match` over trait objects; reach for `dyn` when the set
must stay open. A closure `Box<dyn Fn(u32) -> String>` covers the single-method case.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

const Method = enum { credit, paypal };

// A switch that grows with every new payment type.
fn pay(method: Method, amount: u32) void {
    switch (method) {
        .credit => std.debug.print("Paid {d} using Credit Card.\n", .{amount}),
        .paypal => std.debug.print("Paid {d} using PayPal.\n", .{amount}),
    }
}

pub fn main() void {
    pay(.credit, 100);
    pay(.paypal, 200);
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// Zig has no interfaces or closures — the strategy is a function pointer.
const PaymentStrategy = struct {
    payFn: *const fn (amount: u32) void,

    pub fn pay(self: PaymentStrategy, amount: u32) void {
        self.payFn(amount);
    }
};

fn payCredit(amount: u32) void {
    std.debug.print("Paid {d} using Credit Card.\n", .{amount});
}

fn payPayPal(amount: u32) void {
    std.debug.print("Paid {d} using PayPal.\n", .{amount});
}

const PaymentContext = struct {
    strategy: PaymentStrategy,

    pub fn setStrategy(self: *PaymentContext, s: PaymentStrategy) void {
        self.strategy = s;
    }
    pub fn pay(self: PaymentContext, amount: u32) void {
        self.strategy.pay(amount);
    }
};

pub fn main() void {
    var context = PaymentContext{ .strategy = .{ .payFn = payCredit } };
    context.pay(100); // Paid 100 using Credit Card.

    context.setStrategy(.{ .payFn = payPayPal });
    context.pay(200); // Paid 200 using PayPal.
}
```

**🧠 Tradeoff** — a bare function pointer covers stateless strategies; once a strategy
needs its own state, Zig's answer is the two-field vtable idiom (`*anyopaque` context +
function pointer) that `std.mem.Allocator` uses. Be honest about the naive version,
though: when the set of strategies is closed, the enum + exhaustive `switch` *is*
idiomatic Zig — zero indirection, and the compiler flags every unhandled case. The
pointer form pays off only when new strategies must arrive without touching the switch.

### Java

**❌ Naive**

```java
// A conditional that grows with every new payment type.
class PaymentService {
    String pay(String method, int amount) {
        return switch (method) {
            case "credit" -> "Paid %d using Credit Card.".formatted(amount);
            case "paypal" -> "Paid %d using PayPal.".formatted(amount);
            default -> throw new IllegalArgumentException("Unknown method: " + method);
        };
    }
}
```

**✅ Idiomatic**

```java
// The strategy contract — a single method, so it's a functional interface.
interface PaymentStrategy {
    String pay(int amount);
}

class CreditCard implements PaymentStrategy {
    public String pay(int amount) {
        return "Paid %d using Credit Card.".formatted(amount);
    }
}

class PayPal implements PaymentStrategy {
    public String pay(int amount) {
        return "Paid %d using PayPal.".formatted(amount);
    }
}

class PaymentContext {
    private PaymentStrategy strategy;

    PaymentContext(PaymentStrategy strategy) { this.strategy = strategy; }

    void setStrategy(PaymentStrategy strategy) { this.strategy = strategy; }
    String pay(int amount) { return strategy.pay(amount); }
}

public class Demo {
    public static void main(String[] args) {
        var context = new PaymentContext(new CreditCard());
        System.out.println(context.pay(100)); // Paid 100 using Credit Card.

        context.setStrategy(new PayPal());
        System.out.println(context.pay(200)); // Paid 200 using PayPal.

        // Single-method interface — a lambda IS a strategy:
        context.setStrategy(amount -> "Paid %d using Crypto.".formatted(amount));
        System.out.println(context.pay(300)); // Paid 300 using Crypto.
    }
}
```

**🧠 Tradeoff** — this is the GoF book's home language, and the classical form fits with
no translation: interface, concrete classes, context. What modern Java changes is the
floor. Since any single-method interface is a functional interface, a lambda replaces the
strategy class — `Comparator` passed to `sort` is the standard library doing exactly this.
Write the class when a strategy carries configuration or state; reach for the lambda when
it's one stateless method, which is most of the time.

## Applications

Real-world uses of Strategy (from the reference articles):

- **Payment processing** — credit card / PayPal / crypto behind one `pay` call.
- **Authentication** — OAuth vs JWT vs session strategies chosen per request (backend).
- **Form validation** — email / phone / password validators swapped per field (frontend).
- **Theme switching** — light / dark / high-contrast render strategies (frontend).
- **Sorting & compression** — quick vs merge sort; ZIP vs GZIP, picked by data size or config.
- **Logging** — console vs file vs remote sink selected by environment (backend).
- **API rate limiting** — token bucket vs leaky bucket per route (backend).

**In modern systems:**

- **Low-code** — a field's `"validator": "email"` or `"format": "currency"` picks a strategy at
  render time straight from the JSON config; adding one is a new object, not a new branch.
- **Workflow engine** — a step's retry/backoff policy chosen by name from the step definition.
- **Multi-agent** — swap the planning strategy (ReAct vs plan-and-execute) or the model behind a
  single `generate` call without touching the orchestration around it.

## Related Patterns

- **State** — identical structure, different intent. State objects transition between
  themselves as internal state changes; Strategy variants are chosen by the client and are
  unaware of each other.
- **Template Method** — varies *steps* of a fixed algorithm via inheritance; Strategy varies
  the *whole* algorithm via composition. Composition swaps at runtime; inheritance is fixed at
  compile time.
- **Factory Method** — often pairs with Strategy to construct the concrete strategy chosen at
  runtime from a config value or user choice.
