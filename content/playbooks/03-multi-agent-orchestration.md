---
id: playbook-multi-agent
category: playbooks
sequence: 3
title: Orchestrating Multi-Agent Tasks
also_known_as: [Agent Orchestration, LLM Agent Systems]
gof: false
kind: playbook
intent: "Coordinate several LLM agents and their tools on one task — a supervisor routes work, agents call tools, and the whole run is logged, bounded, and resumable."
frequency: high
difficulty: advanced
tags: [playbook, multi-agent, llm, orchestration, tools, agentic]
related: [mediator, command, strategy, actor, fan-out-fan-in, facade, circuit-breaker]
languages: []
---

## Intent

A multi-agent system coordinates several LLM agents and their tools on one task: a supervisor
breaks the work down, specialist agents handle pieces, tools do the side effects, and the whole
run must be logged, bounded, and resumable. It is the newest domain in this catalog — and it
leans on the *oldest* patterns, because an agent is a component like any other.

This playbook is the map from those patterns to an agent runtime. The surprise is how little is
new: the model is a black box, but everything around it is a design-patterns problem.

## The Shape

```
        task ──▶ supervisor (Mediator) ──▶ router ──▶ specialist agents (Actors)
                     │                                      │
                     │                              each agent turn:
              fan-out sub-agents                     model call (Strategy)
              (Fan-out/Fan-in) ──▶ gather              + tools (Command + Adapter)
                     │                                  + Retry/Timeout/Breaker
              shared event bus (Pub-Sub)                + Result, not exceptions
              message log (Event Sourcing) ──▶ replay / resume
```

Agents don't talk N-to-N; they report to a supervisor. Each agent owns its own context (an
actor), calls tools through one uniform interface, and every model and tool call is a logged,
replayable command.

## The Patterns You'll Reach For

- **Mediator** — a supervisor agent coordinates workers so they don't talk N-to-N. All traffic
  goes through the hub, which keeps coordination auditable and stops the combinatorial mess.
- **Actor** — each agent is an actor with a mailbox: it processes one message at a time, owns
  private context, and never shares memory. The cleanest model for concurrent agents.
- **Command** — a tool call is a Command object the orchestrator can log, gate behind approval,
  and re-run deterministically when replaying a session.
- **Strategy** — swap the planning strategy (ReAct vs plan-and-execute) or the model behind a
  single `generate` call without touching the orchestration.
- **Fan-out / Fan-in** — spawn N sub-agents over slices of a task, then gather and merge their
  results: map-reduce for agents, and how a supervisor parallelizes.
- **Adapter** — wrap heterogeneous tool and model APIs behind one uniform `call` interface, so a
  new provider is a new adapter, not a rewrite.
- **Facade** — one `agent.run(task)` over the tangle of model, memory, tools, and planner.
- **Chain of Responsibility** — a fallback model chain (fast → strong → human), or tool dispatch
  where each handler claims only the calls it recognizes.
- **Decorator** — wrap a raw model call with retry, caching, guardrail, and logging layers, each
  added independently.
- **Retry / Timeout / Circuit Breaker** — resilience around flaky model and tool calls: back off
  on rate limits, bound a hung tool, trip the breaker to a fallback instead of hammering.
- **Pub-Sub** — a shared event bus (a blackboard) agents publish findings to and subscribe to
  each other's, coordinating without direct coupling.
- **Event Sourcing / Memento** — the message and tool-call log is the source of truth; state is
  derived from it, so a session replays exactly, and you can snapshot and roll back a dead-end
  branch.
- **Result over exceptions** — a tool returns `Result<value, error>` so the agent handles failure
  as data it can reason about, instead of an exception thrown mid-loop.

**And the LLM-specific patterns**, taught in the **AI & LLM Patterns** family, are the substrate an
agent runtime is built from: the **ReAct Loop** (think → act → observe), **Tool Use** (typed
function calling), **Reflection** (a critic agent), the **Router** (dispatch to the specialist),
**Memory** (short-term + long-term), **Guardrails** (gate every hand-off), **LLM-as-Judge** (grade a
worker's output), and **Human-in-the-Loop** (approve the risky action). This playbook is the
assembly; those katas are the parts.

## How the Approach Changed

1. **One prompt** — a single call in, a single answer out; no tools, no loop.
2. **Tool use** — the model can call functions, so now you need a dispatcher, adapters, and
   error handling around each call.
3. **Single agent loop** — think → act → observe, repeated; suddenly it's a state machine with
   retries, timeouts, and a context to manage.
4. **Multi-agent** — a supervisor delegates to specialists, fans work out, and gathers it back;
   the coordination is pure Mediator + Actor + Fan-out/Fan-in.
5. **Durable agent runs** — the log is the truth, runs resume after a crash, and every tool call
   is gated and replayable — the exact durability the workflow playbook describes.

The model got more capable, so more of the classic patterns became necessary — not fewer. The
newest systems in software are built almost entirely from the oldest ideas in this catalog.

## Pitfalls

- **The god supervisor.** The Mediator trap in agentic clothing: cramming every routing and
  arbitration rule into one prompt until it's unsteerable.
- **Unbounded loops and spend.** Without a Worker Pool cap, retry limits, and a dead-letter for
  tasks that won't complete, an agent loops forever and drains the budget.
- **Trusting tool output.** A tool call is a Command with real side effects — gate destructive
  ones behind approval and treat every result as untrusted input.
- **Exceptions across the loop.** Letting a tool throw unwinds the agent's turn; return `Result`
  so failure is data the agent can route around.
- **No replay.** If the run isn't an event log, you can't reproduce a bad session or resume a
  crashed one — the same mistake as a workflow engine that mutates state.

## Related Playbooks

- **Building a Workflow Engine** — a multi-agent run is a workflow whose next step a model
  decides; the durability, retry, and compensation patterns carry over directly.
- **Building a JSON Low-Code Framework** — an agent's plan is a small DSL, interpreted by a
  runtime rather than executed as raw code.
