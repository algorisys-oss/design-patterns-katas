---
id: reactive-state
category: ui
sequence: 4
title: Reactive State
also_known_as: [Signals, Observables, Reactive Programming]
gof: false
intent: "Model state as observable values that automatically notify everything derived from them, so views and computed values update themselves when their inputs change — no manual wiring."
frequency: high
difficulty: intermediate
tags: [ui, reactivity, signals, derived-state, dependency-tracking]
related: [observer, unidirectional-data-flow, provider]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Make state **reactive**: wrap a value so that reading it *inside* a computation records a
dependency, and writing it *automatically re-runs* every computation and view that depended on it.
Derived values and the UI become declarations of *what* they are in terms of state, and the system
keeps them up to date.

Instead of "when X changes, remember to also update Y and re-render Z," you declare `Y = f(X)` and
`Z renders X, Y` once, and reactivity propagates the change for you. It's the Observer pattern turned
into infrastructure, with automatic dependency tracking.

## The Problem

Manually keeping derived data and the UI in sync with source state is error-prone:

- **Forgotten updates** — you change `firstName` but forget to recompute `fullName` or re-render the
  header, so the UI shows stale data.
- **Manual subscription bookkeeping** — wiring "when this changes, update that" by hand for every
  dependency is tedious and easy to get wrong.
- **Over-updating** — to be safe, you re-render everything on every change, wasting work.
- **Tangled invalidation** — as derived values depend on other derived values, the "what needs
  updating when X changes?" graph becomes impossible to maintain by hand.

## Structure

Key Components:

- **Signal / Observable (source)** — a container holding a value; reading it tracks a dependency,
  writing it notifies dependents.
- **Derived / Computed** — a value defined by a function of signals; recomputes automatically (and
  usually lazily/memoized) when its inputs change.
- **Effect / View** — a side effect (rendering, logging) that re-runs when the signals it reads change.
- **Dependency tracking** — the runtime records which computations read which signals, so it knows
  exactly what to update.

```
[ Signal ] ──tracked by──► [ Derived ] ──updates──► [ View / Effect ]
   set(v) ──► notifies only the computations that read it (auto-tracked)
```

## When to Use

- UI or computed values must stay in sync with changing source state.
- You have derived state (totals, filters, formatted values) that depends on other state.
- Manual "update this when that changes" wiring has become error-prone.
- Fine-grained updates matter (update only what actually depends on the change).

## Advantages and Disadvantages

### Advantages
- **Automatic consistency** — derived values and views never go stale; the system updates them.
- **Declarative** — say what a value *is* in terms of others, not how to keep it updated.
- **Fine-grained efficiency** — only computations that actually read a changed signal re-run.

### Disadvantages
- **Hidden control flow** — updates happen "magically," which can be hard to trace and debug.
- **Subtle traps** — effects that both read and write signals can loop; stale closures and timing
  bugs appear.
- **Memory & lifecycle** — subscriptions/effects must be disposed, or they leak and keep stale
  values alive.

## Common Mistakes

- **Effects that write the signals they read** — creating a feedback loop (or an infinite update
  cycle); derive instead of imperatively syncing.
- **Not disposing effects/subscriptions** — reactive graphs leak if effects outlive their component;
  clean up on unmount.
- **Deriving with side effects** — a computed value that also mutates state or does I/O breaks the
  "pure function of inputs" contract; keep derivations pure.
- **Fighting the batching** — assuming each write re-renders synchronously; reactive systems batch,
  so reading right after writing may see the old value.

## Key Takeaways

- Signals notify dependents automatically; derived values and views stay in sync without manual wiring.
- Declare `derived = f(signals)`; the runtime tracks dependencies and updates precisely what changed.
- It's Observer with automatic dependency tracking — the engine behind modern reactive UIs.
- Keep derivations pure, dispose effects, and respect batching.

## Implementations

### JavaScript

**❌ Naive**

```js
// Manual sync: every writer must remember to update derived values and the DOM.
let price = 10, qty = 2;
function setQty(n) {
  qty = n;
  total = price * qty;                 // easy to forget
  document.querySelector("#total").textContent = total; // and this
}
```

**✅ Idiomatic**

```js
// Signals: derived recomputes and the effect re-renders automatically on change.
import { signal, computed, effect } from "@preact/signals-core";

const price = signal(10);
const qty = signal(2);
const total = computed(() => price.value * qty.value); // auto-tracks price & qty

effect(() => {
  document.querySelector("#total").textContent = total.value; // re-runs when total changes
});

qty.value = 5; // total recomputes, the effect re-renders — no manual wiring
```

**🧠 Tradeoff** — Signals make `total` and the DOM update themselves: change `qty` and everything
downstream follows, because reads inside `computed`/`effect` are tracked automatically. This is the
model behind SolidJS, Vue, Preact Signals, and Angular signals. The cost is that updates become
implicit control flow — great until an effect loops or a stale closure bites — so keep derivations
pure and dispose effects.

### Node.js

**❌ Naive**

```js
// Manually recompute and re-emit whenever an input changes; forget one and it's stale.
let temps = [];
function addReading(t) {
  temps.push(t);
  const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
  io.emit("avg", avg);            // must remember to recompute + emit every time
}
```

**✅ Idiomatic**

```js
// RxJS: streams model changing values; derived streams and subscribers update automatically.
const { Subject } = require("rxjs");
const { scan, map } = require("rxjs/operators");

const readings = new Subject();
const average = readings.pipe(
  scan((acc, t) => [...acc, t], []),
  map((all) => all.reduce((a, b) => a + b, 0) / all.length), // derived, recomputed on each reading
);
average.subscribe((avg) => io.emit("avg", avg)); // auto-updates on every new reading

// readings.next(21.5);
```

**🧠 Tradeoff** — RxJS models values-over-time as observable streams: `average` is *declared* as a
transformation of `readings`, and subscribers update whenever it emits — no manual recompute-and-emit
in every writer. It shines for event/async streams (sockets, sensors, UI events). The cost is RxJS's
learning curve and the ease of leaking subscriptions, so unsubscribe when done.

### Python

**❌ Naive**

```python
# Recompute derived values by hand wherever an input changes.
price, qty = 10, 2
def set_qty(n):
    global qty, total
    qty = n
    total = price * qty        # forgettable
    refresh_ui(total)          # and this
```

**✅ Idiomatic**

```python
# A signal/computed with dependency tracking (here sketched; libs: 'reactivex', 'param', Reflex).
class Signal:
    def __init__(self, value):
        self._value, self._subs = value, []
    @property
    def value(self): return self._value
    @value.setter
    def value(self, v):
        self._value = v
        for fn in self._subs: fn()          # notify dependents
    def subscribe(self, fn): self._subs.append(fn)

price, qty = Signal(10), Signal(2)
def render(): print("total:", price.value * qty.value)   # derived + effect
price.subscribe(render); qty.subscribe(render)
qty.value = 5     # render re-runs automatically
```

**🧠 Tradeoff** — Python has no built-in signals, but the observer-with-notification core is a small
class, and libraries provide the real thing: RxPY for streams, `param` for reactive parameters, and
Reflex/Flet for reactive UI state. The sketch shows explicit subscription (no auto-tracking); mature
libs add dependency tracking. Reactivity is less pervasive in Python UIs than JS, but the pattern
applies wherever derived state must stay fresh.

### Elixir

**❌ Naive**

```elixir
# Manually recompute and re-assign derived values on every change.
def handle_event("set_qty", %{"qty" => q}, socket) do
  qty = String.to_integer(q)
  total = socket.assigns.price * qty        # must remember to recompute
  {:noreply, assign(socket, qty: qty, total: total)}
end
```

**✅ Idiomatic**

```elixir
# LiveView re-renders reactively when assigns change; assign_new/3 and streams derive efficiently.
def handle_event("set_qty", %{"qty" => q}, socket) do
  {:noreply, assign(socket, qty: String.to_integer(q))}   # just set the source
end

# derived value computed in render (or a helper) — recomputed when assigns change:
def render(assigns) do
  ~H"""
  <p>Total: <%= @price * @qty %></p>   <!-- derived from assigns, always current -->
  """
end
```

**🧠 Tradeoff** — LiveView is reactive at the render layer: change an assign and the template
re-renders, recomputing derived values (and it diffs to send only what changed over the wire). You
set the *source* (`qty`) and derive in the template, rather than hand-syncing a `total` assign.
Phoenix's change tracking makes this efficient. It's coarser-grained than JS signals (per-assign, not
per-value), but it removes the manual recompute step the same way.

### Go

**❌ Naive**

```go
// Recompute and re-notify by hand on every input change.
func (m *Meter) SetQty(n int) {
    m.qty = n
    m.total = m.price * m.qty      // forgettable
    m.notify(m.total)              // and this
}
```

**✅ Idiomatic**

```go
// Channels model a reactive stream: derive by transforming, fan the result to subscribers.
func average(readings <-chan float64) <-chan float64 {
    out := make(chan float64)
    go func() {
        defer close(out)
        var sum float64
        var n int
        for r := range readings { // recompute on each new value
            sum += r
            n++
            out <- sum / float64(n) // emit derived value downstream
        }
    }()
    return out
}
// for avg := range average(readings) { render(avg) }  // consumers react to each new value
```

**🧠 Tradeoff** — Go has no signal library in the standard idiom, but channels model reactive streams
naturally: `average` transforms an input channel into a derived output channel, and consumers `range`
over it, reacting to each value. It's explicit dataflow rather than transparent dependency tracking —
you wire the graph with channels and goroutines. For UI-style fine-grained reactivity Go is a poor
fit; for streaming/derived pipelines, channels are the idiomatic reactive primitive.

## Applications

- **Modern UI frameworks** — SolidJS signals, Vue reactivity, Svelte runes, Angular signals, and
  Preact Signals all drive rendering reactively (frontend).
- **Spreadsheets** — the canonical reactive system: a cell's formula recomputes when its inputs
  change (frontend).
- **Live dashboards** — metrics and charts derived from streaming inputs update as data arrives
  (frontend & backend).
- **Form state** — validity, derived fields, and enabled/disabled state computed reactively from
  inputs (frontend).
- **Event/stream processing** — RxJS/RxPY pipelines transforming sockets, sensors, and user events
  into derived streams (frontend & backend).

## Related Patterns

- **Observer** — reactive state *is* Observer with automatic dependency tracking: signals are subjects,
  effects are observers, wired implicitly instead of by hand.
- **Unidirectional Data Flow** — an alternative state model; reactivity favors fine-grained derived
  values, unidirectional flow favors explicit actions and reducers.
- **Provider / Context** — reactive stores/signals are typically shared with the component tree through
  a provider.
