---
id: few-shot
category: ai
sequence: 7
title: Few-Shot Prompting
also_known_as: [In-Context Learning, Example-Based Prompting]
gof: false
kind: pattern
intent: "Steer the model by putting a few worked examples in the prompt, so it matches your format and labels without any fine-tuning."
frequency: high
difficulty: beginner
tags: [ai, llm, few-shot, in-context-learning, prompting]
related: [structured-output, rag, strategy, prototype]
languages: [javascript, python, elixir, go]
---

## Intent

Few-Shot Prompting teaches the model by example, in the prompt itself. Instead of describing the
output you want in words, you *show* it: a handful of input→output pairs, then the real input. The
model infers the pattern — the format, the label set, the tone, the edge-case handling — and follows
it. No fine-tuning, no training run; the "learning" happens in-context, per request.

## The Problem

Zero-shot (instruction only) is underspecified for anything with a house style:

- **Format drift** — you asked for "a short summary" and get three sentences here, a bulleted list
  there, a paragraph the next time. Instructions describe; they don't pin.
- **Label ambiguity** — "classify the sentiment" — but is a neutral-but-frustrated review "neutral"
  or "negative"? Your definition lives in examples, not adjectives.
- **Edge cases** — the one weird input (an empty field, a sarcastic tone) that prose instructions
  never anticipated but a well-chosen example covers.

A few examples resolve all three by demonstration, which the model imitates far more reliably than it
follows description.

## Structure

Key Components / Participants:

- **Instruction** — the task statement (still useful; examples complement it, not replace it).
- **Examples** — a small set of input→output pairs demonstrating format, labels, and edge cases.
- **Selector** — chooses which examples to include: a fixed set, or dynamically the ones most similar
  to the current input (retrieval-based).
- **Query** — the real input, appended in the same shape as the examples.

```
instruction
+ examples ─── static set, or dynamically selected (retrieve nearest to the query)
    in →  out
    in →  out
+ query (same shape as the examples)  ──▶ model ──▶ output matching the demonstrated pattern
```

## When to Use

- The output has a specific format, label set, or style that instructions alone underspecify.
- Zero-shot results are inconsistent and you can show what "right" looks like.
- You have a few good exemplars but not enough (or no reason) to fine-tune.
- Edge cases are best communicated by demonstration.

## Advantages and Disadvantages

### Advantages
- No training — steer behavior by editing the prompt.
- Examples pin format, labels, and edge cases better than prose.
- Dynamic (retrieved) examples adapt the prompt to each input.
- Fast to iterate: change an example, change the behavior.

### Disadvantages
- Examples cost tokens in *every* request (unlike fine-tuning, which bakes them in).
- Poorly chosen or biased examples steer the model wrong (order and class balance matter).
- Too many examples crowd the context and can dilute the actual input.

## Common Mistakes

- **Unrepresentative examples** — three easy cases teach nothing about the hard one. Include the
  edge cases you actually care about.
- **Class imbalance** — five "positive" examples and one "negative" biases the model toward positive.
  Balance the label distribution.
- **Inconsistent formatting across examples** — if your examples don't share an exact shape, the
  model has no pattern to copy. Be rigorous.
- **Few-shot when structured output is the real fix** — if the goal is valid JSON, a schema
  ([[structured-output]]) guarantees it; examples only nudge. Use the right tool.
- **Static examples for a shifting distribution** — when inputs vary widely, retrieve examples
  similar to each input instead of hard-coding one set.

## Key Takeaways

- Show, don't just tell — examples pin behavior instructions can't.
- Curate for coverage and balance; order and class mix matter.
- Retrieve examples per-input when the input distribution is wide.
- Examples cost tokens every call — use the fewest that pin the behavior.

## Implementations

We build the prompt from an instruction plus example pairs, then the query. The naive version is
instruction-only; the idiomatic version formats a consistent example block and (optionally) selects
examples dynamically.

### JavaScript

**❌ Naive**

```js
// Instruction only — format and labels drift request to request.
async function classify(review) {
  return callModel(`Classify the sentiment of this review: ${review}`);
}
```

**✅ Idiomatic**

```js
const EXAMPLES = [
  { in: "Shipping was fast and the product works great.", out: "positive" },
  { in: "It arrived broken and support never replied.", out: "negative" },
  { in: "It's fine. Does what it says, nothing more.", out: "neutral" },
];

const shots = (examples) =>
  examples.map((e) => `Review: ${e.in}\nSentiment: ${e.out}`).join("\n\n");

async function classify(review, examples = EXAMPLES) {
  const prompt =
    `Classify sentiment as positive, negative, or neutral.\n\n` +
    `${shots(examples)}\n\nReview: ${review}\nSentiment:`;
  return (await callModel(prompt)).trim();
}
```

**🧠 Tradeoff** — A consistent example block pins the label set (three values, demonstrated) and the
exact shape the model should complete. Passing `examples` as a parameter is what makes it *dynamic* —
swap in examples retrieved by similarity to `review` for a shifting distribution. The cost is example
tokens on every call; when the labels are fixed, a [[structured-output]] enum is the stronger guarantee.

### Python

**❌ Naive**

```python
def classify(review: str) -> str:
    return call_model(f"Classify the sentiment of this review: {review}")
```

**✅ Idiomatic**

```python
EXAMPLES = [
    ("Shipping was fast and the product works great.", "positive"),
    ("It arrived broken and support never replied.", "negative"),
    ("It's fine. Does what it says, nothing more.", "neutral"),
]

def shots(examples: list[tuple[str, str]]) -> str:
    return "\n\n".join(f"Review: {i}\nSentiment: {o}" for i, o in examples)

def classify(review: str, examples: list[tuple[str, str]] = EXAMPLES) -> str:
    prompt = (
        "Classify sentiment as positive, negative, or neutral.\n\n"
        f"{shots(examples)}\n\nReview: {review}\nSentiment:"
    )
    return call_model(prompt).strip()
```

**🧠 Tradeoff** — Examples as data (`list[tuple]`) separate the *content* of the demonstration from the
*formatting*, so you can curate, balance, or retrieve them independently. To go dynamic, replace the
default with `select_similar(review, pool, k=3)` — the same signature, retrieval-backed. The judgment
is curation, not code: representative, balanced, consistently formatted examples.

### Elixir

**❌ Naive**

```elixir
def classify(review), do: call_model("Classify the sentiment: #{review}")
```

**✅ Idiomatic**

```elixir
defmodule Sentiment do
  @examples [
    {"Shipping was fast and the product works great.", "positive"},
    {"It arrived broken and support never replied.", "negative"},
    {"It's fine. Does what it says, nothing more.", "neutral"}
  ]

  def classify(review, examples \\ @examples) do
    shots =
      examples
      |> Enum.map_join("\n\n", fn {input, out} -> "Review: #{input}\nSentiment: #{out}" end)

    """
    Classify sentiment as positive, negative, or neutral.

    #{shots}

    Review: #{review}
    Sentiment:
    """
    |> call_model()
    |> String.trim()
  end
end
```

**🧠 Tradeoff** — `Enum.map_join` builds the example block in one pass, and the default `@examples`
arg makes the static case ergonomic while leaving the door open to pass retrieved examples. The
heredoc keeps the prompt readable. For dynamic selection you'd embed the pool once and pass the
nearest few — the function signature already supports it.

### Go

**❌ Naive**

```go
func Classify(review string) string {
    return CallModel("Classify the sentiment: " + review)
}
```

**✅ Idiomatic**

```go
type Shot struct{ In, Out string }

var examples = []Shot{
    {"Shipping was fast and the product works great.", "positive"},
    {"It arrived broken and support never replied.", "negative"},
    {"It's fine. Does what it says, nothing more.", "neutral"},
}

func shots(examples []Shot) string {
    var b strings.Builder
    for i, e := range examples {
        if i > 0 {
            b.WriteString("\n\n")
        }
        fmt.Fprintf(&b, "Review: %s\nSentiment: %s", e.In, e.Out)
    }
    return b.String()
}

func Classify(review string, examples []Shot) string {
    prompt := fmt.Sprintf(
        "Classify sentiment as positive, negative, or neutral.\n\n%s\n\nReview: %s\nSentiment:",
        shots(examples), review)
    return strings.TrimSpace(CallModel(prompt))
}
```

**🧠 Tradeoff** — A `Shot` struct and a `strings.Builder` keep example formatting explicit and
allocation-light. Taking `examples []Shot` as a parameter is the seam for dynamic selection — pass the
package-level `examples` for the static case, or the retrieved nearest-k for a shifting distribution.
No magic; the whole pattern is "format demonstrations consistently, then the query."

## Applications

Real-world uses of Few-Shot Prompting:

- **Classification & tagging** — pin an exact label set with a few balanced examples.
- **Format enforcement** — demonstrate the output shape when a schema is too rigid for the content.
- **Style & tone matching** — show the house voice for summaries, replies, or rewrites.
- **Structured extraction** — a couple of worked extractions teach the field mapping.
- **Dynamic few-shot** — retrieve the most similar past examples per input (RAG for exemplars).

**In modern systems:**

- **Low-code** — a "train by example" UX where users add input→output pairs and the model generalizes.
- **Workflow engine** — a classification/routing step tuned by curated examples, no retrain.
- **Multi-agent** — an agent primed with exemplars of good tool use or output format before it runs.

## Related Patterns

- **Structured Output** — when the goal is *valid* output, a schema guarantees what examples only nudge.
- **Retrieval-Augmented Generation** — dynamic few-shot *is* RAG applied to examples instead of documents.
- **Strategy** — static vs. retrieved example selection are interchangeable strategies behind one call.
- **Prototype** — a curated example set is a template you clone and adapt per task.
