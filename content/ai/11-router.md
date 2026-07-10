---
id: router
category: ai
sequence: 11
title: Router
also_known_as: [Intent Routing, Model Routing, Dispatcher]
gof: false
kind: pattern
intent: "Classify each request and dispatch it to the handler, model, or path best suited to it, instead of sending everything down one route."
frequency: high
difficulty: intermediate
tags: [ai, llm, router, routing, dispatch]
related: [content-based-router, strategy, chain-of-responsibility, model-cascade]
languages: [javascript, python, elixir, go]
---

## Intent

A Router looks at an incoming request, decides what *kind* it is, and dispatches it to the handler
built for that kind — a specialized prompt, a particular model, a tool, a sub-agent, or a canned
response. One entry point, many routes. It's how a system serves a diverse mix of requests without
forcing every one through the same expensive, do-everything path.

## The Problem

One path for everything is wrong in both directions:

- **One giant prompt** — a single prompt that tries to answer product questions, do math, write
  code, and handle small talk does each worse than a focused prompt would, and its instructions
  fight each other.
- **One expensive model** — routing every request, including "hi" and "thanks", to the strongest
  model wastes money and latency on trivia.

The requests aren't the same, so the handling shouldn't be. Classify first, then dispatch to the
right route.

## Structure

Key Components / Participants:

- **Router** — classifies the request into one of a known set of routes (by a fast model, embeddings,
  or rules).
- **Routes** — the handlers, each specialized: a prompt, a model tier, a tool, a sub-agent.
- **Dispatch** — sends the request to the chosen route; often a default/fallback route for the
  unmatched.

```
request ──▶ router (classify) ──▶ route key
                                     │
             ┌───────────┬──────────┼───────────┬────────────┐
             ▼           ▼          ▼            ▼            ▼
          billing     coding     small-talk   search      default
          (RAG)      (strong    (cheap        (tool)      (fallback)
                      model)     model)
```

## When to Use

- Requests fall into distinct categories with different ideal handling.
- You want to send simple requests to a cheap model and hard ones to a strong one.
- Specialized prompts/tools/agents beat one generalist path.
- You need a clear place to add a new category without touching the others.

## Advantages and Disadvantages

### Advantages
- Each route is focused and easy to optimize independently.
- Cost and latency drop — cheap routes handle the easy majority.
- New categories are new routes; existing ones are untouched (open for extension).
- The classification is a clear, inspectable decision point.

### Disadvantages
- A misclassification sends the request to the wrong handler — routing quality caps everything.
- The router is another call (latency) and another thing to maintain.
- Too many fine-grained routes get hard to keep distinct and to classify reliably.
- A catch-all default can silently swallow requests that deserved a real route.

## Common Mistakes

- **Routing with the expensive model** — the classifier should be cheap and fast; using the strong
  model to route defeats the cost win. Use a small model, embeddings, or rules.
- **No default route** — an unrecognized request must go *somewhere* sane; a missing fallback drops
  it or crashes.
- **Overlapping route definitions** — if "billing" and "account" blur, the router flips between them.
  Keep categories distinct.
- **Ignoring misroute cost** — some misroutes are cheap (wrong prompt), others expensive (wrong
  agent that takes destructive action). Weigh the blast radius.
- **Static routes for a drifting request mix** — periodically review what's landing in the default;
  it's where new categories reveal themselves.

## Key Takeaways

- Classify first, then dispatch to the specialized route.
- Route with a *cheap* classifier; reserve the strong model for the work.
- Always have a sane default; watch what lands there.
- Keep routes distinct; a new category should be a new route, not a reworked one.

## Implementations

The router classifies into a route key; a dispatch table maps keys to handlers. The naive version is
one path for all; the idiomatic version classifies cheaply and dispatches, with a default.

### JavaScript

**❌ Naive**

```js
// Everything through one strong-model prompt — costly and unfocused.
async function handle(request) {
  return callStrongModel(`Answer anything:\n${request}`);
}
```

**✅ Idiomatic**

```js
const routes = {
  billing:    (req) => ragAnswer(req, billingDocs),   // grounded
  coding:     (req) => callStrongModel(codePrompt(req)),
  small_talk: (req) => callCheapModel(req),            // cheap route
};

async function classify(request) {
  const { route } = await callCheapModel(
    `Classify into ${Object.keys(routes).join(", ")}. Return JSON {route}.\n${request}`);
  return routes[route] ? route : "small_talk"; // default
}

async function handle(request) {
  return routes[await classify(request)](request);
}
```

**🧠 Tradeoff** — Routes as a name→handler map make dispatch a table lookup, and classification runs on
the *cheap* model so routing is nearly free. The `routes[route] ? ... : "small_talk"` guard guarantees a
default. Adding a category is one map entry — the router is open for extension. The risk is
misclassification; keep the categories distinct and monitor the default bucket.

### Python

**❌ Naive**

```python
def handle(request: str) -> str:
    return call_strong_model(f"Answer anything:\n{request}")
```

**✅ Idiomatic**

```python
ROUTES = {
    "billing":    lambda req: rag_answer(req, billing_docs),
    "coding":     lambda req: call_strong_model(code_prompt(req)),
    "small_talk": lambda req: call_cheap_model(req),
}

def classify(request: str) -> str:
    route = call_cheap_model_json(
        f"Classify into {', '.join(ROUTES)}. Return JSON {{route}}.\n{request}"
    )["route"]
    return route if route in ROUTES else "small_talk"   # default

def handle(request: str) -> str:
    return ROUTES[classify(request)](request)
```

**🧠 Tradeoff** — A dict of handlers is the dispatch table; `classify` uses the cheap model and falls back
to a default when the label is unknown. This is [[content-based-router]] with an LLM classifier — same
shape as routing a message by a field, except the "field" is inferred. To route on similarity instead of
a model call, replace `classify` with a nearest-centroid embedding lookup; the dispatch is unchanged.

### Elixir

**❌ Naive**

```elixir
def handle(request), do: call_strong_model("Answer anything:\n#{request}")
```

**✅ Idiomatic**

```elixir
defmodule Router do
  @routes %{
    "billing" => &Handlers.billing/1,
    "coding" => &Handlers.coding/1,
    "small_talk" => &Handlers.small_talk/1
  }

  def handle(request) do
    route = classify(request)
    handler = Map.get(@routes, route, &Handlers.small_talk/1) # default
    handler.(request)
  end

  defp classify(request) do
    "Classify into #{Enum.join(Map.keys(@routes), ", ")}. Return the label only.\n#{request}"
    |> call_cheap_model()
    |> String.trim()
  end
end
```

**🧠 Tradeoff** — A map of route keys to function values, with `Map.get/3`'s third argument giving the
default route for free — a clean expression of "dispatch, with a fallback." Classification is a piped
cheap-model call. If routing rules grow branchy (priority, tenant, fallback chains), a
[[chain-of-responsibility]] of handlers each deciding "is this mine?" scales better than one classifier.

### Go

**❌ Naive**

```go
func Handle(request string) string {
    return CallStrongModel("Answer anything:\n" + request)
}
```

**✅ Idiomatic**

```go
var routes = map[string]func(string) string{
    "billing":    func(r string) string { return RAGAnswer(r, billingDocs) },
    "coding":     func(r string) string { return CallStrongModel(codePrompt(r)) },
    "small_talk": func(r string) string { return CallCheapModel(r) },
}

func classify(request string) string {
    label := strings.TrimSpace(CallCheapModel(
        "Classify into billing, coding, small_talk. Return the label only.\n" + request))
    if _, ok := routes[label]; ok {
        return label
    }
    return "small_talk" // default
}

func Handle(request string) string {
    return routes[classify(request)](request)
}
```

**🧠 Tradeoff** — A `map[string]func(string) string` is the dispatch table; the `_, ok` check enforces the
default so an unknown label can't panic on a nil handler. Classification stays on the cheap model. It's
plain and testable — swap `classify` for an embedding-based router without touching dispatch. The whole
pattern is "one entry, many focused exits, cheap decision in the middle."

## Applications

Real-world uses of the Router:

- **Support triage** — route billing / technical / sales / account to specialized handlers.
- **Model tiering** — send easy requests to a cheap model, hard ones to a strong one (see [[model-cascade]]).
- **Multi-domain assistants** — dispatch to the right knowledge base or tool per topic.
- **Guardrail routing** — send flagged inputs to a stricter path or a refusal.
- **Language/locale routing** — pick the right prompt or model per detected language.

**In modern systems:**

- **Multi-agent** — a supervisor's router dispatches each request to the specialist agent for that intent.
- **Workflow engine** — a branch step that inspects content and routes the instance to the next node.
- **Low-code** — route a record to the form or handler named by a discriminator, inferred by the model.

## Related Patterns

- **Content-Based Router** — the messaging pattern this is; the Router is its LLM-classifier form.
- **Strategy** — each route is an interchangeable strategy selected by the classification.
- **Chain of Responsibility** — an alternative to a classifier: each handler decides if the request is its own.
- **Model Cascade** — routing by difficulty to escalate cheap→strong models on demand.
