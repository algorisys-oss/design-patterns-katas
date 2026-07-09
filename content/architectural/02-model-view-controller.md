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
languages: [javascript, node-js, python, elixir, go]
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
