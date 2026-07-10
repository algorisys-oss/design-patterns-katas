---
id: structured-output
category: ai
sequence: 5
title: Structured Output
also_known_as: [Schema-Constrained Generation, JSON Mode, Extraction]
gof: false
kind: pattern
intent: "Constrain the model to emit data matching a schema, so downstream code parses a validated object instead of scraping prose."
frequency: high
difficulty: beginner
tags: [ai, llm, structured-output, json, extraction, validation]
related: [option-result, guardrails, prompt-chaining, adapter]
languages: [javascript, python, elixir, go]
---

## Intent

Structured Output turns a model from a prose generator into a typed function. You give it a schema;
it returns data that validates against that schema — JSON with the fields you asked for, the enums
you allowed, the types you need. Downstream code then works with a parsed object, not a paragraph
it has to regex.

This is the seam between an LLM and the rest of your program. Everything that follows — routing on
a field, storing a record, calling the next step — needs data, not prose.

## The Problem

Ask a model for JSON in plain instructions and you get *usually*-JSON:

```
Sure! Here's the data you asked for:

```json
{ "name": "Ada", "plan": "pro" }
```

Let me know if you need anything else!
```

Now your parser has to strip the preamble, find the fenced block, and hope the model didn't add a
trailing comment, use single quotes, or omit a required field. Every one of those is a production
incident waiting for the one input that trips it. "Usually valid" JSON is a bug that fires on a
schedule you don't control.

## Structure

Key Components / Participants:

- **Schema** — the contract: fields, types, enums, required-ness.
- **Constraint mechanism** — the API feature that forces the output to match: a response format
  (`output_config.format`) or a strict tool/function schema.
- **Validator** — parses and checks the response against the schema, returning a typed value or a
  clear error.

```
schema ──▶ request (output_config.format = json_schema)
              │
              ▼
           model ──▶ JSON matching schema ──▶ validate ──▶ typed object
                                                 │
                                                 └─▶ error (retry / reject)
```

## When to Use

- The output feeds code: routing, storage, a downstream call, an API response.
- You're extracting fields from unstructured text (a form, an email, a document).
- You need enums or a fixed label set from a classification.
- Any time you'd otherwise write a regex to pull data out of the model's prose — stop and use a schema.

## Advantages and Disadvantages

### Advantages
- Guaranteed-parseable output — no prose-scraping, no fenced-block hunting.
- The schema documents the contract and validates it in one place.
- Enums constrain classification to valid labels.
- Turns the model into a drop-in function with a typed return.

### Disadvantages
- The schema must be expressible in the model's supported JSON-Schema subset (no arbitrary
  regex/length constraints on some providers).
- Over-constraining can hurt quality — a model boxed into a rigid shape may drop nuance.
- A refusal or a truncated response can still violate the schema; you must handle the failure.

## Common Mistakes

- **Asking for JSON in prose instead of using the schema feature** — "respond in JSON" is a hope;
  `output_config.format` is a guarantee. Use the API mechanism.
- **Skipping validation** — even with a schema, a refusal or `max_tokens` truncation can return
  something unparseable. Validate and handle the error (see [[option-result]]).
- **A too-loose schema** — `additionalProperties: true` or missing `required` lets the model omit
  fields silently; tighten it.
- **Cramming reasoning into the schema** — if you need the model to think, give it a `reasoning`
  field *before* the answer field, or reason in a prior step; don't expect good answers from a bare
  enum with no room to work.

## Key Takeaways

- Use the API's schema mechanism, not a "please return JSON" instruction.
- Validate the result — a schema request can still fail (refusal, truncation).
- Constrain enums and mark fields required; keep the schema tight.
- Structured output is the seam that makes an LLM callable from code.

## Implementations

We show the request shape with a schema and the validation that follows. `callStructured(schema,
prompt)` stands for the provider call that returns schema-constrained JSON; the naive version parses
free-form prose.

### JavaScript

**❌ Naive**

```js
// Hope the model returns clean JSON; JSON.parse throws on the day it doesn't.
async function extract(text) {
  const out = await callModel(`Return JSON with name and plan for: ${text}`);
  return JSON.parse(out); // preamble? fences? single quotes? → boom
}
```

**✅ Idiomatic**

```js
const schema = {
  type: "object",
  properties: {
    name: { type: "string" },
    plan: { type: "string", enum: ["free", "pro", "enterprise"] },
  },
  required: ["name", "plan"],
  additionalProperties: false,
};

async function extract(text) {
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: `Extract from: ${text}` }],
  });
  const json = res.content.find((b) => b.type === "text").text;
  return validate(schema, JSON.parse(json)); // guaranteed valid, but still guard
}
```

**🧠 Tradeoff** — `output_config.format` makes the response *guaranteed* schema-valid, so `JSON.parse`
is safe and `validate` is a belt-and-suspenders check for the refusal/truncation edge. The schema
lives as data, so the same `extract` handles any shape — you're using the model as a typed function.
The cost is that your schema must fit the provider's supported JSON-Schema subset.

### Python

**❌ Naive**

```python
import json
def extract(text: str) -> dict:
    return json.loads(call_model(f"Return JSON with name and plan for: {text}"))
```

**✅ Idiomatic**

```python
from pydantic import BaseModel
from typing import Literal

class Customer(BaseModel):
    name: str
    plan: Literal["free", "pro", "enterprise"]

def extract(text: str) -> Customer:
    res = client.messages.parse(          # SDK validates against the model
        model="claude-opus-4-8",
        max_tokens=1024,
        messages=[{"role": "user", "content": f"Extract from: {text}"}],
        output_format=Customer,
    )
    return res.parsed_output              # a typed Customer, not a dict
```

**🧠 Tradeoff** — A Pydantic model *is* the schema and the validator: `messages.parse` derives the
JSON-Schema, constrains the model, and returns a validated `Customer`. `Literal` pins the enum. This
is the tightest expression of the pattern — one class, no manual parsing — at the cost of coupling to
the SDK's parse helper (drop to `output_config.format` + `model_validate_json` if you need the raw path).

### Elixir

**❌ Naive**

```elixir
def extract(text) do
  "Return JSON with name and plan for: #{text}" |> call_model() |> Jason.decode!()
end
```

**✅ Idiomatic**

```elixir
defmodule Extract do
  @schema %{
    "type" => "object",
    "properties" => %{
      "name" => %{"type" => "string"},
      "plan" => %{"type" => "string", "enum" => ["free", "pro", "enterprise"]}
    },
    "required" => ["name", "plan"],
    "additionalProperties" => false
  }

  def extract(text) do
    with {:ok, json} <- call_structured(@schema, "Extract from: #{text}"),
         {:ok, data} <- Jason.decode(json),
         :ok <- validate(@schema, data) do
      {:ok, data}
    end
  end
end
```

**🧠 Tradeoff** — Elixir has no first-party structured-output SDK, so `call_structured/2` posts the
schema as `output_config.format` over HTTP. The `with` chain threads the fallible steps — request,
decode, validate — and short-circuits to the first `{:error, _}`, which is exactly the
[[option-result]] shape for "any of these can fail." Callers pattern-match `{:ok, data}` and handle
failure as data, no exceptions.

### Go

**❌ Naive**

```go
func Extract(text string) (map[string]any, error) {
    var m map[string]any
    err := json.Unmarshal([]byte(CallModel("Return JSON for: "+text)), &m)
    return m, err
}
```

**✅ Idiomatic**

```go
type Customer struct {
    Name string `json:"name"`
    Plan string `json:"plan"` // "free" | "pro" | "enterprise"
}

var schema = map[string]any{
    "type": "object",
    "properties": map[string]any{
        "name": map[string]any{"type": "string"},
        "plan": map[string]any{"type": "string",
            "enum": []string{"free", "pro", "enterprise"}},
    },
    "required":             []string{"name", "plan"},
    "additionalProperties": false,
}

func Extract(text string) (Customer, error) {
    raw, err := CallStructured(schema, "Extract from: "+text) // POST with output_config.format
    if err != nil {
        return Customer{}, err
    }
    var c Customer
    if err := json.Unmarshal([]byte(raw), &c); err != nil {
        return Customer{}, fmt.Errorf("schema-valid response failed to decode: %w", err)
    }
    return c, validatePlan(c)
}
```

**🧠 Tradeoff** — The struct plus tags is the target shape; the schema map is what constrains the
model over HTTP (no Go SDK for structured outputs). Go's explicit `(Customer, error)` return makes
the failure path unmissable — the caller can't ignore a decode or validation error. The duplication
between struct tags and the schema map is the price of no code-gen; a helper that derives one from the
other removes it.

## Applications

Real-world uses of Structured Output:

- **Extraction** — pull fields from emails, resumes, invoices, forms into records.
- **Classification** — route a ticket to a queue with a constrained `category` enum.
- **Tool arguments** — a strict schema *is* how tool/function calling passes typed inputs (see [[tool-use]]).
- **Grounded answers with citations** — RAG output as `{ answer, sources[] }` instead of prose.
- **Config/DSL generation** — emit valid JSON config a downstream system can consume directly.

**In modern systems:**

- **Low-code** — generate a form or page's JSON schema from a plain-English description, then validate it.
- **Workflow engine** — a step returns `{status, next, payload}` the orchestrator branches on.
- **Multi-agent** — every agent-to-agent hand-off is structured output; free text between agents rots.

## Related Patterns

- **Option / Result** — the honest return type when a schema request can fail (refusal, truncation).
- **Guardrails** — schema validation is one guardrail; content and policy checks are others.
- **Prompt Chaining** — structured output is what makes one step's result safely consumable by the next.
- **Adapter** — a schema adapts free-form model output to the typed interface your code expects.
