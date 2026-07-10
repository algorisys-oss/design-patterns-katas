---
id: content-based-router
category: messaging
sequence: 3
title: Content-Based Router
also_known_as: [Message Router]
gof: false
intent: "Inspect each message and send it to the right destination channel based on its content or type — so senders don't need to know which consumer should handle what."
frequency: medium
difficulty: beginner
tags: [messaging, integration, routing, decoupling, dispatch]
related: [message-channel, splitter, chain-of-responsibility]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Put a **router** on a channel that examines each incoming message and forwards it to one of several
output channels according to a rule — its type, a field value, a header. The sender publishes to one
place; the router decides where each message actually goes.

The point is to keep routing knowledge in **one place** and out of the sender. Producers stay ignorant
of the consumer topology; adding a new destination or changing a rule touches only the router, not
every producer. It's the messaging counterpart of dispatching on type — a single decision point that
directs traffic.

## The Problem

Without a router, routing logic leaks everywhere:

- **Senders know too much** — each producer must know which consumer handles which message type and
  address it directly, coupling producers to the consumer topology.
- **Scattered dispatch** — `if type == "A" send to X; else if "B" send to Y` copied into every sender,
  so a new type means editing them all.
- **Rigid topology** — you can't reroute or add destinations without changing producers.
- **Mixed concerns** — business code that produces a message also decides its routing.

## Structure

Key Components:

- **Router** — reads each message and selects an output channel by a rule over the message's content.
- **Input channel** — where producers send; the router consumes from it.
- **Output channels** — the possible destinations, one per category/consumer.
- **Routing rules** — the predicate/mapping from message content to destination.

```
                    ┌── type=A ──► Channel A
Message ──► [ Content Router ] ── type=B ──► Channel B
              (inspects content)  └── type=C ──► Channel C
```

## When to Use

- Different messages on one channel need to go to different consumers.
- Routing decisions should live in one place, not in every producer.
- The consumer topology changes (new destinations, changed rules) independently of producers.
- You want producers ignorant of who ultimately handles each message.

## Advantages and Disadvantages

### Advantages
- **Centralized routing** — one place owns the rules; producers stay simple and decoupled.
- **Flexible topology** — add/remove destinations or change rules without touching producers.
- **Separation of concerns** — producing a message and deciding its route are distinct jobs.

### Disadvantages
- **A chokepoint** — all traffic flows through the router; it's a scaling and failure focus.
- **Hidden coupling to content** — the router depends on message structure; schema changes ripple.
- **Debugging indirection** — "where did this message go?" now requires understanding the router's rules.

## Common Mistakes

- **Business logic in the router** — a router should *route*, not transform or process; keep it thin,
  or it becomes a hidden monolith.
- **No default/dead-letter route** — a message matching no rule silently vanishes; always have a
  fallback (unroutable channel).
- **Routing on deep/fragile content** — depending on nested payload internals couples the router to
  producer models; route on stable headers/type where possible.
- **Stateful routing that drifts** — routers that accumulate state become inconsistent across
  instances; prefer stateless, rule-based routing.

## Key Takeaways

- A router inspects each message and forwards it to the right channel by a content rule.
- It centralizes routing so producers don't know the consumer topology.
- Keep it thin (route, don't process) and always have a default/dead-letter route.
- Route on stable fields/headers to avoid coupling to producer payload internals.

## Implementations

### JavaScript

**❌ Naive**

```js
// The producer decides destinations inline — routing logic embedded in business code.
function emit(event) {
  if (event.type === "payment") paymentQueue.push(event);
  else if (event.type === "shipping") shippingQueue.push(event);
  else if (event.type === "email") emailQueue.push(event); // every producer repeats this
}
```

**✅ Idiomatic**

```js
// A thin router maps content → channel; producers just hand it messages.
function makeRouter(routes, fallback) {
  return (message) => (routes[message.type] ?? fallback)(message);
}

const router = makeRouter(
  {
    payment: (m) => paymentQueue.push(m),
    shipping: (m) => shippingQueue.push(m),
    email: (m) => emailQueue.push(m),
  },
  (m) => unroutableQueue.push(m), // default route — nothing is lost
);
// producers: router(event) — they know nothing about destinations
```

**🧠 Tradeoff** — A small `makeRouter` centralizes the type→channel mapping so producers just call
`router(event)`, and adding a route is one entry. The explicit `fallback` prevents silently dropping
unroutable messages. In-process it's a lookup; across services the same idea lives in a broker's
routing (exchange bindings) or an API gateway.

### Node.js

**❌ Naive**

```js
// Consumer of a firehose queue branches on type and calls handlers inline.
ch.consume("events", (msg) => {
  const e = JSON.parse(msg.content);
  if (e.type === "payment") handlePayment(e);
  else if (e.type === "shipping") handleShipping(e); // dispatch tangled with consumption
});
```

**✅ Idiomatic**

```js
// Let the broker route: a topic exchange binds routing keys to per-type queues.
await ch.assertExchange("events", "topic", { durable: true });
await ch.bindQueue("payments", "events", "payment.*");   // routing rules live in bindings
await ch.bindQueue("shipping", "events", "shipping.*");
await ch.bindQueue("unroutable", "events", "#");         // default catch-all

// producer publishes with a routing key; the broker routes to the right queue(s):
ch.publish("events", `payment.${order.id}`, Buffer.from(JSON.stringify(order)));
```

**🧠 Tradeoff** — A RabbitMQ **topic exchange** *is* a content-based router: routing keys plus queue
bindings direct messages to per-type queues, so the routing lives in infrastructure config, not code,
and consumers subscribe only to what they handle. The catch-all binding is the dead-letter/default.
The trade is that routing on the key (a header) is cheap and stable; routing on payload internals would
need a code-level router consuming and re-publishing.

### Python

**❌ Naive**

```python
# Every producer knows and addresses each destination.
def emit(event):
    if event["type"] == "payment": payment_q.put(event)
    elif event["type"] == "shipping": shipping_q.put(event)  # duplicated across producers
```

**✅ Idiomatic**

```python
# A registry-based router; @route decorators keep rules in one place.
class Router:
    def __init__(self, fallback):
        self.routes, self.fallback = {}, fallback
    def route(self, type_):
        def deco(fn): self.routes[type_] = fn; return fn
        return deco
    def dispatch(self, message):
        (self.routes.get(message["type"]) or self.fallback)(message)

router = Router(fallback=lambda m: unroutable_q.put(m))
router.route("payment")(lambda m: payment_q.put(m))
router.route("shipping")(lambda m: shipping_q.put(m))
# producers: router.dispatch(event)
```

**🧠 Tradeoff** — A small `Router` with a decorator/registry centralizes rules and gives a clean
`dispatch`, with an explicit fallback. Celery's task routing and Kombu bindings provide the same at the
broker level for cross-process systems. Keeping the router thin (map to a queue, don't process) is the
discipline that stops it becoming a god-object.

### Elixir

**❌ Naive**

```elixir
# Producer branches on type and sends to specific processes.
def emit(event) do
  case event.type do
    :payment -> send(payment_pid, event)
    :shipping -> send(shipping_pid, event)  # producer coupled to the topology
  end
end
```

**✅ Idiomatic**

```elixir
# Pattern matching is a natural router; or route to named PubSub topics.
defmodule Router do
  def route(%{type: :payment} = m), do: Phoenix.PubSub.broadcast(PubSub, "payments", m)
  def route(%{type: :shipping} = m), do: Phoenix.PubSub.broadcast(PubSub, "shipping", m)
  def route(m), do: Phoenix.PubSub.broadcast(PubSub, "unroutable", m) # default clause
end
# producers call Router.route(event); consumers subscribe to their topic.
```

**🧠 Tradeoff** — Elixir's pattern-matched function clauses are a beautifully direct content router —
each clause a routing rule, the last clause the default — and routing to named `Phoenix.PubSub` topics
keeps producers decoupled from consumers. For durable, high-throughput routing, Broadway consumes a
queue and dispatches. The match-based router is idiomatic and exhaustive-friendly; keep the clauses
routing, not processing.

### Go

**❌ Naive**

```go
// Producer switches on type and sends to specific channels.
func emit(e Event) {
    switch e.Type {
    case "payment":  paymentCh <- e
    case "shipping": shippingCh <- e // routing embedded in the producer
    }
}
```

**✅ Idiomatic**

```go
// A router type holds the rules and a default; producers just hand it messages.
type Router struct {
    routes  map[string]chan<- Event
    fallback chan<- Event
}

func (r Router) Route(e Event) {
    if ch, ok := r.routes[e.Type]; ok {
        ch <- e
        return
    }
    r.fallback <- e // default route — never dropped
}
// router := Router{routes: map[string]chan<- Event{"payment": paymentCh, ...}, fallback: dlqCh}
```

**🧠 Tradeoff** — A `Router` struct mapping type → channel centralizes the rules and makes the default
explicit, so producers call `Route` without knowing destinations. In-process the destinations are Go
channels; across services they're broker subjects (NATS supports subject-based routing natively). It's
plain and testable; keep `Route` a pure dispatch so it stays a thin chokepoint rather than a processor.

## Applications

- **Message brokers** — topic/direct exchanges and subject-based routing (RabbitMQ, NATS) route by key
  (backend).
- **API gateways** — route requests to backend services by path, header, or tenant (backend).
- **Event dispatch** — routing domain events to the interested bounded context/service (backend).
- **Load & feature routing** — directing traffic by region, A/B cohort, or version (backend).
- **Support/workflow systems** — routing tickets/tasks to queues by category or priority (backend).

**In modern systems:**

- **Low-code** — route a record to the form or handler named by a discriminator field in its JSON.
- **Workflow engine** — a branch step routes the instance to the next node by inspecting payload
  content.
- **Multi-agent** — a router agent dispatches each request to the specialist agent that handles
  that intent.

## Related Patterns

- **Message Channel** — the router reads from one channel and writes to others; it's the traffic
  director between channels.
- **Splitter** — where a router sends a whole message to one destination, a splitter breaks one message
  into many; they often appear together.
- **Chain of Responsibility** — the object-level cousin: passing a request along handlers until one
  takes it, versus routing a message to a destination by rule.
