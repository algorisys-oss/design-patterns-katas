---
id: container-presentational
category: ui
sequence: 1
title: Container / Presentational
also_known_as: [Smart & Dumb Components, Fat & Skinny Components]
gof: false
intent: "Split a UI component into one part that fetches data and holds state (container) and one that only renders what it's given (presentational), so each is simple and reusable."
frequency: high
difficulty: beginner
tags: [ui, components, separation-of-concerns, reusability, testability]
related: [provider, unidirectional-data-flow, model-view-controller]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Separate a component's two jobs. The **container** knows *where the data comes from* — it fetches,
holds state, and handles events. The **presentational** component knows *how things look* — it
takes data and callbacks as inputs and renders, with no idea where any of it originated.

The presentational piece becomes a pure function of its inputs: same props, same output. That
makes it reusable across contexts, trivial to preview in isolation, and easy to test — while all
the messy async, state, and wiring lives in one clearly-labeled container.

## The Problem

When a component does everything — fetches, holds state, *and* renders — it gets tangled:

- **Not reusable** — the render markup is welded to one specific data source and API call, so you
  can't reuse the look with different data.
- **Hard to test** — verifying the layout requires mocking network calls and state, because the
  view can't run without them.
- **Hard to preview** — you can't drop it into a style guide or Storybook without a live backend.
- **Mixed concerns** — a designer tweaking markup wades through `useEffect`/fetch logic; a
  developer fixing data flow wades through JSX.

## Structure

Key Components:

- **Container (smart)** — fetches data, owns state, handles events; renders a presentational
  component and passes data + callbacks down. Little or no markup of its own.
- **Presentational (dumb)** — receives data and callbacks as props/inputs and renders; holds no app
  state, does no fetching. Pure function of its inputs.
- **Data source** — the API/store the container talks to.

```
[ Store / API ] ──data──► Container ──props + callbacks──► Presentational ──► DOM
                        (fetch, state, events)          (render only, reusable)
```

## When to Use

- A component mixes data-fetching/state with rendering and has grown hard to reuse or test.
- The same visual component should be driven by different data sources.
- Designers and developers work on the same components and keep colliding.
- You want to preview UI in isolation (style guides, visual tests).

## Advantages and Disadvantages

### Advantages
- **Reusable views** — presentational components work anywhere, driven by any data.
- **Testable & previewable** — render with plain props; no network or state needed.
- **Clear split** — data/logic concerns and rendering concerns each have a home.

### Disadvantages
- **More components** — every feature is now (at least) two files; overkill for trivial UI.
- **Prop drilling** — passing data through the container to deep children can get verbose (see Provider).
- **The line blurs** — modern hooks/composables let you extract logic without a separate container,
  so the strict split is less necessary than it once was.

## Common Mistakes

- **Logic creeping into the presentational component** — a "dumb" component that fetches or holds
  app state loses its reusability and testability; keep it a pure function of props.
- **Splitting trivial components** — wrapping a two-line component in a container adds files for no
  benefit; split when the mix actually hurts.
- **Container rendering real markup** — a container that also lays out DOM re-tangles the concerns;
  it should mostly delegate to a presentational child.
- **Cargo-culting the pattern** — with hooks/composables you can often extract the logic *without* a
  second component; don't split reflexively.

## Key Takeaways

- One part owns data + state + events; the other only renders what it's handed.
- The presentational piece is a pure function of its inputs — reusable, testable, previewable.
- Push all fetching, state, and wiring into the container.
- Modern hooks/composables blur the need; split when mixing concerns genuinely hurts.

## Implementations

### JavaScript

**❌ Naive**

```jsx
// One component fetches, holds state, and renders — untestable without a network.
function UserList() {
  const [users, setUsers] = useState([]);
  useEffect(() => { fetch("/api/users").then((r) => r.json()).then(setUsers); }, []);
  return <ul>{users.map((u) => <li key={u.id}>{u.name}</li>)}</ul>; // view welded to the fetch
}
```

**✅ Idiomatic**

```jsx
// Presentational: pure function of props — reusable, previewable, testable.
function UserList({ users }) {
  return <ul>{users.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
}

// Container: owns fetching + state, delegates rendering.
function UserListContainer() {
  const [users, setUsers] = useState([]);
  useEffect(() => { fetch("/api/users").then((r) => r.json()).then(setUsers); }, []);
  return <UserList users={users} />;
}
```

**🧠 Tradeoff** — `UserList` is now a pure function you can render in a test or style guide with a
fixed array — no network. The container isolates the async mess. The nuance is that a **custom
hook** (`useUsers()`) achieves the same separation without a second component, which is why modern
React often prefers extracting logic to hooks over the strict container split.

### Node.js

**❌ Naive**

```js
// A route handler builds HTML inline from a query — data and markup fused.
app.get("/users", async (_req, res) => {
  const users = await db.query("SELECT id, name FROM users");
  res.send("<ul>" + users.map((u) => `<li>${u.name}</li>`).join("") + "</ul>");
});
```

**✅ Idiomatic**

```js
// Handler = container (fetch + state); template = presentational (render only).
// controllers/users.js  (container: gets data, hands it to a view)
export async function usersPage(req, res) {
  const users = await db.query("SELECT id, name FROM users");
  res.render("users/list", { users }); // pass data to the presentational template
}
// views/users/list.ejs  (presentational: pure function of `users`)
//   <ul><% users.forEach(u => { %><li><%= u.name %></li><% }) %></ul>
```

**🧠 Tradeoff** — On the server the split is handler-as-container and template-as-presentational:
the template renders whatever `users` it's given, so it's reusable across routes and testable by
passing a fixed array. It's the same MVC seam applied at the component level — the template never
knows the data came from SQL.

### Python

**❌ Naive**

```python
# View fetches and formats HTML in one place.
def user_list(request):
    users = User.objects.values("id", "name")
    html = "".join(f"<li>{u['name']}</li>" for u in users)
    return HttpResponse(f"<ul>{html}</ul>")
```

**✅ Idiomatic**

```python
# View = container (fetch + state); template = presentational (render).
def user_list(request):                      # container
    users = User.objects.values("id", "name")
    return render(request, "users/list.html", {"users": users})

# users/list.html  (presentational — a pure function of `users`)
#   <ul>{% for u in users %}<li>{{ u.name }}</li>{% endfor %}</ul>
```

**🧠 Tradeoff** — Django's view/template split *is* container/presentational: the view gathers
data, the template renders it and can be reused with any `users` context (or previewed with a stub
context). Component frameworks like Reflex push the same idea into Python components (a data
component wrapping a render component); the principle — pure render, data elsewhere — carries over.

### Elixir

**❌ Naive**

```elixir
# A LiveView that fetches AND renders complex markup inline — one tangled blob.
def render(assigns) do
  ~H"""
  <ul>
    <li :for={u <- @users}><%= u.name %></li>
  </ul>
  """
end
# ...with the fetching, state, and event handling all in the same module.
```

**✅ Idiomatic**

```elixir
# LiveView = container (state, events, data); function component = presentational.
defmodule UserListLive do                      # container
  use MyAppWeb, :live_view
  def mount(_, _, socket), do: {:ok, assign(socket, users: Accounts.list_users())}
  def render(assigns), do: ~H"<.user_list users={@users} />"  # delegate rendering
end

# a stateless function component — pure function of assigns, reusable anywhere
def user_list(assigns) do
  ~H"""
  <ul>
    <li :for={u <- @users}><%= u.name %></li>
  </ul>
  """
end
```

**🧠 Tradeoff** — Phoenix draws the line as **LiveView (stateful container)** vs. **function/Live
components (presentational)**: the LiveView owns `mount`, assigns, and events; the function
component is a pure `assigns -> HEEx` render reusable across pages and testable with
`render_component/2`. It's the pattern with framework blessing, and the split keeps the stateful and
stateless parts cleanly separable.

### Go

**❌ Naive**

```go
// Handler queries and writes HTML together.
func users(w http.ResponseWriter, r *http.Request) {
    rows, _ := db.Query("SELECT name FROM users")
    fmt.Fprint(w, "<ul>")
    for rows.Next() { var n string; rows.Scan(&n); fmt.Fprintf(w, "<li>%s</li>", n) }
    fmt.Fprint(w, "</ul>")
}
```

**✅ Idiomatic**

```go
// Handler = container (fetch + state); template/templ component = presentational.
var listTmpl = template.Must(template.New("users").Parse(
    `<ul>{{range .}}<li>{{.Name}}</li>{{end}}</ul>`)) // presentational: renders whatever it's given

func users(w http.ResponseWriter, r *http.Request) { // container
    people, err := repo.AllUsers(r.Context())
    if err != nil { http.Error(w, err.Error(), 500); return }
    listTmpl.Execute(w, people)
}
```

**🧠 Tradeoff** — The handler fetches (container) and `html/template` (or a `templ` component)
renders (presentational): the template is a pure function of the slice it's handed, reusable and
testable with a fixed `[]User`. `templ` makes this even more component-like with typed, composable
render functions. Go keeps it explicit — no hooks blurring the line — so the container/presentational
split stays crisp.

## Applications

- **Component libraries** — presentational components (buttons, lists, cards) ship without data; apps
  wrap them in containers (frontend).
- **Style guides & Storybook** — presentational components render from fixed props, enabling visual
  catalogs and snapshot tests (frontend).
- **Server-rendered apps** — the controller/handler + template split is this pattern at the request
  level (backend).
- **Design/dev collaboration** — designers own presentational markup, developers own containers,
  meeting at the props contract (frontend).
- **A/B testing & theming** — swap presentational components behind the same container to change look
  without touching data flow (frontend).

## Related Patterns

- **Provider / Context** — the usual answer to the prop-drilling that containers can cause: provide
  shared data down the tree instead of threading it through every level.
- **Unidirectional Data Flow** — containers typically get their state from a store; the pattern is
  how state reaches the presentational leaves.
- **Model–View–Controller** — container/presentational is MVC's view tier split into "gets data" and
  "renders," one level finer.
