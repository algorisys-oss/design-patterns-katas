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
languages: [javascript, node-js, python, elixir, go]
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

## Related Patterns

- **Unit of Work** — each saga step is a local unit of work (a real ACID transaction in one
  service); the saga strings them together across services.
- **Event Sourcing** — choreographed sagas ride on events; the event log records the saga's progress
  and drives compensations.
- **Retry** — steps and compensations are retried on transient failure, which is why both must be
  idempotent.
