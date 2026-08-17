---
id: saga
category: distributed
sequence: 5
title: Saga
also_known_as: [Distributed Transaction, Compensating Transaction]
gof: false
intent: "Coordinate a business transaction across services as a sequence of local steps, each with a compensating action to undo it — so there's consistency without a distributed lock."
frequency: medium
difficulty: advanced
tags: [distributed, transactions, consistency, compensation, microservices]
related: [unit-of-work, event-sourcing, retry]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Model a transaction that spans several services as a **saga**: an ordered series of **local
transactions**, one per service. Each step has a matching **compensating action** that semantically
undoes it. If any step fails, the saga runs the compensations for the steps already done, in
reverse — walking the system back to a consistent state.

There is no distributed lock and no two-phase commit holding every service hostage. Each service
commits its own step independently; the saga trades *atomic* consistency for *eventual* consistency
you reach by compensating.

## The Problem

A single business operation — place an order — touches Orders, Payment, and Shipping, each with its
own database. You can't wrap them in one ACID transaction:

- **No shared transaction** — separate services and databases can't participate in one atomic
  commit; there's nothing to `ROLLBACK` across all three.
- **Two-phase commit doesn't scale** — distributed locks across services are slow, brittle, and
  hold resources while any participant is slow or down.
- **Partial failure corrupts state** — charge the card, then shipping fails, and now money is taken
  for an order that won't ship, with no automatic undo.
- **Naive rollback is manual** — undoing the first two steps when the third fails becomes bespoke,
  error-prone cleanup code in every operation.

## Structure

Key Components:

- **Saga** — the overall business transaction: an ordered list of steps.
- **Steps (local transactions)** — each commits in one service (`createOrder`, `charge`, `ship`).
- **Compensating actions** — the semantic undo for each step (`cancelOrder`, `refund`, `recall`).
- **Coordination** — either **orchestration** (a central coordinator drives the steps) or
  **choreography** (each service reacts to the previous step's event).

```
create order ──► charge ──► ship          ← forward path (each commits locally)
     ▲             ▲          │ fails
cancel order ◄── refund ◄─────┘            ← compensations run in reverse
```

## When to Use

- A business operation spans multiple services/databases and must stay consistent.
- Long-running or asynchronous workflows where holding a distributed lock is impractical.
- Steps have meaningful compensations (a refund, a cancellation) — you can undo them semantically.
- Eventual consistency is acceptable for the operation.

## Advantages and Disadvantages

### Advantages
- **Consistency without distributed locks** — each service commits locally; no 2PC.
- **Resilience** — a failed step triggers compensation instead of leaving corrupt state.
- **Fits microservices** — respects service autonomy and independent databases.

### Disadvantages
- **Complexity** — you design and test every compensation *and* every partial-failure path.
- **No isolation** — other transactions can see intermediate saga state (a briefly-charged,
  not-yet-shipped order); you need semantic locks or careful design.
- **Compensations aren't perfect undo** — some effects can't be reversed (an email sent), only
  mitigated.

## Common Mistakes

- **No compensation for a step with side effects** — every step that changes state needs a defined
  undo, or a failure downstream strands it.
- **Non-idempotent steps/compensations** — retries and re-delivered events mean each action must be
  safe to apply more than once (idempotency keys).
- **Ignoring the isolation gap** — assuming no one observes the half-done saga leads to bugs (double
  spends, visible pending orders); use status flags/semantic locks.
- **Compensation that can fail silently** — a refund that fails during rollback leaves inconsistency;
  compensations need their own retries and alerting.

## Key Takeaways

- A saga is a sequence of local transactions plus compensations that undo them in reverse on failure.
- It buys cross-service consistency without distributed locks, at the price of eventual consistency
  and no isolation.
- Design every step *and* its compensation; make both idempotent.
- Choose orchestration (central control, easier to reason about) or choreography (decoupled, via events).

## Implementations

### JavaScript

**❌ Naive**

```js
// Sequential calls with no undo — a failure mid-way leaves money charged, nothing shipped.
async function placeOrder(order) {
  await orders.create(order);
  await payment.charge(order);   // if shipping throws next, this is never refunded
  await shipping.ship(order);
}
```

**✅ Idiomatic**

```js
// Orchestrated saga: each step registers its compensation; failure unwinds them in reverse.
async function runSaga(steps) {
  const done = [];
  try {
    for (const step of steps) {
      await step.action();
      done.push(step);
    }
  } catch (e) {
    for (const step of done.reverse()) {
      await step.compensate().catch((err) => alert(err)); // best-effort undo, must be robust
    }
    throw e;
  }
}
// runSaga([
//   { action: () => orders.create(o),  compensate: () => orders.cancel(o.id) },
//   { action: () => payment.charge(o),  compensate: () => payment.refund(o.id) },
//   { action: () => shipping.ship(o),   compensate: () => shipping.recall(o.id) },
// ]);
```

**🧠 Tradeoff** — Pairing each step with its `compensate` and unwinding in reverse turns ad-hoc
cleanup into a reusable orchestration. It makes the partial-failure path explicit and testable. The
hard parts remain yours: compensations must be idempotent and themselves resilient (a failing
`refund` during rollback is the nightmare case), and this in-memory orchestrator doesn't survive a
process crash — production sagas persist their state.

### Node.js

**❌ Naive**

```js
// Fire-and-forget across services via a queue with no compensation path.
await publish("order.created", order);
await publish("payment.charge", order); // if a consumer fails, nothing undoes the rest
```

**✅ Idiomatic**

```js
// Choreographed saga: services react to events and emit the next — or a compensating one.
// payment-service
bus.on("order.created", async (order) => {
  try {
    await charge(order);
    bus.publish("payment.completed", order);
  } catch {
    bus.publish("order.failed", order); // triggers compensation upstream
  }
});
// order-service compensates on failure
bus.on("order.failed", (order) => cancelOrder(order.id));
// shipping reacts to payment.completed, and emits payment.refund.requested if it fails
```

**🧠 Tradeoff** — Choreography via events decouples the services — no central coordinator — and each
one owns its step and its compensation trigger. It scales well and respects autonomy, but the saga's
logic is now spread across event handlers, making the overall flow harder to see and debug.
Durable delivery (a real broker) and idempotent handlers are non-negotiable, since events get
redelivered.

### Python

**❌ Naive**

```python
# Straight-line calls; a later failure leaves earlier side effects in place.
def place_order(order):
    orders.create(order)
    payment.charge(order)   # no undo if shipping fails
    shipping.ship(order)
```

**✅ Idiomatic**

```python
class Saga:
    def __init__(self):
        self.compensations = []

    def step(self, action, compensate):
        action()
        self.compensations.append(compensate)  # remember how to undo

    def run(self, steps):
        try:
            for action, compensate in steps:
                self.step(action, compensate)
        except Exception:
            for undo in reversed(self.compensations):
                try:
                    undo()
                except Exception:
                    log.error("compensation failed")  # must be retried/alerted
            raise

# Saga().run([
#   (lambda: orders.create(o),  lambda: orders.cancel(o.id)),
#   (lambda: payment.charge(o),  lambda: payment.refund(o.id)),
#   (lambda: shipping.ship(o),   lambda: shipping.recall(o.id)),
# ])
```

**🧠 Tradeoff** — A small `Saga` class recording compensations and unwinding them in reverse is a
clear orchestrated implementation, and easy to unit-test by making a middle step raise. For real
systems, frameworks (Temporal's Python SDK, `dramatiq`/Celery workflows) add durability so a crash
mid-saga resumes rather than stranding state — the in-memory version can't.

### Elixir

**❌ Naive**

```elixir
# Chained calls with no rollback across services.
with :ok <- Orders.create(order),
     :ok <- Payment.charge(order),
     :ok <- Shipping.ship(order) do
  :ok
end  # a failure at `ship` leaves the charge in place
```

**✅ Idiomatic**

```elixir
# The `sage` library models sagas natively: each stage pairs a transaction with a compensation.
import Sage

new()
|> run(:order,    &Orders.create/2,   &Orders.cancel/3)
|> run(:payment,  &Payment.charge/2,  &Payment.refund/3)
|> run(:shipping, &Shipping.ship/2,   &Shipping.recall/3)
|> transaction(MyApp.Repo, %{order: order})
# on any failure, Sage runs the compensations of completed stages in reverse.
```

**🧠 Tradeoff** — The `sage` library gives Elixir a declarative saga: each `run` names a step and
its compensation, and Sage handles the reverse unwind, retries, and even async stages. It fits the
functional, data-as-value style. Alternatively, a `GenServer`/`GenStateMachine` per saga instance
models the workflow as explicit state with OTP supervision. Either way you still design idempotent
compensations.

### Go

**❌ Naive**

```go
// Sequential service calls; an error late leaves earlier effects committed.
func placeOrder(o Order) error {
    if err := orders.Create(o); err != nil { return err }
    if err := payment.Charge(o); err != nil { return err } // ship failing next → no refund
    return shipping.Ship(o)
}
```

**✅ Idiomatic**

```go
// Orchestrate steps with compensations pushed onto a stack; unwind on failure.
type Step struct {
    Do         func() error
    Compensate func() error
}

func RunSaga(steps []Step) error {
    var done []Step
    for _, s := range steps {
        if err := s.Do(); err != nil {
            for i := len(done) - 1; i >= 0; i-- {
                if cerr := done[i].Compensate(); cerr != nil {
                    log.Printf("compensation failed: %v", cerr) // needs retry/alert
                }
            }
            return err
        }
        done = append(done, s)
    }
    return nil
}
// steps: {orders.Create, orders.Cancel}, {payment.Charge, payment.Refund}, {shipping.Ship, shipping.Recall}
```

**🧠 Tradeoff** — A slice of `Step{Do, Compensate}` with reverse unwinding is a clear, explicit Go
orchestrator — the whole control flow is visible and testable. As always in Go, durability and
distribution are yours to add: for crash-safe, long-running sagas, teams reach for Temporal's Go
SDK, which persists workflow state and replays it, rather than an in-memory loop.

### CSharp

**❌ Naive**

```csharp
// Straight-line awaits; if Ship throws, the charge is never refunded.
await orders.CreateAsync(order);
await payment.ChargeAsync(order);
await shipping.ShipAsync(order); // fails → money taken, nothing ships, no undo
```

**✅ Idiomatic**

```csharp
// A step is a Do/Compensate pair; failure pops the done stack and unwinds in reverse.
public sealed record SagaStep(string Name, Func<Task> Do, Func<Task> Compensate);

public sealed class Saga(IReadOnlyList<SagaStep> steps)
{
    public async Task RunAsync()
    {
        var done = new Stack<SagaStep>();
        try
        {
            foreach (var step in steps)
            {
                await step.Do();
                done.Push(step); // a Stack pops in reverse order for free
            }
        }
        catch
        {
            while (done.Count > 0)
            {
                var step = done.Pop();
                try { await step.Compensate(); }
                catch (Exception ex) // needs retry/alert
                {
                    Console.Error.WriteLine($"compensation {step.Name} failed: {ex.Message}");
                }
            }
            throw;
        }
    }
}

// await new Saga([
//     new("order",    () => orders.CreateAsync(o),  () => orders.CancelAsync(o.Id)),
//     new("payment",  () => payment.ChargeAsync(o), () => payment.RefundAsync(o.Id)),
//     new("shipping", () => shipping.ShipAsync(o),  () => shipping.RecallAsync(o.Id)),
// ]).RunAsync();
```

**🧠 Tradeoff** — A `record` makes each step a named value — easy to build in a list, easy
to assert on in tests — and `Func<Task>` delegates are the whole contract, no interface
ceremony. `Stack<SagaStep>` gives the reverse unwind for free. Like the other in-memory
orchestrators here, it doesn't survive a crash mid-saga; durable .NET sagas run on
Temporal's .NET SDK, MassTransit saga state machines, or the Durable Task Framework, which
persist progress and resume.

### Rust

**❌ Naive**

```rust
// Straight-line calls; an error at ship leaves the charge committed.
fn place_order(o: &Order) -> Result<(), String> {
    orders::create(o)?;
    payment::charge(o)?; // ship failing next → no refund
    shipping::ship(o)
}
```

**✅ Idiomatic**

```rust
// A step is a do/undo pair of boxed closures; failure unwinds the done list in reverse.
struct Step {
    name: &'static str,
    action: Box<dyn Fn() -> Result<(), String>>,
    compensate: Box<dyn Fn() -> Result<(), String>>,
}

fn run_saga(steps: &[Step]) -> Result<(), String> {
    let mut done: Vec<&Step> = Vec::new();
    for step in steps {
        if let Err(e) = (step.action)() {
            for s in done.iter().rev() {
                if let Err(c) = (s.compensate)() {
                    eprintln!("compensation {} failed: {c}", s.name); // needs retry/alert
                }
            }
            return Err(format!("{} failed: {e}", step.name));
        }
        done.push(step);
    }
    Ok(())
}

// Each closure moves or clones what its step needs — the order stays alive for the undo.
// let steps = vec![
//     Step { name: "order",    action: Box::new(|| orders::create(&o)),  compensate: Box::new(|| orders::cancel(o.id)) },
//     Step { name: "payment",  action: Box::new(|| payment::charge(&o)), compensate: Box::new(|| payment::refund(o.id)) },
//     Step { name: "shipping", action: Box::new(|| shipping::ship(&o)),  compensate: Box::new(|| shipping::recall(o.id)) },
// ];
// run_saga(&steps)?;
```

**🧠 Tradeoff** — Boxed closures are the right dispatch here: the steps are a heterogeneous,
open-ended list, so `Box<dyn Fn...>` (runtime dispatch) beats generics, which would force
every step to be the same type. Ownership sharpens a real saga question — whatever a
compensation needs to undo its step must stay alive until the saga finishes, and the borrow
checker makes you say so with `move` or a clone instead of finding out in production.
Durability is still yours: this unwinds in memory, and a crash mid-saga strands state.

### Zig

**❌ Naive**

```zig
// Straight-line try; a failure at ship leaves the charge committed.
fn placeOrder(o: *const Order) !void {
    try createOrder(o);
    try charge(o); // ship failing next → no refund
    try ship(o);
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

const Order = struct { id: u32, amount: u32 };

// No closures in Zig: a step is a pair of plain fn pointers, and the shared
// state (the order) travels as an explicit argument.
const Step = struct {
    name: []const u8,
    action: *const fn (o: *const Order) anyerror!void,
    compensate: *const fn (o: *const Order) anyerror!void,
};

fn runSaga(steps: []const Step, o: *const Order) !void {
    var done: usize = 0;
    for (steps) |step| {
        step.action(o) catch |err| {
            while (done > 0) : (done -= 1) {
                const s = steps[done - 1];
                s.compensate(o) catch |cerr| // needs retry/alert
                    std.debug.print("compensation {s} failed: {s}\n", .{ s.name, @errorName(cerr) });
            }
            return err;
        };
        done += 1;
    }
}

fn createOrder(o: *const Order) anyerror!void { std.debug.print("order {d} created\n", .{o.id}); }
fn cancelOrder(o: *const Order) anyerror!void { std.debug.print("order {d} cancelled\n", .{o.id}); }
fn charge(o: *const Order) anyerror!void { std.debug.print("charged {d}\n", .{o.amount}); }
fn refund(o: *const Order) anyerror!void { std.debug.print("refunded {d}\n", .{o.amount}); }
fn ship(_: *const Order) anyerror!void { return error.CarrierDown; } // the failing step
fn recall(_: *const Order) anyerror!void {}

pub fn main() void {
    const steps = [_]Step{
        .{ .name = "order",    .action = createOrder, .compensate = cancelOrder },
        .{ .name = "payment",  .action = charge,      .compensate = refund },
        .{ .name = "shipping", .action = ship,        .compensate = recall },
    };
    const o = Order{ .id = 7, .amount = 100 };
    runSaga(&steps, &o) catch |err|
        std.debug.print("saga failed: {s}\n", .{@errorName(err)});
    // order 7 created / charged 100 / refunded 100 / order 7 cancelled / saga failed: CarrierDown
}
```

**🧠 Tradeoff** — With no closures, a step can't quietly capture the order — everything a
compensation needs is in its signature, passed as an explicit argument. That's more honest
than it sounds: the undo's inputs are visible, not hidden in a captured environment. Error
unions make failure part of every step's type, and `@errorName` gives the log its reason
for free. Steps that carry different per-step state need the `*anyopaque` context +
fn-pointer idiom instead. Same caveat as every tab here: in-memory only, and compensations
still have to be idempotent.

### Java

**❌ Naive**

```java
// Straight-line calls; if ship throws, the charge is never refunded.
void placeOrder(Order o) {
    orders.create(o);
    payment.charge(o); // ship failing next → money taken, nothing ships
    shipping.ship(o);
}
```

**✅ Idiomatic**

```java
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

// A step is a do/undo record pair; failure unwinds the done deque in reverse.
record SagaStep(String name, Runnable action, Runnable compensate) {}

class Saga {
    void run(List<SagaStep> steps) {
        Deque<SagaStep> done = new ArrayDeque<>();
        try {
            for (var step : steps) {
                step.action().run();
                done.push(step); // a deque pops in reverse order for free
            }
        } catch (RuntimeException e) {
            while (!done.isEmpty()) {
                var step = done.pop();
                try { step.compensate().run(); }
                catch (RuntimeException ce) { // needs retry/alert
                    System.err.printf("compensation %s failed: %s%n", step.name(), ce.getMessage());
                }
            }
            throw e;
        }
    }
}

// new Saga().run(List.of(
//     new SagaStep("order",    () -> orders.create(o),  () -> orders.cancel(o.id())),
//     new SagaStep("payment",  () -> payment.charge(o), () -> payment.refund(o.id())),
//     new SagaStep("shipping", () -> shipping.ship(o),  () -> shipping.recall(o.id()))
// ));
```

**🧠 Tradeoff** — A `record` makes each step a named value with `name()` accessors for
free, and `Runnable` lambdas are the whole contract — no `Step` interface, no anonymous
classes, which is the GoF-era ceremony modern Java shed. `ArrayDeque` used as a stack
gives the reverse unwind by construction: `push` on success, `pop` on failure, and the
compensation order can't be gotten wrong. What Java can't shed is the caveat every tab
shares: this orchestrator lives in memory, so a crash mid-saga strands state. Durable
Java sagas run on Temporal's Java SDK, Axon, or Eventuate, which persist each step's
outcome and resume the unwind after a restart.

## Applications

- **E-commerce checkout** — order → payment → inventory → shipping, with refunds/cancellations as
  compensations (backend).
- **Travel booking** — flight + hotel + car as one trip; cancel the booked legs if any fails
  (backend).
- **Workflow engines** — Temporal, AWS Step Functions, and Camunda run long, compensatable
  business processes as durable sagas (backend).
- **Money movement** — multi-account transfers where each leg commits locally and reverses on
  failure (backend).
- **Provisioning** — spinning up resources across systems, tearing down the created ones if a later
  step fails (backend).

**In modern systems:**

- **Workflow engine** — this *is* the resilience model: each step carries a compensating action, so
  a late failure unwinds the earlier committed steps in reverse.
- **Multi-agent** — a multi-step agent task where each committed side effect (a booking, a payment)
  has an undo the orchestrator runs when a later step aborts.

## Related Patterns

- **Unit of Work** — each saga step is a local unit of work (a real ACID transaction in one
  service); the saga strings them together across services.
- **Event Sourcing** — choreographed sagas ride on events; the event log records the saga's progress
  and drives compensations.
- **Retry** — steps and compensations are retried on transient failure, which is why both must be
  idempotent.
