---
id: actor
category: concurrency
sequence: 4
title: Actor
also_known_as: [Active Object]
gof: false
intent: "Wrap mutable state in a process that owns it and communicates only by messages, so state is updated one message at a time — no shared memory, no locks."
frequency: medium
difficulty: intermediate
tags: [concurrency, message-passing, isolation, no-shared-state, mailbox]
related: [producer-consumer, pub-sub, future-promise]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Give each piece of mutable state its own **actor**: a unit with private state, a **mailbox**, and
a loop that pulls one message at a time and handles it. Nothing outside the actor touches its
state — you send it a message and it decides what to do.

Because an actor processes messages **sequentially**, its state is only ever touched by one
message at a time. That removes the need for locks entirely: there is no shared memory to guard,
so there is nothing to race.

## The Problem

Shared mutable state across threads is the hardest thing in concurrency. The usual fix — locks —
trades one problem for a pile of new ones:

- **Races** — forget to guard one access and you get corruption that only shows up under load.
- **Deadlocks** — two threads grabbing two locks in different orders freeze each other.
- **Lock contention** — coarse locks serialize everything (killing the concurrency you wanted);
  fine-grained locks are error-prone.
- **Invisible coupling** — every caller must know the locking protocol; one that doesn't breaks
  everyone.

The root cause is *sharing*. If two threads didn't share the state, none of this could happen.

## Structure

Key Components:

- **Actor** — owns private state and a behavior: a function from (state, message) to a new state
  (and possibly outgoing messages).
- **Mailbox** — a queue of incoming messages; the actor consumes it one at a time.
- **Address / reference** — how others reach the actor; they can only `send`, never read state.
- **Messages** — immutable values describing requests; the actor's only input.

```
Sender A ──send──►┐
                  ├─►  [ ▢ ▢ ▢ ] ──►  Actor { state }
Sender B ──send──►┘     mailbox        handles one msg at a time
```

## When to Use

- Independent stateful entities that mostly act alone (a game character, a connection, a session).
- You want to avoid locks by construction, not discipline.
- Work distributes naturally across machines — actors don't care if the mailbox is local or remote.
- You need supervision/fault isolation: one actor crashing shouldn't corrupt others.

## Advantages and Disadvantages

### Advantages
- **No locks** — sequential message handling means no shared state to guard.
- **Isolation** — a crashing actor takes down only its own state; supervisors can restart it.
- **Location transparency** — sending a message is the same whether the actor is local or remote.

### Disadvantages
- **Async everywhere** — request/reply becomes message + future; simple reads turn into round-trips.
- **Mailbox overflow** — an actor slower than its senders grows an unbounded mailbox (backpressure
  isn't automatic).
- **Sequential bottleneck** — one actor processes one message at a time; a hot actor is a serial
  chokepoint you must shard.

## Common Mistakes

- **Leaking shared state into messages** — passing a mutable object by reference reintroduces
  sharing; messages must be immutable (or copied).
- **Blocking inside the handler** — a long synchronous call in one message stalls the whole
  mailbox; offload slow work and reply later.
- **Unbounded mailbox** — no limit means a fast sender can OOM a slow actor; add backpressure or
  bounded mailboxes.
- **Chatty request/reply** — turning every field access into a message round-trip is slow; design
  coarse messages that do real work.

## Key Takeaways

- One-message-at-a-time processing removes shared state, and with it the need for locks.
- An actor is state + mailbox + behavior; the outside world can only send it messages.
- Isolation buys fault tolerance (crash and restart) and location transparency (local or remote).
- The trade is asynchrony and per-actor serialization — shard hot actors, bound mailboxes.

## Implementations

### JavaScript

**❌ Naive**

```js
// Shared object mutated from many async callers — interleaved awaits corrupt it.
const account = { balance: 0 };
async function deposit(n) {
  const b = account.balance;
  await audit(n);            // another deposit can run here
  account.balance = b + n;   // lost update
}
```

**✅ Idiomatic**

```js
// An actor: a private state guarded by a serial mailbox. Messages queue and
// run one at a time, so handlers never interleave.
function actor(state, handlers) {
  let tail = Promise.resolve();
  return (type, payload) =>
    (tail = tail.then(async () => {
      state = await handlers[type](state, payload);
    }));
}

const account = actor({ balance: 0 }, {
  async deposit(s, n) {
    await audit(n);
    return { balance: s.balance + n }; // no interleave — mailbox is serial
  },
});
// account("deposit", 100); account("deposit", 50);  // applied in order, no races
```

**🧠 Tradeoff** — JS has no actors, but the single-threaded loop plus a promise chain gives you a
serial mailbox: chaining each message onto the previous guarantees handlers never interleave, so
the lost-update bug is gone. It's cooperative, not parallel — one event loop — so it isolates
*logical* races, not CPU work. For true isolation across cores, use Web Workers as actors.

### Node.js

**❌ Naive**

```js
// A new worker thread per request, sharing nothing but also pooling nothing,
// and no ownership model for the state each should hold.
```

**✅ Idiomatic**

```js
// worker_threads are real actors: isolated memory, message-passing only.
const { Worker } = require("node:worker_threads");

class ActorRef {
  constructor(file) {
    this.worker = new Worker(file); // owns its state, no shared memory
    this.pending = new Map();
    this.seq = 0;
    this.worker.on("message", ({ id, result }) => this.pending.get(id)?.(result));
  }
  send(msg) {
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ id, msg }); // into the actor's mailbox
    });
  }
}
```

**🧠 Tradeoff** — `worker_threads` give genuine actor semantics: each worker has isolated memory
and communicates only by `postMessage`, so there is literally no shared state to race — and it's
real parallelism across cores. The cost is serialization overhead on every message and the
round-trip to model request/reply; it's worth it for CPU-bound or crash-isolated work, overkill
for coordinating a little in-process state.

### Python

**❌ Naive**

```python
# Shared dict mutated by many threads — needs a lock, and locks bring deadlocks.
state = {"balance": 0}
def deposit(n):
    state["balance"] += n   # not atomic; races without a lock
```

**✅ Idiomatic**

```python
import threading, queue

# An actor: a thread owning private state, fed by a mailbox queue.
class Account(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.mailbox = queue.Queue()
        self._balance = 0

    def send(self, msg):
        self.mailbox.put(msg)

    def run(self):
        while (msg := self.mailbox.get()) is not None:
            kind, *args = msg
            if kind == "deposit":
                self._balance += args[0]  # only this thread touches _balance
```

**🧠 Tradeoff** — Wrapping state in a thread that owns it, fed by a `queue.Queue` mailbox, gets
you the actor discipline: one owner, message-passing, no locks on `_balance`. It's a manual build
(Python has no actor runtime in the stdlib), and the GIL means it isolates logic rather than
parallelizing CPU. Libraries like Pykka or Ray provide fuller actor systems when you need them.

### Elixir

**❌ Naive**

```elixir
# Shared state in ETS is fast but reintroduces the race — concurrent updates
# to the same key need explicit atomic ops or a serialization point.
:ets.insert(:accounts, {:balance, old + n})  # lost update under concurrency
```

**✅ Idiomatic**

```elixir
# The BEAM is an actor runtime; a GenServer is an actor. Its state is private
# and every call/cast is handled one at a time in its own process.
defmodule Account do
  use GenServer

  def start_link(balance), do: GenServer.start_link(__MODULE__, balance)
  def deposit(pid, n), do: GenServer.cast(pid, {:deposit, n})
  def balance(pid), do: GenServer.call(pid, :balance)

  @impl true
  def init(balance), do: {:ok, balance}
  @impl true
  def handle_cast({:deposit, n}, balance), do: {:noreply, balance + n}
  @impl true
  def handle_call(:balance, _from, balance), do: {:reply, balance, balance}
end
```

**🧠 Tradeoff** — This is the actor model's home. A `GenServer` *is* an actor: isolated process,
private state, serial message handling, and a supervisor that restarts it on crash ("let it
crash"). You get fault tolerance and distribution nearly for free. The cost is that everything
stateful becomes a process with an async protocol — but on the BEAM that's the natural grain, so
it rarely feels forced.

### Go

**❌ Naive**

```go
// Shared struct guarded by a mutex — works, but you now own lock ordering,
// contention, and the risk of deadlock as the type grows.
type Account struct {
    mu      sync.Mutex
    balance int
}
func (a *Account) Deposit(n int) {
    a.mu.Lock(); defer a.mu.Unlock()
    a.balance += n
}
```

**✅ Idiomatic**

```go
// "Share memory by communicating": a goroutine owns the state; a channel is
// the mailbox. No mutex — only the owner goroutine touches balance.
type deposit struct{ amount int }
type balance struct{ reply chan int }

func Account(mailbox <-chan any) {
    bal := 0
    for msg := range mailbox { // one message at a time
        switch m := msg.(type) {
        case deposit:
            bal += m.amount
        case balance:
            m.reply <- bal
        }
    }
}
// mailbox := make(chan any); go Account(mailbox)
// mailbox <- deposit{100}
```

**🧠 Tradeoff** — Go's proverb "don't communicate by sharing memory; share memory by
communicating" is the actor model: a goroutine owns the state, a channel is its mailbox, and only
that goroutine mutates `bal` — no mutex, no race. It's lighter than a full actor framework but
also barer: no supervision, no addresses, no location transparency. You get the core discipline
and wire the rest yourself.

### CSharp

**❌ Naive**

```csharp
// Shared balance guarded by a lock — works, but you own the lock discipline
// forever, and every new member must remember it.
public sealed class Account
{
    private readonly object _gate = new();
    private int _balance;

    public void Deposit(int n) { lock (_gate) _balance += n; }
    public int Balance { get { lock (_gate) return _balance; } }
}
```

**✅ Idiomatic**

```csharp
// An actor: a Task loop draining a Channel. The loop is the only code that
// ever touches the balance — no lock anywhere.
using System.Threading.Channels;

var account = new AccountActor();
account.Send(new Deposit(100));
account.Send(new Deposit(50));
Console.WriteLine(await account.GetBalanceAsync()); // 150

public abstract record Message;                     // records: immutable messages
public sealed record Deposit(int Amount) : Message;
public sealed record GetBalance(TaskCompletionSource<int> Reply) : Message;

public sealed class AccountActor
{
    private readonly Channel<Message> _mailbox = Channel.CreateUnbounded<Message>();

    public AccountActor() => _ = Task.Run(RunAsync);

    public void Send(Message msg) => _mailbox.Writer.TryWrite(msg);

    public Task<int> GetBalanceAsync()
    {
        var reply = new TaskCompletionSource<int>();
        Send(new GetBalance(reply)); // the reply channel rides in the message
        return reply.Task;
    }

    private async Task RunAsync()
    {
        var balance = 0; // private to this loop
        await foreach (var msg in _mailbox.Reader.ReadAllAsync()) // one at a time
        {
            switch (msg)
            {
                case Deposit d: balance += d.Amount; break;
                case GetBalance g: g.Reply.SetResult(balance); break;
            }
        }
    }
}
```

**🧠 Tradeoff** — A `Channel` drained by one `Task` is the actor: records make the messages
immutable, the loop is the only reader of `balance`, and `TaskCompletionSource` turns
request/reply into a plain `await`. But it's discipline you assemble, not a runtime you inherit
— compare the Elixir tab, where the mailbox, supervision, and restarts all ship with the BEAM.
When you need that fuller story in .NET (addresses, supervision, distribution), that's Akka.NET
or Orleans; this hand-rolled loop covers the common in-process case.

### Rust

**❌ Naive**

```rust
use std::sync::{Arc, Mutex};
use std::thread;

// Shared state behind Arc<Mutex<..>> — safe, but every caller queues on the
// lock, and the API is "grab the mutex and hope you got the protocol right".
fn main() {
    let balance = Arc::new(Mutex::new(0));
    let handles: Vec<_> = (0..4)
        .map(|_| {
            let b = Arc::clone(&balance);
            thread::spawn(move || *b.lock().unwrap() += 25)
        })
        .collect();
    for h in handles {
        h.join().unwrap();
    }
    println!("{}", *balance.lock().unwrap()); // 100
}
```

**✅ Idiomatic**

```rust
use std::sync::mpsc;
use std::thread;

// Messages are moved into the actor — ownership transfers, nothing is shared.
enum Msg {
    Deposit(i64),
    Balance(mpsc::Sender<i64>), // the reply channel rides in the message
}

// The actor: a thread that OWNS the balance, fed by an mpsc receiver.
fn spawn_account() -> mpsc::Sender<Msg> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut balance = 0; // owned here — no other thread can even name it
        for msg in rx {      // one message at a time
            match msg {
                Msg::Deposit(n) => balance += n,
                Msg::Balance(reply) => {
                    let _ = reply.send(balance);
                }
            }
        }
    });
    tx
}

fn main() {
    let account = spawn_account();
    account.send(Msg::Deposit(100)).unwrap();
    account.send(Msg::Deposit(50)).unwrap();

    let (reply_tx, reply_rx) = mpsc::channel();
    account.send(Msg::Balance(reply_tx)).unwrap();
    println!("balance: {}", reply_rx.recv().unwrap()); // balance: 150
}
```

**🧠 Tradeoff** — This is the natural Rust form, not a workaround: the thread *owns* `balance`,
and ownership means the compiler proves nothing else can touch it — the isolation Elixir gets
from its runtime, Rust gets from the type system at compile time. The message enum is closed
and exhaustively matched, so an unhandled message is a compile error, not a silent drop. What
you don't get is the BEAM's supervision, addresses, or distribution: a panicked actor here is
just a dead thread until you build restart logic around it.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

// Shared globals guarded by a mutex — correct only while every caller
// remembers to take the lock. Nothing enforces it.
var balance: i64 = 0;
var mu: std.Io.Mutex = .init;

fn deposit(io: std.Io, n: i64) !void {
    try mu.lock(io); // locking itself needs the io capability now
    defer mu.unlock(io);
    balance += n;
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

const Msg = union(enum) { deposit: i64, stop };

// The mailbox: a ring buffer guarded by mutex + condition. Senders only ever
// touch the queue; the actor thread is its only reader.
const Mailbox = struct {
    mu: std.Io.Mutex = .init,
    cond: std.Io.Condition = .init,
    buf: [16]Msg = undefined, // bounded: 16 slots (a real one errors when full)
    head: usize = 0,
    len: usize = 0,

    fn send(self: *Mailbox, io: std.Io, msg: Msg) !void {
        try self.mu.lock(io);
        defer self.mu.unlock(io);
        self.buf[(self.head + self.len) % self.buf.len] = msg;
        self.len += 1;
        self.cond.signal(io);
    }

    fn recv(self: *Mailbox, io: std.Io) !Msg {
        try self.mu.lock(io);
        defer self.mu.unlock(io);
        while (self.len == 0) try self.cond.wait(io, &self.mu);
        const msg = self.buf[self.head];
        self.head = (self.head + 1) % self.buf.len;
        self.len -= 1;
        return msg;
    }
};

fn account(io: std.Io, mailbox: *Mailbox) !void {
    var balance: i64 = 0; // on this thread's stack — unreachable from outside
    while (true) {
        switch (try mailbox.recv(io)) { // one message at a time
            .deposit => |n| balance += n,
            .stop => break,
        }
    }
    std.debug.print("final balance: {d}\n", .{balance});
}

pub fn main(init: std.process.Init) !void {
    const io = init.io; // blocking is a capability — threaded in like an allocator
    var mailbox = Mailbox{};
    const actor = try std.Thread.spawn(.{}, account, .{ io, &mailbox });
    try mailbox.send(io, .{ .deposit = 100 });
    try mailbox.send(io, .{ .deposit = 50 });
    try mailbox.send(io, .stop);
    actor.join(); // final balance: 150
}
```

**🧠 Tradeoff** — Zig gives you the parts, not the pattern: mailbox = ring buffer + mutex +
condition, actor = the one thread that reads it. The discipline ("only the owning thread
touches `balance`") is a convention — nothing enforces it, unlike Rust's ownership or the
BEAM's process isolation. In the Elixir tab this entire file collapses into `use GenServer`,
because there the actor model *is* the runtime. What Zig buys back is that every byte is
visible: the mailbox is 16 slots you declared, so backpressure is an explicit decision in your
code, not an unbounded default you inherit. Since 0.17-dev the blocking is visible too —
mutex and condition sit behind `std.Io`, so the mailbox takes an `io` the way allocating
code takes an allocator.

### Java

**❌ Naive**

```java
// Shared balance guarded by synchronized — works, but you own the lock
// discipline forever, and every new method must remember it.
class Account {
    private int balance;

    synchronized void deposit(int n) { balance += n; }
    synchronized int balance() { return balance; }
}
```

**✅ Idiomatic**

```java
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Messages are immutable records; the sealed interface closes the protocol.
sealed interface Message permits Deposit, GetBalance {}
record Deposit(int amount) implements Message {}
record GetBalance(CompletableFuture<Integer> reply) implements Message {}

// The actor: a single-thread executor. Its internal queue is the mailbox,
// and one worker thread is the one-message-at-a-time guarantee.
class AccountActor {
    private final ExecutorService mailbox = Executors.newSingleThreadExecutor();
    private int balance = 0; // touched only by the mailbox thread — no lock

    void send(Message msg) {
        mailbox.execute(() -> {
            switch (msg) { // exhaustive over the sealed protocol
                case Deposit d -> balance += d.amount();
                case GetBalance g -> g.reply().complete(balance);
            }
        });
    }

    CompletableFuture<Integer> balance() {
        var reply = new CompletableFuture<Integer>();
        send(new GetBalance(reply)); // the reply future rides in the message
        return reply;
    }

    void shutdown() { mailbox.shutdown(); }
}

class Demo {
    public static void main(String[] args) {
        var account = new AccountActor();
        account.send(new Deposit(100));
        account.send(new Deposit(50));
        System.out.println(account.balance().join()); // 150
        account.shutdown();
    }
}
```

**🧠 Tradeoff** — the single-thread executor is a mailbox you already had: its queue holds
the messages, its one thread drains them serially, so `balance` needs no lock and handlers
never interleave. Modern Java sharpens the protocol the way Rust's enum does — a sealed
interface plus pattern-matching `switch` means an unhandled message type is a compile
error, and records keep messages immutable. A `CompletableFuture` in the message is
request/reply as a plain `await`-able. It's still discipline, not a runtime: no
supervision, no addresses, an unbounded queue by default — Akka/Pekko supply those when
you need them. Virtual threads add a second honest shape: one virtual thread per actor
looping on a `BlockingQueue` is now affordable at GenServer-like scale.

## Applications

- **Stateful connections** — each WebSocket/session is an actor owning its buffers and state,
  isolated from the others (backend).
- **Telephony & messaging** — Erlang/Elixir run millions of actors (one per call/user) with
  supervision; WhatsApp's backbone is the canonical example (backend).
- **Game entities** — each NPC or player is an actor processing input messages against its own
  state (backend & frontend).
- **IoT device shadows** — one actor per device holds last-known state and serializes commands
  (backend).
- **UI components** — a component with local state and a message reducer (Elm, Redux) is an actor
  in spirit: state changed only through dispatched messages (frontend).

**In modern systems:**

- **Multi-agent** — each agent is an actor with a mailbox: it processes one message at a time,
  owns private state, and never shares memory — the cleanest model for concurrent agents.
- **Workflow engine** — a workflow instance as an actor that owns its state and is driven by
  messages (start, step-done, cancel).
- **Low-code** — a stateful widget as an actor receiving user events serially.

## Related Patterns

- **Producer–Consumer** — an actor's mailbox is a producer–consumer queue with the actor as the
  single consumer.
- **Future / Promise** — an actor `call` (request/reply) hands back a future for the reply while
  the actor keeps handling other messages.
- **Publish–Subscribe** — actors often communicate over pub/sub topics rather than direct
  addresses, decoupling sender from receiver.
