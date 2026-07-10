---
id: human-in-the-loop
category: ai
sequence: 17
title: Human-in-the-Loop
also_known_as: [HITL, Approval Gate, Human Oversight]
gof: false
kind: pattern
intent: "Pause an agent for human approval or input at high-stakes or uncertain steps, then resume with the decision."
frequency: medium
difficulty: intermediate
tags: [ai, llm, agent, human-in-the-loop, safety, approval]
related: [react, tool-use, saga, state]
languages: [javascript, python, elixir, go]
---

## Intent

Human-in-the-Loop puts a person at the decision points that matter. An agent runs autonomously up to
a checkpoint — a destructive action, a low-confidence call, a policy-sensitive step — then **pauses**
and hands control to a human to approve, edit, or reject. On the human's decision it **resumes**.
It's how you get the throughput of automation with human judgment exactly where the cost of a wrong
autonomous action is too high.

## The Problem

A fully autonomous agent acts on its own judgment everywhere, including where it shouldn't:

- **Irreversible actions** — it deletes the account, sends the email, issues the refund, merges the
  PR — on a hallucinated argument or a misread instruction, with no one to catch it.
- **Low-confidence calls** — it proceeds past a step it's genuinely unsure about because nothing
  makes it stop and ask.
- **Policy-sensitive decisions** — it takes an action that a human, by policy or law, must sign off on.

Full autonomy is fine for reversible, low-stakes steps and reckless for the rest. The fix is a gate:
automate freely, but *stop for a human* at the steps where being wrong is expensive.

## Structure

Key Components / Participants:

- **Agent** — runs autonomously until it reaches a gated step.
- **Gate** — the policy deciding which steps require a human (by tool, by confidence, by amount, by rule).
- **Checkpoint** — a pause that surfaces the proposed action to a human and *persists the state* so
  the run survives the wait (a [[memento]]/[[saga]] concern — the pause can be minutes or days).
- **Decision** — approve, edit (approve a modified action), or reject; the agent resumes accordingly.

```
agent ──▶ step ──▶ gated? ──no──▶ execute ──▶ continue
                     │
                     yes
                     ▼
                 checkpoint (persist state) ──▶ human: approve / edit / reject
                     ▲                                      │
                     └──────────── resume ◀─────────────────┘
```

## When to Use

- Actions are irreversible or high-stakes (financial, destructive, external-facing).
- The agent's confidence is low and the cost of a wrong action is high.
- Policy, compliance, or law requires human sign-off.
- You're rolling out an agent gradually — gate everything, then loosen as trust builds.

## Advantages and Disadvantages

### Advantages
- Human judgment exactly where autonomy is too risky; automation everywhere else.
- Catches hallucinated or misjudged actions before they cause harm.
- Creates an audit trail of who approved what.
- A dial for trust — gate broadly at first, narrow the gates as the agent proves out.

### Disadvantages
- A human in the path adds latency and caps throughput at that step.
- Over-gating creates approval fatigue — people rubber-stamp, defeating the purpose.
- Requires durable pause/resume: the run must survive a wait of minutes to days.
- The human is now a bottleneck and a single point of delay.

## Common Mistakes

- **Gating everything** — approval fatigue sets in, humans stop reading, and the gate becomes a
  rubber stamp. Gate only what genuinely warrants it.
- **Gating nothing risky** — a `delete`/`pay`/`send` tool running on the model's say-so alone is the
  incident waiting to happen. Gate by blast radius.
- **Not persisting state at the pause** — if the run lives only in memory, a restart during the wait
  loses it. Checkpoint durably ([[memento]]).
- **Only offering approve/reject** — often the right action is a *tweaked* one; let the human edit,
  not just veto.
- **No timeout policy** — a pending approval that never comes blocks forever. Define what happens on
  timeout (escalate, expire, safe default).

## Key Takeaways

- Automate the reversible; gate the irreversible and the uncertain.
- Gate by blast radius, not everywhere — over-gating breeds rubber-stamping.
- Persist state at the checkpoint; the pause can outlive the process.
- Offer approve / edit / reject, and define a timeout policy.

## Implementations

A gate decides if a step needs approval; the agent checkpoints, awaits a decision, and resumes. We
model the pause as an async `requestApproval` boundary. The naive version executes every action; the
idiomatic version gates the risky ones.

### JavaScript

**❌ Naive**

```js
// Executes whatever the model asked — including destructive actions, unreviewed.
async function step(action) {
  return tools[action.name].run(action.input);
}
```

**✅ Idiomatic**

```js
const needsApproval = (action) =>
  DESTRUCTIVE.has(action.name) || action.confidence < 0.7;

async function step(action, runId) {
  if (!needsApproval(action)) return tools[action.name].run(action.input);

  // Checkpoint: persist so the run survives a wait of minutes/days.
  await checkpoint(runId, action);
  const decision = await requestApproval(runId, action); // resolves on human input

  switch (decision.verdict) {
    case "approve": return tools[action.name].run(action.input);
    case "edit":    return tools[action.name].run(decision.input); // human tweaked it
    case "reject":  return { skipped: decision.reason };
  }
}
```

**🧠 Tradeoff** — `needsApproval` gates by blast radius (destructive tools) *and* confidence, so only
risky steps pause — the rest run at full speed. The `checkpoint` before `requestApproval` is what lets the
pause outlive the process, a [[saga]]/[[memento]] concern since the wait can be long. Offering `edit`, not
just approve/reject, means a human can fix an action instead of vetoing the whole run. Gate narrowly or
approval fatigue turns the gate into a rubber stamp.

### Python

**❌ Naive**

```python
def step(action) -> str:
    return tools[action.name].run(action.input)
```

**✅ Idiomatic**

```python
def needs_approval(action) -> bool:
    return action.name in DESTRUCTIVE or action.confidence < 0.7

async def step(action, run_id: str) -> dict:
    if not needs_approval(action):
        return tools[action.name].run(action.input)

    await checkpoint(run_id, action)                       # durable pause
    decision = await request_approval(run_id, action)      # awaits human

    match decision.verdict:
        case "approve": return tools[action.name].run(action.input)
        case "edit":    return tools[action.name].run(decision.input)
        case "reject":  return {"skipped": decision.reason}
```

**🧠 Tradeoff** — The gate combines a policy set (`DESTRUCTIVE`) with a confidence threshold; `match`
handles the three human verdicts. `checkpoint` before the await is the durability seam — back it with a
DB or a workflow engine (Temporal, Step Functions) so a pending approval survives a deploy. The Anthropic
tool runner's per-turn hooks let you gate inside the loop without hand-writing this, but the shape — pause,
persist, await, resume — is the same.

### Elixir

**❌ Naive**

```elixir
def step(action), do: apply(tools()[action.name], [action.input])
```

**✅ Idiomatic**

```elixir
defmodule HITL do
  def step(action, run_id) do
    if needs_approval?(action) do
      :ok = Checkpoint.save(run_id, action)               # durable pause
      case Approval.await(run_id, action) do              # blocks until a human decides
        {:approve, _}      -> run(action.name, action.input)
        {:edit, new_input} -> run(action.name, new_input)
        {:reject, reason}  -> {:skipped, reason}
      end
    else
      run(action.name, action.input)
    end
  end

  defp needs_approval?(action),
    do: action.name in destructive() or action.confidence < 0.7
end
```

**🧠 Tradeoff** — Pattern matching on the approval verdict makes approve/edit/reject three clean clauses.
`Checkpoint.save` before `Approval.await` persists the run, and because Elixir agents are naturally
processes (an [[actor]]), the awaiting run can be a supervised GenServer that survives and resumes — a good
fit for durable pause/resume. The gate stays a small predicate; keep it tight to avoid approval fatigue.

### Go

**❌ Naive**

```go
func Step(action Action) (string, error) {
    return tools[action.Name].Run(action.Input)
}
```

**✅ Idiomatic**

```go
func needsApproval(a Action) bool {
    return destructive[a.Name] || a.Confidence < 0.7
}

func Step(ctx context.Context, a Action, runID string) (string, error) {
    if !needsApproval(a) {
        return tools[a.Name].Run(a.Input)
    }
    if err := Checkpoint(runID, a); err != nil { // durable pause
        return "", err
    }
    decision, err := RequestApproval(ctx, runID, a) // blocks until human or ctx timeout
    if err != nil {
        return "", err
    }
    switch decision.Verdict {
    case "approve":
        return tools[a.Name].Run(a.Input)
    case "edit":
        return tools[a.Name].Run(decision.Input)
    default: // reject
        return "", fmt.Errorf("rejected: %s", decision.Reason)
    }
}
```

**🧠 Tradeoff** — The gate is a predicate over a destructive-tool set and a confidence threshold. Passing
`context.Context` into `RequestApproval` gives you the timeout policy for free — a pending approval that
never comes cancels via `ctx` instead of blocking forever. `Checkpoint` before the wait persists the run.
The explicit error returns make the reject and timeout paths impossible to ignore, which is exactly what
you want at a high-stakes gate.

## Applications

Real-world uses of Human-in-the-Loop:

- **Destructive-action approval** — a human confirms deletes, payments, and external sends.
- **Content moderation** — flag uncertain content for human review before publishing.
- **Agent rollout** — gate broadly during a pilot, loosen as the agent earns trust.
- **Compliance sign-off** — a person approves decisions that policy or law requires.
- **Active learning** — human corrections on low-confidence cases feed back into examples/training.

**In modern systems:**

- **Multi-agent** — the supervisor escalates a risky sub-agent action to a human before it executes.
- **Workflow engine** — an approval step that pauses the instance until a human acts (durable wait).
- **Low-code** — a "requires approval" flag on an action node in a visual builder.

## Related Patterns

- **ReAct Loop** — the agent whose gated steps this pattern pauses; HITL is the checkpoint in the loop.
- **Tool Use** — the gate lives on tool execution; destructive tools are the ones to gate.
- **Saga** — durable pause/resume across a long wait, with compensation if a step is rejected.
- **State** — the run's `running → awaiting-approval → resumed | aborted` lifecycle is a state machine.
