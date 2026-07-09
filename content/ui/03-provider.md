---
id: provider
category: ui
sequence: 3
title: Provider / Context
also_known_as: [Context, Dependency Provision, Scoped State]
gof: false
intent: "Make a value available to a whole subtree of components without passing it manually through every intermediate level — provide once at the top, consume anywhere below."
frequency: high
difficulty: beginner
tags: [ui, dependency-injection, prop-drilling, scoping, tree]
related: [dependency-injection, container-presentational, unidirectional-data-flow]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Set a value at the top of a component (or call) tree and let anything **below** read it directly,
skipping every level in between. A **Provider** holds the value; **Consumers** anywhere in its
subtree pull it out. Intermediate components that don't care about the value never have to see it.

It's dependency injection scoped to a tree: the theme, the current user, a store, or a request's
context is provided once and available everywhere underneath, without being threaded by hand through
components that are just passing it along.

## The Problem

To get a value from the top of a tree to a deep leaf, you pass it down every level — **prop
drilling**:

- **Tedious threading** — a `theme` needed by a deeply nested button is passed through ten
  components that don't use it, just to hand it along.
- **Fragile plumbing** — add a level, or move a component, and you re-thread the prop through new
  intermediaries.
- **Polluted signatures** — every intermediate component's props are cluttered with values it
  merely forwards.
- **Coupling to structure** — components become coupled to the tree shape because they exist partly
  to pass things down.

## Structure

Key Components:

- **Provider** — sits high in the tree, holds the value (state, config, a service), and makes it
  available to its subtree.
- **Context / Scope** — the named channel through which the value flows; consumers look it up by it.
- **Consumers** — components anywhere below that read the value directly, regardless of depth.
- **Intermediate components** — neither provide nor consume; they're blissfully unaware.

```
[ Provider (value) ]
      ├─ intermediate ─ intermediate ─► Consumer A  (reads value)
      ├─ intermediate ──────────────► Consumer B  (reads value)
      └────────────────────────────► Consumer C  (reads value)
   value skips the intermediates — no prop drilling
```

## When to Use

- A value is needed by many components at varying depths (theme, locale, current user, a store).
- Prop drilling has become tedious or is polluting intermediate components.
- The value is relatively stable/global to a subtree (not changing every render).
- You want to scope a dependency to part of the tree, not make it a true global.

## Advantages and Disadvantages

### Advantages
- **No prop drilling** — provide once, consume anywhere below; intermediates stay clean.
- **Scoped, not global** — the value lives in a subtree; different subtrees can have different providers.
- **Decoupling** — consumers depend on the context, not on the components between them and the provider.

### Disadvantages
- **Hidden dependencies** — a consumer's needs aren't visible in its props; you must know a provider
  exists above it.
- **Re-render breadth** — a naive provider re-renders its whole subtree on every value change; needs
  care (memoization, splitting contexts).
- **Overuse as a global** — stuffing everything into context recreates global-state problems with
  extra indirection.

## Common Mistakes

- **Putting frequently-changing state in one context** — every change re-renders all consumers;
  split contexts by change frequency or use a store with selectors.
- **Using context for everything** — it's for cross-cutting, relatively stable values (theme, auth),
  not a dumping ground for all state.
- **Consuming without a provider** — a consumer with no provider above it silently gets a default (or
  errors); guard with a clear error.
- **New object value every render** — passing a freshly-created object as the value defeats
  memoization and re-renders all consumers; stabilize it.

## Key Takeaways

- Provide a value at the top of a subtree; consume it anywhere below without threading props.
- It's tree-scoped dependency injection — great for theme, auth, locale, and shared stores.
- Beware re-render breadth and hidden dependencies; split contexts and memoize values.
- Reach for it to kill prop drilling, not as a global-state replacement.

## Implementations

### JavaScript

**❌ Naive**

```jsx
// theme threaded through every level to reach a deep button — prop drilling.
function App()    { return <Page theme="dark" />; }
function Page({ theme })   { return <Toolbar theme={theme} />; }        // just forwarding
function Toolbar({ theme }) { return <Button theme={theme} />; }        // just forwarding
function Button({ theme })  { return <button className={theme}>Go</button>; }
```

**✅ Idiomatic**

```jsx
// Provide once at the top; consume where needed. Intermediates don't see `theme`.
const ThemeContext = createContext("light");

function App() {
  return (
    <ThemeContext.Provider value="dark">
      <Page />
    </ThemeContext.Provider>
  );
}
function Page()    { return <Toolbar />; }   // no theme prop
function Toolbar() { return <Button />; }    // no theme prop
function Button()  {
  const theme = useContext(ThemeContext);    // reads it directly
  return <button className={theme}>Go</button>;
}
```

**🧠 Tradeoff** — React Context removes the drilling entirely: `Page` and `Toolbar` no longer carry a
`theme` prop they don't use. The cost is that `Button`'s dependency on a theme provider is now
implicit, and a changing context value re-renders all consumers — so context suits stable,
cross-cutting values, with a store + selectors for hot, granular state.

### Node.js

**❌ Naive**

```js
// Passing request-scoped data (user, requestId) through every function call.
function handler(req, res) { service(req.user, req.id); }
function service(user, id) { repo(user, id); }        // forwarding
function repo(user, id)    { audit(user, id); }       // forwarding
```

**✅ Idiomatic**

```js
// AsyncLocalStorage provides request-scoped context to anything downstream.
const { AsyncLocalStorage } = require("node:async_hooks");
const ctx = new AsyncLocalStorage();

function handler(req, res) {
  ctx.run({ user: req.user, requestId: req.id }, () => service()); // provide
}
function service() { repo(); }                 // no threading
function repo()    { audit(); }                // no threading
function audit()   { const { user, requestId } = ctx.getStore(); log(user, requestId); } // consume
```

**🧠 Tradeoff** — `AsyncLocalStorage` is the server-side provider: it makes request-scoped values
(user, trace id) available to any function in the async call chain without threading them through
every signature — the same "provide at the top, consume below" idea for backend code. The tradeoff
mirrors the UI one: the dependency becomes implicit, and it's for cross-cutting request context, not
a substitute for passing real arguments.

### Python

**❌ Naive**

```python
# Thread request context (user, trace id) through every function.
def handler(request): service(request.user, request.trace_id)
def service(user, tid): repo(user, tid)     # forwarding
def repo(user, tid):    audit(user, tid)    # forwarding
```

**✅ Idiomatic**

```python
from contextvars import ContextVar

current_user: ContextVar = ContextVar("current_user")

def handler(request):
    token = current_user.set(request.user)   # provide (context-local)
    try:
        service()
    finally:
        current_user.reset(token)

def service(): repo()                         # no threading
def repo():    audit()                        # no threading
def audit():   log(current_user.get())        # consume anywhere downstream
```

**🧠 Tradeoff** — `contextvars` is Python's provider, and it's async/thread-aware, so request-scoped
values (user, locale, trace id) reach any downstream function without threading — and each async task
gets its own copy. In UI frameworks (Reflex, Flet) a `State`/context object plays the same role for
components. As always the dependency goes implicit, so it's for cross-cutting scope, not ordinary
arguments.

### Elixir

**❌ Naive**

```elixir
# Pass shared assigns down through every nested component manually.
def render(assigns), do: ~H"<.toolbar theme={@theme} user={@user} />"
def toolbar(assigns), do: ~H"<.button theme={@theme} />"   # forwarding
```

**✅ Idiomatic**

```elixir
# LiveView assigns flow down; for cross-cutting values, use the process dictionary
# sparingly or a context struct — but the idiomatic tree provider is assigns + slots.
# Provide once; nested function components read from a shared assign:
def app(assigns) do
  ~H"""
  <.theme_provider theme="dark">
    <.page />
  </.theme_provider>
  """
end
# For request-scoped values, Logger metadata / Process dictionary provide implicitly:
# Logger.metadata(user_id: user.id)  # available to any log downstream in this process
```

**🧠 Tradeoff** — Elixir leans on explicit assigns and **slots** for the component tree (values flow
down HEEx, and slots let a parent inject content), which keeps dependencies visible. For truly
cross-cutting, per-process values it uses `Logger.metadata` or the process dictionary as an implicit
provider — deliberately reserved for cross-cutting concerns. The BEAM's process isolation means
"scoped context" is naturally per-process, a clean provider boundary.

### Go

**❌ Naive**

```go
// Thread request-scoped values through every function signature.
func handler(w http.ResponseWriter, r *http.Request) { service(r, currentUser(r), traceID(r)) }
func service(r *http.Request, user User, tid string)  { repo(r, user, tid) } // forwarding
```

**✅ Idiomatic**

```go
// context.Context IS the provider: attach request-scoped values, read them downstream.
type ctxKey string
const userKey ctxKey = "user"

func handler(w http.ResponseWriter, r *http.Request) {
    ctx := context.WithValue(r.Context(), userKey, currentUser(r)) // provide
    service(ctx)
}
func service(ctx context.Context) { repo(ctx) }      // just pass ctx
func repo(ctx context.Context) {
    user := ctx.Value(userKey).(User)                // consume
    audit(user)
}
```

**🧠 Tradeoff** — `context.Context` is Go's provider for request-scoped values: attach at the top,
read anywhere downstream, and only `ctx` threads through — not every value. It's the idiomatic way to
carry a user, trace id, or deadline through a call tree. Go's community wisely limits it to
*request-scoped* data (not optional config), because, like all providers, values-in-context are
implicit dependencies that type signatures don't reveal.

## Applications

- **Theming & i18n** — a theme or locale provided at the root and read by any component (frontend).
- **Auth / current user** — the logged-in user available everywhere without prop drilling (frontend
  & backend).
- **Request context** — user, trace id, and deadline carried through a server call tree
  (`context.Context`, `AsyncLocalStorage`, `contextvars`) (backend).
- **Shared stores** — a state store made available to the component tree so any component can
  subscribe (frontend).
- **Design-system config** — spacing, density, and RTL settings provided once and honored by all
  components below (frontend).

## Related Patterns

- **Dependency Injection** — Provider is DI scoped to a tree: injecting a value into a subtree instead
  of into a constructor.
- **Container / Presentational** — Provider solves the prop-drilling that the container/presentational
  split can otherwise create.
- **Unidirectional Data Flow** — a store is typically handed to the tree via a provider, then consumed
  by the components that need it.
