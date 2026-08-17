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
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
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

### CSharp

**❌ Naive**

```csharp
// The store is hard-wired to each consumer.
public sealed class Store(Header header, Badge badge)
{
    public void SetTotal(int total)
    {
        header.Render(total); // coupled — adding a consumer edits this
        badge.Render(total);
    }
}
```

**✅ Idiomatic**

```csharp
// C# events ARE the Observer pattern, built into the language.
var store = new Store();

store.TotalChanged += v => Console.WriteLine($"header {v}");
void Badge(int v) => Console.WriteLine($"badge {v}");
store.TotalChanged += Badge;

store.SetTotal(42);          // both fire

store.TotalChanged -= Badge; // badge unsubscribes — no leak
store.SetTotal(43);          // only the header fires

public sealed class Store
{
    private int _total;

    public event Action<int>? TotalChanged;

    public void SetTotal(int total)
    {
        _total = total;
        TotalChanged?.Invoke(total); // broadcast; the store doesn't know who listens
    }
}
```

**🧠 Tradeoff** — You don't build the subject in C#: `event` is the language-native observer.
`TotalChanged` is a multicast delegate list — `+=` subscribes, `-=` unsubscribes, and the
`event` keyword means only `Store` can raise or clear it; outsiders can't `Invoke` your event.
The lapsed-listener leak survives, though: a subscriber that never `-=`s is kept alive by the
delegate's reference to it. For push streams that need completion and errors,
`IObservable<T>`/`IObserver<T>` (and Rx on top) formalize the same idea.

### Rust

**❌ Naive**

```rust
// The store is hard-wired to each consumer.
struct Store {
    header: Header,
    badge: Badge,
}

impl Store {
    fn set_total(&mut self, total: i32) {
        self.header.render(total); // coupled — adding a consumer edits this
        self.badge.render(total);
    }
}
```

**✅ Idiomatic**

```rust
// Observers are boxed closures; unsubscribe is by id.
struct Subject {
    subs: Vec<(usize, Box<dyn Fn(i32)>)>,
    next_id: usize,
}

impl Subject {
    fn new() -> Self {
        Self { subs: Vec::new(), next_id: 0 }
    }

    fn subscribe(&mut self, f: impl Fn(i32) + 'static) -> usize {
        let id = self.next_id;
        self.next_id += 1;
        self.subs.push((id, Box::new(f)));
        id
    }

    fn unsubscribe(&mut self, id: usize) {
        self.subs.retain(|(sub_id, _)| *sub_id != id);
    }

    fn notify(&self, value: i32) {
        for (_, f) in &self.subs {
            f(value);
        }
    }
}

fn main() {
    let mut total = Subject::new();
    let header = total.subscribe(|v| println!("header {v}"));
    total.subscribe(|v| println!("badge {v}"));

    total.notify(42); // both fire
    total.unsubscribe(header);
    total.notify(43); // only the badge fires
}
```

**🧠 Tradeoff** — The `+ 'static` bound is the honest part: a stored closure can't borrow local
variables by reference, so observers must own their state (`move`) or share it through
`Rc<RefCell<...>>` / `Arc<Mutex<...>>`. The borrow checker also forbids what other languages
guard against at runtime: `subscribe` needs `&mut self` while `notify` holds `&self`, so an
observer can't mutate the subscriber list mid-notification — that bug is unrepresentable, but so
is a legitimate self-unsubscribing observer, which then needs a queued or channel-based design.
Across threads, the more Rusty broadcast is a channel per observer, same as Go's.

### Zig

**❌ Naive**

```zig
const std = @import("std");

// The store calls each consumer directly.
const Store = struct {
    total: i32 = 0,

    pub fn setTotal(self: *Store, total: i32) void {
        self.total = total;
        renderHeader(total); // coupled — adding a consumer edits this
        renderBadge(total);
    }
};

fn renderHeader(v: i32) void {
    std.debug.print("header {d}\n", .{v});
}
fn renderBadge(v: i32) void {
    std.debug.print("badge {d}\n", .{v});
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// Observers are function pointers; the subject keeps a fixed table of slots.
const Callback = *const fn (value: i32) void;

const Subject = struct {
    subs: [8]?Callback = @splat(null),

    pub fn subscribe(self: *Subject, cb: Callback) usize {
        for (&self.subs, 0..) |*slot, i| {
            if (slot.* == null) {
                slot.* = cb;
                return i;
            }
        }
        unreachable; // demo: table full
    }

    pub fn unsubscribe(self: *Subject, id: usize) void {
        self.subs[id] = null;
    }

    pub fn notify(self: *const Subject, value: i32) void {
        for (self.subs) |slot| {
            if (slot) |cb| cb(value);
        }
    }
};

fn header(v: i32) void {
    std.debug.print("header {d}\n", .{v});
}

fn badge(v: i32) void {
    std.debug.print("badge {d}\n", .{v});
}

pub fn main() void {
    var total = Subject{};
    const header_id = total.subscribe(header);
    _ = total.subscribe(badge);

    total.notify(42); // both fire
    total.unsubscribe(header_id);
    total.notify(43); // only the badge fires
}
```

**🧠 Tradeoff** — Bare function pointers carry no state: Zig has no closures, so an observer
that needs context must use the two-field vtable idiom (`*anyopaque` context + function
pointer) that `std.mem.Allocator` uses. The fixed table of optional slots costs zero allocation
and gives O(1) unsubscribe by id — a subject you could ship on an embedded target. Swap it for
a growable list and you take on an explicit allocator, plus the question of who frees the
subscriptions.

### Java

**❌ Naive**

```java
// The store is hard-wired to each consumer.
class Store {
    private final Header header;
    private final Badge badge;

    Store(Header header, Badge badge) { this.header = header; this.badge = badge; }

    void setTotal(int total) {
        header.render(total); // coupled — adding a consumer edits this
        badge.render(total);
    }
}
```

**✅ Idiomatic**

```java
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Consumer;

// Observers are plain Consumers; subscribe returns a Runnable that unsubscribes.
class Subject {
    private final List<Consumer<Integer>> subscribers = new CopyOnWriteArrayList<>();

    Runnable subscribe(Consumer<Integer> fn) {
        subscribers.add(fn);
        return () -> subscribers.remove(fn); // unsubscribe
    }

    void publish(int value) {
        for (var fn : subscribers) fn.accept(value);
    }
}

public class Demo {
    public static void main(String[] args) {
        var total = new Subject();

        var offHeader = total.subscribe(v -> System.out.println("header " + v));
        total.subscribe(v -> System.out.println("badge " + v));

        total.publish(42);  // both fire
        offHeader.run();    // header unsubscribes — no leak
        total.publish(43);  // only the badge fires
    }
}
```

**🧠 Tradeoff** — Java has shipped three generations of this pattern: `java.util.Observer`
(JDK 1.0, deprecated in Java 9), `java.beans.PropertyChangeListener` with
`PropertyChangeSupport` (still the Swing and JavaBeans standard), and today's form above —
a lambda *is* the observer, so you never write an interface of your own.
`CopyOnWriteArrayList` exists precisely for observer lists: iteration walks a stable snapshot,
so a subscriber can unsubscribe mid-`publish` without a `ConcurrentModificationException`, at
the cost of copying the array on every subscribe. For push streams that need completion and
errors, `java.util.concurrent.Flow` is the JDK's Reactive Streams contract.

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
