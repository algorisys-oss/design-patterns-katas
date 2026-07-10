---
id: mediator
category: behavioral
sequence: 5
title: Mediator
also_known_as: [Intermediary, Controller]
gof: true
intent: "Route interactions between objects through a central mediator so they stop referencing each other directly."
frequency: medium
difficulty: intermediate
tags: [behavioral, decoupling, coordination, hub, many-to-many]
related: [observer, facade, command]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

When a set of objects all talk to each other, the direct connections turn into a tangle — every
object knows every other. A mediator becomes the hub: objects talk to *it*, and it coordinates who
needs to know what. The many-to-many web collapses into many-to-one.

## The Problem

A dialog has a text field, a checkbox, and a submit button whose enabled state depends on the
others. If each control references the others directly, adding a control means editing several,
and the interaction rules are smeared across all of them.

```
checkbox.onChange = () => { submit.enabled = checkbox.checked && field.value; }; // checkbox knows submit AND field
field.onInput   = () => { submit.enabled = checkbox.checked && field.value; }; // duplicated rule, tight web
```

A mediator owns the rule; each control just reports "I changed" to the mediator.

## Structure

Key Components:

- **Mediator** — the hub that coordinates; holds references to the colleagues.
- **Colleagues** — the objects that interact; they know the mediator, not each other.
- Colleagues notify the mediator of events; the mediator decides the reactions.

## When to Use

- Many objects interact in complex, tangled ways.
- Reusing a component is hard because it's wired to too many others.
- You want interaction logic in one place instead of spread across objects.

## Advantages and Disadvantages

### Advantages
- Turns many-to-many coupling into many-to-one.
- Interaction logic lives in one place, easy to change.
- Colleagues become reusable (they only depend on the mediator interface).

### Disadvantages
- The mediator can grow into a god object holding all the logic.
- Centralization can become a bottleneck or a dumping ground.

## Common Mistakes

- **God mediator** — it absorbs so much logic it becomes unmaintainable; split it if it bloats.
- **Colleagues still referencing each other** — defeats the purpose; route everything through the
  mediator.
- **Confusing it with Observer** — Observer is one-way broadcast; Mediator is two-way coordination
  among peers with rules.

## Key Takeaways

- Mediator = a hub that replaces a web of direct references.
- Colleagues know only the mediator; it owns the interaction rules.
- Watch for the mediator turning into a god object.

## Implementations

Controls in a dialog coordinated by a mediator.

### JavaScript

**❌ Naive**

```js
// Each control wires directly to the others — a tangle.
const field = { value: "" }, checkbox = { checked: false }, submit = { enabled: false };
field.onInput = () => { submit.enabled = checkbox.checked && field.value.length > 0; };
checkbox.onChange = () => { submit.enabled = checkbox.checked && field.value.length > 0; };
// rule duplicated; adding a control touches every handler
```

**✅ Idiomatic (frontend)**

```js
// The mediator owns the rule; controls just report changes to it.
class DialogMediator {
  constructor() { this.field = ""; this.agreed = false; this.canSubmit = false; }
  changed(who, value) {
    if (who === "field") this.field = value;
    if (who === "agree") this.agreed = value;
    this.canSubmit = this.agreed && this.field.length > 0;  // the one rule, one place
  }
}

const dialog = new DialogMediator();
dialog.changed("field", "hi");
dialog.changed("agree", true);
dialog.canSubmit;   // true
```

**🧠 Tradeoff** — The enable rule lives once, in the mediator; controls don't know about each
other, so adding a control means teaching only the mediator. The risk is the mediator accreting
every rule — if a dialog grows huge, split the mediator or move to a state machine.

### Node.js

**❌ Naive**

```js
// Services calling each other directly — a mesh that's hard to change.
class OrderService {
  place(order) {
    inventory.reserve(order);   // order knows inventory
    payment.charge(order);      // and payment
    shipping.schedule(order);   // and shipping — a web of direct calls
  }
}
```

**✅ Idiomatic (backend)**

```js
// An event-bus mediator: services publish/subscribe through the hub, not each other.
class Mediator {
  #handlers = {};
  on(event, fn) { (this.#handlers[event] ||= []).push(fn); }
  emit(event, payload) { (this.#handlers[event] || []).forEach(fn => fn(payload)); }
}

const bus = new Mediator();
bus.on("order:placed", (o) => inventory.reserve(o));
bus.on("order:placed", (o) => payment.charge(o));
bus.on("order:placed", (o) => shipping.schedule(o));

// The order flow just announces; it references none of the services.
function placeOrder(order) { bus.emit("order:placed", order); }
```

**🧠 Tradeoff** — On the backend a mediator is often an event bus or message broker: services
coordinate through it instead of importing each other, which keeps a microservice/module mesh
decoupled. The line between Mediator and Observer blurs here — the distinction is that a mediator
also owns *coordination rules*, not just fan-out. The cost is indirection: the flow is no longer
readable top-to-bottom.

### Python

**❌ Naive**

```python
class Dialog:
    def __init__(self):
        self.field, self.agreed, self.can_submit = "", False, False
    def on_field(self, value):
        self.field = value
        self.can_submit = self.agreed and len(self.field) > 0
    def on_agree(self, value):
        self.agreed = value
        self.can_submit = self.agreed and len(self.field) > 0  # duplicated rule
```

**✅ Idiomatic**

```python
class DialogMediator:
    def __init__(self):
        self.field, self.agreed, self.can_submit = "", False, False
    def changed(self, who: str, value) -> None:
        if who == "field":
            self.field = value
        elif who == "agree":
            self.agreed = value
        self.can_submit = self.agreed and len(self.field) > 0  # one rule

class Control:
    def __init__(self, name: str, mediator: DialogMediator):
        self.name, self.mediator = name, mediator
    def change(self, value) -> None:
        self.mediator.changed(self.name, value)

m = DialogMediator()
Control("field", m).change("hi")
Control("agree", m).change(True)
```

**🧠 Tradeoff** — Colleagues hold a reference to the mediator and report changes; the rule lives
once. Straightforward in Python — the pattern is about the reference topology (star, not mesh),
not any special language feature. Keep the mediator focused so it doesn't become a catch-all.

### Elixir

**❌ Naive**

```elixir
# Each process messages the others directly — an interconnected mesh.
defmodule Player do
  def move(other_players, move) do
    Enum.each(other_players, fn p -> send(p, {:opponent_moved, move}) end)
    # every player must know every other player's pid
  end
end
```

**✅ Idiomatic**

```elixir
# A GenServer mediator: colleagues talk to it; it coordinates and broadcasts.
defmodule Lobby do
  use GenServer

  def start_link(_), do: GenServer.start_link(__MODULE__, %{players: %{}}, name: __MODULE__)
  def join(name, pid), do: GenServer.cast(__MODULE__, {:join, name, pid})
  def broadcast(from, msg), do: GenServer.cast(__MODULE__, {:broadcast, from, msg})

  @impl true
  def init(state), do: {:ok, state}

  @impl true
  def handle_cast({:join, name, pid}, state),
    do: {:noreply, put_in(state.players[name], pid)}

  @impl true
  def handle_cast({:broadcast, from, msg}, state) do
    for {name, pid} <- state.players, name != from, do: send(pid, {:message, from, msg})
    {:noreply, state}
  end
end
```

**🧠 Tradeoff** — A `GenServer` is a natural mediator: colleague processes send it messages and it
coordinates, so processes never hold each other's pids directly. This is exactly how chat lobbies
and game rooms are built on the BEAM. The mediator process can become a bottleneck under high
throughput — then you shard it or use `Phoenix.PubSub` for pure fan-out.

### Go

**❌ Naive**

```go
// Each component holds pointers to the others — a mesh.
type Field struct{ submit *Submit; checkbox *Checkbox; value string }

func (f *Field) OnInput(v string) {
	f.value = v
	f.submit.enabled = f.checkbox.checked && len(v) > 0 // Field knows Submit and Checkbox
}
```

**✅ Idiomatic**

```go
package dialog

type Mediator interface {
	Changed(who string, value any)
}

type Dialog struct {
	field    string
	agreed   bool
	CanSubmit bool
}

// The mediator owns the rule; controls report to it via Changed.
func (d *Dialog) Changed(who string, value any) {
	switch who {
	case "field":
		d.field = value.(string)
	case "agree":
		d.agreed = value.(bool)
	}
	d.CanSubmit = d.agreed && len(d.field) > 0
}

type Control struct {
	name string
	m    Mediator
}

func (c Control) Change(value any) { c.m.Changed(c.name, value) }
```

**🧠 Tradeoff** — Controls depend on the `Mediator` interface, not on each other, so the topology
is a star and the rule lives in `Changed`. Go's interface keeps the colleagues testable with a
fake mediator. As always, guard against the mediator becoming a god object as rules multiply.

## Applications

Real-world uses of Mediator (from the reference article), by tier:

- **Frontend** — form/dialog control coordination, component communication buses, UI framework
  event hubs.
- **Backend** — chat rooms, game lobbies, air-traffic-style coordination, event bus / message
  broker between services, workflow orchestration.
- **Both** — decoupling components that would otherwise form a mesh.

**In modern systems:**

- **Multi-agent** — a supervisor agent is the mediator: workers never talk N-to-N, they report to
  the hub and it decides who runs next, keeping coordination in one auditable place.
- **Workflow engine** — the orchestrator mediates the steps; a step reports completion and the
  orchestrator, not the step, chooses the successor.
- **Low-code** — a form mediator wires cross-field logic (show B when A changes) declared in the
  JSON schema rather than hard-coded between fields.

## Related Patterns

- **Observer** — Mediator often uses Observer internally, but adds coordination rules; Observer
  alone is one-way broadcast.
- **Facade** — a facade is a one-way simplifying front door; a mediator coordinates two-way peer
  interaction.
- **Command** — colleagues can send commands through the mediator.
