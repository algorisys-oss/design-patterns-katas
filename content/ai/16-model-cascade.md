---
id: model-cascade
category: ai
sequence: 16
title: Model Cascade
also_known_as: [Model Fallback, Tiered Inference, Escalation]
gof: false
kind: pattern
intent: "Try a cheap, fast model first and escalate to a stronger one only when the cheap one isn't confident enough."
frequency: medium
difficulty: intermediate
tags: [ai, llm, cost, cascade, fallback, routing]
related: [router, chain-of-responsibility, circuit-breaker, retry]
languages: [javascript, python, elixir, go]
---

## Intent

A Model Cascade sends each request to the cheapest model that can handle it, escalating only when
needed. Try a small, fast model first; if its answer clears a confidence bar, ship it; if not, fall
back to a stronger, pricier model. Most requests are easy and the cheap model nails them, so you pay
premium prices only for the hard minority — cutting cost and latency without capping quality.

## The Problem

Picking one model tier for everything is wrong both ways:

- **Always the strong model** — you pay top-tier price and latency for "reset my password" and "what
  time is it," which a tiny model answers perfectly. Most traffic is easy; you're overpaying for it.
- **Always the cheap model** — the small model handles the easy majority but botches the genuinely
  hard requests, and there's no path to recover.

The requests differ in difficulty, so the model should too — but you don't know a request's
difficulty until you try. A cascade tries cheap first and escalates on evidence.

## Structure

Key Components / Participants:

- **Tiers** — an ordered list of models, cheapest/fastest first, strongest last.
- **Confidence gate** — decides whether a tier's answer is good enough or the request must escalate
  (self-reported confidence, a validator, a verifier, or an [[llm-as-judge]]).
- **Escalation** — on a failed gate, pass the request (and optionally the failed attempt) to the next
  tier.

```
request ──▶ cheap model ──▶ confident? ──yes──▶ answer
                              │
                              no
                              ▼
                          strong model ──▶ answer   (escalate; last tier is the floor)
```

## When to Use

- Request difficulty varies widely and most requests are easy.
- Model cost or latency is a real constraint and you want to optimize the common case.
- You can define a usable confidence signal (a check, a verifier, or self-reported certainty).
- Also as *fallback*: escalate on error, rate limit, or refusal, not just low confidence.

## Advantages and Disadvantages

### Advantages
- Big cost and latency savings — the cheap model absorbs the easy majority.
- No quality cap — hard requests still reach the strong model.
- Doubles as resilience: escalate on the cheap model's error, timeout, or rate limit.
- Tiers are configurable — add, reorder, or swap models without touching callers.

### Disadvantages
- A bad confidence gate is the whole risk: too lax ships wrong cheap answers; too strict escalates
  everything and saves nothing.
- Escalated requests pay *both* models — worst case is more expensive than going strong first.
- More complexity than a single call; the gate is another thing to build and calibrate.
- Getting a reliable confidence signal from an LLM is genuinely hard.

## Common Mistakes

- **No real confidence signal** — asking the model "are you sure?" is weak; prefer a verifiable check
  (schema validity, a test, a verifier model, agreement between samples).
- **Escalating too often** — if most requests fail the gate, you pay double and save nothing.
  Calibrate the gate on real traffic.
- **Escalating too rarely** — a lax gate ships the cheap model's wrong answers. Measure the false-accept rate.
- **Forgetting the failure path** — a cascade should also escalate on the cheap model's *error* or
  rate limit, not just low confidence (that's the [[circuit-breaker]]/[[retry]] overlap).
- **Ignoring the both-models cost** — track the escalation rate; past a break-even point, going
  strong-first is cheaper.

## Key Takeaways

- Try cheap first, escalate on a confidence (or failure) signal — pay premium only for the hard tail.
- The gate is the crux: calibrate false-accept vs. escalation rate on real traffic.
- Escalation pays both models — watch the escalation rate against break-even.
- The same structure handles fallback on error, rate limit, and refusal.

## Implementations

Tiers are an ordered list of models; a gate decides accept vs. escalate. The naive version always
uses the strong model; the idiomatic version cascades through tiers on the gate.

### JavaScript

**❌ Naive**

```js
// Every request pays for the strong model, including trivial ones.
async function answer(q) {
  return callStrongModel(q);
}
```

**✅ Idiomatic**

```js
// Tiers cheapest-first; `confident` gates accept vs. escalate.
const tiers = [callCheapModel, callMidModel, callStrongModel];

async function answer(question, confident = defaultGate) {
  let last;
  for (const model of tiers) {
    try {
      const res = await model(question);
      if (await confident(question, res)) return res; // accept
      last = res;                                      // escalate
    } catch (err) {
      last = { error: err };                           // also escalate on failure
    }
  }
  return last; // strongest tier is the floor
}
```

**🧠 Tradeoff** — The tier list plus a pluggable `confident` gate is the whole pattern: accept a tier's
answer or fall through to the next, treating an *error* as an automatic escalation. The gate is the crux —
a schema check or a verifier model is far better than self-reported confidence. Watch the escalation rate:
past break-even, escalated requests that pay two models cost more than going strong-first.

### Python

**❌ Naive**

```python
def answer(q: str) -> str:
    return call_strong_model(q)
```

**✅ Idiomatic**

```python
TIERS = [call_cheap_model, call_mid_model, call_strong_model]

def answer(question: str, confident=default_gate) -> str:
    last = None
    for model in TIERS:
        try:
            res = model(question)
            if confident(question, res):     # accept
                return res
            last = res                        # escalate on low confidence
        except (RateLimitError, ModelError):
            continue                          # escalate on failure
    return last                               # strongest tier is the floor
```

**🧠 Tradeoff** — A tier list and an injected gate; escalation happens on both a failed gate and a caught
error, folding the cost cascade and the resilience [[circuit-breaker]]/[[retry]] behavior into one loop.
`confident` is where the engineering lives — agreement across samples, a validator, or an
[[llm-as-judge]] beats "are you sure?". Log which tier answered to keep the escalation rate honest.

### Elixir

**❌ Naive**

```elixir
def answer(q), do: call_strong_model(q)
```

**✅ Idiomatic**

```elixir
defmodule Cascade do
  @tiers [&Models.cheap/1, &Models.mid/1, &Models.strong/1]

  def answer(question, gate \\ &default_gate/2) do
    Enum.reduce_while(@tiers, nil, fn model, _last ->
      case try_tier(model, question) do
        {:ok, res} -> if gate.(question, res), do: {:halt, res}, else: {:cont, res}
        {:error, _} -> {:cont, nil}   # escalate on failure
      end
    end)
  end

  defp try_tier(model, question) do
    {:ok, model.(question)}
  rescue
    _ -> {:error, :failed}
  end
end
```

**🧠 Tradeoff** — `Enum.reduce_while` walks the tiers, `{:halt, res}` accepting on the gate and `{:cont, _}`
escalating on low confidence or a rescued failure — the accumulator carries the last attempt as the floor.
The tier functions are values in a module attribute, so reordering or adding a model is a one-line change.
The `try_tier` rescue folds error-escalation into the same loop, the resilience half of the pattern.

### Go

**❌ Naive**

```go
func Answer(q string) string {
    return CallStrongModel(q)
}
```

**✅ Idiomatic**

```go
type Model func(string) (string, error)

var tiers = []Model{CallCheapModel, CallMidModel, CallStrongModel}

func Answer(question string, confident func(string, string) bool) string {
    var last string
    for _, model := range tiers {
        res, err := model(question)
        if err != nil {
            continue // escalate on failure
        }
        if confident(question, res) {
            return res // accept
        }
        last = res // escalate on low confidence
    }
    return last // strongest tier is the floor
}
```

**🧠 Tradeoff** — A `[]Model` (each a `func(string) (string, error)`) tried in order, with an injected
`confident` gate. The `err != nil` branch escalates on failure, unifying the cost cascade with fallback
resilience. It's plain and testable — add a tier by appending to the slice. The real work, in every
language, is the confidence gate: a cheap verifiable check calibrated on real traffic, not a self-assessment.

## Applications

Real-world uses of the Model Cascade:

- **Cost optimization** — a small model handles the FAQ tail; the strong model handles the hard minority.
- **Latency budgets** — fast model for the common case, escalate only when needed.
- **Classification with abstention** — cheap classifier answers confident cases, escalates the rest.
- **Resilience fallback** — escalate to another provider/model on rate limit, error, or refusal.
- **Draft-then-verify** — cheap model drafts, strong model reviews only the uncertain outputs.

**In modern systems:**

- **Multi-agent** — a fallback model chain (fast → strong → human) behind a single agent capability.
- **Workflow engine** — a step that escalates to a stronger model when its output fails a validation gate.
- **Low-code** — a cost dial that quietly serves easy "AI" requests from a cheap model.

## Related Patterns

- **Router** — routes by *category* up front; a cascade escalates by *difficulty* on evidence.
- **Chain of Responsibility** — the tiers form a chain; each accepts the request or passes it on.
- **Circuit Breaker / Retry** — the failure-escalation half: fall back when a tier errors or is rate-limited.
- **LLM-as-Judge** — a natural confidence gate deciding accept vs. escalate.
