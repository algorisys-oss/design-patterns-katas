---
id: iterator
category: behavioral
sequence: 4
title: Iterator
also_known_as: [Cursor]
gof: true
intent: "Traverse a collection's elements one by one without exposing how it's stored."
frequency: high
difficulty: beginner
tags: [behavioral, traversal, collection, lazy, sequence]
related: [composite, observer, strategy]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Give a uniform way to walk through a collection — one element at a time — without the caller
knowing whether it's an array, a tree, a linked list, or a paged API. The traversal logic lives in
an iterator, separate from the collection, so the same `for`-style loop works over any structure.

## The Problem

Different collections expose their contents differently: an array by index, a tree by traversal, a
paged API by fetching pages. Code that consumes them ends up knowing each structure's internals,
and switching structures rewrites the loops.

```
// array:
for (let i = 0; i < arr.length; i++) use(arr[i]);
// tree: recursion; paged API: fetch-loop; linked list: node.next…
// every consumer must know the structure's shape
```

An iterator hides the shape behind a `next()`/`hasNext()` (or a language's built-in protocol).

## Structure

Key Components:

- **Iterator** — knows how to produce the next element and whether more remain.
- **Iterable/Aggregate** — the collection that can produce an iterator.
- **Client** — walks the iterator, ignorant of the underlying structure.

## When to Use

- You want to traverse a collection without exposing its representation.
- You need multiple or custom traversal orders over one structure.
- You want lazy iteration — produce elements on demand, not all up front.
- Callers should use one loop shape across different collections.

## Advantages and Disadvantages

### Advantages
- Decouples traversal from the collection's storage.
- Supports lazy, on-demand iteration (infinite or huge sequences).
- One uniform loop over many structures.

### Disadvantages
- For a plain array, a hand-rolled iterator is needless overhead.
- Iterator invalidation: mutating the collection mid-iteration can break it.

## Common Mistakes

- **Exposing the structure anyway** — an iterator that hands back internal nodes leaks the shape.
- **Eager when you meant lazy** — building the whole sequence up front defeats streaming.
- **Mutating during iteration** — add/remove mid-loop and behavior is undefined in most languages.

## Key Takeaways

- Iterator = uniform, structure-agnostic traversal, often lazy.
- Most languages have this built in (`for..of`, `__iter__`, `range`, `Enumerable`) — implement the
  protocol rather than a custom API.
- Prefer lazy iteration for large or streamed data.

## Implementations

Iterating a custom range/collection lazily.

### JavaScript

**❌ Naive**

```js
// Consumers reach into the internal array and index it by hand.
class NumberRange {
  constructor(start, end) { this.items = []; for (let i = start; i < end; i++) this.items.push(i); }
}
const r = new NumberRange(0, 3);
for (let i = 0; i < r.items.length; i++) console.log(r.items[i]); // knows it's an array; eager
```

**✅ Idiomatic (frontend)**

```js
// Implement the built-in iterator protocol; lazy, no backing array.
class NumberRange {
  constructor(start, end) { this.start = start; this.end = end; }
  *[Symbol.iterator]() {
    for (let i = this.start; i < this.end; i++) yield i; // produced on demand
  }
}

const range = new NumberRange(0, 3);
for (const n of range) console.log(n);   // 0 1 2 — uniform for..of
const doubled = [...range].map(x => x * 2);
```

**🧠 Tradeoff** — Implementing `Symbol.iterator` as a generator makes the object work with
`for..of`, spread, and destructuring — the whole language's iteration machinery, for free, and
lazily. Rolling your own `next()`/`hasNext()` API instead would fight the language; the built-in
protocol is almost always the right call.

### Node.js

**❌ Naive**

```js
// Loading every DB row into memory before the caller sees any.
async function getUsers(db) {
  const rows = await db.query("SELECT * FROM users"); // could be millions of rows
  return rows;                                        // all buffered at once
}
```

**✅ Idiomatic (backend)**

```js
// An async iterator streams rows lazily — one page at a time.
async function* users(db, pageSize = 100) {
  let offset = 0;
  while (true) {
    const rows = await db.query("SELECT * FROM users LIMIT ? OFFSET ?", [pageSize, offset]);
    if (rows.length === 0) return;
    yield* rows;                 // hand out rows without buffering everything
    offset += rows.length;
  }
}

// The caller uses for-await-of; memory stays flat regardless of table size.
for await (const user of users(db)) {
  process(user);
}
```

**🧠 Tradeoff** — Async generators (`for await...of`) are the backend Iterator: they stream from
databases, files, and network without loading everything into memory — the same protocol behind
Node streams and cursors. The tradeoff is holding a resource (a DB cursor/connection) open across
the iteration, so you must close it in a `finally` if the consumer breaks early.

### Python

**❌ Naive**

```python
class NumberRange:
    def __init__(self, start, end):
        self.items = list(range(start, end))  # eager; exposes a list

r = NumberRange(0, 3)
for i in range(len(r.items)):
    print(r.items[i])
```

**✅ Idiomatic**

```python
from typing import Iterator

class NumberRange:
    def __init__(self, start: int, end: int):
        self.start, self.end = start, end
    def __iter__(self) -> Iterator[int]:
        i = self.start
        while i < self.end:
            yield i           # generator: lazy, no backing list
            i += 1

for n in NumberRange(0, 3):
    print(n)                  # 0 1 2
doubled = [x * 2 for x in NumberRange(0, 3)]
```

**🧠 Tradeoff** — A generator `__iter__` makes the object a first-class iterable: `for`, `list()`,
comprehensions, `sum()` all just work, lazily. Python's iterator protocol is so central that a
plain generator function is often the whole pattern — you rarely write an explicit iterator class.

### Elixir

**❌ Naive**

```elixir
# Building the whole list eagerly, then walking it.
defmodule NumberRange do
  def to_list(start, stop), do: Enum.to_list(start..(stop - 1))
end

NumberRange.to_list(0, 3) |> Enum.each(&IO.puts/1)  # materializes the list
```

**✅ Idiomatic**

```elixir
# Stream gives lazy iteration; the Enumerable protocol is the "iterator".
defmodule NumberRange do
  def stream(start, stop) do
    Stream.unfold(start, fn
      i when i < stop -> {i, i + 1}   # emit i, advance
      _ -> nil                        # halt
    end)
  end
end

NumberRange.stream(0, 3)
|> Stream.map(&(&1 * 2))              # still lazy — nothing computed yet
|> Enum.to_list()                    # [0, 2, 4] — runs on demand here
```

**🧠 Tradeoff** — Elixir's `Enumerable`/`Stream` *is* the Iterator pattern: `Stream` builds lazy
pipelines that produce values only when an `Enum` function pulls them. `Stream.unfold` expresses a
custom sequence without a backing list, so it works over infinite or generated data. You implement
the `Enumerable` protocol for a custom collection to plug into the whole `Enum`/`Stream` toolbox.

### Go

**❌ Naive**

```go
// Expose the slice and index it — caller is tied to the representation.
type NumberRange struct{ Items []int }

func NewRange(start, end int) NumberRange {
	items := make([]int, 0, end-start)
	for i := start; i < end; i++ {
		items = append(items, i)
	}
	return NumberRange{items} // eager
}
```

**✅ Idiomatic**

```go
package rng

import "iter"

// Go 1.23+ range-over-func: return an iterator; the caller uses for..range.
func Numbers(start, end int) iter.Seq[int] {
	return func(yield func(int) bool) {
		for i := start; i < end; i++ {
			if !yield(i) { // consumer can stop early
				return
			}
		}
	}
}

// for n := range rng.Numbers(0, 3) { fmt.Println(n) }  // 0 1 2 — lazy, no slice
```

**🧠 Tradeoff** — Go 1.23's `iter.Seq` (range-over-func) is the modern Iterator: a function that
yields values, consumed with `for range`, lazily and with early-break support via `yield`'s bool.
Before 1.23, the idioms were a `Next() (T, bool)` method or a channel; the new form integrates with
the language loop the way the other languages' protocols do.

### CSharp

**❌ Naive**

```csharp
// Consumers reach into the internal list and index it by hand.
var r = new NumberRange(0, 3);
for (var i = 0; i < r.Items.Count; i++) Console.WriteLine(r.Items[i]); // knows it's a List; eager

public sealed class NumberRange
{
    public List<int> Items { get; } = [];
    public NumberRange(int start, int end)
    {
        for (var i = start; i < end; i++) Items.Add(i); // materialized up front
    }
}
```

**✅ Idiomatic**

```csharp
using System.Collections;

// yield return implements the iterator protocol — lazy, no backing list.
foreach (var n in new NumberRange(0, 3)) Console.WriteLine(n); // 0 1 2

var doubled = new NumberRange(0, 3).Select(x => x * 2).ToList(); // LINQ plugs straight in

public sealed class NumberRange(int start, int end) : IEnumerable<int>
{
    public IEnumerator<int> GetEnumerator()
    {
        for (var i = start; i < end; i++) yield return i; // produced on demand
    }
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}
```

**🧠 Tradeoff** — `IEnumerable<T>`/`IEnumerator<T>` *is* the GoF Iterator shipped in the box,
and `yield return` writes the `MoveNext` state machine you'd otherwise hand-roll — `foreach`
and all of LINQ are its clients. So in C# the pattern means implementing the protocol, never
inventing a `HasNext`/`Next` API of your own. For streamed sources — the Node.js tab's case —
`IAsyncEnumerable<T>` with `await foreach` is the same pattern over async data, with the same
close-the-cursor caveat.

### Rust

**❌ Naive**

```rust
// Expose the backing Vec and index it — caller tied to the representation; eager.
struct NumberRange { items: Vec<i32> }

impl NumberRange {
    fn new(start: i32, end: i32) -> Self {
        Self { items: (start..end).collect() } // materialized up front
    }
}

fn main() {
    let r = NumberRange::new(0, 3);
    for i in 0..r.items.len() {
        println!("{}", r.items[i]);
    }
}
```

**✅ Idiomatic**

```rust
// The iterator holds the cursor; next() is the whole protocol.
struct NumberRange { current: i32, end: i32 }

impl NumberRange {
    fn new(start: i32, end: i32) -> Self {
        Self { current: start, end }
    }
}

impl Iterator for NumberRange {
    type Item = i32;

    fn next(&mut self) -> Option<i32> {
        if self.current < self.end {
            let n = self.current;
            self.current += 1;
            Some(n) // produced on demand
        } else {
            None // iteration over
        }
    }
}

fn main() {
    for n in NumberRange::new(0, 3) {
        println!("{n}"); // 0 1 2 — a plain for loop
    }
    let doubled: Vec<i32> = NumberRange::new(0, 3).map(|x| x * 2).collect();
    println!("{doubled:?}"); // [0, 2, 4]
}
```

**🧠 Tradeoff** — implement one method, `next() -> Option<Item>`, and the trait's dozens of
provided adapters (`map`, `filter`, `take`, `collect`) come along free — all lazy, and
monomorphized down to loop-speed code. Honesty check: for numbers you'd just write `0..3`,
which is already an `Iterator`; you implement the trait for your own structures — tree walks,
pagers, parsers. And the "mutating during iteration" hazard from the mistakes list isn't
undefined behavior here: the borrow checker rejects it at compile time.

### Zig

**❌ Naive**

```zig
const std = @import("std");

// Materialize the whole range into a buffer, then walk it by index.
const NumberRange = struct {
    items: [16]i64 = undefined,
    len: usize = 0,

    fn init(start: i64, end: i64) NumberRange {
        var r = NumberRange{};
        var i = start;
        while (i < end) : (i += 1) {
            r.items[r.len] = i;
            r.len += 1;
        }
        return r; // eager, and the caller indexes the internals
    }
};

pub fn main() void {
    const r = NumberRange.init(0, 3);
    for (r.items[0..r.len]) |n| std.debug.print("{d}\n", .{n});
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// The std convention: a struct with next() returning ?T — null means done.
const NumberRange = struct {
    current: i64,
    end: i64,

    fn init(start: i64, end: i64) NumberRange {
        return .{ .current = start, .end = end };
    }

    fn next(self: *NumberRange) ?i64 {
        if (self.current >= self.end) return null; // done
        defer self.current += 1;
        return self.current; // produced on demand
    }
};

pub fn main() void {
    var range = NumberRange.init(0, 3);
    while (range.next()) |n| {
        std.debug.print("{d}\n", .{n}); // 0 1 2
    }
}
```

**🧠 Tradeoff** — the optional-returning `next()` is a convention, not a language feature, but
it's the one std uses everywhere (`std.fs.Dir.iterate`, hash-map iterators, the string
tokenizers), so `while (it.next()) |n|` reads as native Zig. The `?i64` collapses
`hasNext`/`next` into one call, and the iteration is lazy with no allocation. What you don't
get is generator sugar: there's no `yield`, so an iterator that walks a tree must carry its own
explicit stack in the struct — the state a JS generator or C# iterator method hides for you.

### Java

**❌ Naive**

```java
import java.util.ArrayList;
import java.util.List;

// Consumers reach into the internal list and index it by hand.
class NumberRange {
    final List<Integer> items = new ArrayList<>();

    NumberRange(int start, int end) {
        for (int i = start; i < end; i++) items.add(i); // eager; exposes a List
    }
}

public class Demo {
    public static void main(String[] args) {
        var r = new NumberRange(0, 3);
        for (int i = 0; i < r.items.size(); i++) {
            System.out.println(r.items.get(i)); // knows it's a List
        }
    }
}
```

**✅ Idiomatic**

```java
import java.util.Iterator;
import java.util.NoSuchElementException;

// Implement Iterable and the for-each loop works; lazy, no backing list.
class NumberRange implements Iterable<Integer> {
    private final int start, end;

    NumberRange(int start, int end) { this.start = start; this.end = end; }

    public Iterator<Integer> iterator() {
        return new Iterator<>() {
            private int current = start;

            public boolean hasNext() { return current < end; }
            public Integer next() {
                if (!hasNext()) throw new NoSuchElementException();
                return current++; // produced on demand
            }
        };
    }
}

public class Demo {
    public static void main(String[] args) {
        for (var n : new NumberRange(0, 3)) {
            System.out.println(n); // 0 1 2 — uniform for-each
        }
    }
}
```

**🧠 Tradeoff** — Iterator is the GoF pattern Java shipped as a core library type:
`java.util.Iterator` *is* the `hasNext`/`next` interface from the book, and the for-each loop
is compiler sugar that calls `iterator()` on anything `Iterable` — so in Java the pattern
means implementing the protocol, never inventing a cursor API of your own. Honesty check: for
numbers you'd just write `IntStream.range(0, 3)`; you implement `Iterable` for your own
structures so they plug into for-each and `Collection` machinery. The "mutating during
iteration" hazard isn't undefined here — `java.util` collections fail fast with
`ConcurrentModificationException`. What Java lacks is generator sugar: no `yield`, so a
tree-walking iterator carries its own explicit stack, the state a JS or Python generator
hides for you.

## Applications

Real-world uses of Iterator (from the reference article), by tier:

- **Frontend** — paginated results, virtualized lists, tree/DOM traversal, generator-driven
  animation sequences.
- **Backend** — streaming database cursors, directory traversal, reading large files line by line,
  paging external APIs without buffering.
- **Both** — lazy pipelines over infinite or generated sequences.

## Related Patterns

- **Composite** — Iterator traverses a composite tree uniformly.
- **Strategy** — different traversal orders are strategies plugged into iteration.
- **Observer** — both decouple, but Iterator pulls elements while Observer pushes events.
