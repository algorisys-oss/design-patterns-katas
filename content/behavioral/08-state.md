---
id: state
category: behavioral
sequence: 8
title: State
also_known_as: [Objects for States]
gof: true
intent: "Let an object change its behavior when its internal state changes — as if it changed class."
frequency: medium
difficulty: intermediate
tags: [behavioral, state-machine, transitions, polymorphism, conditionals]
related: [strategy, observer, command]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

When an object behaves differently depending on what state it's in, give each state its own
object and let the context delegate to the current one. Adding a transition or a state becomes
adding a class, not another branch in a growing conditional.

State and Strategy share a structure; the difference is intent. Strategy's variants are chosen by
the client and don't know about each other. State's objects know the *next* state and drive the
transitions themselves.

## The Problem

A media player behaves differently when playing, paused, or stopped. Modeled with a status flag,
every method becomes a conditional, and the transition rules ("you can't pause when stopped")
scatter across `if` branches that are easy to get wrong.

```
play() {
  if (this.status === "playing") return;
  else if (this.status === "paused") { this.status = "playing"; }
  else if (this.status === "stopped") { this.status = "playing"; }
  // every method repeats this switch; transitions live nowhere in particular
}
```

State pulls each status into an object that knows its own behavior and transitions.

## Structure

Key Components:

- **Context** — holds a current State and delegates requests to it.
- **State** — the interface for state-specific behavior (`play`, `pause`).
- **Concrete States** — one per state; each implements the behavior and returns/sets the next
  state.

## When to Use

- An object's behavior depends on its state and changes at runtime.
- You have large conditionals that switch on a status field in many methods.
- State transitions have rules you want in one place per state.

## Advantages and Disadvantages

### Advantages
- Removes sprawling status conditionals; each state's behavior is localized.
- Transitions are explicit and live with the state that owns them.
- Adding a state is a new class (Open/Closed).

### Disadvantages
- More classes, even for simple machines.
- Transition logic is distributed across states — the whole map can be harder to see at once.

## Common Mistakes

- **Leaving the conditionals** — adding state objects but still branching on a status flag elsewhere.
- **Context micromanaging transitions** — let states decide the next state, or you've just moved
  the switch.
- **Confusing it with Strategy** — same shape; State transitions itself, Strategy is picked by
  the client and is transition-free.

## Key Takeaways

- State = one object per state; the context delegates to the current one.
- States own their behavior and their transitions.
- It replaces a status flag plus conditionals with a small state machine.

## Implementations

A media player whose behavior and transitions depend on its state.

### JavaScript

**❌ Naive**

```js
// A status flag switched on in every method.
class Player {
  constructor() { this.status = "stopped"; }
  play() {
    if (this.status === "playing") return "already playing";
    this.status = "playing"; return "playing";
  }
  pause() {
    if (this.status !== "playing") return "can't pause";
    this.status = "paused"; return "paused";
  }
  // add "buffering" → touch every method
}
```

**✅ Idiomatic (frontend)**

```js
// Each state is an object; the context delegates and states set the next state.
class Player {
  constructor() { this.state = new StoppedState(this); }
  setState(s) { this.state = s; }
  play() { return this.state.play(); }
  pause() { return this.state.pause(); }
}

class StoppedState {
  constructor(p) { this.p = p; }
  play() { this.p.setState(new PlayingState(this.p)); return "playing"; }
  pause() { return "can't pause when stopped"; }
}
class PlayingState {
  constructor(p) { this.p = p; }
  play() { return "already playing"; }
  pause() { this.p.setState(new PausedState(this.p)); return "paused"; }
}
class PausedState {
  constructor(p) { this.p = p; }
  play() { this.p.setState(new PlayingState(this.p)); return "resumed"; }
  pause() { return "already paused"; }
}
```

**🧠 Tradeoff** — Each state class owns both its behavior and where it transitions, so the illegal
moves ("pause when stopped") live in exactly one place. The player has no status conditionals at
all. The price is a class per state — worth it once the machine has more than two or three.

### Node.js

**❌ Naive**

```js
// Order status as a string, guarded by scattered conditionals.
function advance(order) {
  if (order.status === "pending") order.status = "shipped";
  else if (order.status === "shipped") order.status = "delivered";
  else throw new Error("can't advance");   // rules spread across the codebase
}
```

**✅ Idiomatic (backend)**

```js
// A transition table encodes the state machine; the service enforces it.
const TRANSITIONS = {
  pending: { ship: "shipped", cancel: "cancelled" },
  shipped: { deliver: "delivered" },
  delivered: {},
  cancelled: {},
};

class Order {
  constructor() { this.status = "pending"; }
  apply(event) {
    const next = TRANSITIONS[this.status][event];
    if (!next) throw new Error(`can't ${event} from ${this.status}`);
    this.status = next;
    return this.status;
  }
}

const order = new Order();
order.apply("ship");     // "shipped"
order.apply("deliver");  // "delivered"
```

**🧠 Tradeoff** — On the backend, a state machine is often a *data* transition table rather than a
class per state — the whole machine is visible in one object, easy to persist and audit, and
illegal transitions fail loudly. Use the object-per-state form when each state carries rich
behavior; use a table when states are mostly about which transitions are legal (orders, workflows).

### Python

**❌ Naive**

```python
class Player:
    def __init__(self):
        self.status = "stopped"
    def play(self):
        if self.status == "playing":
            return "already playing"
        self.status = "playing"
        return "playing"
    def pause(self):
        if self.status != "playing":
            return "can't pause"
        self.status = "paused"
        return "paused"
```

**✅ Idiomatic**

```python
class Player:
    def __init__(self):
        self.state: State = Stopped(self)
    def play(self) -> str:
        return self.state.play()
    def pause(self) -> str:
        return self.state.pause()

class State:
    def __init__(self, player: "Player"):
        self.player = player
    def play(self) -> str: ...
    def pause(self) -> str: ...

class Stopped(State):
    def play(self) -> str:
        self.player.state = Playing(self.player); return "playing"
    def pause(self) -> str:
        return "can't pause when stopped"

class Playing(State):
    def play(self) -> str: return "already playing"
    def pause(self) -> str:
        self.player.state = Paused(self.player); return "paused"

class Paused(State):
    def play(self) -> str:
        self.player.state = Playing(self.player); return "resumed"
    def pause(self) -> str: return "already paused"
```

**🧠 Tradeoff** — The state objects hold a back-reference to the player to trigger transitions.
Python's `enum` plus a transition dict is a lighter alternative for simple machines; the class
form pays off when each state has substantial behavior beyond "which state comes next."

### Elixir

**❌ Naive**

```elixir
defmodule Player do
  def play(%{status: :playing} = p), do: {p, "already playing"}
  def play(p), do: {%{p | status: :playing}, "playing"}
  def pause(%{status: :playing} = p), do: {%{p | status: :paused}, "paused"}
  def pause(p), do: {p, "can't pause"}
end
```

**✅ Idiomatic**

```elixir
# States are atoms; transitions are function clauses that pattern-match the state.
defmodule Player do
  def play(:stopped), do: {:playing, "playing"}
  def play(:paused), do: {:playing, "resumed"}
  def play(:playing), do: {:playing, "already playing"}

  def pause(:playing), do: {:paused, "paused"}
  def pause(state), do: {state, "can't pause from #{state}"}
end

{state, _msg} = Player.play(:stopped)   # {:playing, "playing"}
{state, _msg} = Player.pause(state)     # {:paused, "paused"}
```

**🧠 Tradeoff** — Pattern matching on the state atom *is* the State pattern in Elixir: each clause
is a state's behavior and returns the next state, with illegal transitions caught by a catch-all
clause. For long-running stateful entities, `:gen_statem` (OTP's state-machine behaviour) gives
this with supervision, timeouts, and events built in.

### Go

**❌ Naive**

```go
type Player struct{ status string }

func (p *Player) Play() string {
	if p.status == "playing" {
		return "already playing"
	}
	p.status = "playing"
	return "playing"
}
func (p *Player) Pause() string {
	if p.status != "playing" {
		return "can't pause"
	}
	p.status = "paused"
	return "paused"
}
```

**✅ Idiomatic**

```go
package player

type State interface {
	Play(p *Player) string
	Pause(p *Player) string
}

type Player struct{ state State }

func New() *Player { return &Player{state: Stopped{}} }
func (p *Player) Play() string  { return p.state.Play(p) }
func (p *Player) Pause() string { return p.state.Pause(p) }

type Stopped struct{}
func (Stopped) Play(p *Player) string  { p.state = Playing{}; return "playing" }
func (Stopped) Pause(p *Player) string { return "can't pause when stopped" }

type Playing struct{}
func (Playing) Play(p *Player) string  { return "already playing" }
func (Playing) Pause(p *Player) string { p.state = Paused{}; return "paused" }

type Paused struct{}
func (Paused) Play(p *Player) string  { p.state = Playing{}; return "resumed" }
func (Paused) Pause(p *Player) string { return "already paused" }
```

**🧠 Tradeoff** — Each state is a tiny struct satisfying `State`; the player delegates and states
flip `p.state`. Because the states are stateless value types, they cost nothing to allocate. For
transition-heavy workflows Go code often uses a `map[state]map[event]state` table instead — same
tradeoff as the Node version.

## Applications

Real-world uses of State (from the reference article), by tier:

- **Frontend** — media players (playing/paused/stopped), modals (open/closed), wizard/checkout
  steps, drag-and-drop interaction states, input validation states.
- **Backend** — order fulfillment (pending/shipped/delivered), auth sessions
  (logged-out/logged-in/expired), document workflow (draft/review/published), connection
  lifecycle.
- **Both** — finite state machines, game entity AI states.

## Related Patterns

- **Strategy** — same structure; Strategy variants are client-chosen and transition-free, State
  drives its own transitions.
- **Observer** — a state change is often what notifies observers.
- **Command** — commands can trigger state transitions in a machine.
