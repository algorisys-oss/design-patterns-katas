---
id: react
category: ai
sequence: 8
title: ReAct Loop
also_known_as: [Reason + Act, Agent Loop, Think-Act-Observe]
gof: false
kind: pattern
intent: "Interleave reasoning and tool actions in a loop — think, act, observe, repeat — so the model gathers what it needs before answering."
frequency: high
difficulty: advanced
tags: [ai, llm, agent, react, tool-use, loop]
related: [tool-use, reflection, state, mediator]
languages: [javascript, python, elixir, go]
---

## Intent

ReAct is the control loop at the heart of an agent. Instead of answering in one shot, the model
**reasons** about what it needs, takes an **action** (calls a tool), observes the result, and
repeats — thinking and acting in alternation until it has enough to answer. The reasoning steers the
actions; the observations ground the reasoning.

It's the difference between a model guessing and a model *finding out*.

## The Problem

A single call can't handle tasks that need information it doesn't have:

- **Answer blind** — ask "is order #4021 delayed?" and the model has no way to check; it either
  refuses or invents an answer.
- **Plan-then-execute blind** — a common alternative is "write the whole plan, then run it." But a
  plan written before seeing any results is brittle: step 3 assumed step 2 returned something it
  didn't, and there's no way to adapt.

ReAct fixes both by looping: the model sees each observation before deciding the next action, so it
adapts as it goes and grounds each step in real results.

## Structure

Key Components / Participants:

- **Model** — produces the next *thought* and either an *action* (tool call) or a final answer.
- **Tools** — the actions the agent can take (search, fetch, compute); see [[tool-use]].
- **Loop** — runs think → act → observe until the model returns an answer or a limit is hit.
- **Transcript** — the growing history of thoughts, actions, and observations, fed back each turn.

```
       ┌─────────────────────────────────────────┐
       ▼                                          │
question ──▶ model ──▶ thought + action ──▶ execute tool ──▶ observation ──┘
               │                                   (appended to transcript)
               └──▶ (no action) final answer ──▶ done
                          ▲
                    stop when answered or max-steps reached
```

## When to Use

- The task needs information or actions the model can't do in one pass (lookups, calculations, API calls).
- Later steps depend on the results of earlier ones — the path can't be fully planned up front.
- You want the agent to adapt to what it finds rather than follow a fixed script.
- A tool's result should inform whether and what to do next.

## Advantages and Disadvantages

### Advantages
- Grounds answers in real tool results instead of the model's guesses.
- Adapts step-by-step — the next action reflects the last observation.
- The reasoning trace is inspectable and auditable.
- Generalizes: give it new tools and it can tackle new tasks with the same loop.

### Disadvantages
- Unbounded loops burn tokens and money; you must cap steps.
- Errors compound — a bad observation can send the whole loop off course.
- Latency scales with the number of turns.
- Harder to make deterministic or testable than a straight-line chain.

## Common Mistakes

- **No step limit** — a confused agent loops forever, calling tools and draining the budget. Cap
  iterations and fail gracefully.
- **Not feeding observations back faithfully** — if the tool result isn't returned to the model
  intact, its next reasoning step is blind.
- **Too many or overlapping tools** — a confusing tool surface makes the model pick wrong; keep the
  set small and distinct ([[tool-use]]).
- **Using ReAct when a chain would do** — if the steps are fixed and known, a [[prompt-chaining]]
  pipeline is cheaper and more predictable. Reach for a loop only when the path is dynamic.
- **Trusting tool output blind** — a tool with side effects is a real action; gate the dangerous ones
  ([[human-in-the-loop]]).

## Key Takeaways

- ReAct = loop of think → act → observe until answered.
- Feed each observation back; the model adapts on real results.
- Always cap the loop — unbounded agents are a runaway cost.
- Use a loop only when the path is dynamic; a fixed path is a chain.

## Implementations

The model returns either a tool call or a final answer. We loop, executing tools and appending
observations, until it answers or we hit `maxSteps`. `callModel(transcript, tools)` returns a step;
tool dispatch is the [[tool-use]] mechanism.

### JavaScript

**❌ Naive**

```js
// One shot, no tools — can't look anything up.
async function agent(question) {
  return callModel(question); // "is order #4021 delayed?" → a guess
}
```

**✅ Idiomatic**

```js
async function agent(question, tools, maxSteps = 6) {
  const transcript = [{ role: "user", content: question }];
  for (let step = 0; step < maxSteps; step++) {
    const res = await callModel(transcript, tools); // model may request a tool
    transcript.push({ role: "assistant", content: res.content });
    if (res.stop_reason !== "tool_use") return res.text; // final answer

    for (const call of res.toolCalls) {
      const observation = await tools[call.name].run(call.input); // act
      transcript.push({ role: "user", content: toolResult(call.id, observation) });
    }
  }
  return "Stopped: step limit reached."; // the guardrail
}
```

**🧠 Tradeoff** — The loop is the whole pattern: call the model, run any tools it asked for, feed the
observations back, repeat. `maxSteps` is the non-negotiable guardrail. In practice the SDK's tool
runner (`client.beta.messages.toolRunner`) drives this loop for you; write it by hand when you need
control the runner doesn't expose — approval gates, custom transport, per-step logging.

### Python

**❌ Naive**

```python
def agent(question: str) -> str:
    return call_model(question)
```

**✅ Idiomatic**

```python
def agent(question: str, tools: dict, max_steps: int = 6) -> str:
    transcript = [{"role": "user", "content": question}]
    for _ in range(max_steps):
        res = call_model(transcript, tools)
        transcript.append({"role": "assistant", "content": res.content})
        if res.stop_reason != "tool_use":
            return res.text                      # final answer
        for call in res.tool_calls:
            observation = tools[call.name].run(call.input)   # act
            transcript.append(tool_result(call.id, observation))
    return "Stopped: step limit reached."         # guardrail
```

**🧠 Tradeoff** — A plain loop over `max_steps` with a clear exit on the non-tool answer. `tools` is a
name→callable dict — the dispatch table. This hand-written form is worth understanding even if you use
`client.beta.messages.tool_runner`, because it's what the runner does; owning it lets you gate a
dangerous tool, log each step, or inject a check between turns.

### Elixir

**❌ Naive**

```elixir
def agent(question), do: call_model(question)
```

**✅ Idiomatic**

```elixir
defmodule Agent do
  def run(question, tools, max_steps \\ 6) do
    loop([%{role: :user, content: question}], tools, max_steps)
  end

  defp loop(_transcript, _tools, 0), do: {:error, :step_limit}

  defp loop(transcript, tools, steps) do
    res = call_model(transcript, tools)
    transcript = transcript ++ [%{role: :assistant, content: res.content}]

    case res.stop_reason do
      :tool_use ->
        observations =
          Enum.map(res.tool_calls, fn call ->
            tool_result(call.id, tools[call.name].(call.input))
          end)

        loop(transcript ++ observations, tools, steps - 1)

      _ ->
        {:ok, res.text}
    end
  end
end
```

**🧠 Tradeoff** — The loop is recursion with the step budget as the base case (`loop(_, _, 0)`), which
is the idiomatic Elixir way to write a bounded loop — the guardrail is structural, not a mutable
counter. `case` on `stop_reason` branches tool-use vs. done. For a long-lived agent you'd wrap this in
a GenServer (an [[actor]]) so it owns its transcript and processes messages serially.

### Go

**❌ Naive**

```go
func Agent(question string) string {
    return CallModel(question)
}
```

**✅ Idiomatic**

```go
func Agent(question string, tools map[string]Tool, maxSteps int) (string, error) {
    transcript := []Message{{Role: "user", Content: question}}
    for step := 0; step < maxSteps; step++ {
        res := CallModel(transcript, tools)
        transcript = append(transcript, Message{Role: "assistant", Content: res.Content})
        if res.StopReason != "tool_use" {
            return res.Text, nil // final answer
        }
        for _, call := range res.ToolCalls {
            obs := tools[call.Name].Run(call.Input) // act
            transcript = append(transcript, ToolResult(call.ID, obs))
        }
    }
    return "", errors.New("step limit reached") // guardrail
}
```

**🧠 Tradeoff** — A bounded `for` loop; `tools` is a `map[string]Tool` dispatch table where `Tool` is a
small interface (`Run(input) string`). The `(string, error)` return forces the caller to handle the
step-limit case explicitly — you can't accidentally treat a runaway agent as success. There's no Go
tool-runner SDK, so this hand-written loop *is* the agent.

## Applications

Real-world uses of the ReAct Loop:

- **Research assistants** — search, read, refine, and synthesize across multiple lookups.
- **Customer support agents** — look up an order, check a policy, then answer.
- **Coding agents** — read files, run tests, edit, re-run — adapting to each result.
- **Data analysis** — query, inspect, compute, and iterate toward an answer.
- **Operations bots** — check a metric, decide, take an action, verify.

**In modern systems:**

- **Multi-agent** — each worker agent runs its own ReAct loop; the supervisor coordinates them.
- **Workflow engine** — a dynamic step whose next action a model chooses, versus a fixed branch.
- **Low-code** — an "AI action" node that reasons over the app's tools to fulfill a natural-language request.

## Related Patterns

- **Tool Use** — the mechanism the loop's "act" step depends on; ReAct is the control flow over it.
- **Reflection** — a loop that critiques and revises output rather than gathering information.
- **State** — the agent's lifecycle (thinking → acting → done) is a small state machine.
- **Mediator** — a supervisor coordinating several ReAct agents so they don't talk N-to-N.
