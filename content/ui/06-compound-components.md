---
id: compound-components
category: ui
sequence: 6
title: Compound Components
also_known_as: [Component Composition, Slots]
gof: false
intent: "Build a set of components that work together and share implicit state through a common parent, so users compose them freely instead of configuring one component with a wall of props."
frequency: medium
difficulty: intermediate
tags: [ui, composition, api-design, slots, flexibility]
related: [provider, container-presentational, composite]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Instead of one monolithic component driven by dozens of props, expose a **family of components** —
a parent and its children — that coordinate through **implicit shared state**. The user composes
them in markup (`<Tabs>` wrapping `<TabList>`, `<Tab>`, and `<TabPanel>`), arranging and styling
them freely, while the parent quietly manages the state they all need (which tab is active).

The user gets layout flexibility and readable markup; the components handle the wiring. It's
composition over configuration: rather than a `tabs={[…]}` prop describing everything, the structure
*is* the API.

## The Problem

A "do everything through props" component collapses under its own configurability:

- **Prop explosion** — a `<Tabs>` that takes `tabs`, `labels`, `icons`, `renderTab`, `activeIndex`,
  `onChange`, `tabClassName`, `panelClassName`… becomes an unusable configuration language.
- **No layout control** — the component decides the markup, so you can't put a divider between two
  tabs or wrap one in a tooltip without a new prop.
- **Rigid structure** — supporting a new arrangement means adding yet another prop or a render-prop
  escape hatch.
- **Threaded state** — if the user *does* compose the pieces, they're stuck manually passing
  `activeIndex`/`onChange` between every child.

## Structure

Key Components:

- **Parent** — owns the shared state (e.g., which tab is active) and provides it implicitly to its
  children (via context/slots), plus the API to change it.
- **Child components** — the composable pieces (`Tab`, `TabPanel`, `TabList`); each reads/uses the
  shared state without being handed it explicitly.
- **Implicit communication** — the children coordinate through the parent's context/scope, not
  through props the user threads.
- **Composition** — the user arranges the children in markup; the structure expresses intent.

```
[ Tabs (parent) ] ── shares context (active tab) ──► TabList
       │                                          ──► Tab      (reads/sets active)
       └──────────────────────────────────────── ──► TabPanel (shows if active)
   user composes the children; the parent wires the shared state
```

## When to Use

- A component has many parts that must coordinate but should be arranged flexibly.
- A props-driven API has grown unwieldy or can't express the layouts users need.
- You're building a reusable UI library where consumers want composition and control.
- The parts share a small piece of state (selection, open/closed) the parent can own.

## Advantages and Disadvantages

### Advantages
- **Flexible composition** — users arrange, wrap, and style the parts however they like.
- **Clean API** — the markup structure expresses intent; no giant prop object.
- **Encapsulated state** — the parent manages coordination; children stay simple and dumb.

### Disadvantages
- **Implicit coupling** — children only work inside their parent, and that requirement isn't visible
  in a signature.
- **Discoverability** — which children exist and how they combine is less obvious than a typed props
  list.
- **Misuse is easy** — a child used outside its parent (or nested wrong) fails at runtime, often
  with a confusing error.

## Common Mistakes

- **No guard for orphaned children** — a child rendered outside its parent should fail with a clear
  message, not a cryptic null-context error.
- **Leaking too much internal state** — exposing the entire parent state to children invites misuse;
  share only what the children need.
- **Over-applying it** — a component with two fixed parts doesn't need compound composition; a couple
  of props are simpler.
- **Losing accessibility wiring** — flexible composition can break the aria/roles the parts need;
  the parent should still wire relationships (ids, roles) implicitly.

## Key Takeaways

- A parent plus composable children coordinate through implicit shared state, not threaded props.
- The markup structure becomes the API — composition over configuration.
- Great for flexible, reusable widgets (tabs, menus, accordions, selects).
- Guard against orphaned children and keep the shared state minimal.

## Implementations

### JavaScript

**❌ Naive**

```jsx
// One component configured entirely by props — inflexible and prop-heavy.
<Tabs
  tabs={[{ label: "A", content: <A /> }, { label: "B", content: <B /> }]}
  activeIndex={i}
  onChange={setI}
  tabClassName="..."
  panelClassName="..."
/>  // can't reorder, wrap, or interleave anything
```

**✅ Idiomatic**

```jsx
// Compound components share state via context; the user composes the parts.
const TabsCtx = createContext(null);

function Tabs({ children }) {
  const [active, setActive] = useState(0);
  return <TabsCtx.Provider value={{ active, setActive }}>{children}</TabsCtx.Provider>;
}
function Tab({ index, children }) {
  const { active, setActive } = useContext(TabsCtx); // implicit shared state
  return <button aria-selected={active === index} onClick={() => setActive(index)}>{children}</button>;
}
function TabPanel({ index, children }) {
  const { active } = useContext(TabsCtx);
  return active === index ? <div>{children}</div> : null;
}
Tabs.Tab = Tab; Tabs.Panel = TabPanel;

// <Tabs><Tab index={0}>A</Tab><Divider/><Tab index={1}>B</Tab>
//   <Tabs.Panel index={0}><A/></Tabs.Panel> ...</Tabs>  ← arrange freely
```

**🧠 Tradeoff** — Context lets `Tab` and `TabPanel` share the active index without the user threading
it, so the markup composes freely (insert a `<Divider/>`, wrap a `<Tab>` in a tooltip). It's the API
behind Radix, Reach UI, and headless component libraries. The cost is implicit coupling — a `<Tab>`
outside `<Tabs>` breaks — so guard the context read with a helpful error.

### Node.js

**❌ Naive**

```js
// A server template partial configured by one big options object — no composition.
res.render("tabs", {
  tabs: [{ label: "A", body: htmlA }, { label: "B", body: htmlB }],
  active: 0, // can't interleave custom markup between tabs
});
```

**✅ Idiomatic**

```js
// Template layouts + slots/blocks let a parent template compose named child sections.
// layouts/tabs.ejs  (parent owns the shared 'active' state and structure)
//   <div class="tabs" data-active="<%= active %>">
//     <div class="tablist"><%- tablist %></div>   <!-- slot -->
//     <div class="panels"><%- panels %></div>       <!-- slot -->
//   </div>
// a page composes the slots:
res.render("layouts/tabs", {
  active: 0,
  tablist: renderPartial("tab", { index: 0, label: "A" }) + renderPartial("tab", { index: 1, label: "B" }),
  panels: renderPartial("panel", { index: 0, body: htmlA }),
});
```

**🧠 Tradeoff** — Server templates express compound components through **slots/blocks**: the parent
layout owns the shared state and structure, and the page fills named regions with child partials it
composes. It's less dynamic than client-side context (the "shared state" is baked at render time,
enhanced with a little JS for interactivity), but the composition-over-configuration idea carries:
the page arranges the parts rather than passing one options blob.

### Python

**❌ Naive**

```python
# One template tag configured by a dict — rigid, no interleaving.
{% tabs config=tabs_config active=0 %}   {# can't customize per-tab markup #}
```

**✅ Idiomatic**

```python
# Template inheritance / slots (Django blocks, Jinja) let a parent define regions children fill.
# templates/tabs.html  (parent owns structure + shared 'active')
#   <div class="tabs" data-active="{{ active }}">
#     <div class="tablist">{% block tablist %}{% endblock %}</div>   {# slot #}
#     <div class="panels">{% block panels %}{% endblock %}</div>       {# slot #}
#   </div>
# a page extends it and composes the parts:
#   {% extends "tabs.html" %}
#   {% block tablist %}{% include "tab.html" with index=0 label="A" %} ...{% endblock %}

# Component frameworks (Reflex) express it as nested components sharing State:
def tabs(*children): return rx.box(*children, class_name="tabs")  # parent
def tab(index, label): return rx.button(label, on_click=State.set_active(index))  # child reads State
```

**🧠 Tradeoff** — Django/Jinja template inheritance provides the server-side compound shape via
`block` slots a child page fills, with the parent owning structure. For interactive Python UIs,
Reflex/Flet express it as nested components sharing a `State` object — closer to the React model. The
principle holds across both: the parent coordinates, the consumer composes named parts rather than
configuring one component.

### Elixir

**❌ Naive**

```elixir
# A component driven by one big attr — can't interleave or customize parts.
<.tabs items={[%{label: "A", body: ~H"<A/>"}, %{label: "B", body: ~H"<B/>"}]} active={0} />
```

**✅ Idiomatic**

```elixir
# HEEx slots are compound components: the parent declares named slots children fill.
attr :active, :integer, default: 0
slot :tab, required: true do
  attr :label, :string
end
slot :panel

def tabs(assigns) do
  ~H"""
  <div class="tabs">
    <div class="tablist">
      <button :for={{tab, i} <- Enum.with_index(@tab)} aria-selected={@active == i}>
        <%= tab.label %>
      </button>
    </div>
    <div class="panels">
      <div :for={{panel, i} <- Enum.with_index(@panel)} :if={@active == i}>
        <%= render_slot(panel) %>
      </div>
    </div>
  </div>
  """
end

# usage composes named slots:
#   <.tabs active={0}>
#     <:tab label="A" /><:tab label="B" />
#     <:panel><A/></:panel><:panel><B/></:panel>
#   </.tabs>
```

**🧠 Tradeoff** — Phoenix HEEx has **slots** as a first-class feature: a component declares named
slots (`:tab`, `:panel`) with their own attrs, and the caller composes them in markup while the
parent owns the shared `active` state and wiring. It's the cleanest server-side expression of the
pattern here — typed, validated slots with composition — and LiveView makes the selection interactive
without client JS.

### Go

**❌ Naive**

```go
// A template helper taking a slice of tab structs — no per-tab composition.
tabsTmpl.Execute(w, TabsData{Active: 0, Tabs: []Tab{{"A", bodyA}, {"B", bodyB}}})
```

**✅ Idiomatic**

```go
// templ components compose: a parent component owns state; children are passed as content.
// (templ syntax — typed, composable render functions)
templ Tabs(active int) {
    <div class="tabs" data-active={ strconv.Itoa(active) }>
        { children... }   // slot: caller composes the child components here
    </div>
}
templ Tab(index int, label string, active int) {
    <button aria-selected={ active == index }>{ label }</button>
}
// caller composes freely:
//   @Tabs(active) {
//       @Tab(0, "A", active)
//       @Divider()
//       @Tab(1, "B", active)
//   }
```

**🧠 Tradeoff** — `templ` gives Go typed, composable components with a `children...` slot, so a parent
`Tabs` component wraps child `Tab`/`Panel` components the caller arranges — compound composition with
compile-time checking. The shared `active` state is passed explicitly (Go has no implicit context in
templates), which is more verbose than React's context but keeps the data flow visible. Plain
`html/template` supports the idea more crudely via nested template blocks.

## Applications

- **Headless UI libraries** — Radix, Reach UI, Headless UI, and Ark expose tabs/menus/dialogs as
  compound components for maximum composition (frontend).
- **Form builders** — `<Form>`, `<Field>`, `<Label>`, `<Error>` sharing form state implicitly
  (frontend).
- **Layout primitives** — `<Table>`/`<Row>`/`<Cell>`, `<Menu>`/`<MenuItem>`, `<Accordion>`/`<Item>`
  (frontend).
- **Design systems** — components that must be arranged flexibly while staying wired for
  accessibility (frontend).
- **Server-rendered slots** — Phoenix slots, Django blocks, and templ children compose page sections
  server-side (backend).

## Related Patterns

- **Provider / Context** — the usual mechanism for the implicit shared state: the parent provides
  context the children consume.
- **Composite** — like Composite, it forms a part-whole tree of components; compound components add
  shared coordination state among the parts.
- **Container / Presentational** — the compound parent is a small stateful container; its children are
  presentational parts arranged by the consumer.
