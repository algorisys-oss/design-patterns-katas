---
id: memento
category: behavioral
sequence: 6
title: Memento
also_known_as: [Snapshot, Token]
gof: true
intent: "Capture an object's state so it can be restored later, without exposing its internals."
frequency: medium
difficulty: intermediate
tags: [behavioral, snapshot, undo, encapsulation, history]
related: [command, prototype, state]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Save a snapshot of an object's state so you can roll back to it later — undo, checkpoints,
transactions — without breaking encapsulation. The object produces an opaque token (the memento);
only the object knows how to read it back. Nobody else pokes at its private fields.

## The Problem

You want undo for an editor. The tempting fix is to let the history reach into the editor and copy
its fields, then write them back. Now the history knows the editor's internals, and any change to
those fields breaks the history.

```
// history reaches into private state:
history.push({ content: editor.content, cursor: editor.cursor, selection: editor.selection });
// add a field to the editor → every place that snapshots it must change too
```

Memento has the editor produce and consume its own snapshot, keeping its internals private.

## Structure

Key Components:

- **Originator** — the object whose state is saved; creates a memento and restores from one.
- **Memento** — the opaque snapshot; only the originator understands its contents.
- **Caretaker** — keeps mementos (the history/undo stack) but never inspects them.

## When to Use

- You need undo/redo, checkpoints, or transactional rollback.
- You want to snapshot state without exposing the object's internals.
- The caretaker should store history without depending on state details.

## Advantages and Disadvantages

### Advantages
- Preserves encapsulation — only the originator reads its memento.
- Clean undo/redo and rollback.
- The caretaker stays ignorant of state structure.

### Disadvantages
- Snapshots cost memory; deep histories add up.
- Copying large state frequently can be expensive.
- Deciding full vs incremental snapshots adds complexity.

## Common Mistakes

- **Leaking internals through the memento** — if the caretaker can read/modify it, encapsulation
  is broken.
- **Unbounded history** — snapshots pile up; cap the stack or use diffs.
- **Shallow snapshots** — capturing references instead of copies, so later mutation corrupts the
  snapshot (see Prototype's deep-copy lesson).

## Key Takeaways

- Memento = an opaque state snapshot the originator makes and restores.
- The caretaker stores snapshots but never looks inside.
- Pairs with Command for undo; watch snapshot cost and copy depth.

## Implementations

An editor that snapshots and restores its own state.

### JavaScript

**❌ Naive**

```js
// The history reaches into the editor's fields directly.
const editor = { content: "", cursor: 0 };
const history = [];
history.push({ ...editor });      // caretaker knows the internal shape
editor.content = "hello";
Object.assign(editor, history.pop());  // and rewrites it — tightly coupled
```

**✅ Idiomatic (frontend)**

```js
// The editor makes and restores its own opaque snapshot.
class Editor {
  #content = ""; #cursor = 0;
  type(text) { this.#content += text; this.#cursor += text.length; }
  save() { return { content: this.#content, cursor: this.#cursor }; } // memento
  restore(m) { this.#content = m.content; this.#cursor = m.cursor; }
  get content() { return this.#content; }
}

class History {
  #stack = [];
  backup(editor) { this.#stack.push(editor.save()); }
  undo(editor) { const m = this.#stack.pop(); if (m) editor.restore(m); }
}

const editor = new Editor(), history = new History();
history.backup(editor);
editor.type("hello");
history.undo(editor);        // back to ""
```

**🧠 Tradeoff** — `save`/`restore` keep the editor's private fields private; `History` only holds
snapshots it can't interpret. This is the undo backbone of editors and canvases. The memento here
is a plain object copy — fine for small state, but snapshotting a large document on every keypress
needs incremental diffs instead.

### Node.js

**❌ Naive**

```js
// Rolling back a config change by hand-copying fields around.
let config = { retries: 3, timeout: 30 };
const backup = config;              // same reference — not a real snapshot
config.retries = 5;
config = backup;                    // "restore" changed nothing; backup was mutated too
```

**✅ Idiomatic (backend)**

```js
// A settings service snapshots state for transactional rollback.
class Settings {
  #state = { retries: 3, timeout: 30 };
  update(patch) { Object.assign(this.#state, patch); }
  snapshot() { return structuredClone(this.#state); }   // deep, opaque memento
  restore(snap) { this.#state = structuredClone(snap); }
  get() { return { ...this.#state }; }
}

const settings = new Settings();
const checkpoint = settings.snapshot();
settings.update({ retries: 5 });
try { applyMigration(); }
catch { settings.restore(checkpoint); }   // roll back on failure
```

**🧠 Tradeoff** — On the backend, Memento is transactional rollback: snapshot before a risky
operation, restore on failure. `structuredClone` gives a deep, independent snapshot (the naive
version's bug was aliasing, not copying). For large or persistent state, snapshot to durable
storage or use append-only event logs rather than in-memory copies.

### Python

**❌ Naive**

```python
editor = {"content": "", "cursor": 0}
history = []
history.append(editor)        # same dict reference — not a snapshot
editor["content"] = "hello"
editor = history.pop()        # "restore" is aliased to the mutated dict
```

**✅ Idiomatic**

```python
from dataclasses import dataclass, replace

@dataclass(frozen=True)
class Memento:
    content: str
    cursor: int

class Editor:
    def __init__(self) -> None:
        self._content, self._cursor = "", 0
    def type(self, text: str) -> None:
        self._content += text
        self._cursor += len(text)
    def save(self) -> Memento:
        return Memento(self._content, self._cursor)   # immutable snapshot
    def restore(self, m: Memento) -> None:
        self._content, self._cursor = m.content, m.cursor

class History:
    def __init__(self) -> None:
        self._stack: list[Memento] = []
    def backup(self, e: Editor) -> None:
        self._stack.append(e.save())
    def undo(self, e: Editor) -> None:
        if self._stack:
            e.restore(self._stack.pop())
```

**🧠 Tradeoff** — A `frozen=True` dataclass makes the memento immutable, so a stored snapshot can't
be mutated out from under the history. `copy.deepcopy` is the alternative for arbitrary nested
state. The originator owns `save`/`restore`; the history just stacks opaque `Memento` values.

### Elixir

**❌ Naive**

```elixir
# Trying to "restore" by rebinding — but the real state lives in a process
# whose internals you'd otherwise reach into.
state = %{content: "", cursor: 0}
history = [state]
# mutating isn't possible; the awkwardness is exposing/threading raw state everywhere
```

**✅ Idiomatic**

```elixir
# Immutable data makes a memento just... the previous value. The caretaker is a list.
defmodule Editor do
  defstruct content: "", cursor: 0

  def type(%Editor{} = e, text),
    do: %{e | content: e.content <> text, cursor: e.cursor + String.length(text)}

  def save(%Editor{} = e), do: e            # the snapshot IS the immutable struct
  def restore(_current, memento), do: memento
end

defmodule History do
  def backup(stack, editor), do: [Editor.save(editor) | stack]
  def undo([memento | rest], _editor), do: {memento, rest}
end

editor = %Editor{} |> Editor.type("hello")
stack = History.backup([], editor)
```

**🧠 Tradeoff** — In Elixir every value is already an immutable snapshot, so "capturing state" is
just keeping the old struct — no copying, no aliasing bug, and encapsulation holds because the
caretaker only stores opaque terms. Undo is a list of past values. For a live stateful process,
the `GenServer` holds the history in its own state and hands back a prior value on `:undo`.

### Go

**❌ Naive**

```go
type Editor struct {
	Content string
	Cursor  int
}

var editor = Editor{}
history := []*Editor{&editor}   // storing a pointer — later edits mutate the "snapshot"
editor.Content = "hello"
editor = *history[len(history)-1] // no-op: the pointed-to value already changed
```

**✅ Idiomatic**

```go
package editor

// Memento is a value copy — independent of the originator.
type Memento struct {
	content string
	cursor  int
}

type Editor struct {
	content string
	cursor  int
}

func (e *Editor) Type(s string) { e.content += s; e.cursor += len(s) }
func (e *Editor) Save() Memento  { return Memento{e.content, e.cursor} } // copy
func (e *Editor) Restore(m Memento) { e.content, e.cursor = m.content, m.cursor }

type History struct{ stack []Memento }

func (h *History) Backup(e *Editor) { h.stack = append(h.stack, e.Save()) }
func (h *History) Undo(e *Editor) {
	if n := len(h.stack); n > 0 {
		e.Restore(h.stack[n-1])
		h.stack = h.stack[:n-1]
	}
}
```

**🧠 Tradeoff** — Returning a `Memento` *value* (not a pointer) gives an independent snapshot for
free — the naive bug was storing a pointer that aliased the live editor. The unexported memento
fields keep the state opaque to the `History` caretaker. Watch copy cost if the state includes
slices/maps — those need explicit deep copies.

### CSharp

**❌ Naive**

```csharp
// Storing a reference, not a copy — the "snapshot" aliases the live editor.
var editor = new EditorState();
var history = new Stack<EditorState>();
history.Push(editor);            // same object — not a snapshot
editor.Content = "hello";
editor = history.Pop();          // "restore" changed nothing; the backup mutated too
Console.WriteLine(editor.Content); // hello

public sealed class EditorState
{
    public string Content = "";
    public int Cursor;
}
```

**✅ Idiomatic**

```csharp
var editor = new Editor();
var history = new History();

history.Backup(editor);
editor.Type("hello");
Console.WriteLine(editor.Content); // hello

history.Undo(editor);
Console.WriteLine(editor.Content); // (empty again)

// The memento is an immutable record; only the editor uses its contents.
public sealed record Memento(string Content, int Cursor);

public sealed class Editor
{
    private string _content = "";
    private int _cursor;

    public string Content => _content;

    public void Type(string text)
    {
        _content += text;
        _cursor += text.Length;
    }

    public Memento Save() => new(_content, _cursor);

    public void Restore(Memento m) => (_content, _cursor) = (m.Content, m.Cursor);
}

// The caretaker stacks mementos but never looks inside.
public sealed class History
{
    private readonly Stack<Memento> _stack = new();

    public void Backup(Editor e) => _stack.Push(e.Save());

    public void Undo(Editor e)
    {
        if (_stack.TryPop(out var m)) e.Restore(m);
    }
}
```

**🧠 Tradeoff** — A `record` gives an immutable snapshot in one line, so the naive aliasing bug
can't happen: nothing can mutate a stored `Memento` out from under the history. One honest
caveat: records expose their properties, so `History` *could* peek at `Content` — C# can't make
the memento readable by the editor but opaque to everyone else, short of nesting it as a private
type inside `Editor`. In practice the record's immutability, not secrecy, is what protects the
snapshot.

### Rust

**❌ Naive**

```rust
// The history reaches into the editor's public fields — every snapshot
// site knows the editor's internals.
pub struct Editor {
    pub content: String,
    pub cursor: usize,
}

fn main() {
    let mut editor = Editor { content: String::new(), cursor: 0 };
    let mut history: Vec<(String, usize)> = Vec::new();

    history.push((editor.content.clone(), editor.cursor)); // caretaker knows the shape
    editor.content.push_str("hello");
    editor.cursor += 5;

    let (content, cursor) = history.pop().unwrap(); // and rewrites it field by field
    editor.content = content;
    editor.cursor = cursor;
}
```

**✅ Idiomatic**

```rust
// editor.rs — Memento's fields are private outside this module,
// so the caretaker can store snapshots but never read them.
pub struct Memento {
    content: String,
    cursor: usize,
}

pub struct Editor {
    content: String,
    cursor: usize,
}

impl Editor {
    pub fn new() -> Self {
        Self { content: String::new(), cursor: 0 }
    }

    pub fn type_text(&mut self, text: &str) {
        self.content.push_str(text);
        self.cursor += text.len();
    }

    pub fn save(&self) -> Memento {
        Memento { content: self.content.clone(), cursor: self.cursor }
    }

    // Takes the memento by value: the String moves back in, no copy.
    pub fn restore(&mut self, m: Memento) {
        self.content = m.content;
        self.cursor = m.cursor;
    }

    pub fn content(&self) -> &str {
        &self.content
    }
}

pub struct History {
    stack: Vec<Memento>,
}

impl History {
    pub fn new() -> Self {
        Self { stack: Vec::new() }
    }

    pub fn backup(&mut self, e: &Editor) {
        self.stack.push(e.save());
    }

    pub fn undo(&mut self, e: &mut Editor) {
        if let Some(m) = self.stack.pop() {
            e.restore(m);
        }
    }
}
```

**🧠 Tradeoff** — The pointer-aliasing bug from the Go naive version is a *compile error* in
Rust: you can't hold a live `&mut Editor` and a stored reference to its insides at the same
time, so the only naive sin left is broken encapsulation. Privacy is per-module — `Memento`'s
fields are invisible outside the editor's module, so the caretaker truly can't look. And
ownership makes undo cheap: `restore` consumes the memento by value, moving the `String` back
with no copy; `save` pays the one clone.

### Zig

**❌ Naive**

```zig
const std = @import("std");

const Editor = struct {
    buf: [64]u8 = undefined,
    len: usize = 0,
};

pub fn main() void {
    var editor = Editor{};
    const history = [_]*Editor{&editor}; // a pointer — not a snapshot
    editor.buf[0] = 'h';
    editor.len = 1;
    editor = history[0].*; // no-op: the pointed-to value already changed
    std.debug.print("{d}\n", .{editor.len}); // 1 — the "restore" restored nothing
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// Arrays are values in Zig, so copying the struct copies the buffer.
const Memento = struct {
    buf: [64]u8,
    len: usize,
    cursor: usize,
};

const Editor = struct {
    buf: [64]u8 = undefined,
    len: usize = 0,
    cursor: usize = 0,

    pub fn typeText(self: *Editor, text: []const u8) void {
        @memcpy(self.buf[self.len..][0..text.len], text); // demo: no bounds check
        self.len += text.len;
        self.cursor += text.len;
    }

    pub fn save(self: *const Editor) Memento {
        return .{ .buf = self.buf, .len = self.len, .cursor = self.cursor };
    }

    pub fn restore(self: *Editor, m: Memento) void {
        self.buf = m.buf;
        self.len = m.len;
        self.cursor = m.cursor;
    }

    pub fn content(self: *const Editor) []const u8 {
        return self.buf[0..self.len];
    }
};

const History = struct {
    stack: [8]Memento = undefined,
    top: usize = 0,

    pub fn backup(self: *History, e: *const Editor) void {
        self.stack[self.top] = e.save();
        self.top += 1;
    }

    pub fn undo(self: *History, e: *Editor) void {
        if (self.top == 0) return;
        self.top -= 1;
        e.restore(self.stack[self.top]);
    }
};

pub fn main() void {
    var editor = Editor{};
    var history = History{};

    history.backup(&editor);
    editor.typeText("hello");
    std.debug.print("{s}\n", .{editor.content()}); // hello

    history.undo(&editor);
    std.debug.print("[{s}]\n", .{editor.content()}); // []
}
```

**🧠 Tradeoff** — Because arrays are values, `save` copying the struct copies the whole buffer —
a real snapshot with zero allocation, and the naive pointer-aliasing bug can't touch it. The
fixed `[64]u8` is the price: a real editor holds a heap slice, and then `save` must
`allocator.dupe` the contents and `History` owns memory it has to free when snapshots are popped
or discarded — the caretaker growing an allocator is the true cost of Memento in a
manual-memory language. Zig struct fields are always public, so the memento is opaque by
convention and file scope, not enforcement.

### Java

**❌ Naive**

```java
import java.util.ArrayDeque;

// Storing a reference, not a copy — the "snapshot" aliases the live editor.
class EditorState {
    String content = "";
    int cursor;
}

public class Demo {
    public static void main(String[] args) {
        var editor = new EditorState();
        var history = new ArrayDeque<EditorState>();
        history.push(editor);               // same object — not a snapshot
        editor.content = "hello";
        editor = history.pop();             // "restore" changed nothing; the backup mutated too
        System.out.println(editor.content); // hello
    }
}
```

**✅ Idiomatic**

```java
import java.util.ArrayDeque;
import java.util.Deque;

// The memento is an immutable record; only the editor uses its contents.
record Memento(String content, int cursor) {}

class Editor {
    private String content = "";
    private int cursor;

    void type(String text) {
        content += text;
        cursor += text.length();
    }

    Memento save() { return new Memento(content, cursor); }

    void restore(Memento m) {
        content = m.content();
        cursor = m.cursor();
    }

    String content() { return content; }
}

// The caretaker stacks mementos but never looks inside.
class History {
    private final Deque<Memento> stack = new ArrayDeque<>();

    void backup(Editor e) { stack.push(e.save()); }

    void undo(Editor e) {
        if (!stack.isEmpty()) e.restore(stack.pop());
    }
}

public class Demo {
    public static void main(String[] args) {
        var editor = new Editor();
        var history = new History();

        history.backup(editor);
        editor.type("hello");
        System.out.println(editor.content()); // hello

        history.undo(editor);
        System.out.println("[" + editor.content() + "]"); // []
    }
}
```

**🧠 Tradeoff** — A `record` makes the snapshot immutable in one line, so the naive aliasing bug
can't happen — nothing mutates a stored `Memento` behind the history's back. The accessors are
public, though: `History` *could* read `content()`. The GoF-strict Java fix is a marker
interface with the real record nested privately inside `Editor`, which casts it back in
`restore` — ceremony worth paying only when opacity is a hard requirement, since immutability
already protects the snapshot. Watch copy depth too: `content` is an immutable `String`, but a
mutable `List` field would need `List.copyOf` in `save`.

## Applications

Real-world uses of Memento (from the reference article), by tier:

- **Frontend** — editor/canvas undo-redo, form draft snapshots, game save points, wizard step
  back, browser history entries.
- **Backend** — transactional rollback, config/version checkpoints, database savepoints,
  event-sourced state restoration.
- **Both** — time-travel debugging, optimistic-update rollback on error.

**In modern systems:**

- **Workflow engine** — a checkpoint captured before each step so a crashed run resumes from the
  last good state instead of restarting from the top.
- **Multi-agent** — a conversation/context snapshot the orchestrator can roll back to when a branch
  dead-ends, and try a different approach from there.
- **Low-code** — undo in the visual builder: each edit pushes a snapshot of the JSON document.

## Related Patterns

- **Command** — pairs with Memento: a command captures a memento to implement undo.
- **Prototype** — both copy state; Memento stores it for later restore, Prototype clones to spawn
  new objects.
- **State** — a memento can capture and restore which state a machine was in.
