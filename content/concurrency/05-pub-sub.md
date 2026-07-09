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
languages: [javascript, node-js, python, elixir, go]
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

## Related Patterns

- **Observer** — pub/sub is Observer with a broker in the middle: many publishers/topics and
  delivery that can cross processes, instead of a subject holding its observers directly.
- **Producer–Consumer** — a queue delivers each message to *one* consumer; pub/sub delivers each
  message to *every* subscriber.
- **Actor** — actors frequently coordinate over pub/sub topics rather than by holding each
  other's addresses.
