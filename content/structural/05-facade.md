---
id: facade
category: structural
sequence: 5
title: Facade
also_known_as: []
gof: true
intent: "Provide one simple interface to a complex subsystem so callers don't wrestle its parts."
frequency: high
difficulty: beginner
tags: [structural, simplification, subsystem, api-surface, decoupling]
related: [adapter, mediator, singleton]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Put a single, friendly front door on a tangle of subsystems. The facade knows how to drive the
inventory, payment, and shipping services in the right order, so a caller says
`checkout(order)` instead of orchestrating five objects itself.

## The Problem

Placing an order means checking inventory, charging a card, creating a shipment, and sending a
confirmation — four services, in a specific sequence, with error handling between them. Every
caller that needs to place an order repeats this dance and couples itself to all four.

```
inventory.reserve(items);
const charge = payment.charge(card, total);
const ship = shipping.create(address, items);
mailer.send(confirmation);
// every place that checks out must know all four, in order
```

A facade hides that orchestration behind one call.

## Structure

Key Components:

- **Facade** — the single entry point that coordinates the subsystems.
- **Subsystems** — the complex parts (inventory, payment, shipping) that do the real work.
- **Client** — talks only to the facade.

## When to Use

- A subsystem is complex and most callers need only a common slice of it.
- You want to decouple callers from the subsystem's internals.
- You're layering a system and want a clean entry point per layer.

## Advantages and Disadvantages

### Advantages
- Callers get one simple call instead of orchestrating many objects.
- Decouples clients from subsystem internals — internals can change freely.
- A natural seam for a layer boundary.

### Disadvantages
- The facade can grow into a god object if it absorbs too much.
- It's a convenience layer, not a restriction — subsystems stay accessible.
- Another layer to keep in sync as subsystems evolve.

## Common Mistakes

- **Putting business logic in the facade** — it should *coordinate*, not become the whole app.
- **Hiding too much** — a facade so thick that power users can't reach the subsystem when they
  legitimately need to.
- **Confusing it with Adapter** — Facade simplifies many parts behind a new interface; Adapter
  converts one object to a specific expected interface.

## Key Takeaways

- Facade = one simple entry point over a complex subsystem.
- It coordinates and simplifies; it doesn't add behavior or restrict access.
- Keep it thin — orchestration, not business rules.

## Implementations

An `OrderFacade` over inventory, payment, and shipping subsystems.

### JavaScript

**❌ Naive**

```js
// Every caller orchestrates the whole subsystem itself.
function placeOrder(order) {
  inventory.reserve(order.items);
  const receipt = payment.charge(order.card, order.total);
  const shipment = shipping.create(order.address, order.items);
  mailer.send(order.email, receipt, shipment);
  return { receipt, shipment };
}
```

**✅ Idiomatic**

```js
class OrderFacade {
  constructor(inventory, payment, shipping, mailer) {
    Object.assign(this, { inventory, payment, shipping, mailer });
  }
  // One call hides the four-step dance and its ordering.
  checkout(order) {
    this.inventory.reserve(order.items);
    const receipt = this.payment.charge(order.card, order.total);
    const shipment = this.shipping.create(order.address, order.items);
    this.mailer.send(order.email, receipt, shipment);
    return { receipt, shipment };
  }
}

const orders = new OrderFacade(inventory, payment, shipping, mailer);
orders.checkout(order);   // callers know only this
```

**🧠 Tradeoff** — The facade centralizes the orchestration and the subsystem dependencies, so
callers depend on `checkout()` alone. It doesn't lock the subsystems away — advanced code can
still use them directly — which keeps the facade a convenience, not a cage.

### Node.js

**❌ Naive**

```js
// The route handler orchestrates every service and must get the order right.
app.post("/signup", async (req, res) => {
  const user = await users.create(req.body);
  await workspaces.provision(user.id);
  await mailer.sendWelcome(user.email);
  await analytics.track("signup", user.id);
  res.json(user);
});
```

**✅ Idiomatic (backend)**

```js
// One method hides the multi-service dance and its ordering.
class AccountService {
  constructor(users, workspaces, mailer, analytics) {
    Object.assign(this, { users, workspaces, mailer, analytics });
  }
  async signup(input) {
    const user = await this.users.create(input);
    await this.workspaces.provision(user.id);
    await this.mailer.sendWelcome(user.email);
    await this.analytics.track("signup", user.id);
    return user;
  }
}

const accounts = new AccountService(users, workspaces, mailer, analytics);
app.post("/signup", async (req, res) => res.json(await accounts.signup(req.body)));
```

**🧠 Tradeoff** — The controller now depends on `signup()` alone; the facade owns the service wiring
and the order of operations, which is where it belongs and where it can be tested. The facade
doesn't seal the services off — a background job can still call `mailer` directly — so it stays a
convenience, not a wall.

### Python

**❌ Naive**

```python
def place_order(order):
    inventory.reserve(order.items)
    receipt = payment.charge(order.card, order.total)
    shipment = shipping.create(order.address, order.items)
    mailer.send(order.email, receipt, shipment)
    return receipt, shipment
```

**✅ Idiomatic**

```python
class OrderFacade:
    def __init__(self, inventory, payment, shipping, mailer):
        self._inventory = inventory
        self._payment = payment
        self._shipping = shipping
        self._mailer = mailer

    def checkout(self, order):
        self._inventory.reserve(order.items)
        receipt = self._payment.charge(order.card, order.total)
        shipment = self._shipping.create(order.address, order.items)
        self._mailer.send(order.email, receipt, shipment)
        return receipt, shipment

orders = OrderFacade(inventory, payment, shipping, mailer)
orders.checkout(order)
```

**🧠 Tradeoff** — A plain class holding its subsystems is the whole pattern; injecting them (over
importing globals) keeps the facade testable. Python often expresses a lightweight facade as a
single module-level function too — reach for a class when the coordinator carries dependencies.

### Elixir

**❌ Naive**

```elixir
def place_order(order) do
  Inventory.reserve(order.items)
  receipt = Payment.charge(order.card, order.total)
  shipment = Shipping.create(order.address, order.items)
  Mailer.send(order.email, receipt, shipment)
  {receipt, shipment}
end
```

**✅ Idiomatic**

```elixir
# A context module IS a facade — Phoenix contexts are exactly this pattern.
defmodule Orders do
  alias MyApp.{Inventory, Payment, Shipping, Mailer}

  def checkout(order) do
    with :ok <- Inventory.reserve(order.items),
         {:ok, receipt} <- Payment.charge(order.card, order.total),
         {:ok, shipment} <- Shipping.create(order.address, order.items) do
      Mailer.send(order.email, receipt, shipment)
      {:ok, %{receipt: receipt, shipment: shipment}}
    end
  end
end

Orders.checkout(order)
```

**🧠 Tradeoff** — Elixir/Phoenix names this pattern outright: a *context* module is a facade over
a group of related functions and schemas. The `with` chain adds honest error handling to the
orchestration — any failing step short-circuits with its error tuple, which the flag-free naive
version lacked.

### Go

**❌ Naive**

```go
func PlaceOrder(order Order) (Result, error) {
	inventory.Reserve(order.Items)
	receipt, _ := payment.Charge(order.Card, order.Total)
	shipment, _ := shipping.Create(order.Address, order.Items)
	mailer.Send(order.Email, receipt, shipment)
	return Result{receipt, shipment}, nil
}
```

**✅ Idiomatic**

```go
package orders

// Facade holds the subsystems and exposes one method.
type Facade struct {
	Inventory Inventory
	Payment   Payment
	Shipping  Shipping
	Mailer    Mailer
}

func (f Facade) Checkout(order Order) (Result, error) {
	if err := f.Inventory.Reserve(order.Items); err != nil {
		return Result{}, err
	}
	receipt, err := f.Payment.Charge(order.Card, order.Total)
	if err != nil {
		return Result{}, err
	}
	shipment, err := f.Shipping.Create(order.Address, order.Items)
	if err != nil {
		return Result{}, err
	}
	f.Mailer.Send(order.Email, receipt, shipment)
	return Result{receipt, shipment}, nil
}
```

**🧠 Tradeoff** — A struct holding the subsystem interfaces is the facade; taking interfaces (not
concrete types) keeps it testable with fakes. Go's explicit error returns make the facade the
right place to handle failures once, instead of every caller repeating the checks.

## Applications

Real-world uses of Facade (from the reference article):

- **Checkout / order flow** — inventory + payment + shipping behind one call.
- **SDK front doors** — a simple client hiding auth, retries, pagination.
- **Compiler pipeline** — one `compile()` over lexer, parser, codegen.
- **Media / hardware subsystems** — `computer.start()` over CPU, memory, disk.
- **Phoenix contexts / service layers** — a domain API over schemas and services.

**In modern systems:**

- **Multi-agent** — one `agent.run(task)` over a tangle of model, memory, tools, and planner
  subsystems; callers never see the wiring.
- **Workflow engine** — a single `startWorkflow(def, input)` hiding the scheduler, store, and
  executor behind it.
- **Low-code** — `render(schema)` as the one entry point over the parser, node factory, and
  renderer.

## Related Patterns

- **Adapter** — converts one interface to another; Facade defines a new, simpler interface over
  many objects.
- **Mediator** — also centralizes interaction, but between peer objects that keep talking;
  Facade is a one-way front door.
- **Singleton** — a facade is often exposed as a single shared instance.
