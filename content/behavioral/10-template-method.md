---
id: template-method
category: behavioral
sequence: 10
title: Template Method
also_known_as: []
gof: true
intent: "Define the skeleton of an algorithm once, and let each variant fill in specific steps."
frequency: medium
difficulty: intermediate
tags: [behavioral, algorithm-skeleton, hooks, inversion-of-control, reuse]
related: [strategy, factory-method]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Write the fixed shape of an algorithm once — the order of steps, the shared scaffolding — and
leave named holes for the parts that vary. Each variant fills in the holes without touching the
overall structure. The base owns the *when*; the variant owns the *how* of specific steps.

It's the "Hollywood Principle" in action: don't call us, we'll call you — the skeleton calls your
step, not the other way around.

## The Problem

You export reports to CSV and to JSON. Both do the same dance: open, write a header, write rows,
close. If you copy the whole flow for each format, the shared steps get duplicated, and fixing the
open/close logic means editing every copy.

```
function exportCsv(data)  { open(); writeCsvHeader(); writeCsvRows(data); close(); }
function exportJson(data) { open(); writeJsonHeader(); writeJsonRows(data); close(); }
// open/close duplicated; add a step (e.g. compress) and edit both
```

Template Method keeps the shared flow in one place and varies only the format-specific steps.

## Structure

Key Components:

- **Template Method** — the fixed algorithm that calls the steps in order.
- **Abstract/primitive steps** — the holes each variant must fill.
- **Hooks** — optional steps with a default the variant may override.

## When to Use

- Several variants share the same overall algorithm but differ in specific steps.
- You want to enforce a fixed sequence while letting details vary.
- You're duplicating a multi-step flow that differs only in a step or two.

## Advantages and Disadvantages

### Advantages
- The shared algorithm lives once; variants supply only what differs.
- The structure/order is enforced, not re-implemented per variant.
- New variants implement a few steps, not the whole flow.

### Disadvantages
- Classic form relies on inheritance, which couples variants to the base.
- The base can grow rigid; too many hooks make the flow hard to follow.
- Often better expressed with Strategy (composition) in modern code.

## Common Mistakes

- **Overriding the template method itself** — variants should fill steps, not rewrite the flow.
- **Too many hooks** — a template riddled with optional overrides is hard to reason about.
- **Reaching for inheritance when composition fits** — if steps vary independently, Strategy
  (inject the steps) is usually cleaner.

## Key Takeaways

- Template Method = fixed algorithm skeleton + variant-supplied steps.
- The base controls the sequence; variants fill the holes.
- In languages without inheritance (Go, functional code), express it as higher-order functions —
  which is really Strategy.

## Implementations

A report exporter whose flow is fixed but whose format steps vary.

### JavaScript

**❌ Naive**

```js
// The shared flow is copy-pasted per format.
function exportCsv(data) {
  const out = [];
  out.push("id,name");                       // header
  for (const r of data) out.push(`${r.id},${r.name}`);  // rows
  return out.join("\n");                     // finalize
}
function exportJson(data) {
  const out = [];
  out.push("[");                             // duplicated open/close scaffolding
  out.push(data.map(r => JSON.stringify(r)).join(","));
  out.push("]");
  return out.join("\n");
}
```

**✅ Idiomatic (frontend)**

```js
// The base owns the flow; subclasses fill header()/row()/wrap().
class Exporter {
  export(data) {                    // the template method — fixed sequence
    const lines = [this.header(), ...data.map(r => this.row(r))];
    return this.wrap(lines);
  }
  header() { return ""; }           // hooks with defaults
  row() { throw new Error("row() must be implemented"); }
  wrap(lines) { return lines.join("\n"); }
}

class CsvExporter extends Exporter {
  header() { return "id,name"; }
  row(r) { return `${r.id},${r.name}`; }
}
class JsonExporter extends Exporter {
  row(r) { return JSON.stringify(r); }
  wrap(lines) { return "[" + lines.filter(Boolean).join(",") + "]"; }
}

new CsvExporter().export(data);
```

**🧠 Tradeoff** — `export()` fixes the sequence; subclasses supply only `header`/`row`/`wrap`, so
the open/close scaffolding lives once. The coupling to a base class is the cost — if the steps
varied independently you'd inject them as functions instead (that's Strategy), which JS's
first-class functions make easy.

### Node.js

**❌ Naive**

```js
// Two ETL jobs duplicating the extract → transform → load skeleton.
async function importUsers(db) {
  const raw = await fetch("/users").then(r => r.json()); // extract
  const rows = raw.map(u => ({ ...u, active: true }));   // transform
  await db.insert("users", rows);                        // load
}
async function importOrders(db) {
  const raw = await fetch("/orders").then(r => r.json());
  const rows = raw.filter(o => o.total > 0);
  await db.insert("orders", rows);                       // same shape, copied
}
```

**✅ Idiomatic (backend)**

```js
// A base pipeline fixes extract → transform → load; jobs override the steps.
class EtlJob {
  async run(db) {                       // template method
    const raw = await this.extract();
    const rows = this.transform(raw);
    await this.load(db, rows);
    return rows.length;
  }
  async extract() { throw new Error("extract() required"); }
  transform(raw) { return raw; }        // hook: default is passthrough
  async load(db, rows) { await db.insert(this.table(), rows); }
  table() { throw new Error("table() required"); }
}

class UserImport extends EtlJob {
  table() { return "users"; }
  async extract() { return fetch("/users").then(r => r.json()); }
  transform(raw) { return raw.map(u => ({ ...u, active: true })); }
}
```

**🧠 Tradeoff** — On the backend, Template Method captures pipeline skeletons (ETL, request
handling, job runners): the base guarantees the order and shared concerns (transactions, logging),
subclasses fill the steps. Modern Node often prefers passing the step functions in (Strategy /
middleware), which avoids a class hierarchy and composes better — pick inheritance only when the
steps truly belong together.

### Python

**❌ Naive**

```python
def export_csv(data):
    lines = ["id,name"]
    lines += [f"{r['id']},{r['name']}" for r in data]
    return "\n".join(lines)

def export_json(data):
    lines = ["["]
    lines.append(",".join(json.dumps(r) for r in data))
    lines.append("]")
    return "\n".join(lines)   # scaffolding duplicated
```

**✅ Idiomatic**

```python
from abc import ABC, abstractmethod

class Exporter(ABC):
    def export(self, data: list[dict]) -> str:   # template method
        lines = [self.header(), *(self.row(r) for r in data)]
        return self.wrap([l for l in lines if l])

    def header(self) -> str:                      # hook with default
        return ""
    @abstractmethod
    def row(self, r: dict) -> str: ...
    def wrap(self, lines: list[str]) -> str:
        return "\n".join(lines)

class CsvExporter(Exporter):
    def header(self) -> str: return "id,name"
    def row(self, r: dict) -> str: return f"{r['id']},{r['name']}"

class JsonExporter(Exporter):
    def row(self, r: dict) -> str: return json.dumps(r)
    def wrap(self, lines: list[str]) -> str: return "[" + ",".join(lines) + "]"
```

**🧠 Tradeoff** — An `ABC` marks the required step (`row`) as abstract while leaving hooks with
defaults; `export` fixes the flow. This is the textbook Template Method. Python's first-class
functions also let you pass steps into a single `export(data, header=…, row=…)` function — the
functional alternative when inheritance feels heavy.

### Elixir

**❌ Naive**

```elixir
defmodule Export do
  def csv(data), do: Enum.join(["id,name" | Enum.map(data, &"#{&1.id},#{&1.name}")], "\n")
  def json(data), do: "[" <> Enum.map_join(data, ",", &Jason.encode!/1) <> "]"
  # shared "header, rows, wrap" structure isn't captured anywhere
end
```

**✅ Idiomatic**

```elixir
# A behaviour declares the step callbacks; a shared function is the template.
defmodule Exporter do
  @callback header() :: String.t()
  @callback row(map()) :: String.t()
  @callback wrap([String.t()]) :: String.t()

  # The template method: fixed sequence, calls back into the implementing module.
  def export(mod, data) do
    lines = [mod.header() | Enum.map(data, &mod.row/1)]
    mod.wrap(lines)
  end
end

defmodule CsvExporter do
  @behaviour Exporter
  @impl true
  def header, do: "id,name"
  @impl true
  def row(r), do: "#{r.id},#{r.name}"
  @impl true
  def wrap(lines), do: Enum.join(lines, "\n")
end

Exporter.export(CsvExporter, data)
```

**🧠 Tradeoff** — With no inheritance, the template is a shared function that takes the implementing
*module* and calls its callbacks in a fixed order — the behaviour documents the required steps.
Idiomatic Elixir often skips even this and just passes the varying steps as functions to a reducer;
that's Strategy, and for many cases it's the cleaner choice on the BEAM.

### Go

**❌ Naive**

```go
func ExportCSV(data []Row) string {
	out := []string{"id,name"}
	for _, r := range data {
		out = append(out, fmt.Sprintf("%d,%s", r.ID, r.Name))
	}
	return strings.Join(out, "\n")
}

func ExportJSON(data []Row) string {
	parts := make([]string, len(data))
	for i, r := range data {
		parts[i], _ = marshal(r)
	}
	return "[" + strings.Join(parts, ",") + "]" // same skeleton, copied
}
```

**✅ Idiomatic**

```go
package export

// Go has no inheritance: express the "template" as a function taking the
// varying steps (this is Template Method realized via composition/Strategy).
type Format struct {
	Header string
	Row    func(Row) string
	Wrap   func(lines []string) string
}

func Export(data []Row, f Format) string { // the fixed skeleton
	lines := make([]string, 0, len(data)+1)
	if f.Header != "" {
		lines = append(lines, f.Header)
	}
	for _, r := range data {
		lines = append(lines, f.Row(r))
	}
	return f.Wrap(lines)
}

var CSV = Format{
	Header: "id,name",
	Row:    func(r Row) string { return fmt.Sprintf("%d,%s", r.ID, r.Name) },
	Wrap:   func(l []string) string { return strings.Join(l, "\n") },
}
```

**🧠 Tradeoff** — Without inheritance, Go realizes Template Method by passing the varying steps into
a skeleton function — which is composition, i.e. Strategy. That's the point: the two patterns
converge when you can't (or won't) subclass. If you want a partial default, embed a struct with
default step methods and let callers override by shadowing — but the function-fields form above is
the more idiomatic Go.

## Applications

Where Template Method shows up in practice:

- **Frontend** — component lifecycle skeletons (mount/render/unmount hooks), export/serialization
  flows, wizard step frameworks.
- **Backend** — ETL/data pipelines, request-handling skeletons, test setup/teardown harnesses,
  batch-job runners with overridable steps.
- **Both** — any "fixed sequence, varying steps" algorithm.

## Related Patterns

- **Strategy** — Template Method varies steps via inheritance (compile-time); Strategy injects the
  whole algorithm via composition (runtime). In languages without inheritance they converge.
- **Factory Method** — often *is* a step within a template method (the base defines the flow, a
  factory step creates the object it needs).
