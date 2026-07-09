---
id: god-object
category: anti-patterns
kind: anti-pattern
sequence: 1
title: God Object
also_known_as: [The Blob, God Class, Winnebago]
gof: false
intent: "One class or module that knows and does far too much — the anti-pattern of concentrating responsibilities into a single all-powerful object instead of distributing them."
frequency: high
difficulty: beginner
tags: [anti-pattern, coupling, cohesion, single-responsibility, refactoring]
related: [single-responsibility, facade, spaghetti-code]
languages: [javascript, python, go]
---

## The Anti-Pattern

A **God Object** is a class or module that has grown to know about and control most of the system: it
holds the data, makes the decisions, talks to the database, formats the output, sends the emails, and
enforces the rules — all in one place. Everything depends on it, and it depends on everything.

It's the direct violation of the Single Responsibility Principle at maximum scale. Rather than a system of
small collaborating objects each with one job, you have one enormous object doing all the jobs, and a
constellation of anemic data holders around it.

## How It Happens

God Objects rarely start big — they accrete:

- **"I'll just add it here"** — the class already touches everything, so each new feature is easiest to bolt
  onto it, and it grows one method at a time.
- **Fear of new classes** — creating a focused class feels like overhead, so logic lands in the existing big
  one instead.
- **Central "manager" thinking** — a `Manager`/`Controller`/`Utils` class becomes the default home for
  anything that doesn't obviously belong elsewhere.
- **No refactoring pressure** — it keeps working, so no one splits it until it's a 3,000-line monster.

## Why It Hurts

- **Impossible to understand** — no one can hold the whole thing in their head; every change requires
  reading thousands of lines.
- **Everything is coupled** — since everything depends on the God Object, a change anywhere risks breaking
  anything.
- **Untestable** — you can't test one responsibility without dragging in all the others (and their
  dependencies).
- **Merge conflicts & bottleneck** — every feature touches the same file, so teams collide constantly.
- **Can't reuse anything** — the useful bits are welded to the rest, so nothing can be lifted out.

## The Refactor

Break it apart by responsibility:

- **Identify the responsibilities** — group the methods/fields by what they're actually about (validation,
  payment, notification, persistence).
- **Extract a class per responsibility** — move each cohesive group into its own focused class with a clear
  name.
- **Inject collaborators** — the former God Object (if it remains) becomes a thin coordinator that delegates
  to the extracted classes (or disappears entirely).
- **Move behavior to the data** — anemic objects around the God Object often deserve the behavior that was
  operating on them.

```
OrderManager (God Object) ──extract──► OrderValidator · PaymentService · Notifier
   does everything                     each does one thing, testable and reusable
```

## Warning Signs

- A class with hundreds/thousands of lines, dozens of methods, and many unrelated fields.
- Names like `Manager`, `Processor`, `Utils`, `Helper`, `System` that reveal no single responsibility.
- Every feature change touches the same file; constant merge conflicts there.
- You can't describe what the class does in one sentence without "and… and… and…".
- Tests for it require mocking half the system.

## Key Takeaways

- A God Object concentrates many responsibilities into one class everything depends on.
- It grows by accretion and becomes unreadable, untestable, and a coupling/merge bottleneck.
- Refactor by extracting a focused class per responsibility and delegating (or dissolving the coordinator).
- The cure is the Single Responsibility Principle: one class, one reason to change.

## Implementations

### JavaScript

**❌ The Smell**

```js
// One class does validation, pricing, payment, email, and persistence.
class OrderManager {
  async placeOrder(cart, user) {
    if (!cart.items.length) throw new Error("empty");           // validation
    let total = cart.items.reduce((s, i) => s + i.price, 0);
    if (user.vip) total *= 0.9;                                  // pricing rules
    await stripe.charge(user.card, total);                       // payment
    await db.query("INSERT INTO orders ...");                    // persistence
    await mailer.send(user.email, `Order for $${total}`);        // notification
    logger.info(`order for ${user.id}`);                         // logging
  }
  // ...20 more unrelated methods
}
```

**✅ The Refactor**

```js
// Each responsibility is its own class; a thin coordinator delegates.
class OrderValidator { check(cart) { if (!cart.items.length) throw new Error("empty"); } }
class Pricing { total(cart, user) { const t = cart.items.reduce((s, i) => s + i.price, 0); return user.vip ? t * 0.9 : t; } }
class Payment { constructor(gw) { this.gw = gw; } charge(user, amount) { return this.gw.charge(user.card, amount); } }
class Orders { save(order) { return db.query("INSERT INTO orders ...", order); } }

class PlaceOrder {                       // thin use case, delegates to focused collaborators
  constructor({ validator, pricing, payment, orders, notifier }) { Object.assign(this, arguments[0]); }
  async run(cart, user) {
    this.validator.check(cart);
    const total = this.pricing.total(cart, user);
    await this.payment.charge(user, total);
    await this.orders.save({ userId: user.id, total });
    await this.notifier.orderPlaced(user, total);
  }
}
```

**🧠 The Fix** — Extracting `OrderValidator`, `Pricing`, `Payment`, and `Orders` makes each independently
testable (assert pricing rules with no Stripe, no DB) and reusable, and `PlaceOrder` becomes a readable
coordinator. The "extra classes" that felt like overhead are exactly what make the system comprehensible
and changeable. This is SRP applied.

### Python

**❌ The Smell**

```python
# A "manager" that owns users, orders, payments, reports, and email.
class SystemManager:
    def register_user(self, data): ...     # user management
    def place_order(self, cart, user): ...  # order + payment + email + persistence inline
    def generate_report(self): ...          # reporting
    def send_newsletter(self): ...          # marketing
    def cleanup_logs(self): ...             # ops
    # ...one class, the whole application
```

**✅ The Refactor**

```python
# Split by responsibility; compose them where needed.
class UserService:
    def register(self, data): ...

class OrderService:
    def __init__(self, pricing, payment, orders, notifier):
        self.pricing, self.payment, self.orders, self.notifier = pricing, payment, orders, notifier
    def place(self, cart, user):
        total = self.pricing.total(cart, user)
        self.payment.charge(user, total)
        self.orders.save(user, total)
        self.notifier.order_placed(user, total)   # each collaborator focused

class ReportService: ...
class NewsletterService: ...
```

**🧠 The Fix** — Splitting `SystemManager` into `UserService`, `OrderService`, `ReportService`, etc. gives
each a single reason to change and lets you test/deploy/reason about them independently. The `Manager`/
`System` naming was the tell — a name that can't describe one job is usually a God Object forming. Compose
the focused services; don't centralize.

### Go

**❌ The Smell**

```go
// One struct holds every dependency and every method — the God struct.
type App struct {
    db     *sql.DB
    stripe *stripe.Client
    mailer *Mailer
    cache  *redis.Client
    // ...everything
}
func (a *App) PlaceOrder(cart Cart, user User) error { /* validate + charge + save + email inline */ }
func (a *App) Register(u User) error                 { /* ... */ }
func (a *App) Report() ([]Row, error)                { /* ... */ }
// ...50 methods on one struct
```

**✅ The Refactor**

```go
// Small structs with focused dependencies; a use case composes them.
type Payment struct{ gw Gateway }
func (p Payment) Charge(u User, amt int) error { return p.gw.Charge(u.Card, amt) }

type Orders struct{ db *sql.DB }
func (o Orders) Save(order Order) error { /* ... */ return nil }

type PlaceOrder struct {                 // depends only on what it uses
    pricing  Pricing
    payment  Payment
    orders   Orders
    notifier Notifier
}
func (uc PlaceOrder) Run(cart Cart, user User) error {
    total := uc.pricing.Total(cart, user)
    if err := uc.payment.Charge(user, total); err != nil { return err }
    if err := uc.orders.Save(Order{UserID: user.ID, Total: total}); err != nil { return err }
    return uc.notifier.OrderPlaced(user, total)
}
```

**🧠 The Fix** — Breaking the God `App` struct into `Payment`, `Orders`, and a `PlaceOrder` use case that
depends only on what it needs makes dependencies explicit and each piece testable with small fakes. Go's
small-interface culture pushes this way naturally — a struct that accumulates every dependency is the smell,
and focused structs composed at `main` are the cure.

## Related Patterns

- **Single Responsibility Principle** — the God Object is its wholesale violation; the refactor *is* applying
  SRP, one responsibility per class.
- **Facade** — a legitimate single entry point that *delegates* to subsystems, versus a God Object that
  *implements* everything itself; the difference is delegation vs. concentration.
- **Spaghetti Code** — often a companion: a God Object's internal tangle of everything-calls-everything is
  spaghetti at the method level.
