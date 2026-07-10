---
id: memory
category: ai
sequence: 12
title: Memory
also_known_as: [Agent Memory, Short-Term & Long-Term Memory, Context Management]
gof: false
kind: pattern
intent: "Give an agent memory beyond one context window — a rolling short-term summary and a retrievable long-term store — instead of resending everything."
frequency: medium
difficulty: advanced
tags: [ai, llm, memory, context, state]
related: [rag, memento, event-sourcing, actor]
languages: [javascript, python, elixir, go]
---

## Intent

Memory lets an agent remember across a long conversation and across sessions, without stuffing the
entire history into every prompt. It splits into two: **short-term memory** — a rolling, compacted
view of the current conversation that fits the context window — and **long-term memory** — a
persistent store of facts and past interactions, *retrieved* into the prompt only when relevant.

The model itself is stateless. Memory is the machinery around it that makes an agent feel like it
remembers.

## The Problem

The model forgets everything between calls, and the two obvious fixes both fail at scale:

- **Send the whole history every turn** — works for ten turns, then the conversation outgrows the
  context window. Costs climb linearly, latency with it, and eventually you hit the wall and the
  request fails.
- **Send nothing / a fixed window** — the agent forgets what you told it twenty turns ago (or last
  week), asks for the same information twice, and contradicts itself.

You need to keep *what matters* available without keeping *everything* in the prompt. That's two
different mechanisms: compaction for the running conversation, retrieval for durable facts.

## Structure

Key Components / Participants:

- **Short-term memory** — the recent turns verbatim plus a running summary of older ones; kept under
  a token budget by periodic compaction (a [[memento]]-like checkpoint of the conversation state).
- **Long-term memory** — a durable store (vector, key-value, or document) of facts, preferences, and
  past interactions, surviving across sessions.
- **Retriever** — pulls the few relevant long-term memories for the current turn (this is [[rag]]
  over the agent's own memory).
- **Writer** — decides what to persist to long-term memory as the conversation produces durable facts.

```
                     ┌──────────── short-term ────────────┐
turn ──▶ prompt = recent turns + running summary + retrieved facts ──▶ model ──▶ reply
              ▲                    ▲                  ▲                              │
              │              compact when          retrieve                     write durable
              │              over budget           (RAG over                    facts back
              └──────────────────────────────────  long-term store) ◀───────────────┘
```

## When to Use

- Conversations run long enough to exceed the context window.
- The agent must remember facts across sessions (preferences, prior decisions, user profile).
- Resending full history is too costly or slow.
- Different information has different lifetimes — some is turn-local, some is permanent.

## Advantages and Disadvantages

### Advantages
- Conversations and agents that outlast a single context window.
- Cost and latency stay bounded — you send a compacted view, not the full transcript.
- Durable facts persist across sessions, so the agent doesn't re-ask.
- Retrieval keeps the prompt focused on what's relevant *now*.

### Disadvantages
- Compaction is lossy — summarizing can drop a detail that later mattered.
- Deciding *what* to persist and *when* to retrieve is genuinely hard and app-specific.
- Two stores (short and long) add moving parts and consistency concerns.
- Stale or wrong long-term memories poison future answers.

## Common Mistakes

- **Naively resending everything** — the default that works in the demo and dies in production.
  Compact once you approach the budget.
- **Compacting too aggressively** — over-summarize and you lose the detail the next turn needed.
  Keep recent turns verbatim; summarize only the tail.
- **Persisting the whole transcript as "long-term memory"** — long-term memory is *curated facts*,
  not a dump. Write selectively, or retrieval returns noise.
- **Never expiring or correcting long-term memory** — a wrong fact remembered forever is worse than
  forgetting. Support update and delete ([[memento]]/[[event-sourcing]] for auditability).
- **Storing secrets in memory** — memories are replayed into future prompts; never persist
  credentials or sensitive data there.

## Key Takeaways

- Short-term memory is compaction; long-term memory is retrieval — two mechanisms.
- Keep recent turns verbatim, summarize the tail, retrieve durable facts on demand.
- Curate what you persist; long-term memory is facts, not a transcript dump.
- Support correcting and expiring memories — a wrong one poisons every future answer.

## Implementations

Short-term memory is a buffer with a compaction step; long-term is a `store` with `retrieve`/`write`.
The naive version resends everything; the idiomatic version compacts and retrieves.

### JavaScript

**❌ Naive**

```js
// Resend the entire history every turn — grows until it breaks.
class Chat {
  constructor() { this.history = []; }
  async say(msg) {
    this.history.push({ role: "user", content: msg });
    const reply = await callModel(this.history); // eventually exceeds the window
    this.history.push({ role: "assistant", content: reply });
    return reply;
  }
}
```

**✅ Idiomatic**

```js
class Memory {
  constructor(store, budget = 12) {
    this.recent = [];      // verbatim recent turns
    this.summary = "";     // rolling summary of older turns
    this.store = store;    // long-term
    this.budget = budget;
  }

  async say(msg) {
    const facts = await this.store.retrieve(msg, 3);        // long-term (RAG)
    const prompt = [
      { role: "system", content: `Summary so far: ${this.summary}\nRelevant: ${facts.join("; ")}` },
      ...this.recent,
      { role: "user", content: msg },
    ];
    const reply = await callModel(prompt);

    this.recent.push({ role: "user", content: msg }, { role: "assistant", content: reply });
    if (this.recent.length > this.budget) await this.compact();  // short-term
    await this.store.write(msg, reply);                          // persist durable facts
    return reply;
  }

  async compact() {
    const tail = this.recent.splice(0, this.recent.length - 4); // keep last 4 verbatim
    this.summary = await callModel(
      `Update the running summary with these turns.\nSummary: ${this.summary}\nTurns: ${JSON.stringify(tail)}`);
  }
}
```

**🧠 Tradeoff** — Recent turns stay verbatim, older ones fold into a rolling `summary` when the buffer
exceeds `budget`, and long-term facts are *retrieved* per turn — the two mechanisms, side by side. The
prompt stays bounded regardless of conversation length. The cost is a compaction call now and then plus
the retrieval, and the judgment of what `write` should persist — the genuinely hard part is curation, not code.

### Python

**❌ Naive**

```python
class Chat:
    def __init__(self):
        self.history = []
    def say(self, msg: str) -> str:
        self.history.append({"role": "user", "content": msg})
        reply = call_model(self.history)  # grows unbounded
        self.history.append({"role": "assistant", "content": reply})
        return reply
```

**✅ Idiomatic**

```python
class Memory:
    def __init__(self, store, budget: int = 12):
        self.recent: list[dict] = []
        self.summary = ""
        self.store = store
        self.budget = budget

    def say(self, msg: str) -> str:
        facts = self.store.retrieve(msg, k=3)            # long-term
        prompt = [
            {"role": "system", "content": f"Summary: {self.summary}\nRelevant: {'; '.join(facts)}"},
            *self.recent,
            {"role": "user", "content": msg},
        ]
        reply = call_model(prompt)
        self.recent += [{"role": "user", "content": msg}, {"role": "assistant", "content": reply}]
        if len(self.recent) > self.budget:
            self._compact()                              # short-term
        self.store.write(msg, reply)                     # persist
        return reply

    def _compact(self):
        tail, self.recent = self.recent[:-4], self.recent[-4:]  # keep last 4
        self.summary = call_model(
            f"Update the summary.\nSummary: {self.summary}\nTurns: {tail}")
```

**🧠 Tradeoff** — The class holds both memories; `store` is injected so short-term (compaction) and
long-term (a vector store, Redis, or the provider's memory tool) evolve independently. Keeping the last
few turns verbatim while summarizing the tail is the standard balance between fidelity and budget. The
Anthropic memory tool and server-side compaction can own pieces of this — the pattern is the same shape.

### Elixir

**❌ Naive**

```elixir
def say(history, msg) do
  history = history ++ [%{role: :user, content: msg}]
  reply = call_model(history)          # unbounded
  {reply, history ++ [%{role: :assistant, content: reply}]}
end
```

**✅ Idiomatic**

```elixir
defmodule Memory do
  use GenServer   # an actor owning its memory state

  def say(pid, msg), do: GenServer.call(pid, {:say, msg})

  def init(store), do: {:ok, %{recent: [], summary: "", store: store, budget: 12}}

  def handle_call({:say, msg}, _from, state) do
    facts = Store.retrieve(state.store, msg, 3)
    prompt = build(state.summary, facts, state.recent, msg)
    reply = call_model(prompt)

    recent = state.recent ++ [%{role: :user, content: msg}, %{role: :assistant, content: reply}]
    state = %{state | recent: recent} |> maybe_compact()
    Store.write(state.store, msg, reply)
    {:reply, reply, state}
  end

  defp maybe_compact(%{recent: r, budget: b} = s) when length(r) > b do
    {tail, keep} = Enum.split(r, length(r) - 4)
    %{s | recent: keep, summary: call_model("Update summary.\n#{s.summary}\n#{inspect(tail)}")}
  end
  defp maybe_compact(s), do: s
end
```

**🧠 Tradeoff** — A GenServer *is* the memory: an [[actor]] that owns its `recent`/`summary`/`store`
state and processes `say` messages serially, so there's no shared mutable history to race on. Compaction
is a guarded private function — the `when length(r) > b` clause fires it only over budget. This is the
most natural home for agent memory in Elixir: one process per conversation, state encapsulated.

### Go

**❌ Naive**

```go
type Chat struct{ history []Message }

func (c *Chat) Say(msg string) string {
    c.history = append(c.history, Message{"user", msg})
    reply := CallModel(c.history) // grows without bound
    c.history = append(c.history, Message{"assistant", reply})
    return reply
}
```

**✅ Idiomatic**

```go
type Memory struct {
    recent  []Message
    summary string
    store   Store
    budget  int
}

func (m *Memory) Say(msg string) string {
    facts := m.store.Retrieve(msg, 3) // long-term
    prompt := append([]Message{{
        Role:    "system",
        Content: "Summary: " + m.summary + "\nRelevant: " + strings.Join(facts, "; "),
    }}, m.recent...)
    prompt = append(prompt, Message{"user", msg})

    reply := CallModel(prompt)
    m.recent = append(m.recent, Message{"user", msg}, Message{"assistant", reply})
    if len(m.recent) > m.budget {
        m.compact() // short-term
    }
    m.store.Write(msg, reply)
    return reply
}

func (m *Memory) compact() {
    tail := m.recent[:len(m.recent)-4]
    m.recent = m.recent[len(m.recent)-4:] // keep last 4 verbatim
    m.summary = CallModel(fmt.Sprintf("Update summary.\n%s\n%v", m.summary, tail))
}
```

**🧠 Tradeoff** — `Memory` holds both stores; `Store` is a small interface (`Retrieve`, `Write`) so the
long-term backend swaps freely. The compaction slice-arithmetic keeps the last four turns verbatim.
This struct isn't goroutine-safe as written — a chat server would guard `Say` with a mutex or run one
`Memory` per goroutine, the Go equivalent of the Elixir actor's serial processing.

## Applications

Real-world uses of Memory:

- **Long conversations** — chat that stays coherent past the context window via compaction.
- **Personal assistants** — remember preferences, names, and past decisions across sessions.
- **Support agents** — recall a customer's history without re-asking.
- **Long-running coding agents** — a notes/scratchpad file the agent writes to and consults later.
- **Personalization** — a per-user long-term store retrieved into each session's prompt.

**In modern systems:**

- **Multi-agent** — a shared long-term store (a blackboard) plus per-agent short-term context.
- **Workflow engine** — checkpoint an agent's memory so a crashed long-running run resumes (a [[memento]]).
- **Low-code** — a "remembers the user" toggle backed by a per-user memory store.

## Related Patterns

- **Retrieval-Augmented Generation** — long-term memory is RAG over the agent's own past, not documents.
- **Memento** — short-term compaction and checkpointing snapshot conversation state to restore later.
- **Event Sourcing** — persisting the message log as the source of truth, folding it into current state.
- **Actor** — one process per conversation owning its memory is the cleanest concurrency model.
