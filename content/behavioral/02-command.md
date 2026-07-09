---
id: command
category: behavioral
sequence: 2
title: Command
also_known_as: [Action, Transaction]
gof: true
intent: "Turn a request into an object, so you can queue, log, undo, or parameterize actions."
frequency: high
difficulty: intermediate
tags: [behavioral, encapsulation, undo, queue, decoupling, actions]
related: [memento, strategy, chain-of-responsibility, observer]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Wrap "do this" in an object. Once an action is an object — with an `execute()` (and maybe an
`undo()`) — you can store it, queue it, log it, retry it, or reverse it. The caller that triggers
the action is decoupled from the code that performs it.

## The Problem

A UI button runs code directly in its handler. Now you need undo, a redo stack, and a macro that
replays several actions. With the logic buried in handlers, there's nothing to store, reverse, or
replay.

```
button.onclick = () => { document.text += "hello"; };  // the action is a closure, gone after it runs
// undo? redo? replay? there's no object to hold onto.
```

Command makes each action a first-class object you can push onto a history stack.

## Structure

Key Components:

- **Command** — the interface: `execute()`, often `undo()`.
- **Concrete Command** — binds a receiver and parameters; does the work in `execute`.
- **Receiver** — the object the command acts on.
- **Invoker** — triggers commands and may keep a history (undo/redo, queue).

## When to Use

- You need undo/redo, or a replayable history of actions.
- You want to queue, schedule, or log operations.
- You want to decouple the trigger (button, route, timer) from the work.
- You need macros — commands composed of commands.

## Advantages and Disadvantages

### Advantages
- Actions become storable: queue, log, undo, redo, replay.
- Decouples invoker from receiver (Open/Closed for new commands).
- Composable into macros and transactions.

### Disadvantages
- A class (or closure) per action adds indirection.
- Reliable undo means capturing enough state to reverse — not always trivial.

## Common Mistakes

- **`undo` that doesn't fully restore** — capture the state needed to reverse, or undo lies.
- **Fat commands** — a command should delegate to a receiver, not reimplement the domain.
- **Confusing it with Strategy** — Command encapsulates a *request to do something* (with undo);
  Strategy encapsulates *how* to compute something interchangeable.

## Key Takeaways

- Command = an action as an object with `execute()` (and often `undo()`).
- The invoker holds commands; the receiver does the work.
- It's the backbone of undo/redo, queues, and macros.

## Implementations

Actions as objects with undo, driven by an invoker with history.

### JavaScript

**❌ Naive**

```js
// The action lives in the handler; nothing to store, undo, or replay.
let text = "";
button.onclick = () => { text += "hello"; };
// how would you undo this? there's no object representing the action.
```

**✅ Idiomatic (frontend)**

```js
// Each editor action is a command with execute + undo; an invoker keeps history.
class Editor { constructor() { this.text = ""; } }

class InsertText {
  constructor(editor, str) { this.editor = editor; this.str = str; }
  execute() { this.editor.text += this.str; }
  undo() { this.editor.text = this.editor.text.slice(0, -this.str.length); }
}

class History {
  #done = [];
  run(cmd) { cmd.execute(); this.#done.push(cmd); }
  undo() { const cmd = this.#done.pop(); if (cmd) cmd.undo(); }
}

const editor = new Editor(), history = new History();
history.run(new InsertText(editor, "hello"));  // text: "hello"
history.undo();                                // text: ""
```

**🧠 Tradeoff** — Making each edit a command turns undo/redo into a stack of objects — the pattern
behind every text editor and design tool. The cost is capturing enough state to reverse (`undo`
here knows the inserted length); richer edits may store a snapshot (that's Memento's job).

### Node.js

**❌ Naive**

```js
// Work runs inline in the route handler — can't queue, retry, or defer it.
app.post("/resize", async (req, res) => {
  await sharp(req.file).resize(800).toFile(out);   // blocks the request; no retry
  res.send("done");
});
```

**✅ Idiomatic (backend)**

```js
// Jobs are command objects pushed onto a queue and executed by a worker.
class ResizeImageCommand {
  constructor(input, width) { this.input = input; this.width = width; }
  async execute() { /* await sharp(this.input).resize(this.width)... */ return "resized"; }
}

class JobQueue {
  #queue = [];
  enqueue(cmd) { this.#queue.push(cmd); }
  async run() {
    while (this.#queue.length) {
      const cmd = this.#queue.shift();
      try { await cmd.execute(); }
      catch { this.#queue.push(cmd); }   // requeue on failure — retry for free
    }
  }
}

const jobs = new JobQueue();
jobs.enqueue(new ResizeImageCommand("in.jpg", 800));  // request returns immediately
```

**🧠 Tradeoff** — On the backend, Command turns work into queueable jobs — decoupling accepting a
request from doing it, and making retry, scheduling, and logging trivial (this is how BullMQ and
similar job queues model tasks). The tradeoff is serializing commands if the queue is durable
(Redis/DB), since a closure can't be persisted but a plain command object can.

### Python

**❌ Naive**

```python
text = ""
def on_click():
    global text
    text += "hello"   # action buried in a handler; no undo/replay
```

**✅ Idiomatic**

```python
from typing import Protocol

class Command(Protocol):
    def execute(self) -> None: ...
    def undo(self) -> None: ...

class Editor:
    def __init__(self) -> None:
        self.text = ""

class InsertText:
    def __init__(self, editor: Editor, s: str):
        self.editor, self.s = editor, s
    def execute(self) -> None:
        self.editor.text += self.s
    def undo(self) -> None:
        self.editor.text = self.editor.text[: -len(self.s)]

class History:
    def __init__(self) -> None:
        self._done: list[Command] = []
    def run(self, cmd: Command) -> None:
        cmd.execute(); self._done.append(cmd)
    def undo(self) -> None:
        if self._done:
            self._done.pop().undo()

editor, history = Editor(), History()
history.run(InsertText(editor, "hello"))
history.undo()
```

**🧠 Tradeoff** — A `Command` `Protocol` types the `execute`/`undo` contract. Python's first-class
functions mean simple, undo-less commands can just be callables on a queue; you reach for command
*objects* precisely when you need the paired `undo` or extra metadata a bare function can't carry.

### Elixir

**❌ Naive**

```elixir
# The action is a side effect with no reified form to store or reverse.
def on_click(text), do: text <> "hello"
```

**✅ Idiomatic**

```elixir
# A command is data; a reducer executes it and history is a list of commands.
defmodule Editor do
  # commands are plain structs/tuples — trivially serializable and replayable
  def apply(text, {:insert, str}), do: text <> str
  def unapply(text, {:insert, str}), do: String.slice(text, 0, byte_size(text) - byte_size(str))
end

defmodule History do
  def run(state, cmd), do: {Editor.apply(state.text, cmd), [cmd | state.done]}

  def undo(%{text: text, done: [cmd | rest]}),
    do: %{text: Editor.unapply(text, cmd), done: rest}
end

{text, done} = History.run(%{text: "", done: []}, {:insert, "hello"})
```

**🧠 Tradeoff** — In Elixir a command is naturally *data* (a tagged tuple), and executing it is a
pure reducer `(state, command) -> state`. Because commands are plain terms, an undo stack, an
audit log, and event sourcing all fall out for free — and the commands serialize with no special
handling, unlike closures.

### Go

**❌ Naive**

```go
// The action is inlined; nothing to enqueue, log, or undo.
func handleClick(editor *Editor) { editor.Text += "hello" }
```

**✅ Idiomatic**

```go
package editor

type Command interface {
	Execute()
	Undo()
}

type Editor struct{ Text string }

type InsertText struct {
	editor *Editor
	str    string
}

func (c *InsertText) Execute() { c.editor.Text += c.str }
func (c *InsertText) Undo()    { c.editor.Text = c.editor.Text[:len(c.editor.Text)-len(c.str)] }

type History struct{ done []Command }

func (h *History) Run(c Command) { c.Execute(); h.done = append(h.done, c) }
func (h *History) Undo() {
	if n := len(h.done); n > 0 {
		h.done[n-1].Undo()
		h.done = h.done[:n-1]
	}
}
```

**🧠 Tradeoff** — Any type with `Execute`/`Undo` is a `Command`, so the `History` invoker stores a
`[]Command` of mixed actions. For fire-and-forget commands (no undo), Go often uses a `func()`
value or sends work over a channel to a worker pool — the interface earns its keep when you need
undo or command metadata.

## Applications

Real-world uses of Command (from the reference article), by tier:

- **Frontend** — undo/redo in editors, toolbar actions, keyboard-shortcut dispatch, replaying
  user actions, game input (move commands).
- **Backend** — job/task queues, background workers, transactional operations, request logging
  and replay, CQRS command handlers.
- **Both** — macros (a command of commands), remote procedure invocation.

## Related Patterns

- **Memento** — pairs with Command for undo: the memento snapshots state a command restores.
- **Strategy** — Strategy varies an algorithm; Command reifies a whole request (with undo).
- **Composite** — a macro command is a composite of commands.
- **Chain of Responsibility** — a command can be the request passed along a handler chain.
