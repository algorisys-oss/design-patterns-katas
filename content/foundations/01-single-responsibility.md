---
id: single-responsibility
category: foundations
kind: principle
sequence: 1
title: Single Responsibility Principle
also_known_as: [SRP]
gof: false
intent: "A class or module should have one reason to change — one job, one owner of that job."
frequency: high
difficulty: beginner
tags: [solid, srp, cohesion, separation-of-concerns, maintainability]
related: [open-closed, dependency-inversion, facade, strategy]
languages: [javascript, python, elixir, go]
---

## The Principle

> A module should have one, and only one, reason to change.

"Responsibility" here means *a reason to change*, tied to one stakeholder or concern. A class
that formats a report, computes its numbers, and emails it has three reasons to change —
accounting rules, layout, and delivery — pulled by three different people. SRP says split those
so each concern lives in its own unit.

This is the principle the design patterns keep leaning on: Strategy, Facade, and Decorator all
exist to give one concern one home.

## The Smell

One class doing unrelated jobs, so a change to one drags in the others and tests need the world:

```
class Report {
  computeTotals() { /* accounting logic */ }
  renderHtml()    { /* presentation logic */ }
  sendEmail()     { /* delivery logic */ }
  saveToDisk()    { /* persistence logic */ }
}
// change the email provider → edit the class that also owns accounting math
```

## Why It Matters

- Changes stay local — a layout tweak can't break the totals.
- Each concern is testable alone, without mocking the others.
- Code is easier to name and find: the class does what its name says.

## Benefits and Cautions

### Benefits
- High cohesion; low blast radius for changes.
- Small, focused units that are easy to test and reuse.

### Cautions
- Taken too far it fragments logic into a hundred one-method classes.
- "One responsibility" is a judgment call — group by *reason to change*, not by counting methods.

## Common Mistakes

- **Confusing "one responsibility" with "one method"** — a class can have several methods that
  all serve one concern.
- **Splitting by noun, not by change reason** — the useful axis is who asks for the change.
- **Over-fragmenting** — swinging so far that following one feature means opening ten files.

## Key Takeaways

- SRP = one reason to change per unit.
- Group code by the stakeholder/concern that drives its change.
- It's the seed of most patterns: give each concern its own home.

## Implementations

Splitting a `Report` that computes, renders, and delivers.

### JavaScript

**❌ Naive**

```js
// Three concerns, three reasons to change, one class.
class Report {
  constructor(data) { this.data = data; }
  computeTotals() { return this.data.reduce((a, b) => a + b, 0); }
  renderHtml() { return `<b>${this.computeTotals()}</b>`; }
  send(mailer) { mailer.send(this.renderHtml()); }
}
```

**✅ Idiomatic**

```js
// Each concern owns its change reason.
class ReportCalculator {
  totals(data) { return data.reduce((a, b) => a + b, 0); }
}
class ReportRenderer {
  html(total) { return `<b>${total}</b>`; }
}
class ReportMailer {
  constructor(mailer) { this.mailer = mailer; }
  send(html) { this.mailer.send(html); }
}

// Composed at the edge:
const total = new ReportCalculator().totals(data);
const html = new ReportRenderer().html(total);
new ReportMailer(mailer).send(html);
```

**🧠 Note** — Now an accounting change touches only `ReportCalculator`, a layout change only
`ReportRenderer`. The composition moves to a coordinator (a Facade would be a natural home). The
cost is more classes; the win is that each changes for exactly one reason.

### Python

**❌ Naive**

```python
class Report:
    def __init__(self, data):
        self.data = data
    def compute_totals(self):
        return sum(self.data)
    def render_html(self):
        return f"<b>{self.compute_totals()}</b>"
    def send(self, mailer):
        mailer.send(self.render_html())
```

**✅ Idiomatic**

```python
class ReportCalculator:
    def totals(self, data: list[int]) -> int:
        return sum(data)

class ReportRenderer:
    def html(self, total: int) -> str:
        return f"<b>{total}</b>"

class ReportMailer:
    def __init__(self, mailer):
        self._mailer = mailer
    def send(self, html: str) -> None:
        self._mailer.send(html)

total = ReportCalculator().totals(data)
html = ReportRenderer().html(total)
ReportMailer(mailer).send(html)
```

**🧠 Note** — In Python these can even be plain functions in separate modules
(`calc.py`, `render.py`, `deliver.py`) — the unit of responsibility is the *module*, not
necessarily a class. Either way, each file has one reason to change.

### Elixir

**❌ Naive**

```elixir
defmodule Report do
  def compute_totals(data), do: Enum.sum(data)
  def render_html(data), do: "<b>#{compute_totals(data)}</b>"
  def send(data, mailer), do: mailer.send(render_html(data))
end
```

**✅ Idiomatic**

```elixir
# Each concern is its own module.
defmodule Report.Calculator do
  def totals(data), do: Enum.sum(data)
end

defmodule Report.Renderer do
  def html(total), do: "<b>#{total}</b>"
end

defmodule Report.Mailer do
  def send(html, mailer), do: mailer.send(html)
end

# Composed in a pipeline:
data
|> Report.Calculator.totals()
|> Report.Renderer.html()
|> Report.Mailer.send(mailer)
```

**🧠 Note** — Elixir's natural unit of responsibility is the module, and the pipe composes the
concerns into a readable flow. Splitting by concern also plays to the language's strength: each
module is a set of pure functions you can test in isolation.

### Go

**❌ Naive**

```go
type Report struct{ Data []int }

func (r Report) ComputeTotals() int {
	sum := 0
	for _, n := range r.Data {
		sum += n
	}
	return sum
}
func (r Report) RenderHTML() string      { return fmt.Sprintf("<b>%d</b>", r.ComputeTotals()) }
func (r Report) Send(m Mailer) { m.Send(r.RenderHTML()) }
```

**✅ Idiomatic**

```go
package report

type Calculator struct{}

func (Calculator) Totals(data []int) int {
	sum := 0
	for _, n := range data {
		sum += n
	}
	return sum
}

type Renderer struct{}

func (Renderer) HTML(total int) string { return fmt.Sprintf("<b>%d</b>", total) }

type Mailer struct{ Client MailClient }

func (m Mailer) Send(html string) { m.Client.Send(html) }
```

**🧠 Note** — Go leans on small packages and types with a tight method set. Separating the three
concerns into `Calculator`, `Renderer`, and `Mailer` keeps each type's method set cohesive, and
a coordinator wires them — each type now has a single axis of change.

## Applications

Where SRP shows up in practice:

- **Layered architecture** — controller / service / repository each own one concern.
- **Reporting/exporting** — compute, format, and deliver as separate units.
- **Auth** — token issuing, verification, and storage split apart.
- **Logging** — formatting vs transport vs level filtering.

## Related Principles & Patterns

- **Open/Closed** — SRP-sized units are easier to extend without modification.
- **Facade** — a coordinator that composes single-responsibility units behind one call.
- **Strategy / Decorator** — each pulls one varying concern into its own object.
