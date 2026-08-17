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
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
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

### CSharp

**❌ Naive**

```csharp
// A status flag switched on in every method.
public sealed class Player
{
    private string _status = "stopped";

    public string Play()
    {
        if (_status == "playing") return "already playing";
        _status = "playing";
        return "playing";
    }

    public string Pause()
    {
        if (_status != "playing") return "can't pause";
        _status = "paused";
        return "paused";
    }
    // add "buffering" → touch every method
}
```

**✅ Idiomatic**

```csharp
var player = new Player();
Console.WriteLine(player.Play());  // playing
Console.WriteLine(player.Pause()); // paused
Console.WriteLine(player.Play());  // resumed

public interface IState
{
    string Play(Player p);
    string Pause(Player p);
}

// The player delegates; states flip p.State to drive transitions.
public sealed class Player
{
    public IState State { get; set; } = new Stopped();

    public string Play() => State.Play(this);
    public string Pause() => State.Pause(this);
}

public sealed class Stopped : IState
{
    public string Play(Player p) { p.State = new Playing(); return "playing"; }
    public string Pause(Player p) => "can't pause when stopped";
}

public sealed class Playing : IState
{
    public string Play(Player p) => "already playing";
    public string Pause(Player p) { p.State = new Paused(); return "paused"; }
}

public sealed class Paused : IState
{
    public string Play(Player p) { p.State = new Playing(); return "resumed"; }
    public string Pause(Player p) => "already paused";
}
```

**🧠 Tradeoff** — The classic form maps cleanly: each `sealed` state class owns its behavior and
flips `p.State`, so the player has no conditionals at all. The states here are stateless, so
real code often shares `static readonly` instances instead of `new`-ing one per transition. For
simple machines, modern C# frequently skips the classes entirely — an enum plus one `switch`
expression per action reads like the transition table and keeps the whole machine on one screen.
The class form earns its keep when states carry rich behavior, not just a next-state rule.

### Rust

**❌ Naive**

```rust
// A status flag compared as strings, checked in every method.
struct Player {
    status: String,
}

impl Player {
    fn play(&mut self) -> &'static str {
        if self.status == "playing" {
            return "already playing";
        }
        self.status = "playing".to_string();
        "playing"
    }

    fn pause(&mut self) -> &'static str {
        if self.status != "playing" {
            return "can't pause";
        }
        self.status = "paused".to_string();
        "paused"
    }
    // add "buffering" → touch every method, and typos are just data
}
```

**✅ Idiomatic**

```rust
// States are an enum; every transition is an exhaustive match.
#[derive(Clone, Copy)]
enum State {
    Stopped,
    Playing,
    Paused,
}

struct Player {
    state: State,
}

impl Player {
    fn new() -> Self {
        Self { state: State::Stopped }
    }

    fn play(&mut self) -> &'static str {
        match self.state {
            State::Stopped => {
                self.state = State::Playing;
                "playing"
            }
            State::Paused => {
                self.state = State::Playing;
                "resumed"
            }
            State::Playing => "already playing",
        }
    }

    fn pause(&mut self) -> &'static str {
        match self.state {
            State::Playing => {
                self.state = State::Paused;
                "paused"
            }
            State::Stopped => "can't pause when stopped",
            State::Paused => "already paused",
        }
    }
}

fn main() {
    let mut player = Player::new();
    println!("{}", player.play());  // playing
    println!("{}", player.pause()); // paused
    println!("{}", player.play());  // resumed
}
```

**🧠 Tradeoff** — The trait-object form (`Box<dyn State>`) exists in Rust, but for a closed set
of states the enum is the honest form: `Copy`, no allocation, and every `match` is checked for
exhaustiveness — add `State::Buffering` and the compiler lists every method that must handle it,
the exact opposite of the scattered-flag failure mode. Variants can carry data
(`Playing { position: u32 }`) and the `match` arm extracts it. Reach for a trait only when
downstream crates must add states your enum has never heard of.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
const std = @import("std");

// A status flag compared as strings, checked in every method.
const Player = struct {
    status: []const u8 = "stopped",

    pub fn play(self: *Player) []const u8 {
        if (std.mem.eql(u8, self.status, "playing")) return "already playing";
        self.status = "playing";
        return "playing";
    }

    pub fn pause(self: *Player) []const u8 {
        if (!std.mem.eql(u8, self.status, "playing")) return "can't pause";
        self.status = "paused";
        return "paused";
    }
    // add "buffering" → touch every method, and typos compile fine
};
```

**✅ Idiomatic**

```zig
const std = @import("std");

// States are an enum; every transition is an exhaustive switch.
const State = enum { stopped, playing, paused };

const Player = struct {
    state: State = .stopped,

    pub fn play(self: *Player) []const u8 {
        switch (self.state) {
            .stopped => {
                self.state = .playing;
                return "playing";
            },
            .paused => {
                self.state = .playing;
                return "resumed";
            },
            .playing => return "already playing",
        }
    }

    pub fn pause(self: *Player) []const u8 {
        switch (self.state) {
            .playing => {
                self.state = .paused;
                return "paused";
            },
            .stopped => return "can't pause when stopped",
            .paused => return "already paused",
        }
    }
};

pub fn main() void {
    var player = Player{};
    std.debug.print("{s}\n", .{player.play()});  // playing
    std.debug.print("{s}\n", .{player.pause()}); // paused
    std.debug.print("{s}\n", .{player.play()});  // resumed
}
```

**🧠 Tradeoff** — Same verdict as Rust: for a closed set, `enum` plus exhaustive `switch` *is*
the pattern in Zig — an unhandled state is a compile error, so adding `.buffering` turns every
`switch` into a checklist of places to update. When a state needs its own data, upgrade the enum
to a tagged union (`union(enum)`) and each arm captures the payload. The GoF object-per-state
form would need the vtable idiom (`*anyopaque` + function pointers); pay that only if states
must plug in at runtime.

### Java

**❌ Naive**

```java
// A status flag switched on in every method.
class Player {
    private String status = "stopped";

    String play() {
        if (status.equals("playing")) return "already playing";
        status = "playing";
        return "playing";
    }

    String pause() {
        if (!status.equals("playing")) return "can't pause";
        status = "paused";
        return "paused";
    }
    // add "buffering" → touch every method, and typos are just data
}
```

**✅ Idiomatic**

```java
// Each state is an enum constant with its own behavior — a singleton state object.
enum State {
    STOPPED {
        String play(Player p)  { p.state = PLAYING; return "playing"; }
        String pause(Player p) { return "can't pause when stopped"; }
    },
    PLAYING {
        String play(Player p)  { return "already playing"; }
        String pause(Player p) { p.state = PAUSED; return "paused"; }
    },
    PAUSED {
        String play(Player p)  { p.state = PLAYING; return "resumed"; }
        String pause(Player p) { return "already paused"; }
    };

    abstract String play(Player p);
    abstract String pause(Player p);
}

// The player delegates; states flip p.state to drive transitions.
class Player {
    State state = State.STOPPED;

    String play()  { return state.play(this); }
    String pause() { return state.pause(this); }
}

public class Demo {
    public static void main(String[] args) {
        var player = new Player();
        System.out.println(player.play());  // playing
        System.out.println(player.pause()); // paused
        System.out.println(player.play());  // resumed
    }
}
```

**🧠 Tradeoff** — Enum constants with constant-specific method bodies are Java's quiet superpower
here (it's Effective Java's own example): each constant is a singleton state object, so you get
the GoF shape with no class hierarchy and nothing allocated per transition. Add a `BUFFERING`
constant and the code won't compile until it supplies `play` and `pause` — the scattered-flag
failure mode turned into a checklist. The limit is that enum constants can't carry per-instance
data; when a state needs its own fields (a `Playing` with a position), fall back to the classic
interface-and-classes form, which fits Java exactly as the book wrote it.

## Applications

Real-world uses of State (from the reference article), by tier:

- **Frontend** — media players (playing/paused/stopped), modals (open/closed), wizard/checkout
  steps, drag-and-drop interaction states, input validation states.
- **Backend** — order fulfillment (pending/shipped/delivered), auth sessions
  (logged-out/logged-in/expired), document workflow (draft/review/published), connection
  lifecycle.
- **Both** — finite state machines, game entity AI states.

**In modern systems:**

- **Workflow engine** — a workflow instance *is* a state machine: `pending → running → waiting →
  done | failed`, with only legal transitions allowed and each captured for audit.
- **Multi-agent** — an agent's lifecycle (thinking → calling-tool → waiting → done) modeled as
  explicit states instead of scattered boolean flags.
- **Low-code** — a wizard's step-to-step navigation driven by a state map declared in config.

## Related Patterns

- **Strategy** — same structure; Strategy variants are client-chosen and transition-free, State
  drives its own transitions.
- **Observer** — a state change is often what notifies observers.
- **Command** — commands can trigger state transitions in a machine.
