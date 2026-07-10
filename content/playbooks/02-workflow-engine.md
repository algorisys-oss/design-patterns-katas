---
id: playbook-workflow-engine
category: playbooks
sequence: 2
title: Building a Workflow Engine
also_known_as: [Orchestration Engine, Durable Execution]
gof: false
kind: playbook
intent: "Run a multi-step process reliably — steps, state, retries, and compensation — where the flow is data an orchestrator drives, and a crash resumes instead of restarting."
frequency: high
difficulty: advanced
tags: [playbook, workflow, orchestration, state-machine, saga, resilience]
related: [command, state, saga, mediator, event-sourcing, chain-of-responsibility, memento]
languages: []
---

## Intent

A workflow engine runs a **multi-step process reliably**: order → payment → ship, or extract →
transform → load, or any sequence where steps can fail, retry, wait, and must be resumable. The
flow itself is data an orchestrator drives, so a crash resumes from the last good step instead
of starting over.

This playbook maps the patterns behind that durability. Each is taught as its own kata; here is
how they compose into an engine.

## The Shape

```
 workflow def ──▶ orchestrator (Mediator) ──▶ step queue ──▶ executors (Worker Pool)
   (data)              │                                          │
                       │◀──────── step-done events ───────────────┘
                       │                                    each step:
              instance state (State machine)                 Command  + Retry/Timeout
              persisted as an event log                       + compensation (Saga)
              (Event Sourcing) ──▶ resume on crash
```

Steps never call each other — they report to the orchestrator, and it decides what runs next.
Every transition is written to a log, so instance state is a fold over that history.

## The Patterns You'll Reach For

- **Command** — each step is a Command: queued, logged, retried, replayed, and rolled back
  through a paired compensating command. This is the atom of the whole engine.
- **Mediator** — the orchestrator *is* the mediator. A step reports completion; the orchestrator,
  not the step, chooses the successor. Coordination lives in one auditable place.
- **State** — a workflow instance is a state machine: `pending → running → waiting → done |
  failed`, with only legal transitions allowed and each one captured.
- **Saga** — the resilience model for long-running flows: each step carries a compensating
  action, so a late failure unwinds the earlier committed steps in reverse.
- **Event Sourcing** — the run's history is its event log; state is derived by folding it, which
  gives replay, resume, and audit for free.
- **Chain of Responsibility** — step middleware (auth → quota → audit) each step passes through
  before it runs.
- **Template Method** — a step base fixes the skeleton (validate → run → record) and each concrete
  step fills in only `run`.
- **Retry / Timeout / Circuit Breaker** — per-step resilience: retry with backoff, a deadline
  that fails a hung step, a breaker that fails fast when a downstream service is down.
- **Dead-Letter Queue** — a step that exhausts its retries lands in a DLQ for inspection instead
  of killing the whole run.
- **Producer–Consumer / Worker Pool** — the scheduler produces ready steps; a bounded pool of
  executors consumes them, so pool size caps concurrency.
- **Memento** — a checkpoint captured before each step, so a crashed run resumes from the last
  good state.
- **Pipes and Filters** — a linear workflow *is* pipes-and-filters: each step transforms the
  payload and passes it on.

When a step's work is a model call, the **AI & LLM Patterns** family supplies the rest —
**Prompt Chaining** (a step that is itself a pipeline of focused calls), **Structured Output**
(so a step returns data the orchestrator can branch on), **Model Cascade** (escalate a step to a
stronger model when it fails a gate), and **Human-in-the-Loop** (an approval step that pauses the
instance durably).

## How the Approach Changed

1. **Cron + scripts** — steps chained by shell and prayer; a mid-run crash means manual cleanup.
2. **Job queues** — durable steps (Sidekiq, Celery, Oban) with retries, but the *flow between*
   steps still lives in code.
3. **State machines** — the transitions become explicit and enforced, but state is often a column
   you mutate.
4. **Durable orchestration** — Temporal, Step Functions, Camunda: the flow is a definition, the
   history is the source of truth, and resume-after-crash is the headline feature.
5. **Agentic workflows** — the same engine now runs steps whose *next step is chosen by a model*,
   not just by a static branch — which is where the multi-agent playbook picks up.

The durability patterns are constant. What moved is how much of the flow is fixed data versus
decided at runtime.

## Pitfalls

- **A god orchestrator.** The Mediator warning: as routing rules pile into one place, it becomes
  the unmaintainable center. Keep step logic in the steps.
- **Non-idempotent steps.** Retry and resume replay steps — a step that isn't idempotent double-
  charges or double-ships. Design every step to be safely re-run.
- **Forgetting compensation.** Without a Saga's undo per step, a failure halfway through leaves
  the world half-changed and no way back.
- **Mutable state instead of a log.** Overwriting instance state loses the history that makes
  replay, audit, and debugging possible.

## Related Playbooks

- **Building a JSON Low-Code Framework** — a workflow definition is a low-code graph; same
  data-describes-behavior kernel, applied to steps.
- **Orchestrating Multi-Agent Tasks** — a multi-agent run is a workflow whose next step a model
  decides; the durability patterns here carry straight over.
