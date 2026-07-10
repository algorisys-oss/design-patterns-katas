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
languages: [javascript, node-js, python, elixir, go]
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
