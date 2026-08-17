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
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
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

### CSharp

**❌ Naive**

```csharp
// Each control wires directly to the others — a mesh.
public sealed class Field(Checkbox checkbox, Submit submit)
{
    public string Value = "";

    public void OnInput(string v)
    {
        Value = v;
        submit.Enabled = checkbox.Checked && v.Length > 0; // Field knows Submit AND Checkbox
    }
    // Checkbox repeats the same rule — adding a control touches every handler
}
```

**✅ Idiomatic**

```csharp
// Top-level statements: the demo runs first, the types follow.
var dialog = new DialogMediator();
var field = new Control("field", dialog);
var agree = new Control("agree", dialog);

field.Change("hi");
agree.Change(true);
Console.WriteLine(dialog.CanSubmit); // True

public interface IMediator
{
    void Changed(string who, object value);
}

// The mediator owns the rule; controls just report changes to it.
public sealed class DialogMediator : IMediator
{
    private string _field = "";
    private bool _agreed;

    public bool CanSubmit { get; private set; }

    public void Changed(string who, object value)
    {
        switch (who)
        {
            case "field": _field = (string)value; break;
            case "agree": _agreed = (bool)value; break;
        }
        CanSubmit = _agreed && _field.Length > 0; // the one rule, one place
    }
}

// Primary constructor — a colleague knows its name and the hub, nothing else.
public sealed class Control(string name, IMediator mediator)
{
    public void Change(object value) => mediator.Changed(name, value);
}
```

**🧠 Tradeoff** — The `IMediator` interface keeps controls testable with a fake hub, and
`Control`'s primary constructor makes the one dependency explicit. This shape is so common in
.NET that it became a library: MediatR routes request objects to handlers in exactly this star
topology. The warning is the same as everywhere — the mediator is one `switch` arm away from
becoming a god object, so split it when the rules multiply.

### Rust

**❌ Naive**

```rust
use std::cell::RefCell;
use std::rc::Rc;

// Each control needs handles on the others — in Rust the mesh forces
// Rc<RefCell<...>> everywhere, and the rule is still duplicated.
struct Submit { enabled: bool }
struct Field { value: String }

struct Checkbox {
    checked: bool,
    field: Rc<RefCell<Field>>,
    submit: Rc<RefCell<Submit>>,
}

impl Checkbox {
    fn on_change(&mut self, v: bool) {
        self.checked = v;
        // Checkbox knows Field AND Submit; Field duplicates this rule.
        self.submit.borrow_mut().enabled = v && !self.field.borrow().value.is_empty();
    }
}
```

**✅ Idiomatic**

```rust
// The mediator owns all the shared state; changes arrive as messages.
#[derive(Default)]
struct DialogMediator {
    field: String,
    agreed: bool,
    can_submit: bool,
}

enum Change {
    Field(String),
    Agree(bool),
}

impl DialogMediator {
    fn changed(&mut self, change: Change) {
        match change {
            Change::Field(v) => self.field = v,
            Change::Agree(v) => self.agreed = v,
        }
        self.can_submit = self.agreed && !self.field.is_empty(); // the one rule, one place
    }
}

fn main() {
    let mut dialog = DialogMediator::default();
    dialog.changed(Change::Field("hi".to_string()));
    dialog.changed(Change::Agree(true));
    println!("{}", dialog.can_submit); // true
}
```

**🧠 Tradeoff** — Rust pushes you toward Mediator whether you asked or not: the naive mesh needs
`Rc<RefCell<...>>` because the borrow checker won't allow a web of mutable references, while the
star has one owner and no interior mutability at all. The `Change` enum replaces the
stringly-typed `who` — a new control kind is a new variant, and every `match` that misses it
fails to compile. Note the colleagues don't *store* a `&mut` to the mediator (that would lock
everyone else out); they borrow it per call, or send `Change` messages over an `mpsc` channel
when they live on other threads.

### Zig

**❌ Naive**

```zig
// Each control points at the others — a mesh, with the rule duplicated.
const Submit = struct { enabled: bool = false };
const Field = struct { value: []const u8 = "" };

const Checkbox = struct {
    checked: bool = false,
    field: *Field,
    submit: *Submit,

    pub fn onChange(self: *Checkbox, v: bool) void {
        self.checked = v;
        // Checkbox knows Field AND Submit; Field duplicates this rule.
        self.submit.enabled = v and self.field.value.len > 0;
    }
};
```

**✅ Idiomatic**

```zig
const std = @import("std");

// Changes are a tagged union; the mediator owns the state and the rule.
const Change = union(enum) {
    field: []const u8,
    agree: bool,
};

const DialogMediator = struct {
    field: []const u8 = "",
    agreed: bool = false,
    can_submit: bool = false,

    pub fn changed(self: *DialogMediator, change: Change) void {
        switch (change) {
            .field => |v| self.field = v,
            .agree => |v| self.agreed = v,
        }
        self.can_submit = self.agreed and self.field.len > 0; // the one rule, one place
    }
};

// A colleague holds a pointer to the hub, never to another control.
const Control = struct {
    mediator: *DialogMediator,

    pub fn change(self: Control, c: Change) void {
        self.mediator.changed(c);
    }
};

pub fn main() void {
    var dialog = DialogMediator{};
    const field = Control{ .mediator = &dialog };
    const agree = Control{ .mediator = &dialog };

    field.change(.{ .field = "hi" });
    agree.change(.{ .agree = true });
    std.debug.print("can submit: {}\n", .{dialog.can_submit}); // can submit: true
}
```

**🧠 Tradeoff** — Zig has no borrow checker, so the naive mesh compiles fine — the star is a
design choice you make, not one the compiler forces. Plain pointers wire each control to the hub
with zero overhead, and the tagged union plus exhaustive `switch` means a new control kind can't
be silently ignored. One thing to watch: the mediator stores the `[]const u8` slice it's handed
without copying, so the caller's string must outlive the mediator — dupe it with an allocator
when it won't.

### Java

**❌ Naive**

```java
// Each control wires directly to the others — a mesh.
class Field {
    String value = "";
    Checkbox checkbox;
    Submit submit;

    void onInput(String v) {
        value = v;
        submit.enabled = checkbox.checked && !v.isEmpty(); // Field knows Submit AND Checkbox
    }
    // Checkbox repeats the same rule — adding a control touches every handler
}

class Checkbox { boolean checked; }
class Submit { boolean enabled; }
```

**✅ Idiomatic**

```java
// Changes are a sealed family of records; the mediator owns the rule.
sealed interface Change permits FieldChange, AgreeChange {}
record FieldChange(String value) implements Change {}
record AgreeChange(boolean agreed) implements Change {}

class DialogMediator {
    private String field = "";
    private boolean agreed;
    private boolean canSubmit;

    void changed(Change change) {
        switch (change) {
            case FieldChange(String v) -> field = v;
            case AgreeChange(boolean v) -> agreed = v;
        }
        canSubmit = agreed && !field.isEmpty(); // the one rule, one place
    }

    boolean canSubmit() { return canSubmit; }
}

// A colleague knows the hub, never another control.
record Control(DialogMediator mediator) {
    void change(Change c) { mediator.changed(c); }
}

public class Demo {
    public static void main(String[] args) {
        var dialog = new DialogMediator();
        var field = new Control(dialog);
        var agree = new Control(dialog);

        field.change(new FieldChange("hi"));
        agree.change(new AgreeChange(true));
        System.out.println(dialog.canSubmit()); // true
    }
}
```

**🧠 Tradeoff** — The classic Java form takes a `Mediator` interface and a stringly-typed
`changed(String who, Object value)`; sealed records replace that pair with types. A new control
kind is a new record, and the pattern-matching `switch` must stay exhaustive — the compiler
points at every rule that hasn't handled it, where the string version failed silently. The
topology lesson is unchanged: colleagues hold the hub, the hub holds the rule, and the mediator
is still one `case` away from becoming a god object — split it when the rules multiply.

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
