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
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
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

### CSharp

**❌ Naive**

```csharp
// Callers branch on the concrete type and recurse by hand everywhere.
static int TotalSize(object node) => node switch
{
    File file => file.Size,
    Folder folder => folder.Children.Sum(TotalSize),
    _ => throw new ArgumentException($"unknown node: {node}"),
};
```

**✅ Idiomatic**

```csharp
var root = new Folder("root")
    .Add(new File("a.txt", 100))
    .Add(new Folder("sub").Add(new File("b.txt", 50)));

Console.WriteLine(root.TotalSize()); // 150 — no type checks, no manual recursion

// Component: the shared contract.
public interface INode
{
    int TotalSize();
}

// Leaf — a record: name, size, base case.
public sealed record File(string Name, int Size) : INode
{
    public int TotalSize() => Size;
}

// Composite — child management lives here only.
public sealed class Folder(string name) : INode
{
    private readonly List<INode> _children = [];

    public string Name { get; } = name;

    public Folder Add(INode child)
    {
        _children.Add(child);
        return this;
    }

    public int TotalSize() => _children.Sum(c => c.TotalSize());
}
```

**🧠 Tradeoff** — `INode` plus LINQ's `Sum` keeps the recursion a one-expression method, and
the leaf is a positional record. `Add` stays on `Folder`, so a `File` can't hold children —
the same safe placement as the JS version, now enforced by the compiler rather than by
convention.

### Rust

**❌ Naive**

```rust
struct FileNode { size: u64 }
struct FolderNode { files: Vec<FileNode>, folders: Vec<FolderNode> }

// Two parallel lists per folder; every caller re-implements the walk.
fn total_size(folder: &FolderNode) -> u64 {
    let files: u64 = folder.files.iter().map(|f| f.size).sum();
    let subs: u64 = folder.folders.iter().map(total_size).sum();
    files + subs
}
```

**✅ Idiomatic**

```rust
// A closed node set is an enum — the tree owns its children.
enum Node {
    File { name: String, size: u64 },
    Folder { name: String, children: Vec<Node> },
}

impl Node {
    fn total_size(&self) -> u64 {
        match self {
            Node::File { size, .. } => *size,
            Node::Folder { children, .. } => children.iter().map(Node::total_size).sum(),
        }
    }
}

fn main() {
    let root = Node::Folder {
        name: "root".into(),
        children: vec![
            Node::File { name: "a.txt".into(), size: 100 },
            Node::Folder {
                name: "sub".into(),
                children: vec![Node::File { name: "b.txt".into(), size: 50 }],
            },
        ],
    };
    println!("{}", root.total_size()); // 150
}
```

**🧠 Tradeoff** — the enum is the honest Rust form here: the node set is closed, `match` is
exhaustive, and `Vec<Node>` gives the recursion its indirection (a direct `Node` field would
need `Box<Node>`). The trait-object alternative — a `Node` trait with `Vec<Box<dyn Node>>`
children — buys an open set (new node kinds without touching this file) at the cost of a heap
allocation and dynamic dispatch per node. Reach for `dyn` only when the set must stay open.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// Two node kinds with no shared shape — every walk is hand-rolled per kind.
const File = struct { name: []const u8, size: u64 };
const Folder = struct { name: []const u8, files: []const File, folders: []const Folder };

fn totalSize(folder: Folder) u64 {
    var sum: u64 = 0;
    for (folder.files) |f| sum += f.size;
    for (folder.folders) |sub| sum += totalSize(sub);
    return sum;
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// A closed node set is a tagged union; folders own a slice of children.
const Node = union(enum) {
    file: struct { name: []const u8, size: u64 },
    folder: struct { name: []const u8, children: []const Node },

    fn totalSize(self: Node) u64 {
        return switch (self) {
            .file => |f| f.size,
            .folder => |d| blk: {
                var sum: u64 = 0;
                for (d.children) |child| sum += child.totalSize();
                break :blk sum;
            },
        };
    }
};

pub fn main() !void {
    const allocator = std.heap.page_allocator;

    // The tree owns heap memory, so building it takes an explicit allocator.
    const sub = try allocator.dupe(Node, &.{
        .{ .file = .{ .name = "b.txt", .size = 50 } },
    });
    defer allocator.free(sub);

    const top = try allocator.dupe(Node, &.{
        .{ .file = .{ .name = "a.txt", .size = 100 } },
        .{ .folder = .{ .name = "sub", .children = sub } },
    });
    defer allocator.free(top);

    const root = Node{ .folder = .{ .name = "root", .children = top } };
    std.debug.print("{d}\n", .{root.totalSize()}); // 150
}
```

**🧠 Tradeoff** — a tagged union with an exhaustive `switch` is idiomatic Zig for a closed
node set: zero indirection, and the compiler flags any unhandled kind. What Zig adds is
honesty about memory — a tree owns heap-allocated child slices, so building one takes an
explicit allocator and freeing is your job (`defer`, or an arena for whole-tree cleanup).
An open node set would need the vtable idiom; for pure data like this, the union is the
right call.

### Java

**❌ Naive**

```java
// Callers branch on the concrete type and recurse by hand everywhere.
static int totalSize(Object node) {
    if (node instanceof File file) return file.size();
    var folder = (Folder) node;
    return folder.children().stream().mapToInt(Demo::totalSize).sum();
}
```

**✅ Idiomatic**

```java
import java.util.ArrayList;
import java.util.List;

// Component: the shared contract.
interface Node {
    int totalSize();
}

// Leaf — a record: name, size, base case.
record File(String name, int size) implements Node {
    public int totalSize() { return size; }
}

// Composite — child management lives here only.
class Folder implements Node {
    private final String name;
    private final List<Node> children = new ArrayList<>();

    Folder(String name) { this.name = name; }

    Folder add(Node child) {
        children.add(child);
        return this;
    }

    public int totalSize() {
        return children.stream().mapToInt(Node::totalSize).sum();
    }
}

public class Demo {
    public static void main(String[] args) {
        var root = new Folder("root")
            .add(new File("a.txt", 100))
            .add(new Folder("sub").add(new File("b.txt", 50)));

        System.out.println(root.totalSize()); // 150 — no type checks, no manual recursion
    }
}
```

**🧠 Tradeoff** — Swing carried this pattern for decades: `Container` is a `Component` that
holds components, so panels nest in panels. The modern trim is visible above — the leaf is a
record and the recursion is a stream `sum()`. When the node set is closed, sealed types offer
an alternative shape: `sealed interface Node permits File, Folder` plus a pattern-matching
`switch` moves the operation out of the nodes, enum-style, and the compiler checks
exhaustiveness. Keep `totalSize` on the interface when the set stays open; seal it when you
want new *operations* to be cheap instead of new node kinds.

## Applications

Real-world uses of Composite (from the reference article):

- **File systems** — files and folders with recursive size/search.
- **UI trees** — a panel containing buttons and nested panels; render/layout recurses.
- **Org charts** — employees and managers, headcount rolls up.
- **Graphics / scene graphs** — groups of shapes transformed together.
- **Expression / AST trees** — evaluate nested expressions uniformly.

**In modern systems:**

- **Low-code** — the JSON schema itself: a `container` holds fields and other containers, rendered
  by one recursive walk that treats a leaf field and a group alike.
- **Workflow engine** — a sub-workflow is a step, so a group of steps drops in anywhere a single
  step is expected.
- **Multi-agent** — a team is an agent: a supervisor wrapping workers exposes the same `run`
  interface as a lone agent, so you can nest teams within teams.

## Related Patterns

- **Decorator** — wraps a single component to add behavior; Composite aggregates many.
- **Iterator** — traverses a composite's elements.
- **Visitor** — adds operations over a composite tree without changing the node classes.
