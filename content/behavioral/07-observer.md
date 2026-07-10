---
id: observer
category: behavioral
sequence: 7
title: Observer
also_known_as: [Publish-Subscribe, Dependents]
gof: true
intent: "Let objects subscribe to another object and get notified automatically when it changes."
frequency: high
difficulty: intermediate
tags: [behavioral, events, pub-sub, reactive, decoupling, notifications]
related: [mediator, command, state]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Define a one-to-many dependency: when one object (the subject) changes, everything that
subscribed to it is notified automatically. Subscribers come and go at runtime, and the subject
doesn't know or care who they are — it just publishes.

This is the pattern behind event systems, reactive UIs, and pub/sub: the subject broadcasts,
observers react, and the two stay decoupled.

## The Problem

A `Store` holds state. When it changes, the header, the cart badge, and an analytics logger all
need to update. If the store calls each of them directly, it's coupled to all three, and adding
a fourth means editing the store.

```
class Store {
  setTotal(t) {
    this.total = t;
    header.update(t);     // store must know about every consumer
    cartBadge.update(t);  // add analytics → edit this method again
  }
}
```

Observer inverts this: consumers subscribe, and the store just notifies its list.

## Structure

Key Components:

- **Subject** — holds observers, offers `subscribe`/`unsubscribe`, and `notify`s on change.
- **Observer** — the interface subscribers implement (`update(data)`), or just a callback.
- **Concrete Observers** — the things that react (UI, logger, badge).

## When to Use

- A change in one object must propagate to an unknown number of others.
- You want loose coupling between the source of an event and its consumers.
- Consumers should be able to subscribe and unsubscribe at runtime.

## Advantages and Disadvantages

### Advantages
- Subject and observers are decoupled — add/remove observers freely (Open/Closed).
- Supports broadcast to many consumers.
- Dynamic subscription at runtime.

### Disadvantages
- Notification order is usually unspecified.
- Cascading updates can be hard to trace ("who triggered this?").
- Forgotten unsubscribes leak memory (the lapsed-listener problem).

## Common Mistakes

- **Never unsubscribing** — dead observers pile up and leak; always provide and use unsubscribe.
- **Doing heavy work synchronously in `update`** — one slow observer stalls the whole notify.
- **Cycles** — an observer that updates the subject it observes can loop.
- **Confusing it with Mediator** — Observer is one-way broadcast; Mediator coordinates two-way
  interactions among peers.

## Key Takeaways

- Observer = subscribe to a subject, get notified on change, stay decoupled.
- The subject knows a list of observers, not their concrete types.
- Always support unsubscribe to avoid leaks.
- Most languages/runtimes ship an event/emitter primitive that already is this.

## Implementations

A subject that notifies subscribers when its value changes.

### JavaScript

**❌ Naive**

```js
// The store is hard-wired to each consumer.
class Store {
  constructor(header, badge) { this.header = header; this.badge = badge; }
  setTotal(total) {
    this.total = total;
    this.header.render(total);  // coupled — adding a consumer edits this
    this.badge.render(total);
  }
}
```

**✅ Idiomatic (frontend)**

```js
// A tiny observable the UI subscribes to; returns an unsubscribe function.
class Observable {
  #subscribers = new Set();
  subscribe(fn) { this.#subscribers.add(fn); return () => this.#subscribers.delete(fn); }
  notify(value) { for (const fn of this.#subscribers) fn(value); }
}

const total = new Observable();

// UI components subscribe independently:
const offHeader = total.subscribe(v => { document.querySelector("#total").textContent = v; });
total.subscribe(v => { document.querySelector("#badge").textContent = v; });

total.notify(42);   // both update
offHeader();        // header unsubscribes — no leak
```

**🧠 Tradeoff** — Returning an unsubscribe closure from `subscribe` is the modern browser idiom
(the same shape React effects and signal libraries use). The store no longer knows its consumers;
they opt in. The risk shifts to remembering to call the returned cleanup when a component unmounts.

### Node.js

**❌ Naive**

```js
// A service calling each listener directly, coupled to all of them.
class OrderService {
  constructor(mailer, analytics) { this.mailer = mailer; this.analytics = analytics; }
  place(order) {
    this.mailer.sendReceipt(order);   // must know every side effect
    this.analytics.track("order", order);
  }
}
```

**✅ Idiomatic (backend)**

```js
// Node's built-in EventEmitter IS the Observer pattern.
import { EventEmitter } from "node:events";

class OrderService extends EventEmitter {
  place(order) {
    // ...persist the order...
    this.emit("order:placed", order);   // broadcast; doesn't know who listens
    return order;
  }
}

const orders = new OrderService();
orders.on("order:placed", (o) => mailer.sendReceipt(o));
orders.on("order:placed", (o) => analytics.track("order", o));

orders.place({ id: 1, total: 42 });      // both listeners fire
```

**🧠 Tradeoff** — On the backend you rarely hand-roll a subject: `EventEmitter` gives
`on`/`off`/`emit` out of the box, and it's the backbone of streams, servers, and sockets in Node.
The caution is the same lapsed-listener leak (`removeListener`/`off`) plus unbounded listeners —
Node warns past 10 on one event, a hint you may be leaking subscriptions.

### Python

**❌ Naive**

```python
class Store:
    def __init__(self, header, badge):
        self.header, self.badge = header, badge

    def set_total(self, total):
        self.total = total
        self.header.render(total)   # coupled to each consumer
        self.badge.render(total)
```

**✅ Idiomatic**

```python
from typing import Callable

class Observable:
    def __init__(self) -> None:
        self._subscribers: list[Callable[[int], None]] = []

    def subscribe(self, fn: Callable[[int], None]) -> Callable[[], None]:
        self._subscribers.append(fn)
        return lambda: self._subscribers.remove(fn)  # unsubscribe

    def notify(self, value: int) -> None:
        for fn in list(self._subscribers):
            fn(value)

total = Observable()
off = total.subscribe(lambda v: print("header", v))
total.subscribe(lambda v: print("badge", v))
total.notify(42)   # both fire
off()              # header unsubscribes
```

**🧠 Tradeoff** — Callables make observers just functions; no Observer base class needed.
Iterating over a copy (`list(self._subscribers)`) guards against an observer unsubscribing
mid-notification. For heavier needs, libraries like `blinker` provide named signals with the
same semantics.

### Elixir

**❌ Naive**

```elixir
# The subject hard-codes each consumer call.
defmodule Store do
  def set_total(total) do
    Header.render(total)
    Badge.render(total)   # add a consumer → edit here
    total
  end
end
```

**✅ Idiomatic**

```elixir
# Registry gives pub/sub: subscribers register under a key; the subject dispatches.
defmodule Store do
  def start, do: Registry.start_link(keys: :duplicate, name: Store.Registry)

  def subscribe(fun), do: Registry.register(Store.Registry, :total, fun)

  def notify(total) do
    Registry.dispatch(Store.Registry, :total, fn entries ->
      for {_pid, fun} <- entries, do: fun.(total)
    end)
  end
end

Store.subscribe(fn v -> IO.puts("header #{v}") end)
Store.subscribe(fn v -> IO.puts("badge #{v}") end)
Store.notify(42)
```

**🧠 Tradeoff** — Elixir ships pub/sub primitives: `Registry` for in-process dispatch, and
`Phoenix.PubSub` for cluster-wide broadcast. Observers are often *processes* subscribed to a
topic, so a crashing observer doesn't take the subject down — supervision replaces the manual
unsubscribe discipline you need in the OO versions.

### Go

**❌ Naive**

```go
type Store struct {
	header *Header
	badge  *Badge
}

func (s *Store) SetTotal(total int) {
	s.header.Render(total) // coupled to each consumer
	s.badge.Render(total)
}
```

**✅ Idiomatic**

```go
package store

import "sync"

// Observers are functions; Subscribe returns an unsubscribe func.
type Subject struct {
	mu   sync.Mutex
	subs map[int]func(int)
	next int
}

func New() *Subject { return &Subject{subs: map[int]func(int){}} }

func (s *Subject) Subscribe(fn func(int)) func() {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := s.next
	s.next++
	s.subs[id] = fn
	return func() { s.mu.Lock(); delete(s.subs, id); s.mu.Unlock() }
}

func (s *Subject) Notify(v int) {
	s.mu.Lock()
	fns := make([]func(int), 0, len(s.subs))
	for _, fn := range s.subs {
		fns = append(fns, fn)
	}
	s.mu.Unlock()
	for _, fn := range fns {
		fn(v)
	}
}
```

**🧠 Tradeoff** — Function observers keyed by id give O(1) unsubscribe; copying the slice under
the lock before calling lets observers subscribe/unsubscribe during a notify without deadlocking.
Go's more idiomatic broadcast is often *channels* (each observer owns a channel the subject sends
on), which decouples timing but adds buffering and goroutine-lifecycle decisions.

## Applications

Real-world uses of Observer (from the reference article), by tier:

- **Frontend** — DOM event listeners, UI state stores (Redux `subscribe`), reactive signals,
  live dashboards updating on data change.
- **Backend** — Node `EventEmitter`, pub/sub messaging, WebSocket broadcast, domain events
  (`order:placed` → email + analytics + inventory).
- **Both** — MVVM/data-binding, notification systems, cache invalidation on change.

**In modern systems:**

- **Workflow engine** — step-completion events fan out to progress trackers, dashboards, and audit
  sinks without the step knowing who listens.
- **Multi-agent** — token and tool-event streams the UI and logger subscribe to as the agent runs.
- **Low-code** — a field re-renders when the model value it's bound to changes; the binding is the
  subscription.

## Related Patterns

- **Mediator** — Observer broadcasts one-way; Mediator centralizes two-way coordination among
  peers.
- **Command** — often the payload delivered to observers (an event as a command object).
- **State** — a subject's state change is frequently what triggers notification.
