---
id: model-view-controller
category: architectural
sequence: 2
title: Model–View–Controller
also_known_as: [MVC]
gof: false
intent: "Split a UI into a Model (state and rules), a View (presentation), and a Controller (input handling), so each can change independently."
frequency: high
difficulty: beginner
tags: [architecture, ui, separation-of-concerns, presentation]
related: [observer, layered, cqrs]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Divide the parts of an interactive application into three roles: the **Model** owns state and
business rules, the **View** renders that state, and the **Controller** turns user input into
updates on the model. Presentation, data, and input handling stop being one tangle.

The value is independent change. The same model can drive a web page, a mobile screen, and a JSON
API by swapping the view; the visual design can change without touching the rules; input handling
lives in one place instead of scattering through the display code.

## The Problem

Put state, rendering, and event handling in one place and every kind of change collides:

- **UI and logic tangle** — a button's click handler mutates state, recomputes totals, and
  rewrites the DOM, so you can't restyle without risking the rules.
- **No reuse** — the business logic is welded to one screen; a second view means copy-paste.
- **Hard to test** — the rules can't run without the UI, because they *are* the UI.
- **Input scattered** — event handling is smeared across widgets with no single place to reason
  about "what happens when the user acts."

## Structure

Key Components:

- **Model** — application state and the rules that change it; notifies observers when it changes.
- **View** — renders the model for the user; ideally passive, reading model state.
- **Controller** — receives user input, invokes model updates, and selects the view.
- **Notification** — the model tells views it changed (often via Observer) so they re-render.

```
        input           updates
User ─────────► Controller ─────────► Model
  ▲                  │ selects          │ notifies
  │ displays         ▼                  ▼
  └───────────────  View  ◄─────────────┘
```

## When to Use

- An interactive application where the same data may drive multiple presentations.
- Visual design and business rules are maintained by different people or change at different rates.
- You want the core logic testable without driving the UI.
- Input handling deserves a single, coherent home.

## Advantages and Disadvantages

### Advantages
- **Separation of concerns** — rules, rendering, and input each have one place.
- **Parallel work** — designers touch views, developers touch models, with a thin controller seam.
- **Multiple views** — one model can back several presentations at once.

### Disadvantages
- **Boundary blur** — "where does this logic go?" (fat controllers, smart views) is a constant
  judgment call.
- **Indirection** — a trivial screen pays for three collaborating parts.
- **Variant sprawl** — MVP, MVVM, and MVC differ subtly, and teams argue past each other about
  which they're doing.

## Common Mistakes

- **Fat controller** — cramming business rules into the controller instead of the model turns it
  into the tangle MVC was meant to remove.
- **Smart view** — a view that queries and mutates the model directly couples presentation to
  logic; views should read, controllers should write.
- **Model that knows the view** — the model calling view methods reverses the dependency; it
  should only *notify*, letting views pull.
- **God model** — one giant model for the whole app; split it by feature so changes stay local.

## Key Takeaways

- Three roles: Model (state+rules), View (render), Controller (input) — each changes independently.
- The model notifies; views observe and re-render — it never reaches into the view directly.
- Controllers write to the model, views read from it; keep that direction clean.
- MVP and MVVM are variants that move where the presentation logic lives (see Related).

## Implementations

### JavaScript

*Targets modern JavaScript (ES2015+).*

**❌ Naive**

```js
// One click handler holds state, rules, and rendering — all welded together.
let count = 0;
document.querySelector("#btn").addEventListener("click", () => {
  count += 1;                                    // state
  if (count > 10) count = 10;                    // rule
  document.querySelector("#out").textContent = count; // render
});
```

**✅ Idiomatic**

```js
// Model notifies, View renders on change, Controller handles input.
class CounterModel {
  #count = 0;
  #listeners = new Set();
  get count() { return this.#count; }
  increment() { this.#count = Math.min(10, this.#count + 1); this.#emit(); }
  subscribe(fn) { this.#listeners.add(fn); }
  #emit() { this.#listeners.forEach((fn) => fn(this.#count)); }
}

const model = new CounterModel();
const view = (count) => (document.querySelector("#out").textContent = count); // reads model
model.subscribe(view);                                                        // observes
document.querySelector("#btn").addEventListener("click", () => model.increment()); // controller
```

**🧠 Tradeoff** — Splitting into model/view/controller means the rule (`min(10, …)`) lives in one
testable place and the view is a pure function of state. For a single counter it's more code than
the inline handler; the payoff appears the moment a second view (a progress bar) subscribes to the
same model with zero changes to the logic.

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// Express route builds HTML from raw rows inline — no model, no view boundary.
app.get("/todos", async (req, res) => {
  const rows = await db.query("SELECT * FROM todos");
  res.send("<ul>" + rows.map((r) => `<li>${r.title}</li>`).join("") + "</ul>");
});
```

**✅ Idiomatic**

```js
// Server-side MVC: model (data+rules), controller (route), view (template).
// models/todo.js
export const Todo = {
  all: () => db.query("SELECT * FROM todos ORDER BY created_at"),
  add: (title) => { if (!title) throw new Error("empty"); return db.query("INSERT ..."); },
};
// controllers/todos.js
export async function index(req, res) {
  const todos = await Todo.all();          // ask the model
  res.render("todos/index", { todos });    // hand data to the view
}
// views/todos/index.ejs   →  <ul><% todos.forEach(t => { %><li><%= t.title %></li><% }) %></ul>
```

**🧠 Tradeoff** — This is the shape every server-side web framework encodes: a route (controller)
asks a model and renders a template (view). Separating them lets the same `Todo` model serve an
HTML page and a JSON endpoint, and lets a designer own the template. The cost is the framework's
conventions and a bit of ceremony for the simplest pages.

### Python

*Targets Python 3.12.*

**❌ Naive**

```python
# A Tkinter callback mutates state and redraws in one place.
count = 0
def on_click():
    global count
    count = min(10, count + 1)
    label.config(text=str(count))
```

**✅ Idiomatic**

```python
# Model with observers; view renders on notify; controller wires input.
class CounterModel:
    def __init__(self):
        self._count = 0
        self._observers = []
    @property
    def count(self): return self._count
    def increment(self):
        self._count = min(10, self._count + 1)
        for obs in self._observers: obs(self._count)
    def subscribe(self, fn): self._observers.append(fn)

model = CounterModel()
model.subscribe(lambda c: label.config(text=str(c)))     # view
button.config(command=model.increment)                    # controller
```

**🧠 Tradeoff** — The model owns the `min(10, …)` rule and publishes changes; the view is just a
subscriber. On the server, Django is famously "MVT" — its *template* is the view and its *view*
is the controller — the same three roles under different names. The discipline in plain Python is
yours to keep; the payoff is a rule you can unit-test with no GUI.

### Elixir

*Targets Elixir 1.18.*

**❌ Naive**

```elixir
# A LiveView (or controller) with business rules stuffed into the render path.
def handle_event("inc", _p, socket) do
  count = min(10, socket.assigns.count + 1)  # rule mixed into the event handler
  {:noreply, assign(socket, count: count)}
end
```

**✅ Idiomatic**

```elixir
# Model = a context module (rules); View = template/component; Controller = LiveView/controller.
defmodule Counter do                         # the model: state transitions + rules
  def increment(count), do: min(10, count + 1)
end

defmodule MyAppWeb.CounterLive do            # controller: input → model → assign
  use MyAppWeb, :live_view
  def mount(_, _, socket), do: {:ok, assign(socket, count: 0)}
  def handle_event("inc", _params, socket) do
    {:noreply, assign(socket, count: Counter.increment(socket.assigns.count))}
  end
  # render/1 is the view — a pure function of assigns
  def render(assigns), do: ~H"<button phx-click='inc'><%= @count %></button>"
end
```

**🧠 Tradeoff** — Phoenix separates the roles cleanly: the **context** module is the model (pure,
testable rules), `render/1` is the view (a pure function of assigns), and the controller/LiveView
maps events to model calls. Keeping the rule in `Counter` rather than the event handler means it's
tested without the socket. LiveView blurs client/server, but the model/view/controller split still
holds.

### Go

*Targets Go 1.26.*

**❌ Naive**

```go
// Handler computes and writes HTML in one blob.
func counter(w http.ResponseWriter, r *http.Request) {
    count++ // package-global state, mutated and rendered inline
    if count > 10 { count = 10 }
    fmt.Fprintf(w, "<b>%d</b>", count)
}
```

**✅ Idiomatic**

```go
// Model (state+rules), view (template), controller (handler) as separate pieces.
type Counter struct{ n int }
func (c *Counter) Increment() { if c.n < 10 { c.n++ } } // rule in the model
func (c *Counter) Value() int  { return c.n }

var tmpl = template.Must(template.New("c").Parse(`<b>{{.}}</b>`)) // view

func (h *Handler) counter(w http.ResponseWriter, r *http.Request) { // controller
    h.model.Increment()
    tmpl.Execute(w, h.model.Value())
}
```

**🧠 Tradeoff** — Go has no MVC framework blessing the split, so you assemble it: a `Counter` type
holds state and the rule, `html/template` is the view, and the handler is a thin controller. The
explicitness is very Go — no magic wiring — and the model tests with a plain unit test. The cost
is that nothing enforces the boundaries, so team discipline keeps handlers from growing fat.

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// A click handler owns state, rule, and rendering all at once.
var count = 0;
button.Click += (_, _) =>
{
    count = Math.Min(10, count + 1);   // rule
    label.Text = count.ToString();     // render, right here
};
```

**✅ Idiomatic**

```csharp
// Model raises an event; the view subscribes; the controller writes.
var model = new CounterModel();
model.Changed += count => label.Text = count.ToString(); // view: reads and renders
button.Click += (_, _) => model.Increment();             // controller: input → model

public sealed class CounterModel
{
    private int _count;

    public event Action<int>? Changed;

    public int Count => _count;

    public void Increment()
    {
        _count = Math.Min(10, _count + 1);   // the rule lives here
        Changed?.Invoke(_count);
    }
}
```

**🧠 Tradeoff** — C# builds the model-notifies-view link into the language: `event` *is* the
Observer hookup, one declaration and one `+=`. The rule tests as a plain unit test — call
`Increment`, assert `Count`, no UI attached. Note where the frameworks sit: ASP.NET Core MVC
names the three roles outright, while WPF and MAUI prefer MVVM, where data binding replaces the
hand-wired subscription — same separation, the binding engine does the notifying.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// State, rule, and rendering fused in one handler.
fn on_click(count: &mut u32) {
    *count = (*count + 1).min(10);      // rule
    println!("count: {count}");         // render, right here
}
```

**✅ Idiomatic**

```rust
// The model owns state and the rule, and notifies subscribed views.
struct CounterModel {
    count: u32,
    listeners: Vec<Box<dyn Fn(u32)>>,
}

impl CounterModel {
    fn new() -> Self {
        Self { count: 0, listeners: Vec::new() }
    }
    fn subscribe(&mut self, f: impl Fn(u32) + 'static) {
        self.listeners.push(Box::new(f));
    }
    fn increment(&mut self) {
        self.count = (self.count + 1).min(10);      // the rule lives here
        for f in &self.listeners { f(self.count); } // notify
    }
}

fn main() {
    let mut model = CounterModel::new();
    model.subscribe(|c| println!("view: {c}"));     // view renders on notify
    model.increment();                              // controller calls in → view: 1
    model.increment();                              // view: 2
}
```

**🧠 Tradeoff** — The hand-rolled observer works, but push it toward a real UI and the borrow
checker starts objecting: views that also hold state mean shared mutation, which drags in
`Rc<RefCell<…>>`. That's why Rust UI libraries (iced, and egui in spirit) favor Model–View–Update
instead: a `Message` enum, an `update` function that `match`es messages into model changes, and a
view that's a pure function of the model. Same three roles, with the controller collapsed into an
exhaustive `match` — the more idiomatic Rust shape.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

var count: u32 = 0;

// The handler owns state, rule, and rendering.
fn onClick() void {
    count = @min(10, count + 1);                 // rule
    std.debug.print("count: {d}\n", .{count});   // render, right here
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// Zig has no closures — a view is a plain function pointer.
const View = *const fn (count: u32) void;

const CounterModel = struct {
    count: u32 = 0,
    views: []const View = &.{},                    // wired once at startup

    pub fn increment(self: *CounterModel) void {
        self.count = @min(10, self.count + 1);     // the rule lives here
        for (self.views) |view| view(self.count);  // notify
    }
};

fn renderLabel(count: u32) void {
    std.debug.print("label: {d}\n", .{count});
}

pub fn main() void {
    var model = CounterModel{ .views = &.{renderLabel} }; // view observes
    model.increment(); // controller calls in → label: 1
    model.increment(); // label: 2
}
```

**🧠 Tradeoff** — With no closures, a Zig view is a bare function pointer, which only covers
stateless views; a widget that carries its own state needs the two-field vtable idiom
(`*anyopaque` context + function pointer). The rule still tests clean — call `increment`, assert
`count`, no rendering involved. Honestly, Zig has no mainstream UI framework to bless the split;
where it earns its keep is embedded and immediate-mode rendering, where "update the model" and
"draw the model" are already separate phases and MVC just names them.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// A Swing listener owns state, rule, and rendering all at once.
class CounterPanel {
    private int count = 0;

    CounterPanel(JButton button, JLabel label) {
        button.addActionListener(e -> {
            count = Math.min(10, count + 1);      // rule
            label.setText(String.valueOf(count)); // render, right here
        });
    }
}
```

**✅ Idiomatic**

```java
import java.util.ArrayList;
import java.util.List;
import java.util.function.IntConsumer;

// Model notifies; views subscribe; the controller writes.
class CounterModel {
    private int count = 0;
    private final List<IntConsumer> listeners = new ArrayList<>();

    int count() { return count; }

    void increment() {
        count = Math.min(10, count + 1);         // the rule lives here
        listeners.forEach(l -> l.accept(count)); // notify
    }

    void subscribe(IntConsumer listener) { listeners.add(listener); }
}

public class Demo {
    public static void main(String[] args) {
        var model = new CounterModel();
        model.subscribe(c -> System.out.println("label: " + c)); // view renders on notify
        // in Swing the controller is one line: button.addActionListener(e -> model.increment());
        model.increment(); // label: 1
        model.increment(); // label: 2
    }
}
```

**🧠 Tradeoff** — Classic Java would declare an `Observer` interface and anonymous inner classes
to implement it; `IntConsumer` plus a lambda deletes all of that — the view subscribes in one
line. The rule now tests as plain JUnit: call `increment`, assert `count`, no window open. Java's
frameworks bless the split on both sides of the wire. Swing was designed around it — every
`JButton` already has a separate `ButtonModel` — and on the server, Spring MVC names the roles
outright: a `@Controller` method takes the input, writes to a `Model`, and picks the view template
that renders it. Same three roles, whether the view is a label or an HTML page.

## Applications

- **Web frameworks** — Rails, Django (MVT), Laravel, Spring MVC, and Phoenix all ship the model/
  view/controller split as the default app shape (backend).
- **Desktop & mobile UIs** — Cocoa (MVC), Android (with MVVM), and classic Swing apps structure
  screens this way (frontend).
- **Single-page apps** — early frameworks (Backbone) were explicitly MVC; React/Vue lean toward
  the MVVM-ish variant with reactive view-models (frontend).
- **Game UIs & tools** — editor and HUD code separates game state (model) from rendering (view)
  and input (controller) (frontend).
- **Admin/CRUD screens** — the pattern's sweet spot: forms and tables driven by a shared model
  (frontend & backend).

## Related Patterns

- **Observer** — the model-notifies-view link is Observer; the view subscribes to model changes.
- **MVP / MVVM** — variants that relocate presentation logic: MVP routes everything through a
  presenter, MVVM binds the view to a view-model via data binding.
- **Layered Architecture** — MVC is layering applied to the UI tier; the model itself often sits
  atop application/domain layers.
