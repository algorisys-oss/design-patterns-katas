---
id: tool-use
category: ai
sequence: 9
title: Tool Use
also_known_as: [Function Calling, Tool Calling]
gof: false
kind: pattern
intent: "Give the model a set of typed tools it can call; the runtime executes the call and returns the result, so the model can act on the world."
frequency: high
difficulty: intermediate
tags: [ai, llm, tool-use, function-calling, agent]
related: [react, command, adapter, chain-of-responsibility]
languages: [javascript, python, elixir, go]
---

## Intent

Tool Use is the mechanism that lets a model *do* things instead of just talk. You declare a set of
tools — each a name, a description, and a typed input schema. The model, when it needs one, emits a
structured **tool call**; your runtime executes it and returns the result; the model continues with
that result in hand. It's how an LLM reaches a database, an API, a calculator, or your own functions.

Where [[react]] is the *loop*, Tool Use is the *contract and dispatch* inside it: how the model
names an action, how you run it, and how the result flows back.

## The Problem

A bare model is sealed off from everything real:

- It can't fetch the current price, look up a record, send an email, or run a calculation.
- The tempting hack — "tell the model to output `ACTION: search(query)` and parse it from the prose"
  — is exactly the fragile string-scraping that [[structured-output]] exists to kill. The model
  wraps it in a sentence, misspells the tool name, or malforms the args, and your parser breaks.

Tool Use replaces the hack with a first-class, typed protocol: the provider guarantees a
well-formed tool call, and you dispatch on it.

## Structure

Key Components / Participants:

- **Tool** — a name, a description (what it does and *when* to use it), and an input schema.
- **Registry / dispatch table** — maps a tool name to the function that runs it.
- **Tool call** — the model's structured request: `{ name, input, id }`.
- **Tool result** — the executed output, returned to the model tagged with the call's `id`.

```
tools ──▶ model ──▶ tool_call { name, input, id }
                        │
                        ▼
                    dispatch[name](input) ──▶ result
                        │
                        ▼
                    tool_result(id, result) ──▶ back to model
```

## When to Use

- The model needs live data or must take an action (query, fetch, compute, send).
- You want typed, validated arguments to your functions, not parsed prose.
- You're building an agent — Tool Use is the substrate the [[react]] loop runs on.
- You need to gate, log, or audit the actions the model takes.

## Advantages and Disadvantages

### Advantages
- Typed, validated arguments — no prose parsing (it's [[structured-output]] for actions).
- Each tool call is a first-class object you can log, gate, and replay (a [[command]]).
- New capabilities are new tools — the model surface grows without prompt rewrites.
- Clear boundary between "the model decides" and "your code executes."

### Disadvantages
- A large or overlapping tool set confuses the model — it picks the wrong one.
- Tools with side effects are real actions; an unguarded destructive tool is a liability.
- Descriptions are load-bearing prompt engineering — vague ones get misused.
- The model can hallucinate arguments; validate before executing.

## Common Mistakes

- **Too many tools** — a bloated registry degrades selection. Keep it small; consider tool-search or
  a [[router]] when the set is large.
- **Weak descriptions** — the description is how the model decides *when* to call. Be prescriptive
  ("call this when the user asks about an order's status"), not just descriptive.
- **Executing unvalidated arguments** — a hallucinated or malicious argument runs against your
  system. Validate inputs; treat tool results as untrusted input.
- **No gate on destructive tools** — `delete_account` should not run on the model's say-so alone;
  require confirmation ([[human-in-the-loop]]).
- **Dropping the `id`** — every tool result must carry the call's id, or the model can't match result
  to request.

## Key Takeaways

- Tool Use is structured output for *actions* — a typed call the runtime dispatches.
- Descriptions decide selection; keep the set small and each tool distinct.
- Every tool call is a Command: loggable, gate-able, replayable.
- Validate arguments and gate side effects; tool output is untrusted.

## Implementations

We define tools as `{ name, description, schema, run }` and dispatch on the model's tool call. The
naive version fakes tools by parsing prose; the idiomatic version uses typed tools and a dispatch table.

### JavaScript

**❌ Naive**

```js
// Ask the model to print an action, then regex it out — breaks constantly.
async function act(question) {
  const out = await callModel(`If you need to search, print SEARCH: <query>\n${question}`);
  const m = out.match(/SEARCH:\s*(.+)/); // preamble, typos, wrong format → miss
  return m ? search(m[1]) : out;
}
```

**✅ Idiomatic**

```js
const tools = {
  get_order: {
    description: "Look up an order by id. Call this when the user asks about an order's status.",
    schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: ({ id }) => db.orders.find(id),
  },
};

async function dispatch(call) {
  const tool = tools[call.name];
  if (!tool) return { error: `unknown tool: ${call.name}` };
  return tool.run(validate(tool.schema, call.input)); // validate before executing
}

// The model emits a typed tool_use block; you run dispatch and return the result.
```

**🧠 Tradeoff** — Tools as data (`{ description, schema, run }`) make the registry a dispatch table; the
provider guarantees a well-formed `tool_use` block, so `dispatch` never parses prose. `validate` before
`run` is the guard against hallucinated arguments. The cost is that descriptions and the tool set are
now prompt engineering you must tune — but that's the real work, exposed instead of hidden in a regex.

### Python

**❌ Naive**

```python
import re
def act(question: str) -> str:
    out = call_model(f"If you need to search, print SEARCH: <query>\n{question}")
    m = re.search(r"SEARCH:\s*(.+)", out)
    return search(m.group(1)) if m else out
```

**✅ Idiomatic**

```python
from dataclasses import dataclass
from typing import Callable

@dataclass
class Tool:
    description: str
    schema: dict
    run: Callable[[dict], str]

TOOLS = {
    "get_order": Tool(
        description="Look up an order by id. Call when the user asks about order status.",
        schema={"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]},
        run=lambda args: db.orders.find(args["id"]),
    ),
}

def dispatch(call) -> str:
    tool = TOOLS.get(call.name)
    if tool is None:
        return f"unknown tool: {call.name}"
    return tool.run(validate(tool.schema, call.input))  # validate first
```

**🧠 Tradeoff** — A `Tool` dataclass plus a name→`Tool` registry is the dispatch table; the
`@beta_tool` decorator in the Anthropic SDK derives the schema from a typed function signature if you'd
rather not hand-write it. Either way the pattern is the same: typed tools, validated inputs, a dispatch
map. The judgment is which capabilities to expose and how to describe them.

### Elixir

**❌ Naive**

```elixir
def act(question) do
  out = call_model("If you need to search, print SEARCH: <query>\n#{question}")
  case Regex.run(~r/SEARCH:\s*(.+)/, out) do
    [_, q] -> search(q)
    _ -> out
  end
end
```

**✅ Idiomatic**

```elixir
defmodule Tools do
  @tools %{
    "get_order" => %{
      description: "Look up an order by id. Call when the user asks about order status.",
      schema: %{"type" => "object", "properties" => %{"id" => %{"type" => "string"}},
               "required" => ["id"]},
      run: &GetOrder.run/1
    }
  }

  def dispatch(%{name: name, input: input}) do
    case @tools[name] do
      nil -> {:error, "unknown tool: #{name}"}
      %{run: run, schema: schema} ->
        with {:ok, args} <- validate(schema, input), do: {:ok, run.(args)}
    end
  end
end
```

**🧠 Tradeoff** — Tools are a map to a struct holding a `run` function value; `dispatch` pattern-matches
the call and `with` threads validation before execution. If you want a named contract per tool, a
`behaviour` with `run/1` and `schema/0` callbacks lets each tool be its own module — cleaner when tools
grow logic. For a handful, the map-of-functions is leaner. There's no Claude SDK here, so the tool-call
protocol rides on the raw HTTP `tools` field.

### Go

**❌ Naive**

```go
func Act(question string) string {
    out := CallModel("If you need to search, print SEARCH: <query>\n" + question)
    if m := regexp.MustCompile(`SEARCH:\s*(.+)`).FindStringSubmatch(out); m != nil {
        return Search(m[1])
    }
    return out
}
```

**✅ Idiomatic**

```go
type Tool struct {
    Description string
    Schema      map[string]any
    Run         func(map[string]any) (string, error)
}

var tools = map[string]Tool{
    "get_order": {
        Description: "Look up an order by id. Call when the user asks about order status.",
        Schema:      map[string]any{"type": "object", "properties": map[string]any{"id": map[string]any{"type": "string"}}, "required": []string{"id"}},
        Run:         func(args map[string]any) (string, error) { return db.FindOrder(args["id"].(string)) },
    },
}

func Dispatch(call ToolCall) (string, error) {
    tool, ok := tools[call.Name]
    if !ok {
        return "", fmt.Errorf("unknown tool: %s", call.Name)
    }
    args, err := Validate(tool.Schema, call.Input)
    if err != nil {
        return "", err // never run on invalid args
    }
    return tool.Run(args)
}
```

**🧠 Tradeoff** — A `Tool` struct with a `Run` func field and a name→`Tool` map is the dispatch table; the
`(string, error)` returns make validation and unknown-tool failures explicit and un-ignorable. Go has no
tool-runner, so `Dispatch` is the loop's act step — exactly where you'd add a permission check for a
destructive tool. The `any`-typed args are the seam where the model's untyped output meets your typed code;
validate there.

## Applications

Real-world uses of Tool Use:

- **Data access** — look up orders, users, inventory, or documents mid-conversation.
- **Actions** — send an email, create a ticket, schedule an event, post a message.
- **Computation** — a calculator or code-execution tool for exact math the model shouldn't guess.
- **Web** — search and fetch tools to reach information past the model's training cutoff.
- **MCP servers** — a standardized way to expose a whole toolset (GitHub, Slack, a database) to the model.

**In modern systems:**

- **Multi-agent** — wrap heterogeneous tool and model APIs behind one uniform call the orchestrator dispatches.
- **Workflow engine** — a step whose "work" is a typed tool the model chose to invoke.
- **Low-code** — the app's declared actions (`sendEmail`, `queryTable`) exposed as tools the model can call.

## Related Patterns

- **ReAct Loop** — the control flow that repeatedly calls tools; Tool Use is the mechanism it runs on.
- **Command** — every tool call is a Command object: loggable, gate-able, replayable.
- **Adapter** — a tool adapts a foreign API to the uniform tool interface the model expects.
- **Chain of Responsibility** — tool dispatch as a chain where each handler claims the calls it recognizes.
