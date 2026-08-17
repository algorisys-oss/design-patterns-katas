---
id: event-sourcing
category: architectural
sequence: 8
title: Event Sourcing
also_known_as: [Event Log, Append-Only State]
gof: false
intent: "Store state as an append-only log of events that happened, and rebuild current state by replaying them — instead of storing only the latest snapshot."
frequency: medium
difficulty: advanced
tags: [architecture, events, audit, append-only, replay]
related: [cqrs, pub-sub, unit-of-work]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Persist **what happened**, not **what is**. Every change becomes an immutable **event**
(`MoneyDeposited`, `OrderShipped`) appended to a log; current state is a **fold** over those events.
The event log is the source of truth, and the "current state" is just a cached projection of it.

Because you keep the full history, you get things a snapshot throws away: a perfect audit trail,
the ability to reconstruct state at any past moment, and the freedom to build brand-new read models
by replaying events you already have.

## The Problem

Storing only the latest state — the normal `UPDATE` — quietly destroys information:

- **Lost history** — an `UPDATE` overwrites the old value; *why* and *when* it changed is gone
  unless you bolted on audit logging.
- **No time travel** — you can't ask "what did this look like last Tuesday?" because only *now* exists.
- **Audit as an afterthought** — compliance and debugging need the trail, so teams reinvent it with
  triggers and history tables that drift from the real data.
- **Rigid read shapes** — a new report needs data you didn't think to keep; with only current state,
  it's unrecoverable.

## Structure

Key Components:

- **Event** — an immutable fact about something that happened, in the past tense.
- **Aggregate** — a consistency boundary that validates a command and emits event(s); its state is
  the fold of its events.
- **Event Store** — the append-only log; the system of record.
- **Replay** — rebuilding an aggregate's (or projection's) state by folding its events.
- **Projections** — read models built by consuming the event stream (this is where CQRS meets it).

```
Command ──► Aggregate ──emits──► Event Store  (append-only log)
              ▲  fold to rebuild      │ feeds
              └──────replay───────────┤
                                      ▼
                                  Projection ──► Read Model
```

## When to Use

- A full, trustworthy audit trail is a first-class requirement (finance, healthcare, compliance).
- You need to reconstruct past state or analyze how state evolved.
- New read models will be needed over time and can be built by replaying history.
- The domain is naturally event-driven ("things happen") rather than record-editing.

## Advantages and Disadvantages

### Advantages
- **Complete history** — every change is preserved as a first-class fact; audit is built in.
- **Time travel & replay** — reconstruct any past state; build new projections from old events.
- **Debuggability** — reproduce a bug by replaying the exact events that led to it.

### Disadvantages
- **Complexity** — event design, versioning, snapshots, and replay are substantial machinery.
- **Eventual consistency** — projections lag the log; reads aren't the write's immediate result.
- **Schema evolution is hard** — events are immutable forever, so changing their shape means
  versioning and upcasting old events, not migrating rows.

## Common Mistakes

- **Events as CRUD in disguise** — `UserUpdated { fields… }` throws away intent; model meaningful
  domain events (`EmailChanged`, `SubscriptionCancelled`).
- **No snapshots** — folding thousands of events on every load gets slow; snapshot aggregate state
  periodically and replay only the tail.
- **Mutating or deleting events** — the log is append-only; "fixing" an event breaks the source of
  truth. Correct with a new compensating event.
- **Ignoring event versioning** — schemas evolve; without a versioning/upcasting strategy, old
  events become unreadable.

## Key Takeaways

- Store the stream of events; derive current state by folding them — the log is the truth.
- You gain audit, time-travel, and replayable projections; you pay in complexity and consistency.
- Events are immutable and forever, so model them as meaningful facts and plan for versioning.
- It pairs naturally with CQRS: events on the write side, projections as the read models.

## Implementations

### JavaScript

*Targets modern JavaScript (ES2015+).*

**❌ Naive**

```js
// Only the latest balance is kept; every change overwrites the last, history lost.
class Account {
  constructor() { this.balance = 0; }
  deposit(n) { this.balance += n; }   // previous value gone
  withdraw(n) { this.balance -= n; }
}
```

**✅ Idiomatic**

```js
// State is a fold over an append-only event list.
class Account {
  constructor(events = []) {
    this.events = [];
    events.forEach((e) => this.#apply(e)); // rebuild by replay
  }
  deposit(n) { this.#record({ type: "Deposited", amount: n }); }
  withdraw(n) {
    if (this.balance < n) throw new Error("insufficient");   // rule on the command
    this.#record({ type: "Withdrew", amount: n });
  }
  #record(e) { this.events.push(e); this.#apply(e); }        // append + apply
  #apply(e) {                                                 // the fold
    if (e.type === "Deposited") this.balance = (this.balance ?? 0) + e.amount;
    if (e.type === "Withdrew") this.balance -= e.amount;
  }
}
// persist account.events to the store; reload with new Account(loadedEvents)
```

**🧠 Tradeoff** — Recording `Deposited`/`Withdrew` events and folding them to a balance keeps the
whole history and makes reload a replay. You separate *deciding* (the rule in `withdraw`) from
*applying* (`#apply`, which never rejects). The cost is that every read of `balance` is derived, and
you'll eventually need snapshots and event versioning — real work you skip with a plain field.

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// UPDATE overwrites state; the prior row (and the reason) is gone.
await pool.query("UPDATE accounts SET balance = balance + $1 WHERE id=$2", [amount, id]);
```

**✅ Idiomatic**

```js
// Append events to a log; fold them to get current state; project for reads.
async function append(pool, streamId, event) {
  await pool.query(
    "INSERT INTO events(stream_id, seq, type, data) VALUES ($1, (SELECT COALESCE(MAX(seq),0)+1 FROM events WHERE stream_id=$1), $2, $3)",
    [streamId, event.type, event.data],
  );
}
async function load(pool, streamId) {
  const { rows } = await pool.query("SELECT type, data FROM events WHERE stream_id=$1 ORDER BY seq", [streamId]);
  return rows.reduce(applyEvent, initialState()); // rebuild by fold
}
// a projector tails the events table and upserts read models
```

**🧠 Tradeoff** — A single append-only `events` table with a per-stream sequence is a serviceable
event store, and `reduce(applyEvent, …)` rebuilds state. It gives you audit and replay on ordinary
Postgres. You now own optimistic concurrency (the `seq`), projections, and snapshots for hot streams
— which is why dedicated stores (EventStoreDB) exist for heavier use.

### Python

*Targets Python 3.12.*

**❌ Naive**

```python
# Mutating the model loses the history of how it got here.
account.balance += amount
session.commit()
```

**✅ Idiomatic**

```python
from dataclasses import dataclass, field

@dataclass
class Account:
    events: list = field(default_factory=list)
    balance: int = 0

    @classmethod
    def replay(cls, events):           # rebuild from history
        acc = cls()
        for e in events:
            acc._apply(e)
        return acc

    def deposit(self, n):
        self._record(("Deposited", n))
    def withdraw(self, n):
        if self.balance < n:
            raise ValueError("insufficient")
        self._record(("Withdrew", n))

    def _record(self, e):
        self.events.append(e)
        self._apply(e)
    def _apply(self, e):
        kind, n = e
        self.balance += n if kind == "Deposited" else -n
```

**🧠 Tradeoff** — A `replay` classmethod plus `_record`/`_apply` gives clean event sourcing in
plain Python: decide-then-apply, full history in `events`. It's a natural fit for DDD aggregates and
testable without a database. The perennial costs apply — snapshots for long streams and a versioning
plan for the event shapes, since those tuples/dicts are your permanent schema.

### Elixir

*Targets Elixir 1.18.*

**❌ Naive**

```elixir
# GenServer holds only the latest state; a crash/restart loses the history.
def handle_cast({:deposit, n}, balance), do: {:noreply, balance + n}  # prior states gone
```

**✅ Idiomatic**

```elixir
# Decide → emit events → apply. Persist the events; rebuild by folding them.
defmodule Account do
  def decide(%{balance: b}, {:withdraw, n}) when n > b, do: {:error, :insufficient}
  def decide(_state, {:deposit, n}), do: {:ok, [{:deposited, n}]}
  def decide(_state, {:withdraw, n}), do: {:ok, [{:withdrew, n}]}

  def apply(state, {:deposited, n}), do: %{state | balance: state.balance + n}
  def apply(state, {:withdrew, n}), do: %{state | balance: state.balance - n}

  def replay(events), do: Enum.reduce(events, %{balance: 0}, &apply(&2, &1))
end
# persist the emitted events to an event store; the Commanded library formalizes this on the BEAM.
```

**🧠 Tradeoff** — The functional decide/apply split is a beautiful fit for Elixir: `decide/2`
validates a command and returns events (pure, easily tested), `apply/2` folds them, and `replay/1`
is `Enum.reduce`. Immutable data and pattern matching make events idiomatic, and Commanded provides
a full event-sourced/CQRS framework. The write side is elegant; the operational weight (stores,
projections, snapshots) is the same everywhere.

### Go

*Targets Go 1.26.*

**❌ Naive**

```go
// Overwrite the balance; no record of how it changed.
func (a *Account) Deposit(n int) { a.balance += n }
```

**✅ Idiomatic**

```go
// Commands produce events; events are applied and appended. Replay folds them.
type Event struct {
    Type   string
    Amount int
}

type Account struct{ balance int }

func (a *Account) Withdraw(n int) ([]Event, error) {
    if n > a.balance {
        return nil, errors.New("insufficient")
    }
    e := Event{Type: "Withdrew", Amount: n}
    a.apply(e)
    return []Event{e}, nil // caller appends to the store
}

func (a *Account) apply(e Event) {
    switch e.Type {
    case "Deposited":
        a.balance += e.Amount
    case "Withdrew":
        a.balance -= e.Amount
    }
}

func Replay(events []Event) *Account {
    a := &Account{}
    for _, e := range events {
        a.apply(e)
    }
    return a
}
```

**🧠 Tradeoff** — Go keeps it explicit: a command method validates, calls `apply`, and returns the
events for the caller to persist; `Replay` folds a slice back into state. No framework hides the
mechanics, so the event flow is obvious and testable. You build the store, concurrency control, and
projections yourself — the usual Go bargain of clarity for hand-written plumbing.

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// Only the latest balance survives; each change overwrites the last.
public sealed class Account
{
    public int Balance { get; private set; }
    public void Deposit(int n) => Balance += n;  // previous value gone
    public void Withdraw(int n) => Balance -= n;
}
```

**✅ Idiomatic**

```csharp
// Commands validate and emit events; state is a fold over them.
var account = new Account();
account.Deposit(100);
account.Withdraw(30);
Console.WriteLine(account.Balance); // 70

var rebuilt = Account.Replay(account.Events); // reload = replay
Console.WriteLine(rebuilt.Balance);           // 70

public abstract record Event;
public sealed record Deposited(int Amount) : Event;
public sealed record Withdrew(int Amount) : Event;

public sealed class Account
{
    public int Balance { get; private set; }
    public List<Event> Events { get; } = [];

    public void Deposit(int n) => Record(new Deposited(n));

    public void Withdraw(int n)
    {
        if (n > Balance) throw new InvalidOperationException("insufficient"); // rule on the command
        Record(new Withdrew(n));
    }

    private void Record(Event e) { Events.Add(e); Apply(e); } // append + apply

    private void Apply(Event e) => Balance += e switch        // the fold — never rejects
    {
        Deposited d => d.Amount,
        Withdrew w => -w.Amount,
        _ => 0, // the hierarchy is open, so the compiler demands a default arm
    };

    public static Account Replay(IEnumerable<Event> events)
    {
        var account = new Account();
        foreach (var e in events) account.Apply(e);
        return account;
    }
}
```

**🧠 Tradeoff** — Records are the right event shape in C#: immutable, value-equal, one line each,
and the type-pattern `switch` is the fold. The weak spot is that a record hierarchy is open — the
compiler can't know `Deposited` and `Withdrew` are the only events, so every fold needs a default
arm, and a newly added event type silently falls into it instead of failing the build (Rust's enum
does better here). For real systems, Marten turns Postgres into an event store and EventStoreDB is
the dedicated one — the versioning and snapshot work remains yours either way.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// Overwrite the balance; how it got here is gone.
struct Account {
    balance: i64,
}

impl Account {
    fn deposit(&mut self, n: i64) {
        self.balance += n; // previous value gone
    }
}
```

**✅ Idiomatic**

```rust
// Events are an enum: a closed set of facts, matched exhaustively.
#[derive(Clone, Debug)]
enum Event {
    Deposited(u32),
    Withdrew(u32),
}

#[derive(Default)]
struct Account {
    balance: i64,
    events: Vec<Event>, // the append-only log
}

impl Account {
    fn deposit(&mut self, n: u32) {
        self.record(Event::Deposited(n));
    }

    fn withdraw(&mut self, n: u32) -> Result<(), String> {
        if i64::from(n) > self.balance {
            return Err("insufficient".into()); // rule on the command
        }
        self.record(Event::Withdrew(n));
        Ok(())
    }

    fn record(&mut self, e: Event) { // append + apply
        self.apply(&e);
        self.events.push(e);
    }

    fn apply(&mut self, e: &Event) { // the fold step — never rejects
        match e {
            Event::Deposited(n) => self.balance += i64::from(*n),
            Event::Withdrew(n) => self.balance -= i64::from(*n),
        }
    }

    fn replay(events: Vec<Event>) -> Account {
        let mut account = Account::default();
        for e in &events {
            account.apply(e);
        }
        account.events = events;
        account
    }
}

fn main() {
    let mut account = Account::default();
    account.deposit(100);
    account.withdraw(30).unwrap();
    println!("balance {}", account.balance); // balance 70

    let rebuilt = Account::replay(account.events.clone()); // reload = replay
    println!("replayed {}", rebuilt.balance); // replayed 70
}
```

**🧠 Tradeoff** — The enum is exactly what an event schema wants to be: a closed set, and the
exhaustive `match` means adding a `TransferredOut` variant breaks every fold that doesn't handle
it — at compile time. For a permanent, append-only schema, that's the strongest guarantee any
language here offers. The decide/apply split falls out of the types too: `withdraw` returns
`Result` (commands can fail), `apply` returns nothing (facts can't be rejected). Persistence means
serializing the enum (serde) — and event versioning is still your problem; the compiler checks
today's variants, not last year's bytes on disk.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// Only the latest balance is kept; each change overwrites the last.
const Account = struct {
    balance: i64 = 0,

    fn deposit(self: *Account, n: u32) void {
        self.balance += n; // previous value gone
    }
};
```

**✅ Idiomatic**

```zig
const std = @import("std");

// Events are a tagged union: a closed set of facts, switched exhaustively.
const Event = union(enum) {
    deposited: u32,
    withdrew: u32,
};

const Account = struct {
    balance: i64 = 0,
    events: [32]Event = undefined, // the append-only log (fixed-size for the demo)
    len: usize = 0,

    fn deposit(self: *Account, n: u32) !void {
        try self.record(.{ .deposited = n });
    }

    fn withdraw(self: *Account, n: u32) !void {
        if (n > self.balance) return error.Insufficient; // rule on the command
        try self.record(.{ .withdrew = n });
    }

    fn record(self: *Account, e: Event) !void { // append + apply
        if (self.len == self.events.len) return error.LogFull;
        self.events[self.len] = e;
        self.len += 1;
        self.apply(e);
    }

    fn apply(self: *Account, e: Event) void { // the fold step — never rejects
        switch (e) {
            .deposited => |n| self.balance += n,
            .withdrew => |n| self.balance -= n,
        }
    }

    fn replay(events: []const Event) Account {
        var account = Account{};
        for (events) |e| {
            account.events[account.len] = e;
            account.len += 1;
            account.apply(e);
        }
        return account;
    }
};

pub fn main() !void {
    var account = Account{};
    try account.deposit(100);
    try account.withdraw(30);
    std.debug.print("balance {d}\n", .{account.balance}); // balance 70

    const rebuilt = Account.replay(account.events[0..account.len]); // reload = replay
    std.debug.print("replayed {d}\n", .{rebuilt.balance}); // replayed 70
}
```

**🧠 Tradeoff** — The tagged union gives Zig the same guarantee as Rust's enum: the event set is
closed, and an exhaustive `switch` means a new event variant fails every fold that misses it at
compile time — the property you most want for a schema that lives forever. The fixed array stands
in for the log; a real store appends with an explicit allocator and writes bytes you laid out
yourself (`std.json` or hand-packed) — no serialization magic, which makes the event-versioning
problem visible instead of deferred. Commands return error unions, `apply` returns `void`: the
decide/apply split, in the signatures.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// Only the latest balance survives; each change overwrites the last.
class Account {
    private int balance;

    void deposit(int n) { balance += n; } // previous value gone
    void withdraw(int n) { balance -= n; }
}
```

**✅ Idiomatic**

```java
import java.util.ArrayList;
import java.util.List;

// Events are a sealed set of records: immutable facts, closed at compile time.
sealed interface Event permits Deposited, Withdrew {}
record Deposited(int amount) implements Event {}
record Withdrew(int amount) implements Event {}

class Account {
    private int balance;
    private final List<Event> events = new ArrayList<>(); // the append-only log

    int balance() { return balance; }
    List<Event> events() { return List.copyOf(events); }

    void deposit(int n) { record(new Deposited(n)); }

    void withdraw(int n) {
        if (n > balance) throw new IllegalStateException("insufficient"); // rule on the command
        record(new Withdrew(n));
    }

    private void record(Event e) { events.add(e); apply(e); } // append + apply

    private void apply(Event e) {
        balance += switch (e) { // the fold — exhaustive, no default arm needed
            case Deposited d -> d.amount();
            case Withdrew w -> -w.amount();
        };
    }

    static Account replay(List<Event> history) { // reload = replay
        var account = new Account();
        for (var e : history) account.apply(e);
        account.events.addAll(history);
        return account;
    }
}

public class Demo {
    public static void main(String[] args) {
        var account = new Account();
        account.deposit(100);
        account.withdraw(30);
        System.out.println(account.balance()); // 70

        var rebuilt = Account.replay(account.events());
        System.out.println(rebuilt.balance()); // 70
    }
}
```

**🧠 Tradeoff** — The sealed interface is Java catching up to Rust's enum and Zig's tagged union:
the event set is closed, so the pattern-matching `switch` is exhaustive with no default arm, and
adding a `TransferredOut` event breaks every fold that ignores it — at compile time, the guarantee
you most want for a schema that lives forever. Contrast the C# tab, where the open record hierarchy
forces a default arm that swallows new events silently. Records keep each event to one immutable,
value-equal line, and the decide/apply split reads clearly: `withdraw` can reject, `apply` never
does. Persistence still means serializing the records (Jackson) into an events table or a store
like Axon or EventStoreDB — and versioning old events stays your problem; the compiler checks
today's types, not last year's bytes.

## Applications

- **Financial ledgers** — banking and accounting are naturally event-sourced; the transaction log
  *is* the truth, and balances are derived (backend).
- **Audit & compliance** — regulated domains get a tamper-evident history for free as the primary
  model, not an add-on (backend).
- **Order & fulfillment** — an order's life (placed, paid, shipped, delivered) is a stream of
  events driving projections and workflows (backend).
- **Version control & collaborative editing** — Git and CRDT-based editors store operations/commits
  and fold them into current state (backend & frontend).
- **Debugging & analytics** — replay production event streams to reproduce bugs or build new
  metrics from history you already captured (backend).

**In modern systems:**

- **Workflow engine** — a run's history *is* its event log; instance state is a fold over it,
  giving replay, resume, and audit for free.
- **Multi-agent** — the agent's message and tool-call log is the source of truth; the conversation
  state is derived from it, so a session can be replayed exactly.
- **Low-code** — every builder edit stored as an event, so the document is a replay and
  time-travel undo is trivial.

## Related Patterns

- **CQRS** — the natural read side: projections consume the event stream to build query models,
  while events are the write side's source of truth.
- **Publish–Subscribe** — events are typically published so projections and other services react to
  them.
- **Unit of Work** — appending an aggregate's new events is itself a small transactional unit; the
  event store commits them atomically.
