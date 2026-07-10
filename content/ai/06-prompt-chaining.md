---
id: prompt-chaining
category: ai
sequence: 6
title: Prompt Chaining
also_known_as: [LLM Pipeline, Task Decomposition]
gof: false
kind: pattern
intent: "Break a complex task into a sequence of focused model calls, each doing one step and feeding the next, instead of one overloaded prompt."
frequency: high
difficulty: intermediate
tags: [ai, llm, prompt-chaining, pipeline, decomposition]
related: [structured-output, pipes-and-filters, chain-of-responsibility, reflection]
languages: [javascript, python, elixir, go]
---

## Intent

Prompt Chaining decomposes a hard task into a pipeline of small, focused model calls. Each step does
one thing — extract, then classify, then draft, then format — and passes its output to the next.
Each step is easier to prompt, cheaper to run at the right model size, and simple to test in
isolation, so the whole is more reliable than one prompt asked to do everything at once.

## The Problem

The instinct is to write one mega-prompt: "read this email, extract the customer's issue, classify
its urgency, look up the relevant policy, draft a reply, and format it as JSON." The model tries to
do all five in one pass and does each of them a little worse:

- Errors compound silently — a misread issue produces a wrong classification produces a wrong reply,
  with no place to catch it.
- You can't tell *which* sub-task failed when the output is bad.
- You can't insert a check, a retry, or a human between steps.
- Every sub-task pays for the biggest model, even the trivial ones.

Splitting the task into steps makes each step legible, testable, and independently improvable.

## Structure

Key Components / Participants:

- **Steps** — each a focused prompt (often with its own [[structured-output]] schema) doing one
  sub-task.
- **Pipeline** — runs the steps in order, threading each output into the next input.
- **Gates (optional)** — a check between steps that can retry, branch, or stop the chain early.

```
input ──▶ step 1 ──▶ step 2 ──▶ step 3 ──▶ output
          extract    classify   draft
             │           │          │
             └── each: focused prompt, own schema, testable alone
                     (optional gate between steps: retry / branch / stop)
```

## When to Use

- A task naturally splits into stages with distinct instructions.
- One prompt is doing too much and quality suffers.
- You want to check, retry, or gate between stages (validation, human approval).
- Different stages suit different model sizes (cheap extract, strong reasoning).

## Advantages and Disadvantages

### Advantages
- Each step is simpler to prompt and easier to get right.
- Failures are localized — you know which stage broke.
- Gates enable validation, retries, and human-in-the-loop between steps.
- Right-size the model per step; cheap steps don't pay for the expensive model.

### Disadvantages
- More calls means more latency and orchestration than a single prompt.
- Errors still propagate down the chain if you don't gate.
- Over-decomposition adds steps (and cost) without adding quality.

## Common Mistakes

- **Chaining what one call handles fine** — not every task needs a pipeline; a simple ask stays one
  call. Decompose when quality actually suffers.
- **Passing prose between steps** — free text is a lossy, fragile interface. Pass validated
  structured output between stages ([[structured-output]]).
- **No gate on a critical step** — if step 2's output must be valid for step 3, check it; don't let a
  bad value flow downstream.
- **Ignoring accumulated latency** — five sequential calls can blow an interactive budget; parallelize
  independent steps and cache stable ones.

## Key Takeaways

- Decompose a hard task into focused steps; each is easier and testable.
- Thread *structured* output between steps, not prose.
- Gate critical steps to catch failures before they propagate.
- Chain only when it helps — over-decomposition is its own cost.

## Implementations

Each step is a function taking the previous result and returning the next; the pipeline runs them in
order. The naive version is one overloaded call; the idiomatic version is a composed pipeline with a
gate.

### JavaScript

**❌ Naive**

```js
// One prompt does extract + classify + draft — each a little worse, un-debuggable.
async function handle(email) {
  return callModel(
    `Read this email, classify urgency, and draft a reply:\n${email}`);
}
```

**✅ Idiomatic**

```js
const extractIssue = (email) => callStructured(issueSchema, `Extract the issue:\n${email}`);
const classify     = (issue) => callStructured(urgencySchema, `Classify urgency:\n${issue.text}`);
const draft        = (ctx)   => callModel(`Draft a ${ctx.urgency} reply about: ${ctx.issue.text}`);

async function handle(email) {
  const issue = await extractIssue(email);
  const { urgency } = await classify(issue);
  if (urgency === "unknown") throw new Error("classification failed — gate"); // gate
  return draft({ issue, urgency });
}
```

**🧠 Tradeoff** — Three named steps, each a focused call passing *structured* results forward, with a
gate before the expensive draft. Each step is unit-testable with a fake `callModel`. The cost is three
round trips instead of one — worth it when the single prompt was unreliable; overkill when it wasn't.

### Python

**❌ Naive**

```python
def handle(email: str) -> str:
    return call_model(f"Read this email, classify urgency, and draft a reply:\n{email}")
```

**✅ Idiomatic**

```python
def extract_issue(email: str) -> Issue:
    return call_structured(Issue, f"Extract the issue:\n{email}")

def classify(issue: Issue) -> Urgency:
    return call_structured(Urgency, f"Classify urgency:\n{issue.text}")

def draft(issue: Issue, urgency: str) -> str:
    return call_model(f"Draft a {urgency} reply about: {issue.text}")

def handle(email: str) -> str:
    issue = extract_issue(email)
    urgency = classify(issue).level
    if urgency == "unknown":            # gate before the costly step
        raise ValueError("classification failed")
    return draft(issue, urgency)
```

**🧠 Tradeoff** — Plain functions compose the chain; typed structured returns make each seam explicit
and testable. Because steps are ordinary functions, wrapping the pipeline in `functools.reduce` over a
step list, or parallelizing independent steps with `asyncio.gather`, is a small change. Keep the gate —
it's what stops a bad classification from producing a confidently-wrong reply.

### Elixir

**❌ Naive**

```elixir
def handle(email), do: call_model("Classify urgency and draft a reply:\n#{email}")
```

**✅ Idiomatic**

```elixir
defmodule Support do
  def handle(email) do
    with {:ok, issue} <- extract_issue(email),
         {:ok, %{level: level}} when level != "unknown" <- classify(issue) do
      {:ok, draft(issue, level)}
    else
      _ -> {:error, :classification_failed}   # the gate
    end
  end

  defp extract_issue(email), do: call_structured(Issue, "Extract the issue:\n#{email}")
  defp classify(issue), do: call_structured(Urgency, "Classify urgency:\n#{issue.text}")
  defp draft(issue, level), do: call_model("Draft a #{level} reply about: #{issue.text}")
end
```

**🧠 Tradeoff** — The `with` chain *is* the pipeline: each step returns `{:ok, _}` or `{:error, _}`, and
the guard `when level != "unknown"` is the gate expressed as a pattern — a mismatch falls to `else`.
This is the most natural fit of any language, because Elixir's pipeline-and-`with` idiom was built for
"a sequence of steps, any of which can fail." No exceptions, just data.

### Go

**❌ Naive**

```go
func Handle(email string) string {
    return CallModel("Classify urgency and draft a reply:\n" + email)
}
```

**✅ Idiomatic**

```go
func Handle(email string) (string, error) {
    issue, err := ExtractIssue(email)
    if err != nil {
        return "", fmt.Errorf("extract: %w", err)
    }
    urgency, err := Classify(issue)
    if err != nil {
        return "", fmt.Errorf("classify: %w", err)
    }
    if urgency.Level == "unknown" { // gate
        return "", errors.New("classification failed")
    }
    return Draft(issue, urgency.Level)
}
```

**🧠 Tradeoff** — Go has no pipeline sugar, so the chain is explicit: each step returns a value and an
error, checked and wrapped so a failure names its stage. It's more verbose than the `with` form, but
the verbosity *is* the gate — every seam is a visible decision point. For a dynamic step list, define a
`type Step func(any) (any, error)` and fold over a slice; for a fixed chain, the straight-line form is
clearest.

## Applications

Real-world uses of Prompt Chaining:

- **Content pipelines** — outline → draft → edit → format, each a focused call.
- **Support triage** — extract → classify → route → draft reply.
- **Extract-then-reason** — pull structured facts, then reason over them separately (cleaner than both at once).
- **Translate-then-check** — translate, then a second call verifies fidelity.
- **RAG** — rewrite query → retrieve → answer → verify against sources is itself a chain.

**In modern systems:**

- **Low-code** — a value flows through parse → validate → format model steps declared in config.
- **Workflow engine** — this *is* a workflow of LLM steps; the engine's pipes-and-filters over prompts.
- **Multi-agent** — a single agent's internal plan is often a fixed chain before it reaches for other agents.

## Related Patterns

- **Structured Output** — the safe interface between chain steps; pass data, not prose.
- **Pipes and Filters** — the general architecture; prompt chaining is the LLM instance of it.
- **Chain of Responsibility** — a chain where a step may *stop* the flow, not just transform it.
- **Reflection** — a chain that loops a "critique and revise" step back onto the draft.
