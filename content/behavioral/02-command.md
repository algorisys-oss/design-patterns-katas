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
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
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

### CSharp

**❌ Naive**

```csharp
// The action is a lambda, gone after it runs; nothing to store, undo, or replay.
var text = "";
Action onClick = () => text += "hello";
onClick();
// undo? redo? replay? there's no object representing the action.
```

**✅ Idiomatic**

```csharp
var editor = new Editor();
var history = new History();

history.Run(new InsertText(editor, "hello"));
Console.WriteLine(editor.Text);                              // hello
history.Undo();
Console.WriteLine(editor.Text is "" ? "(empty)" : editor.Text); // (empty)

public interface ICommand
{
    void Execute();
    void Undo();
}

public sealed class Editor
{
    public string Text { get; set; } = "";
}

// Primary constructor binds the receiver and parameters; Execute/Undo do the work.
public sealed class InsertText(Editor editor, string str) : ICommand
{
    public void Execute() => editor.Text += str;
    public void Undo() => editor.Text = editor.Text[..^str.Length];
}

public sealed class History
{
    private readonly Stack<ICommand> _done = new();

    public void Run(ICommand cmd) { cmd.Execute(); _done.Push(cmd); }
    public void Undo() { if (_done.TryPop(out var cmd)) cmd.Undo(); }
}
```

**🧠 Tradeoff** — the interface earns its keep for the paired `Undo`; for fire-and-forget
work, C# reaches for a bare delegate (`Action`), which is a command with no reverse gear.
`History` is just a `Stack<ICommand>` — a redo stack is a second one. For the backend-queue
variant of this pattern, write commands into a `System.Threading.Channels.Channel<ICommand>`
and let a worker drain it: the same shape as the Node.js tab, with backpressure built in.

### Rust

**❌ Naive**

```rust
// The action is a closure, gone after it runs; nothing to store, undo, or replay.
fn main() {
    let mut text = String::new();
    let mut on_click = || text.push_str("hello");
    on_click();
    // undo? redo? replay? there's no value representing the action.
    println!("{text}"); // hello
}
```

**✅ Idiomatic**

```rust
struct Editor { text: String }

// The command trait: the receiver is passed in, not stored.
trait Command {
    fn execute(&self, editor: &mut Editor);
    fn undo(&self, editor: &mut Editor);
}

struct InsertText { str: String }

impl Command for InsertText {
    fn execute(&self, editor: &mut Editor) {
        editor.text.push_str(&self.str);
    }
    fn undo(&self, editor: &mut Editor) {
        let keep = editor.text.len() - self.str.len();
        editor.text.truncate(keep);
    }
}

struct History { done: Vec<Box<dyn Command>> }

impl History {
    fn run(&mut self, editor: &mut Editor, cmd: Box<dyn Command>) {
        cmd.execute(editor);
        self.done.push(cmd);
    }
    fn undo(&mut self, editor: &mut Editor) {
        if let Some(cmd) = self.done.pop() {
            cmd.undo(editor);
        }
    }
}

fn main() {
    let mut editor = Editor { text: String::new() };
    let mut history = History { done: Vec::new() };

    history.run(&mut editor, Box::new(InsertText { str: "hello".into() }));
    println!("{}", editor.text); // hello

    history.undo(&mut editor);
    println!("{:?}", editor.text); // ""
}
```

**🧠 Tradeoff** — the receiver goes *into* `execute`/`undo` rather than living in the command:
a command holding `&mut Editor` would keep the editor mutably borrowed for as long as the
history lives, and the borrow checker rightly refuses. That nudge is useful — commands become
receiver-free data. Take the hint further and a closed command set becomes
`enum Command { Insert(String) }` with a `match`: the Elixir tab's data form, serializable for
free. Keep `Box<dyn Command>` when new commands must arrive from outside the crate.

### Zig

**❌ Naive**

```zig
// The action is inlined in the handler; nothing to store, undo, or replay.
fn handleClick(editor: *Editor) void {
    editor.insert("hello"); // the action runs and is gone — no undo, no replay
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// A command is data: a tagged union the receiver knows how to apply and reverse.
const Command = union(enum) {
    insert: []const u8,
};

const Editor = struct {
    buf: [64]u8 = undefined,
    len: usize = 0,

    fn apply(self: *Editor, cmd: Command) void {
        switch (cmd) {
            .insert => |str| {
                @memcpy(self.buf[self.len..][0..str.len], str);
                self.len += str.len;
            },
        }
    }
    fn unapply(self: *Editor, cmd: Command) void {
        switch (cmd) {
            .insert => |str| self.len -= str.len,
        }
    }
    fn text(self: *const Editor) []const u8 {
        return self.buf[0..self.len];
    }
};

// The invoker: runs commands and keeps the done stack for undo.
const History = struct {
    done: [16]Command = undefined,
    count: usize = 0,

    fn run(self: *History, editor: *Editor, cmd: Command) void {
        editor.apply(cmd);
        self.done[self.count] = cmd;
        self.count += 1;
    }
    fn undo(self: *History, editor: *Editor) void {
        if (self.count == 0) return;
        self.count -= 1;
        editor.unapply(self.done[self.count]);
    }
};

pub fn main() void {
    var editor = Editor{};
    var history = History{};

    history.run(&editor, .{ .insert = "hello" });
    std.debug.print("{s}\n", .{editor.text()}); // hello

    history.undo(&editor);
    std.debug.print("{d} chars\n", .{editor.text().len}); // 0 chars
}
```

**🧠 Tradeoff** — with no closures, Zig's natural command is a tagged union — the same
commands-as-data shape as the Elixir tab, and plain bytes, so a durable queue or an audit log
serializes it with no ceremony. The exhaustive `switch` means adding a `delete` variant makes
the compiler point at every place that must handle it. The cost is a closed set: outside code
can't add commands without editing the union. If the set must stay open, the runtime route is
the two-field vtable (`*anyopaque` context plus function pointers, the `std.mem.Allocator`
shape).

### Java

**❌ Naive**

```java
// The action is a lambda, gone after it runs; nothing to store, undo, or replay.
public class Demo {
    static String text = "";

    public static void main(String[] args) {
        Runnable onClick = () -> text += "hello";
        onClick.run();
        // undo? redo? replay? there's no object representing the action.
    }
}
```

**✅ Idiomatic**

```java
import java.util.ArrayDeque;
import java.util.Deque;

interface Command {
    void execute();
    void undo();
}

class Editor { String text = ""; }

// Binds the receiver and parameters; execute/undo do the work.
class InsertText implements Command {
    private final Editor editor;
    private final String str;

    InsertText(Editor editor, String str) { this.editor = editor; this.str = str; }

    public void execute() { editor.text += str; }
    public void undo()    { editor.text = editor.text.substring(0, editor.text.length() - str.length()); }
}

// The invoker: runs commands and keeps the done stack for undo.
class History {
    private final Deque<Command> done = new ArrayDeque<>();

    void run(Command cmd) { cmd.execute(); done.push(cmd); }
    void undo() { if (!done.isEmpty()) done.pop().undo(); }
}

public class Demo {
    public static void main(String[] args) {
        var editor = new Editor();
        var history = new History();

        history.run(new InsertText(editor, "hello"));
        System.out.println(editor.text);   // hello

        history.undo();
        System.out.println(editor.text.isEmpty() ? "(empty)" : editor.text); // (empty)
    }
}
```

**🧠 Tradeoff** — Java already collapsed the fire-and-forget half of this pattern into
`Runnable`: every `executor.submit(() -> ...)` is a command on a queue, and an
`ExecutorService` draining a `BlockingQueue<Runnable>` is the Node.js tab's job queue shipped
in `java.util.concurrent`. So the lambda is the default. The two-method interface earns its
keep exactly where a lambda can't follow — the paired `undo` — which is why undo history is
where the classic form still gets written out (Swing's `UndoableEdit` is the same shape).
`History` is a `Deque` used as a stack; redo is a second one.

## Applications

Real-world uses of Command (from the reference article), by tier:

- **Frontend** — undo/redo in editors, toolbar actions, keyboard-shortcut dispatch, replaying
  user actions, game input (move commands).
- **Backend** — job/task queues, background workers, transactional operations, request logging
  and replay, CQRS command handlers.
- **Both** — macros (a command of commands), remote procedure invocation.

**In modern systems:**

- **Low-code** — a button's `"action": {…}` JSON becomes a Command the runtime dispatches, so the
  UI's behavior is authored as data, not wired in code.
- **Workflow engine** — each step is a Command: queued, logged, retried, replayed, and rolled back
  through a paired compensating command.
- **Multi-agent** — a tool call is a Command object the orchestrator can log, gate behind approval,
  and re-run deterministically when replaying a session.

## Related Patterns

- **Memento** — pairs with Command for undo: the memento snapshots state a command restores.
- **Strategy** — Strategy varies an algorithm; Command reifies a whole request (with undo).
- **Composite** — a macro command is a composite of commands.
- **Chain of Responsibility** — a command can be the request passed along a handler chain.
