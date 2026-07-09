---
id: golden-hammer
category: anti-patterns
kind: anti-pattern
sequence: 3
title: Golden Hammer
also_known_as: [Law of the Instrument, "If all you have is a hammer…"]
gof: false
intent: "Over-relying on one familiar tool, pattern, or technology for every problem — reaching for what you know instead of what fits, so solutions get forced into the wrong shape."
frequency: high
difficulty: beginner
tags: [anti-pattern, tooling, judgment, over-engineering, fit]
related: [strategy, premature-optimization, singleton]
languages: [javascript, python, go]
---

## The Anti-Pattern

"When all you have is a hammer, everything looks like a nail." The **Golden Hammer** is the habit of
applying one favored tool — a language, a framework, a design pattern, a database — to **every** problem,
regardless of whether it fits. The tool becomes the default answer before the question is even understood.

It's a failure of judgment, not of the tool. The tool may be excellent for its purpose; the anti-pattern is
using it *outside* that purpose because it's familiar. The result is solutions bent into awkward shapes:
a graph problem forced into SQL joins, a simple script dragged into a heavyweight framework, a design
pattern applied where a plain function would do.

## How It Happens

- **Familiarity bias** — you know the tool deeply, so reaching for it is fast and comfortable, and learning
  an alternative feels expensive.
- **Sunk-cost & investment** — the team has invested in the tool (licenses, expertise, infrastructure), so
  everything must justify using it.
- **Resume-driven / hype-driven** — a shiny technology (microservices, Kubernetes, a new framework) is
  applied everywhere because it's exciting, not because it fits.
- **Pattern zealotry** — having just learned a design pattern, applying it to everything (the "pattern
  happy" phase).

## Why It Hurts

- **Poor fit, accidental complexity** — forcing the problem into the wrong tool's model adds workarounds and
  complexity that the right tool wouldn't need.
- **Worse performance/cost** — the ill-fitting tool is slower, more expensive, or more fragile for this job.
- **Blind spots** — over-relying on one approach means you don't see simpler or better solutions.
- **Over-engineering** — a heavyweight tool for a lightweight problem buries a simple need under machinery.
- **Stagnation** — the team never learns alternatives, so the Golden Hammer becomes the only tool they *can*
  reach for.

## The Refactor

Match the tool to the problem:

- **Understand the problem first** — characterize the actual requirements before choosing a tool, not after.
- **Consider alternatives** — deliberately list a couple of different approaches and their trade-offs, even
  if you expect to pick the familiar one.
- **Right-size the solution** — a plain function instead of a pattern; a file instead of a database; a script
  instead of a framework — when that's what the problem needs.
- **Expand the toolbox** — invest in learning complementary tools so "what I know" and "what fits" overlap
  more often.

```
Familiar Tool ──force-fit──► "queue problem" · "cache problem" · "graph problem"
   (one hammer)               ──► instead: pick the tool that matches each problem
```

## Warning Signs

- Every design discussion ends with the same technology, regardless of the problem.
- Solutions have awkward workarounds to make the chosen tool "kind of" work.
- "We use X for everything" stated with pride rather than justification.
- Reaching for a pattern/framework before understanding the requirement.
- The team can't articulate when they *wouldn't* use their default tool.

## Key Takeaways

- The Golden Hammer applies one familiar tool to every problem regardless of fit.
- It's a judgment failure, not a tool failure — the tool may be great, just misapplied.
- The result is forced solutions, accidental complexity, and blind spots.
- Understand the problem, weigh alternatives, and right-size the solution — sometimes the answer is a plain
  function.

## Implementations

### JavaScript

**❌ The Smell**

```js
// Reaching for a heavyweight state-management library for trivial local UI state.
import { configureStore, createSlice } from "@reduxjs/toolkit"; // for... a toggle?
const modalSlice = createSlice({
  name: "modal",
  initialState: { open: false },
  reducers: { toggle: (s) => { s.open = !s.open; } },
});
const store = configureStore({ reducer: { modal: modalSlice.reducer } });
// ...actions, dispatch, selectors, a provider — all to open a modal
```

**✅ The Refactor**

```js
// The right-sized tool: local component state.
function Modal() {
  const [open, setOpen] = useState(false); // that's it
  return open ? <Dialog onClose={() => setOpen(false)} /> : <button onClick={() => setOpen(true)}>Open</button>;
}
// Reach for Redux/Zustand when state is genuinely shared and complex — not for a toggle.
```

**🧠 The Fix** — Redux is a fine tool *for shared, complex application state*; using it for a modal toggle is
the Golden Hammer — ceremony and indirection for a one-line `useState`. The fix isn't "never use Redux," it's
matching the tool to the need: local state for local concerns, a store when state is actually shared. Ask
"what does this problem need?" before "what do I always use?".

### Python

**❌ The Smell**

```python
# Spinning up pandas + a DataFrame to sum a short list of numbers.
import pandas as pd
def total(prices):
    df = pd.DataFrame({"price": prices})   # a whole DataFrame...
    return df["price"].sum()               # ...to add a few numbers
```

**✅ The Refactor**

```python
# The right-sized tool: the standard library.
def total(prices):
    return sum(prices)   # done

# pandas is superb for real tabular/analytical work — importing it to sum a list is the hammer.
```

**🧠 The Fix** — pandas is the right tool for real dataframes and analytics; reaching for it to `sum` a short
list adds a heavyweight dependency and object churn for something `sum()` does. The anti-pattern is defaulting
to the powerful familiar tool regardless of scale. Right-size: the standard library for small jobs, pandas
when the data and operations actually warrant it.

### Go

**❌ The Smell**

```go
// Standing up a full microservice (HTTP server, Docker, deploy) for a nightly cron task.
func main() {
    http.HandleFunc("/run", runJob)      // a whole service...
    http.ListenAndServe(":8080", nil)    // ...triggered by an external scheduler hitting it
}
// plus a Dockerfile, k8s manifests, CI pipeline, health checks — for one nightly job
```

**✅ The Refactor**

```go
// The right-sized tool: a plain program run by cron/a scheduler.
func main() {
    if err := runJob(context.Background()); err != nil {
        log.Fatal(err)
    }
}
// build a binary; a cron entry or a scheduled job runs it. No server, no k8s, no HTTP.
```

**🧠 The Fix** — Microservices and Kubernetes are the right tools for independently-scaled, long-running
services; wrapping a nightly batch job in an HTTP service plus container orchestration is the Golden Hammer —
enormous operational overhead for a task a cron-run binary handles. The fix is right-sizing: a scheduled
program for a scheduled job. Reach for the service architecture when the problem is actually a service.

## Related Patterns

- **Strategy** — the constructive opposite: instead of one hammer, define a family of interchangeable
  approaches and pick the one that fits the situation.
- **Premature Optimization** — a sibling judgment failure: applying effort (there, optimization; here, a
  heavyweight tool) before the problem justifies it.
- **Singleton** — often a Golden Hammer in the design-pattern world: reached for reflexively where a plain
  value or dependency injection would serve better.
