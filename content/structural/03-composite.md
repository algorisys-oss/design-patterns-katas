---
id: composite
category: structural
sequence: 3
title: Composite
also_known_as: []
gof: true
intent: "Treat individual objects and groups of objects the same way through one interface."
frequency: medium
difficulty: intermediate
tags: [structural, tree, part-whole, recursion, hierarchy]
related: [decorator, iterator, visitor]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Compose objects into trees and let a leaf and a branch respond to the same operation. A file and
a folder both have a `size()`; the client calls `size()` without caring which it holds, and a
folder computes its size by summing its children — recursion the client never sees.

## The Problem

You model a file system. A file has a size; a folder's size is the sum of its contents. If files
and folders are different types with different methods, every caller must check "is this a file
or a folder?" and recurse by hand.

```
function totalSize(node) {
  if (node.isFile) return node.size;
  // else it's a folder — loop, recurse, sum… at every call site
  return node.children.reduce((s, c) => s + totalSize(c), 0);
}
```

Composite pushes that recursion into the objects: both expose `size()`, and folders sum their
children internally.

## Structure

Key Components:

- **Component** — the shared interface for leaves and composites (`size()`).
- **Leaf** — a single object with no children (`File`).
- **Composite** — holds children (also Components) and implements the operation by delegating to
  them (`Folder`).

## When to Use

- You have a part-whole hierarchy (trees) — files, UI, org charts, expressions.
- You want clients to treat single items and groups uniformly.
- Operations should recurse through the structure without the client managing it.

## Advantages and Disadvantages

### Advantages
- Uniform treatment of leaves and composites — no type checks at call sites.
- Recursion lives in the structure, not the client.
- Easy to add new component types.

### Disadvantages
- The shared interface can get too general (leaf-only ops that composites must stub).
- Type safety loosens — an `add(child)` on a leaf has to error or be absent.
- Very deep trees can be costly to traverse.

## Common Mistakes

- **Putting child-management methods on the Component** — `add`/`remove` on a leaf either lie or
  throw; decide whether they live on Component (uniform but unsafe) or only Composite (safe but
  requires casting).
- **Forgetting the recursion terminates at leaves** — a cycle in the "tree" loops forever.
- **Confusing it with Decorator** — Composite aggregates many children; Decorator wraps exactly
  one and adds behavior.

## Key Takeaways

- Composite = leaves and branches share one interface; branches recurse into children.
- The client treats one and many identically.
- Decide upfront where child-management methods live (Component vs Composite).

## Implementations

A file system where `File` (leaf) and `Folder` (composite) both report `size()`.

### JavaScript

**❌ Naive**

```js
// Callers branch on type and recurse by hand everywhere.
function totalSize(node) {
  if (node.type === "file") return node.size;
  return node.children.reduce((sum, c) => sum + totalSize(c), 0);
}
```

**✅ Idiomatic**

```js
class File {
  constructor(name, size) { this.name = name; this.size = size; }
  totalSize() { return this.size; }         // leaf: base case
}

class Folder {
  constructor(name) { this.name = name; this.children = []; }
  add(child) { this.children.push(child); return this; }
  totalSize() {                              // composite: sum children
    return this.children.reduce((sum, c) => sum + c.totalSize(), 0);
  }
}

const root = new Folder("root")
  .add(new File("a.txt", 100))
  .add(new Folder("sub").add(new File("b.txt", 50)));

root.totalSize();   // 150 — client never checks types or recurses
```

**🧠 Tradeoff** — Both types expose `totalSize()`, so the client calls it uniformly and the
folder handles recursion. Child-management (`add`) lives only on `Folder`, so a `File` can't
accidentally hold children — the safe placement, at the cost of needing a `Folder` reference to
build the tree.

### Node.js

**❌ Naive**

```js
// Callers branch on the node kind and recurse by hand to run a pipeline.
async function run(node) {
  if (node.kind === "step") return node.fn();
  for (const child of node.steps) await run(child); // sequential group, inline
}
```

**✅ Idiomatic (backend)**

```js
// A single step and a group of steps share the same run() — clients don't branch.
class Step {
  constructor(name, fn) { this.name = name; this.fn = fn; }
  run() { return this.fn(); }                        // leaf
}
class Pipeline {
  constructor(name) { this.name = name; this.steps = []; }
  add(step) { this.steps.push(step); return this; }
  async run() {                                      // composite: run children in order
    for (const step of this.steps) await step.run();
  }
}

const deploy = new Pipeline("deploy")
  .add(new Step("build", build))
  .add(new Pipeline("test").add(new Step("unit", unit)).add(new Step("e2e", e2e)))
  .add(new Step("release", release));

await deploy.run(); // client calls run() once; nesting handles itself
```

**🧠 Tradeoff** — Both `Step` and `Pipeline` expose `run()`, so a pipeline can contain steps or
other pipelines to any depth and the caller never inspects types. Sequencing lives in `Pipeline`; a
`ParallelPipeline` using `Promise.all` would slot in the same way — the uniform tree is the point.

### Python

**❌ Naive**

```python
def total_size(node):
    if node["type"] == "file":
        return node["size"]
    return sum(total_size(c) for c in node["children"])
```

**✅ Idiomatic**

```python
from abc import ABC, abstractmethod

class Node(ABC):
    @abstractmethod
    def total_size(self) -> int: ...

class File(Node):
    def __init__(self, name: str, size: int):
        self.name, self.size = name, size
    def total_size(self) -> int:
        return self.size

class Folder(Node):
    def __init__(self, name: str):
        self.name, self.children = name, []
    def add(self, child: Node) -> "Folder":
        self.children.append(child)
        return self
    def total_size(self) -> int:
        return sum(c.total_size() for c in self.children)

root = Folder("root").add(File("a.txt", 100)).add(Folder("sub").add(File("b.txt", 50)))
root.total_size()   # 150
```

**🧠 Tradeoff** — An `ABC` pins the `Node` contract so both leaf and composite implement
`total_size`. The recursion is a one-line generator sum in `Folder`; the client treats any `Node`
alike. Keeping `add` on `Folder` only preserves the invariant that files hold nothing.

### Elixir

**❌ Naive**

```elixir
def total_size(%{type: :file, size: size}), do: size
def total_size(%{type: :folder, children: children}) do
  Enum.reduce(children, 0, fn c, acc -> acc + total_size(c) end)
end
```

**✅ Idiomatic**

```elixir
# The "composite" is just a recursive data structure; one function walks it.
defmodule FS do
  # leaf and branch are plain tagged tuples/structs
  def total_size({:file, _name, size}), do: size

  def total_size({:folder, _name, children}) do
    Enum.reduce(children, 0, fn child, acc -> acc + total_size(child) end)
  end
end

tree =
  {:folder, "root",
   [{:file, "a.txt", 100}, {:folder, "sub", [{:file, "b.txt", 50}]}]}

FS.total_size(tree)   # 150
```

**🧠 Tradeoff** — Functional languages model Composite as an algebraic data type — a tree of
tagged tuples — and one multi-clause function pattern-matches leaf vs branch, recursing on the
branch. There are no objects sharing an interface; the "uniform treatment" is that a single
`total_size/1` accepts either shape. This is often clearer than the OO version for pure data.

### Go

**❌ Naive**

```go
func TotalSize(n Node) int {
	if n.Kind == "file" {
		return n.Size
	}
	sum := 0
	for _, c := range n.Children {
		sum += TotalSize(c)
	}
	return sum
}
```

**✅ Idiomatic**

```go
package fs

// Component: the shared interface.
type Node interface{ TotalSize() int }

// Leaf.
type File struct {
	Name string
	Size int
}

func (f File) TotalSize() int { return f.Size }

// Composite.
type Folder struct {
	Name     string
	Children []Node
}

func (f *Folder) Add(n Node)   { f.Children = append(f.Children, n) }
func (f *Folder) TotalSize() int {
	sum := 0
	for _, c := range f.Children {
		sum += c.TotalSize()
	}
	return sum
}
```

**🧠 Tradeoff** — `File` and `*Folder` both satisfy `Node`, so a `[]Node` mixes leaves and
branches and the client calls `TotalSize()` blind to which is which. `Add` lives on `*Folder`
only, keeping child-management off leaves — Go's implicit interfaces make the uniform treatment
fall out naturally.

## Applications

Real-world uses of Composite (from the reference article):

- **File systems** — files and folders with recursive size/search.
- **UI trees** — a panel containing buttons and nested panels; render/layout recurses.
- **Org charts** — employees and managers, headcount rolls up.
- **Graphics / scene graphs** — groups of shapes transformed together.
- **Expression / AST trees** — evaluate nested expressions uniformly.

## Related Patterns

- **Decorator** — wraps a single component to add behavior; Composite aggregates many.
- **Iterator** — traverses a composite's elements.
- **Visitor** — adds operations over a composite tree without changing the node classes.
