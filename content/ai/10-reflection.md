---
id: reflection
category: ai
sequence: 10
title: Reflection
also_known_as: [Self-Critique, Generate-Critique-Revise, Self-Refine]
gof: false
kind: pattern
intent: "Have the model critique its own output against criteria and revise it, looping until it passes or a limit is hit."
frequency: medium
difficulty: intermediate
tags: [ai, llm, reflection, self-critique, quality]
related: [react, llm-as-judge, prompt-chaining, template-method]
languages: [javascript, python, elixir, go]
---

## Intent

Reflection improves an answer by making the model review its own work. Generate a draft, then ask
the model to **critique** it against explicit criteria, then **revise** based on the critique —
looping until the critique finds nothing wrong or you hit a cap. Models are often better at spotting
a flaw in a finished draft than at avoiding it in the first pass, and Reflection harnesses that gap.

## The Problem

A first draft ships whatever the model produced in one pass — including the mistakes it would have
caught if asked to look:

- A summary that missed the key caveat, code that doesn't handle the empty case, an answer that
  contradicts a source it was given.
- Prompting harder ("be careful, double-check everything") helps a little but still bakes the review
  into the same forward pass that made the error.

Separating *generation* from *evaluation* — draft, then critique, then fix — catches errors the
single pass didn't, because the model now judges a concrete artifact instead of predicting the next
token.

## Structure

Key Components / Participants:

- **Generator** — produces (and later revises) the draft.
- **Critic** — evaluates the draft against criteria and returns concrete, actionable feedback (or
  "looks good"). May be the same model or a separate one (a [[llm-as-judge]]).
- **Loop** — generate → critique → revise, stopping when the critic passes or a max-iterations cap
  is reached.

```
task ──▶ generate ──▶ draft ──┐
                              ▼
                          critique ──▶ pass? ──yes──▶ final
                              │           ▲
                              no          │
                              ▼           │
                          revise ─────────┘  (loop, capped)
```

## When to Use

- Output quality matters more than latency (reports, code, important replies).
- You can state explicit criteria the critic checks against (correctness, completeness, tone).
- First-pass output is decent but inconsistent, and the model can spot its own errors.
- You have budget for extra calls per task.

## Advantages and Disadvantages

### Advantages
- Catches errors the single pass missed, often substantially improving quality.
- Criteria are explicit and inspectable — you can see *why* a draft was revised.
- Works with a separate critic model for independent judgment.
- The loop naturally stops when quality is reached.

### Disadvantages
- Multiplies calls (and latency and cost) per task.
- A self-critiquing model can be blind to its own systematic errors — a separate critic helps.
- Diminishing returns: after a couple of rounds, revisions rarely improve.
- A vague critic ("make it better") produces churn without progress.

## Common Mistakes

- **No iteration cap** — reflection can loop indefinitely chasing marginal gains. Cap it (2–3 rounds
  is usually enough).
- **Vague critique prompts** — "improve this" yields aimless rewrites. Give the critic concrete
  criteria and ask for *specific, actionable* feedback.
- **Self-critique for systematic blind spots** — a model that made an error in its worldview may not
  see it in review. Use an independent critic ([[llm-as-judge]]) when the stakes justify it.
- **Reflecting when one pass is fine** — for simple tasks the extra rounds are pure cost. Reserve it
  for output where quality is worth the calls.

## Key Takeaways

- Separate generation from evaluation; the model critiques better than it self-corrects in one pass.
- Give the critic explicit criteria and demand actionable feedback.
- Always cap the loop — returns diminish fast.
- Use an independent critic model for high-stakes or blind-spot-prone work.

## Implementations

The loop is generate → critique → revise. `critique(draft)` returns `{ pass, feedback }`. The naive
version returns the first draft; the idiomatic version loops until the critic passes or `maxRounds`.

### JavaScript

**❌ Naive**

```js
// Ship the first draft, mistakes and all.
async function write(task) {
  return callModel(`Write: ${task}`);
}
```

**✅ Idiomatic**

```js
async function write(task, maxRounds = 3) {
  let draft = await callModel(`Write: ${task}`);
  for (let round = 0; round < maxRounds; round++) {
    const { pass, feedback } = await critique(task, draft);
    if (pass) break;
    draft = await callModel(
      `Revise this draft to address the feedback.\n\n` +
      `Task: ${task}\nDraft: ${draft}\nFeedback: ${feedback}`);
  }
  return draft;
}

const critique = (task, draft) =>
  callStructured(critiqueSchema, // { pass: boolean, feedback: string }
    `Critique the draft against: correctness, completeness, clarity.\n` +
    `Task: ${task}\nDraft: ${draft}`);
```

**🧠 Tradeoff** — The critic returns *structured* feedback (`{ pass, feedback }`) so the loop can branch
on `pass` and feed concrete `feedback` into the revision — not a vague "make it better." `maxRounds` caps
the cost. The buy is real quality on hard tasks; the cost is up to `maxRounds + 1` calls per task, so
gate reflection to work that's worth it.

### Python

**❌ Naive**

```python
def write(task: str) -> str:
    return call_model(f"Write: {task}")
```

**✅ Idiomatic**

```python
def critique(task: str, draft: str) -> Critique:   # {pass: bool, feedback: str}
    return call_structured(
        Critique,
        f"Critique the draft against: correctness, completeness, clarity.\n"
        f"Task: {task}\nDraft: {draft}",
    )

def write(task: str, max_rounds: int = 3) -> str:
    draft = call_model(f"Write: {task}")
    for _ in range(max_rounds):
        c = critique(task, draft)
        if c.passed:
            break
        draft = call_model(
            f"Revise to address the feedback.\n"
            f"Task: {task}\nDraft: {draft}\nFeedback: {c.feedback}"
        )
    return draft
```

**🧠 Tradeoff** — Generate and revise are the same `call_model` with a different prompt; the critic is a
separate structured call. Passing a *different* model to `critique` turns self-reflection into
independent judgment with a one-line change — the seam is already there. Keep the criteria list concrete;
it's what makes the feedback actionable instead of churny.

### Elixir

**❌ Naive**

```elixir
def write(task), do: call_model("Write: #{task}")
```

**✅ Idiomatic**

```elixir
defmodule Reflect do
  def write(task, max_rounds \\ 3) do
    draft = call_model("Write: #{task}")
    refine(task, draft, max_rounds)
  end

  defp refine(_task, draft, 0), do: draft

  defp refine(task, draft, rounds) do
    case critique(task, draft) do
      %{pass: true} -> draft
      %{feedback: fb} ->
        revised =
          call_model("Revise to address the feedback.\nTask: #{task}\nDraft: #{draft}\nFeedback: #{fb}")

        refine(task, revised, rounds - 1)
    end
  end

  defp critique(task, draft),
    do: call_structured(Critique, "Critique against correctness, completeness, clarity.\nTask: #{task}\nDraft: #{draft}")
end
```

**🧠 Tradeoff** — The loop is recursion with the round budget as the base case, and `case` on the
critique's shape branches pass vs. revise — the guardrail is structural. Swapping `critique` to call a
stronger model is a one-line change. The recursive form reads naturally once you see the round count as
"fuel," which is the idiomatic Elixir way to bound a loop.

### Go

**❌ Naive**

```go
func Write(task string) string {
    return CallModel("Write: " + task)
}
```

**✅ Idiomatic**

```go
func Write(task string, maxRounds int) string {
    draft := CallModel("Write: " + task)
    for round := 0; round < maxRounds; round++ {
        c := Critique(task, draft) // {Pass bool; Feedback string}
        if c.Pass {
            break
        }
        draft = CallModel(fmt.Sprintf(
            "Revise to address the feedback.\nTask: %s\nDraft: %s\nFeedback: %s",
            task, draft, c.Feedback))
    }
    return draft
}

func Critique(task, draft string) CritiqueResult {
    return CallStructured[CritiqueResult](
        "Critique against correctness, completeness, clarity.\nTask: " + task + "\nDraft: " + draft)
}
```

**🧠 Tradeoff** — A bounded `for` loop over rounds with an early `break` on pass. `Critique` returns a
typed `CritiqueResult`, so the branch is on a real field, not parsed prose. Making the critic a separate,
stronger model is a config change to `Critique`. The explicit loop makes the cost visible — every round
is a call — which is the right thing to see when deciding whether reflection is worth it here.

## Applications

Real-world uses of Reflection:

- **Code generation** — draft, run tests / self-review, fix, repeat.
- **Writing & editing** — draft then critique for accuracy, tone, and completeness.
- **Math & reasoning** — solve, then check the solution and correct errors.
- **Structured extraction** — extract, then verify every field against the source.
- **Translation** — translate, then a critique pass checks fidelity and fluency.

**In modern systems:**

- **Multi-agent** — a dedicated critic/reviewer agent evaluates a worker's output before it's accepted.
- **Workflow engine** — a "review" step that loops a task back for revision until it passes a rubric.
- **Low-code** — a "polish" action that iteratively refines generated content against quality criteria.

## Related Patterns

- **LLM-as-Judge** — the independent evaluator; the critic in Reflection is often a judge.
- **ReAct Loop** — both loop, but ReAct gathers information while Reflection refines output.
- **Prompt Chaining** — a chain with a critique-and-revise link folded back on itself.
- **Template Method** — generate → critique → revise is a fixed skeleton with pluggable criteria.
