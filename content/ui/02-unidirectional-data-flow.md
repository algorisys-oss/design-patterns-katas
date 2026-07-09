---
id: unidirectional-data-flow
category: ui
sequence: 2
title: Unidirectional Data Flow
also_known_as: [Flux, Model-View-Update, The Elm Architecture]
gof: false
intent: "Make UI state flow in one direction — state renders the view, the view dispatches actions, a pure reducer produces the next state — so changes are predictable and traceable."
frequency: high
difficulty: intermediate
tags: [ui, state-management, immutability, predictability, reducer]
related: [observer, model-view-controller, provider]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Let data move in a single loop. A single **state** value renders the **view**; user interaction
**dispatches an action** (a plain description of what happened); a pure **reducer/update** function
takes the current state and the action and returns the **next state**; the new state re-renders the
view. Round and round, always the same direction.

Because state is only ever produced by a pure function of `(state, action)`, every change is
explicit, reproducible, and traceable. You can log every action, replay them, time-travel, and know
exactly why the UI looks the way it does — there's no hidden two-way binding mutating things behind
your back.

## The Problem

When any part of the UI can mutate any state directly, change becomes impossible to follow:

- **Tangled two-way binding** — a field updates a model that updates another field that updates the
  model… and a bug could originate anywhere in the web.
- **Unpredictable state** — with many components mutating shared state, "how did it get into *this*
  state?" has no answer.
- **Hard to trace & debug** — there's no single record of what changed and why; you reverse-engineer
  it from the current mess.
- **Scattered logic** — the rules for how state changes are spread across every event handler
  instead of living in one place.

## Structure

Key Components:

- **State (store)** — a single source of truth for the UI's data, treated as immutable.
- **View** — a function of state; renders the current state and nothing else.
- **Action** — a plain, serializable description of something that happened (`{ type, payload }`).
- **Reducer / Update** — a pure function `(state, action) => newState`; the only place state changes.
- **Dispatch** — how the view sends an action into the loop.

```
        ┌──────────── state ────────────┐
        ▼                               │
     [ View ] ──dispatch(action)──► [ Store ] ──runs──► Reducer (state, action) => state
        ▲                                                        │
        └──────────────── re-render on new state ◄───────────────┘
```

## When to Use

- UI state is complex, shared across many components, and changes in many ways.
- You need predictable, debuggable state changes (logging, replay, time-travel).
- Two-way binding has become a tangle you can't reason about.
- State transitions deserve to live in one testable place.

## Advantages and Disadvantages

### Advantages
- **Predictable** — state changes only through pure reducers, so behavior is reproducible.
- **Traceable & debuggable** — every change is an action you can log, replay, and time-travel.
- **Testable transitions** — reducers are pure functions: given state + action, assert next state.

### Disadvantages
- **Boilerplate** — actions, reducers, and dispatch wiring add ceremony for simple state.
- **Indirection** — a click no longer directly does the thing; it dispatches an action handled elsewhere.
- **Overkill for local state** — a single toggle doesn't need a store; reach for it when state is
  genuinely shared and complex.

## Common Mistakes

- **Mutating state in the reducer** — reducers must be pure and return *new* state; mutating the
  argument breaks change detection, time-travel, and predictability.
- **Side effects in reducers** — fetching or logging inside a reducer makes it impure and
  untestable; keep effects at the edges (middleware, effect handlers, commands).
- **One giant reducer/store for everything** — dumping all state in one place couples unrelated
  features; split by domain and compose.
- **Using it for trivial local state** — a component's own toggle or input doesn't need the whole
  action/reducer apparatus.

## Key Takeaways

- State → view → action → reducer → new state → view: one direction, always.
- The reducer is a pure function of `(state, action)`, so changes are predictable and testable.
- Keep side effects out of reducers; run them at the edges.
- It's the Elm Architecture / Flux / Redux idea — and it's what makes state debuggable at scale.

## Implementations

### JavaScript

**❌ Naive**

```js
// Scattered mutation: handlers mutate shared state directly, from anywhere.
let cart = { items: [], total: 0 };
addBtn.onclick = () => { cart.items.push(item); cart.total += item.price; render(); };
clearBtn.onclick = () => { cart.items = []; cart.total = 0; render(); }; // change logic everywhere
```

**✅ Idiomatic**

```js
// A store with a pure reducer; the view dispatches actions, never mutates.
function reducer(state, action) {
  switch (action.type) {
    case "add":   return { items: [...state.items, action.item],
                           total: state.total + action.item.price };
    case "clear": return { items: [], total: 0 };
    default:      return state;
  }
}
function createStore(reducer, initial) {
  let state = initial, listeners = [];
  return {
    getState: () => state,
    dispatch: (action) => { state = reducer(state, action); listeners.forEach((l) => l()); },
    subscribe: (l) => listeners.push(l),
  };
}
// const store = createStore(reducer, { items: [], total: 0 });
// store.subscribe(render); addBtn.onclick = () => store.dispatch({ type: "add", item });
```

**🧠 Tradeoff** — A tiny store + pure reducer is the whole Redux idea in a few lines: all change
logic lives in one testable function and the view only dispatches. It's more ceremony than mutating
`cart` directly, and for one small piece of state that's overkill — but for shared, complex state it
buys predictability, logging, and time-travel that mutation can never offer. `useReducer` gives the
same loop component-locally.

### Node.js

**❌ Naive**

```js
// Server-side session/game state mutated ad hoc across handlers.
socket.on("move", (m) => { game.board[m.i] = m.player; game.turn++; broadcast(game); }); // direct mutation
```

**✅ Idiomatic**

```js
// A pure reducer drives authoritative server state; each event dispatches an action.
function gameReducer(state, action) {
  switch (action.type) {
    case "move":
      if (state.board[action.i]) return state;                // ignore invalid
      return { ...state, board: state.board.with(action.i, action.player), turn: state.turn + 1 };
    default:
      return state;
  }
}
let game = initialGame;
socket.on("move", (m) => {
  game = gameReducer(game, { type: "move", ...m }); // single place rules live
  broadcast(game);
});
```

**🧠 Tradeoff** — Even server-side, routing every mutation through a pure `gameReducer` makes the
authoritative state predictable and the rules (reject invalid moves) live in one testable place —
and the action stream can be logged or replayed to reproduce a game. It's the same discipline as the
client; the cost is the same boilerplate, worth it for shared multiplayer/session state.

### Python

**❌ Naive**

```python
# Global state mutated from various handlers — untraceable.
state = {"count": 0}
def increment(): state["count"] += 1   # who changed it, and why?
def reset():     state["count"] = 0
```

**✅ Idiomatic**

```python
# Pure reducer + a small store; dispatch actions, never mutate in place.
def reducer(state, action):
    match action["type"]:
        case "increment": return {**state, "count": state["count"] + 1}
        case "reset":     return {**state, "count": 0}
        case _:           return state

class Store:
    def __init__(self, reducer, initial):
        self._reducer, self._state, self._subs = reducer, initial, []
    def dispatch(self, action):
        self._state = self._reducer(self._state, action)      # replace, don't mutate
        for s in self._subs: s(self._state)
    def subscribe(self, fn): self._subs.append(fn)

# store = Store(reducer, {"count": 0}); store.dispatch({"type": "increment"})
```

**🧠 Tradeoff** — The reducer + store pattern ports cleanly to Python, and `match` makes the action
handling readable. It's the backbone of Python UI frameworks (Reflex's state, Flet's model) and of
predictable server state. The immutable-update discipline (`{**state, ...}`) is a convention Python
won't enforce, so the win depends on not reaching in and mutating `_state` directly.

### Elixir

**❌ Naive**

```elixir
# Ad-hoc socket assigns updated in scattered ways across handlers.
def handle_event("add", %{"item" => item}, socket) do
  # mutdate-ish: recompute inline, logic duplicated across events
  items = [item | socket.assigns.items]
  {:noreply, assign(socket, items: items, total: socket.assigns.total + item["price"])}
end
```

**✅ Idiomatic**

```elixir
# LiveView IS the Elm Architecture: state → render, events → pure update → new state.
defmodule CartLive do
  use MyAppWeb, :live_view

  def mount(_, _, socket), do: {:ok, assign(socket, update(:init, %{}, %{items: [], total: 0}))}

  # events dispatch to a pure update function
  def handle_event(event, params, socket),
    do: {:noreply, assign(socket, update(String.to_atom(event), params, socket.assigns))}

  # the single, pure place state changes
  defp update(:add, %{"item" => item}, state),
    do: %{state | items: [item | state.items], total: state.total + item["price"]}
  defp update(:clear, _params, state), do: %{state | items: [], total: 0}
  defp update(_other, _params, state), do: state
end
```

**🧠 Tradeoff** — Phoenix LiveView is *literally* the Elm Architecture (model → view → update):
assigns are the immutable state, `render/1` is `view`, and `handle_event` is `update`. Factoring the
transitions into a pure `update/3` makes them testable in isolation and keeps all change logic in one
place. Elixir's immutability means you get the discipline for free — there's no `state` to mutate,
only new maps to return.

### Go

**❌ Naive**

```go
// Handlers mutate shared state directly; rules scattered and racy.
func (g *Game) Move(i, player int) { g.Board[i] = player; g.Turn++ } // direct, no single rule site
```

**✅ Idiomatic**

```go
// A pure reducer returns the next state; the loop applies actions one at a time.
type Action struct {
    Type   string
    Index  int
    Player int
}

func reduce(s State, a Action) State {
    switch a.Type {
    case "move":
        if s.Board[a.Index] != 0 {
            return s // invalid, unchanged
        }
        next := s                       // copy value
        next.Board[a.Index] = a.Player
        next.Turn++
        return next
    default:
        return s
    }
}
// state = reduce(state, action) inside a single goroutine that owns `state` (see Actor)
```

**🧠 Tradeoff** — A pure `reduce(State, Action) State` gives Go the same predictable, testable
transition, and because `State` is a value, returning a copy is natural (no shared mutation).
Combined with a single goroutine owning the state (the Actor pattern), you also get race-free
updates. Go has no UI framework prescribing this, but the reducer discipline pays off anywhere state
must be predictable and replayable.

## Applications

- **Client state management** — Redux, Zustand, Vuex/Pinia, and NgRx all implement the store +
  reducer loop (frontend).
- **Phoenix LiveView & Elm** — server-driven UIs built directly on model-view-update (backend & frontend).
- **Multiplayer/game servers** — authoritative state advanced by a pure reducer over an action
  stream, enabling replay (backend).
- **Undo/redo & time-travel** — an action log plus pure reducers make history and time-travel
  debugging trivial (frontend).
- **Complex forms & wizards** — a reducer centralizes step/validation state instead of scattering it
  across fields (frontend).

## Related Patterns

- **Observer** — the store notifies subscribed views when state changes; the render step is Observer.
- **Model–View–Controller** — unidirectional flow is MVC tightened into a one-way loop with a pure
  update step, removing two-way binding.
- **Provider / Context** — how the single store is made available to the component tree without prop
  drilling.
