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
languages: [javascript, python, go, csharp, rust, zig, java]
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

### CSharp

**❌ The Smell**

```csharp
// One class owns validation, pricing, payment, persistence, and email.
public sealed class OrderManager(SqlConnection db, StripeClient stripe, Mailer mailer)
{
    public async Task PlaceOrder(Cart cart, User user)
    {
        if (cart.Items.Count == 0) throw new InvalidOperationException("empty"); // validation
        var total = cart.Items.Sum(i => i.Price);
        if (user.Vip) total *= 0.9m;                           // pricing rules
        await stripe.Charge(user.Card, total);                 // payment
        await db.ExecuteAsync("INSERT INTO orders ...");       // persistence
        await mailer.Send(user.Email, $"Order for ${total}");  // notification
    }
    // ...20 more unrelated methods, all sharing these dependencies
}
```

**✅ The Refactor**

```csharp
// One sealed class per responsibility; a thin use case composes them.
public sealed class OrderValidator
{
    public void Check(Cart cart)
    {
        if (cart.Items.Count == 0) throw new InvalidOperationException("empty");
    }
}

public sealed class Pricing
{
    public decimal Total(Cart cart, User user)
    {
        var t = cart.Items.Sum(i => i.Price);
        return user.Vip ? t * 0.9m : t;
    }
}

public sealed class Payment(IGateway gw)
{
    public Task Charge(User user, decimal amount) => gw.Charge(user.Card, amount);
}

// Primary constructor: the dependency list IS the signature — and it stays short.
public sealed class PlaceOrder(OrderValidator validator, Pricing pricing,
                               Payment payment, Orders orders, Notifier notifier)
{
    public async Task Run(Cart cart, User user)
    {
        validator.Check(cart);
        var total = pricing.Total(cart, user);
        await payment.Charge(user, total);
        await orders.Save(new Order(user.Id, total));
        await notifier.OrderPlaced(user, total);
    }
}
```

**🧠 The Fix** — Primary constructors make the dependency list impossible to hide: a God class shows up as a
constructor taking ten services, and a DI container will wire it without complaint — the container hides the
pain, not the problem. After the split, `Pricing` tests with no Stripe and no database, and each class has one
reason to change. Watch for the tell in C# codebases: a `Manager` or `Service` whose constructor keeps growing.

### Rust

**❌ The Smell**

```rust
// One struct owns every dependency and every method.
struct App {
    db: DbPool,
    stripe: StripeClient,
    mailer: Mailer,
    cache: Cache,
    // ...everything
}

impl App {
    fn place_order(&mut self, cart: &Cart, user: &User) { /* validate + charge + save + email inline */ }
    fn register(&mut self, user: User) { /* ... */ }
    fn report(&self) -> Vec<Row> { /* ... */ }
    // ...50 methods, and every &mut self borrow locks the whole struct
}
```

**✅ The Refactor**

```rust
// Small structs with focused dependencies; a use case composes them.
struct Pricing;
impl Pricing {
    fn total(&self, cart: &Cart, user: &User) -> u32 {
        let t: u32 = cart.items.iter().map(|i| i.price).sum();
        if user.vip { t * 9 / 10 } else { t }
    }
}

struct Payment { gw: Gateway }
impl Payment {
    fn charge(&self, user: &User, amount: u32) -> Result<(), PayError> {
        self.gw.charge(&user.card, amount)
    }
}

struct PlaceOrder {                  // owns only what it uses
    pricing: Pricing,
    payment: Payment,
    orders: Orders,
    notifier: Notifier,
}

impl PlaceOrder {
    fn run(&self, cart: &Cart, user: &User) -> Result<(), PayError> {
        let total = self.pricing.total(cart, user);
        self.payment.charge(user, total)?;
        self.orders.save(user.id, total)?;
        self.notifier.order_placed(user, total)
    }
}
```

**🧠 The Fix** — Rust punishes God structs earlier than most languages: one `&mut self` method borrows the
*whole* struct, so two responsibilities can't be touched at once and the borrow checker starts fighting you
long before the file hits 3,000 lines. That pressure is a feature — splitting into `Pricing`, `Payment`, and a
`PlaceOrder` that owns only what it uses gives you disjoint borrows, small testable pieces, and error flow
that's explicit in each signature.

### Zig

**❌ The Smell**

```zig
// One struct holds every dependency and every method.
const App = struct {
    db: *Db,
    stripe: *Stripe,
    mailer: *Mailer,
    cache: *Cache,
    // ...everything

    pub fn placeOrder(self: *App, cart: Cart, user: User) !void {
        // validate + charge + save + email, all inline
    }
    pub fn register(self: *App, user: User) !void {
        // ...
    }
    // ...50 methods on one struct
};
```

**✅ The Refactor**

```zig
// Small structs with focused fields; a use case composes them.
const Pricing = struct {
    pub fn total(cart: Cart, user: User) u32 {
        var t: u32 = 0;
        for (cart.items) |item| t += item.price;
        return if (user.vip) t * 9 / 10 else t;
    }
};

const Payment = struct {
    gw: *Gateway,
    pub fn charge(self: Payment, user: User, amount: u32) !void {
        try self.gw.charge(user.card, amount);
    }
};

const PlaceOrder = struct {
    payment: Payment,
    orders: Orders,
    notifier: Notifier,

    pub fn run(self: PlaceOrder, cart: Cart, user: User) !void {
        if (cart.items.len == 0) return error.EmptyCart;
        const total = Pricing.total(cart, user);
        try self.payment.charge(user, total);
        try self.orders.save(user.id, total);
        try self.notifier.orderPlaced(user, total);
    }
};
```

**🧠 The Fix** — Zig has no DI framework to quietly assemble a giant struct: every field is filled by hand at
every construction site, so a God struct is visible pain the moment you try to build one in a test. The split
makes that cheap — `Pricing` needs no state at all, so it becomes a namespaced function you call directly, and
`PlaceOrder` declares exactly the three dependencies it uses. Plain structs composed in `main` are already the
idiomatic Zig shape; the God struct is what takes effort to maintain.

### Java

**❌ The Smell**

```java
// One class owns every dependency and every responsibility.
class OrderManager {
    private final Connection db;
    private final StripeClient stripe;
    private final Mailer mailer;
    private final Cache cache;
    // ...every dependency in the system, wired by the DI container without complaint

    void placeOrder(Cart cart, User user) throws Exception {
        if (cart.items().isEmpty()) throw new IllegalStateException("empty"); // validation
        var total = cart.items().stream().mapToInt(Item::price).sum();
        if (user.vip()) total = total * 9 / 10;                    // pricing rules
        stripe.charge(user.card(), total);                         // payment
        db.prepareStatement("INSERT INTO orders ...").execute();   // persistence
        mailer.send(user.email(), "Order for $" + total);          // notification
    }
    // ...40 more methods sharing the same fields
}
```

**✅ The Refactor**

```java
// One class per responsibility; records make the wiring short.
class Pricing {
    int total(Cart cart, User user) {
        var t = cart.items().stream().mapToInt(Item::price).sum();
        return user.vip() ? t * 9 / 10 : t;
    }
}

record Payment(Gateway gw) {
    void charge(User user, int amount) { gw.charge(user.card(), amount); }
}

record Order(String userId, int total) {}

record PlaceOrder(Pricing pricing, Payment payment, Orders orders, Notifier notifier) {
    void run(Cart cart, User user) {
        if (cart.items().isEmpty()) throw new IllegalStateException("empty");
        var total = pricing.total(cart, user);
        payment.charge(user, total);
        orders.save(new Order(user.id(), total));
        notifier.orderPlaced(user, total);
    }
}
```

**🧠 The Fix** — Java's DI culture is what lets God classes grow painlessly: field injection (`@Autowired`
on a private field) hides the dependency list, so `OrderManager` gains a collaborator per feature and
nothing ever pushes back. Constructor injection restores the tell — a ten-argument constructor is a smell
you can see in review — and records make the honest form cheap: `PlaceOrder` declares its four dependencies
in one line and gets the constructor free. After the split, `Pricing` tests with no Stripe and no database,
and each class has one reason to change.

## Related Patterns

- **Single Responsibility Principle** — the God Object is its wholesale violation; the refactor *is* applying
  SRP, one responsibility per class.
- **Facade** — a legitimate single entry point that *delegates* to subsystems, versus a God Object that
  *implements* everything itself; the difference is delegation vs. concentration.
- **Spaghetti Code** — often a companion: a God Object's internal tangle of everything-calls-everything is
  spaghetti at the method level.
