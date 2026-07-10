---
id: llm-as-judge
category: ai
sequence: 13
title: LLM-as-Judge
also_known_as: [Model-Graded Evaluation, AI Evaluator]
gof: false
kind: pattern
intent: "Use a model to evaluate outputs against a rubric — scoring, comparing, or gating — where no deterministic check exists."
frequency: high
difficulty: intermediate
tags: [ai, llm, evaluation, judge, quality, testing]
related: [reflection, guardrails, strategy, structured-output]
languages: [javascript, python, elixir, go]
---

## Intent

LLM-as-Judge uses one model to evaluate another's output. When there's no exact-match test — is this
summary faithful? is this answer helpful? which of two replies is better? — you give a judge model a
**rubric** and a candidate, and it returns a score, a verdict, or a preference. It's how you evaluate
open-ended generation at a scale humans can't, and it powers evals, [[reflection]], and output
[[guardrails]].

## The Problem

Most LLM output can't be checked with `==`:

- **No ground truth** — "summarize this article" has a thousand good answers and no single correct
  one. String comparison and BLEU/ROUGE scores barely correlate with quality.
- **Humans don't scale** — you can hand-grade fifty outputs, not fifty thousand, and not on every
  deploy.
- **The criteria are semantic** — faithfulness, relevance, tone, safety are judgments about meaning,
  exactly what a model is good at and a regex is not.

A model, given a clear rubric, can render these judgments consistently and cheaply — turning
"quality" into a measurable, automatable signal.

## Structure

Key Components / Participants:

- **Rubric** — explicit, gradeable criteria (not "is it good" but "does it cite a source for every
  claim").
- **Judge** — a model call that applies the rubric to a candidate and returns a *structured* verdict.
- **Mode** — *pointwise* (score one output), *pairwise* (pick the better of two), or *reference-based*
  (compare against a gold answer).

```
candidate ─┐
rubric ────┼──▶ judge (model) ──▶ { score / verdict / winner, reasoning }
reference ─┘        │
              structured output, so the score is machine-usable
```

## When to Use

- Evaluating open-ended output where no deterministic check works.
- Running evals at scale — regression testing prompts, comparing model versions.
- Gating output before it reaches a user (as a [[guardrails]] check).
- Ranking or selecting among several candidate generations.

## Advantages and Disadvantages

### Advantages
- Evaluates semantic quality that exact-match and n-gram metrics miss.
- Scales past human grading — thousands of judgments, on every change.
- The rubric is explicit and the judge returns reasoning you can audit.
- One judge serves eval, reflection, and guardrails behind one interface.

### Disadvantages
- The judge has biases — position bias (favors the first option), length bias (favors longer),
  self-preference (favors its own model family).
- A vague rubric produces noisy, inconsistent scores.
- It's an approximation of human judgment, not a replacement — calibrate against human labels.
- Costs a model call per evaluation.

## Common Mistakes

- **Vague rubrics** — "rate the quality 1–10" gives noise. Decompose into concrete, independently
  gradeable criteria and ask for evidence per criterion.
- **Ignoring position bias in pairwise** — the judge favors whichever candidate comes first. Swap the
  order and average, or randomize.
- **No reasoning before the score** — ask the judge to reason *then* score; a bare number is less
  reliable and unauditable.
- **Trusting the judge blindly** — validate it against a set of human-labeled examples before you
  trust its scores; recalibrate when the model changes.
- **Judge same-model-as-generator for high stakes** — self-preference bias inflates scores; use a
  different or stronger judge when it matters.

## Key Takeaways

- Use a rubric-driven model to score what has no deterministic check.
- Decompose the rubric into concrete criteria; ask for reasoning before the verdict.
- Control for position and length bias, especially in pairwise comparisons.
- Calibrate the judge against human labels; it approximates, it doesn't replace.

## Implementations

The judge takes a candidate and a rubric and returns a *structured* verdict. The naive version
substring-matches an expected answer; the idiomatic version asks a model to grade against criteria.

### JavaScript

**❌ Naive**

```js
// Substring match — fails on any valid paraphrase.
function evaluate(output, expected) {
  return output.includes(expected) ? "pass" : "fail";
}
```

**✅ Idiomatic**

```js
async function judge(candidate, rubric) {
  return callStructured(
    { type: "object",
      properties: {
        reasoning: { type: "string" },
        score: { type: "integer", minimum: 1, maximum: 5 },
        pass: { type: "boolean" },
      },
      required: ["reasoning", "score", "pass"] },
    `Evaluate the candidate against the rubric. Reason first, then score 1-5 and pass/fail.\n\n` +
    `Rubric:\n${rubric}\n\nCandidate:\n${candidate}`);
}

// Pairwise: judge twice with the order swapped, average, to cancel position bias.
async function compare(a, b, rubric) {
  const [ab, ba] = await Promise.all([judge2(a, b, rubric), judge2(b, a, rubric)]);
  return ab.winner === "first" && ba.winner === "second" ? "a" : "tie-or-b";
}
```

**🧠 Tradeoff** — The judge returns structured `{ reasoning, score, pass }` — reasoning before the score,
so the verdict is auditable and more reliable. `compare` runs the pairwise judgment both ways to cancel
position bias, the single most common judge failure. The cost is a model call per evaluation plus the
need to calibrate the rubric against human labels before you trust the numbers.

### Python

**❌ Naive**

```python
def evaluate(output: str, expected: str) -> str:
    return "pass" if expected in output else "fail"
```

**✅ Idiomatic**

```python
class Verdict(BaseModel):
    reasoning: str
    score: int      # 1..5
    passed: bool

def judge(candidate: str, rubric: str) -> Verdict:
    return call_structured(
        Verdict,
        f"Evaluate the candidate against the rubric. Reason first, then score 1-5 and pass/fail.\n\n"
        f"Rubric:\n{rubric}\n\nCandidate:\n{candidate}",
    )

def compare(a: str, b: str, rubric: str) -> str:     # pairwise, bias-controlled
    ab = judge_pair(a, b, rubric)
    ba = judge_pair(b, a, rubric)                     # swapped order
    return "a" if ab.winner == "first" and ba.winner == "second" else "tie"
```

**🧠 Tradeoff** — A Pydantic `Verdict` types the judge's output; reasoning-then-score is baked into the
schema order. Running the pairwise comparison twice with swapped inputs is the standard defense against
position bias. Passing a *stronger* model to `judge` for high-stakes evaluation is a one-line change —
the seam is the injected model, same as [[reflection]]'s critic.

### Elixir

**❌ Naive**

```elixir
def evaluate(output, expected) do
  if String.contains?(output, expected), do: :pass, else: :fail
end
```

**✅ Idiomatic**

```elixir
defmodule Judge do
  @schema %{
    "type" => "object",
    "properties" => %{
      "reasoning" => %{"type" => "string"},
      "score" => %{"type" => "integer", "minimum" => 1, "maximum" => 5},
      "pass" => %{"type" => "boolean"}
    },
    "required" => ["reasoning", "score", "pass"]
  }

  def judge(candidate, rubric) do
    call_structured(@schema,
      "Evaluate against the rubric. Reason first, then score 1-5 and pass/fail.\n\nRubric:\n#{rubric}\n\nCandidate:\n#{candidate}")
  end

  # Pairwise with order swapped to cancel position bias — the two calls run concurrently.
  def compare(a, b, rubric) do
    [{a, b}, {b, a}]
    |> Task.async_stream(fn {x, y} -> judge_pair(x, y, rubric) end)
    |> Enum.map(fn {:ok, v} -> v end)
    |> decide()
  end
end
```

**🧠 Tradeoff** — The judge is a structured HTTP call; `compare` uses `Task.async_stream` to run both
orderings concurrently before deciding — the bias control comes with the concurrency for free. Keeping
the rubric as a module attribute makes it the single, reviewable source of the evaluation criteria. A
stronger judge model is a config swap.

### Go

**❌ Naive**

```go
func Evaluate(output, expected string) string {
    if strings.Contains(output, expected) {
        return "pass"
    }
    return "fail"
}
```

**✅ Idiomatic**

```go
type Verdict struct {
    Reasoning string `json:"reasoning"`
    Score     int    `json:"score"` // 1..5
    Pass      bool   `json:"pass"`
}

func Judge(candidate, rubric string) (Verdict, error) {
    return CallStructured[Verdict](
        "Evaluate against the rubric. Reason first, then score 1-5 and pass/fail.\n\n" +
            "Rubric:\n" + rubric + "\n\nCandidate:\n" + candidate)
}

// Pairwise, both orderings, to cancel position bias.
func Compare(a, b, rubric string) string {
    var ab, ba Pair
    var wg sync.WaitGroup
    wg.Add(2)
    go func() { defer wg.Done(); ab = JudgePair(a, b, rubric) }()
    go func() { defer wg.Done(); ba = JudgePair(b, a, rubric) }()
    wg.Wait()
    if ab.Winner == "first" && ba.Winner == "second" {
        return "a"
    }
    return "tie"
}
```

**🧠 Tradeoff** — A typed `Verdict` and an `(Verdict, error)` return make the judgment machine-usable and
its failure explicit. `Compare` fans the two orderings out to goroutines to control position bias. The
whole pattern hinges on rubric quality, not code — the same reason evals need calibration against human
labels before the scores mean anything.

## Applications

Real-world uses of LLM-as-Judge:

- **Prompt & model evals** — regression-test prompts and compare model versions at scale.
- **RAG evaluation** — score answer faithfulness and retrieval relevance without gold answers.
- **Reflection critic** — the judge is the evaluator in a generate-critique-revise loop.
- **Output guardrail** — gate a response on a safety/quality verdict before it ships.
- **Ranking** — pick the best of N generations, or rank search results by relevance.

**In modern systems:**

- **Multi-agent** — a reviewer agent grades a worker's output before it's accepted downstream.
- **Workflow engine** — a quality-gate step that passes or fails an artifact against a rubric.
- **Low-code** — an automated "does this meet the bar" check on generated content before publish.

## Related Patterns

- **Reflection** — the judge is the critic in a self-improvement loop.
- **Guardrails** — a judge verdict is one guardrail among schema, content, and policy checks.
- **Strategy** — pointwise / pairwise / reference-based are interchangeable judging strategies.
- **Structured Output** — the judge must return a machine-usable verdict, not prose.
