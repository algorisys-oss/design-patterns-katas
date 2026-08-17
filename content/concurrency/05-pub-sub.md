---
id: pub-sub
category: concurrency
sequence: 5
title: Publish–Subscribe
also_known_as: [Pub/Sub, Event Bus]
gof: false
intent: "Let publishers broadcast messages to a topic and subscribers receive them, with neither side knowing about the other — a broker in the middle decouples them."
frequency: high
difficulty: intermediate
tags: [concurrency, messaging, decoupling, events, broadcast]
related: [observer, producer-consumer, actor]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Insert a **broker** between senders and receivers: publishers send messages to a named **topic**,
subscribers register interest in topics, and the broker delivers each message to everyone
subscribed. Publishers don't hold references to subscribers, and vice versa.

This turns N-to-M wiring into N-plus-M: a publisher knows only the topic, a subscriber knows only
the topic, and either side can come and go without the other changing. One message fans out to
*every* interested party.

## The Problem

Wire components together directly and the connections multiply. A module that must notify five
others holds five references and calls five methods; add a sixth listener and you edit the
publisher:

- **Tight coupling** — the sender depends on the concrete receivers, compile-time and forever.
- **Combinatorial wiring** — N senders each knowing M receivers is N×M connections to maintain.
- **Rigid lifecycles** — a receiver can't appear or disappear at runtime without the sender
  managing it.

This is the same coupling the Observer pattern removes for one subject — but pub/sub generalizes
it: many publishers, many topics, and a broker that can live in another process or machine.

## Structure

Key Components:

- **Publisher** — sends a message to a topic; knows nothing about who (if anyone) receives it.
- **Broker / Topic** — routes each published message to the current subscribers of its topic.
- **Subscriber** — registers a handler for a topic; receives every message published there.
- **Message** — the payload, usually with the topic/subject attached.

```
Publisher ──publish("orders", m)──►  [ Broker ]  ──► Subscriber A
                                        topic:   ──► Subscriber B
                                       "orders"  ──► Subscriber C
```

## When to Use

- One event is of interest to several, changing, independent parts of the system.
- You want senders and receivers deployed, scaled, or restarted independently.
- Components should be added without editing the ones that emit the events.
- Communication may cross process or machine boundaries (a message broker).

## Advantages and Disadvantages

### Advantages
- **Loose coupling** — publishers and subscribers share only a topic name.
- **Dynamic membership** — subscribers join and leave at runtime; publishers are none the wiser.
- **Fan-out & scale** — one message reaches many consumers; the broker can span processes/nodes.

### Disadvantages
- **Indirection** — flow is harder to trace; "who handles this event?" has no static answer.
- **Delivery guarantees vary** — in-memory buses drop messages on crash; durability/ordering
  cost real infrastructure.
- **No backpressure by default** — a slow subscriber either blocks the broker or drops messages
  unless you design for it.

## Common Mistakes

- **Leaking subscriptions** — subscribers that never unsubscribe pin memory and keep receiving;
  always provide (and call) an unsubscribe.
- **Assuming delivery** — treating an in-memory bus like a durable queue; if delivery must
  survive crashes, you need a real broker with persistence.
- **Doing heavy work in the handler** — a slow subscriber stalls synchronous brokers; hand off to
  a queue/worker and return fast.
- **Over-broadcasting** — one firehose topic forces every subscriber to filter; model topics at
  the right granularity.

## Key Takeaways

- The broker decouples senders from receivers: both know only the topic, turning N×M into N+M.
- Pub/sub is Observer generalized — many publishers, many topics, delivery that can cross nodes.
- Delivery semantics (at-most/at-least-once, ordering, durability) are a *choice*, not a given.
- Watch subscription lifecycle and slow subscribers; neither is handled for you.

## Implementations

### JavaScript

*Targets modern JavaScript (ES2015+).*

**❌ Naive**

```js
// The publisher hard-wires every listener; adding one edits this function.
function onOrderPlaced(order) {
  emailService.send(order);
  analytics.track(order);
  inventory.reserve(order); // add a listener → change the caller
}
```

**✅ Idiomatic**

```js
// A tiny broker: subscribe by topic, publish fans out; subscribe returns an
// unsubscribe so lifecycles are managed.
function createBus() {
  const topics = new Map();
  return {
    subscribe(topic, fn) {
      const subs = topics.get(topic) ?? new Set();
      subs.add(fn);
      topics.set(topic, subs);
      return () => subs.delete(fn); // unsubscribe
    },
    publish(topic, msg) {
      topics.get(topic)?.forEach((fn) => fn(msg));
    },
  };
}

// const bus = createBus();
// const off = bus.subscribe("order.placed", sendEmail);
// bus.publish("order.placed", order);
```

**🧠 Tradeoff** — A `Map` of topic → handler set is a complete in-process event bus in a dozen
lines, and returning an unsubscribe keeps lifecycles honest. It's synchronous and in-memory, so a
throwing or slow subscriber affects the publish call, and nothing survives a reload. That's the
right tool for decoupling UI modules; cross-tab or cross-service needs a real broker.

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// Direct calls again — plus no way for other processes to react.
function publishOrder(order) {
  emailWorker.handle(order);
  analyticsWorker.handle(order);
}
```

**✅ Idiomatic**

```js
// In-process: EventEmitter. Across processes: a broker like Redis pub/sub.
const EventEmitter = require("node:events");
const bus = new EventEmitter();

bus.on("order.placed", sendEmail);
bus.on("order.placed", trackAnalytics);
bus.emit("order.placed", order); // fans out to all listeners

// Cross-service: publisher and subscribers connect to Redis and pub/sub a channel,
// so processes decouple the same way in-process listeners do.
```

**🧠 Tradeoff** — `EventEmitter` is Node's built-in bus and the backbone of streams, sockets, and
much of the platform — zero-dependency decoupling in-process. Its limits are the in-memory ones:
same-process, synchronous emit, no durability. Crossing processes or machines swaps the emitter
for a broker (Redis, NATS, Kafka) while keeping the exact publish/subscribe shape.

### Python

*Targets Python 3.12.*

**❌ Naive**

```python
# Publisher knows every consumer; the list is edited by hand.
def order_placed(order):
    send_email(order)
    track(order)
    reserve(order)
```

**✅ Idiomatic**

```python
from collections import defaultdict

class Bus:
    def __init__(self):
        self._subs = defaultdict(list)

    def subscribe(self, topic, fn):
        self._subs[topic].append(fn)
        return lambda: self._subs[topic].remove(fn)  # unsubscribe

    def publish(self, topic, msg):
        for fn in list(self._subs[topic]):  # copy → safe if a handler unsubscribes
            fn(msg)

# bus = Bus(); off = bus.subscribe("order.placed", send_email)
# bus.publish("order.placed", order)
```

**🧠 Tradeoff** — A `defaultdict(list)` broker is the whole pattern, and iterating a *copy* of the
handlers keeps it safe when a subscriber unsubscribes mid-dispatch. It's synchronous and
in-process; the `blinker` library adds weak references (auto-cleanup) and `asyncio` handlers, and
Celery/Redis take it cross-process. Start simple, graduate when you cross a boundary.

### Elixir

*Targets Elixir 1.18.*

**❌ Naive**

```elixir
# Hard-coding recipient pids couples the publisher to them and breaks when
# any of them restart with a new pid.
send(email_pid, {:order, order})
send(analytics_pid, {:order, order})
```

**✅ Idiomatic**

```elixir
# Registry gives topic-based dispatch: subscribers register under a key, the
# publisher dispatches to whoever is currently registered.
# Subscriber: Registry.register(Bus, "order.placed", nil)
# Publisher:
Registry.dispatch(Bus, "order.placed", fn entries ->
  for {pid, _} <- entries, do: send(pid, {:order, order})
end)

# Across nodes, Phoenix.PubSub does the same with cluster-wide delivery:
#   Phoenix.PubSub.subscribe(MyApp.PubSub, "order.placed")
#   Phoenix.PubSub.broadcast(MyApp.PubSub, "order.placed", {:order, order})
```

**🧠 Tradeoff** — The BEAM ships pub/sub primitives: `Registry` for local topic dispatch,
`Phoenix.PubSub` for cluster-wide broadcast that survives process restarts (subscribers register
by key, not pid). You get distribution and fault tolerance without extra infrastructure — pub/sub
across a cluster is a library call. The trade is buying into OTP's process/registry model, which
is the native grain anyway.

### Go

*Targets Go 1.26.*

**❌ Naive**

```go
// A slice of subscriber channels mutated without locking, and a publish that
// blocks on the slowest receiver.
var subs []chan Order
func publish(o Order) { for _, s := range subs { s <- o } } // one slow sub stalls all
```

**✅ Idiomatic**

```go
// A broker goroutine owns the subscriber set (no locks) and delivers to each
// subscriber's own buffered channel, so one slow subscriber can't block others.
type Broker[T any] struct {
    subscribe   chan chan T
    unsubscribe chan chan T
    publish     chan T
}

func (b *Broker[T]) Run() {
    subs := map[chan T]struct{}{}
    for {
        select {
        case ch := <-b.subscribe:
            subs[ch] = struct{}{}
        case ch := <-b.unsubscribe:
            delete(subs, ch)
            close(ch)
        case msg := <-b.publish:
            for ch := range subs {
                select {
                case ch <- msg: // deliver
                default: // subscriber full — drop rather than block everyone
                }
            }
        }
    }
}
```

**🧠 Tradeoff** — A broker goroutine that owns the subscriber map (actor-style, no mutex) plus
per-subscriber buffered channels gives clean fan-out, and the `default` case makes the slow-
subscriber policy explicit: drop rather than block the whole bus. It's more code than
`EventEmitter`, but every decision — buffering, drop-vs-block, unsubscribe/close — is visible and
yours, which is exactly what you want when delivery semantics matter.

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// The publisher hard-wires every receiver; adding one edits this class.
public sealed class OrderService(EmailService email, AnalyticsService analytics)
{
    public void PlaceOrder(Order order)
    {
        email.Send(order);
        analytics.Track(order); // add a listener → change this class
    }
}
```

**✅ Idiomatic**

```csharp
// Each subscriber gets its own bounded Channel, so one slow subscriber can't
// stall the bus — DropWrite makes the policy explicit.
using System.Threading.Channels;

var bus = new Bus<string>();
var email = bus.Subscribe("order.placed");
var analytics = bus.Subscribe("order.placed");

bus.Publish("order.placed", "order #42"); // fans out to both

Console.WriteLine(await email.ReadAsync());     // order #42
Console.WriteLine(await analytics.ReadAsync()); // order #42

public sealed class Bus<T>
{
    private readonly Dictionary<string, List<Channel<T>>> _topics = new();
    private readonly Lock _gate = new();

    public ChannelReader<T> Subscribe(string topic)
    {
        var ch = Channel.CreateBounded<T>(new BoundedChannelOptions(16)
        {
            FullMode = BoundedChannelFullMode.DropWrite, // full subscriber → drop
        });
        lock (_gate)
        {
            if (!_topics.TryGetValue(topic, out var subs))
                _topics[topic] = subs = [];
            subs.Add(ch);
        }
        return ch.Reader;
    }

    public void Publish(string topic, T msg)
    {
        Channel<T>[] subs;
        lock (_gate) subs = _topics.TryGetValue(topic, out var s) ? [.. s] : [];
        foreach (var ch in subs)
            ch.Writer.TryWrite(msg); // never blocks the publisher
    }
}
```

**🧠 Tradeoff** — One bounded channel per subscriber makes the slow-subscriber policy a
constructor argument: `DropWrite` mirrors the Go tab's `default:` drop; `Wait` would push back
on publishers instead. Snapshotting the list under the lock keeps publish safe against
concurrent subscribes — the Python tab's copy trick. For a single hard-coded topic, a plain C#
`event` already *is* in-process pub/sub. Either way it stops at the process boundary: where
Elixir's `Phoenix.PubSub` gets cluster-wide delivery from the runtime, .NET crosses processes
by swapping this class for Redis or NATS behind the same Publish/Subscribe shape.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// The publisher holds every subscriber's sender, and unbounded channels hide
// the problem: a slow subscriber's queue just grows until memory runs out.
use std::sync::mpsc::Sender;

struct OrderService {
    email: Sender<String>,
    analytics: Sender<String>, // add a listener → change this struct
}

impl OrderService {
    fn place_order(&self, order: String) {
        self.email.send(order.clone()).unwrap();
        self.analytics.send(order).unwrap();
    }
}
```

**✅ Idiomatic**

```rust
use std::collections::HashMap;
use std::sync::mpsc::{self, SyncSender};
use std::thread;

enum Cmd {
    Subscribe(String, SyncSender<String>),
    Publish(String, String),
}

// The broker is itself an actor: one thread owns the topic map, and
// subscribing or publishing is a message to it — no Mutex anywhere.
fn spawn_broker() -> mpsc::Sender<Cmd> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut topics: HashMap<String, Vec<SyncSender<String>>> = HashMap::new();
        for cmd in rx {
            match cmd {
                Cmd::Subscribe(topic, sub) => topics.entry(topic).or_default().push(sub),
                Cmd::Publish(topic, msg) => {
                    if let Some(subs) = topics.get(&topic) {
                        for sub in subs {
                            // full mailbox (or dropped receiver): drop the
                            // message rather than block the whole bus
                            let _ = sub.try_send(msg.clone());
                        }
                    }
                }
            }
        }
    });
    tx
}

fn main() {
    let broker = spawn_broker();

    // Each subscriber brings its own bounded mailbox.
    let (email_tx, email_rx) = mpsc::sync_channel(16);
    broker.send(Cmd::Subscribe("order.placed".into(), email_tx)).unwrap();

    broker.send(Cmd::Publish("order.placed".into(), "order #42".into())).unwrap();
    println!("email got: {}", email_rx.recv().unwrap()); // email got: order #42
}
```

**🧠 Tradeoff** — The broker is the previous kata put to work: one thread owns the topic map,
so subscribe and publish can't race by construction and there's no `Mutex` to hold wrong.
`sync_channel` + `try_send` makes every subscriber mailbox bounded and the drop policy visible
in one line. A dropped receiver surfaces as a send error — a `retain` on the `Vec` is where
unsubscribe-by-drop would go. The std library stops at the process boundary, though: the
cluster-wide broadcast Elixir gets from `Phoenix.PubSub` as a library call is a real external
broker away in Rust.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// The publisher calls every receiver by name; adding one edits this function.
fn orderPlaced(order: []const u8) void {
    email.send(order);
    analytics.track(order); // add a listener → recompile the publisher
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// Zig has no closures — a subscriber is the std.mem.Allocator idiom:
// a context pointer plus a function pointer.
const Subscriber = struct {
    topic: []const u8,
    ctx: *anyopaque,
    onMsg: *const fn (ctx: *anyopaque, msg: []const u8) void,
};

const Bus = struct {
    mu: std.Io.Mutex = .init,
    subs: [8]?Subscriber = @splat(null), // fixed slots — capacity is explicit

    fn subscribe(self: *Bus, io: std.Io, sub: Subscriber) !void {
        try self.mu.lock(io);
        defer self.mu.unlock(io);
        for (&self.subs) |*slot| {
            if (slot.* == null) {
                slot.* = sub;
                return;
            }
        }
        return error.BusFull;
    }

    fn publish(self: *Bus, io: std.Io, topic: []const u8, msg: []const u8) !void {
        try self.mu.lock(io);
        defer self.mu.unlock(io);
        for (self.subs) |slot| {
            const sub = slot orelse continue;
            if (std.mem.eql(u8, sub.topic, topic))
                sub.onMsg(sub.ctx, msg); // note: handler runs under the lock
        }
    }
};

const Mailer = struct {
    sent: u32 = 0,

    fn onMsg(ctx: *anyopaque, msg: []const u8) void {
        const self: *Mailer = @ptrCast(@alignCast(ctx));
        self.sent += 1;
        std.debug.print("email for: {s}\n", .{msg});
    }
};

pub fn main(init: std.process.Init) !void {
    const io = init.io; // the bus lock needs the Io capability — threaded in like an allocator
    var bus = Bus{};
    var mailer = Mailer{};
    try bus.subscribe(io, .{ .topic = "order.placed", .ctx = &mailer, .onMsg = Mailer.onMsg });
    try bus.publish(io, "order.placed", "order #42"); // email for: order #42
}
```

**🧠 Tradeoff** — Without closures, a subscriber is the `*anyopaque` context + function pointer
pair — exactly what a closure compiles down to elsewhere, spelled by hand. Fixed slots make
capacity a visible decision. The honest catch: handlers run *under the lock*, so one slow
subscriber stalls every publish — the exact hazard this kata warns about, which the Go tab
dodges with per-subscriber channels. Fixing it here means giving each subscriber a mailbox and
a thread, at which point you've rebuilt the Actor kata — and that's the lesson. Since
0.17-dev even the lock takes an `io` — blocking moved behind the `std.Io` capability, passed
explicitly like an allocator. On the BEAM
this whole layered build is one `Registry` call, because pub/sub lives in the runtime.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// The publisher hard-wires every receiver; adding one edits this class.
class OrderService {
    private final EmailService email = new EmailService();
    private final AnalyticsService analytics = new AnalyticsService();

    void placeOrder(Order order) {
        email.send(order);
        analytics.track(order); // add a listener → change this class
    }
}
```

**✅ Idiomatic**

```java
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

// Each subscriber gets its own bounded mailbox queue; offer() drops rather
// than blocking, so one slow subscriber can't stall the bus.
class Bus<T> {
    private final Map<String, List<BlockingQueue<T>>> topics = new ConcurrentHashMap<>();

    BlockingQueue<T> subscribe(String topic) {
        var mailbox = new ArrayBlockingQueue<T>(16);
        topics.computeIfAbsent(topic, t -> new CopyOnWriteArrayList<>()).add(mailbox);
        return mailbox;
    }

    void publish(String topic, T msg) {
        for (var mailbox : topics.getOrDefault(topic, List.of()))
            mailbox.offer(msg); // full subscriber → drop; never blocks the publisher
    }
}

class Demo {
    public static void main(String[] args) throws InterruptedException {
        var bus = new Bus<String>();
        var email = bus.subscribe("order.placed");
        var analytics = bus.subscribe("order.placed");

        bus.publish("order.placed", "order #42"); // fans out to both

        System.out.println(email.take());     // order #42
        System.out.println(analytics.take()); // order #42
    }
}
```

**🧠 Tradeoff** — the concurrency is all in class choice: `computeIfAbsent` on a
`ConcurrentHashMap` makes subscribe atomic, and `CopyOnWriteArrayList` is built for exactly
this read-mostly listener list — publishers iterate a stable snapshot while subscribers
come and go (the same copy trick the Python tab does by hand). `offer` versus `put` is the
drop-vs-block policy in one method name, mirroring Go's `default:` and C#'s `DropWrite`.
When you want backpressure handled for you, the JDK already ships a grown-up bus:
`java.util.concurrent.Flow` with `SubmissionPublisher` is reactive-streams pub/sub in the
standard library. Either way it ends at the process boundary — cluster-wide delivery means
Kafka, NATS, or Redis behind this same publish/subscribe shape.

## Applications

- **Live UI updates** — the browser pushes DOM events onto listeners; app frameworks broadcast
  store changes to subscribed components (frontend).
- **Microservice events** — services publish domain events ("OrderPlaced") to Kafka/NATS;
  interested services subscribe without the publisher knowing them (backend).
- **Realtime features** — chat, notifications, and live dashboards fan a message out to every
  connected client over a pub/sub channel (backend & frontend).
- **Cache invalidation** — one node publishes "key changed"; all nodes subscribe and evict
  (backend).
- **Logging & telemetry** — components emit events onto a bus; collectors subscribe to ship them
  onward (backend).

**In modern systems:**

- **Multi-agent** — a shared event bus (a blackboard) agents publish findings to and subscribe to
  each other's, coordinating without direct coupling.
- **Workflow engine** — steps emit domain events other workflows subscribe to, decoupling the
  producer from everything that reacts.
- **Low-code** — form fields publish change events on a bus that cross-field rules subscribe to.

## Related Patterns

- **Observer** — pub/sub is Observer with a broker in the middle: many publishers/topics and
  delivery that can cross processes, instead of a subject holding its observers directly.
- **Producer–Consumer** — a queue delivers each message to *one* consumer; pub/sub delivers each
  message to *every* subscriber.
- **Actor** — actors frequently coordinate over pub/sub topics rather than by holding each
  other's addresses.
