---
id: query-rewriting
category: ai
sequence: 4
title: Query Rewriting
also_known_as: [Query Expansion, Multi-Query, HyDE]
gof: false
kind: pattern
intent: "Transform the user's raw question before retrieval — expand, decompose, or hypothesize — so the search actually matches the stored chunks."
frequency: medium
difficulty: intermediate
tags: [ai, llm, rag, retrieval, query-rewriting]
related: [rag, hybrid-search, prompt-chaining, strategy]
languages: [javascript, python, elixir, go]
---

## Intent

Query Rewriting reshapes the question *before* it hits the retriever. Users ask terse, ambiguous,
context-dependent questions; your chunks are written in full, standalone prose. Rewriting bridges
that gap — expanding, decomposing, or generating a hypothetical answer — so the search vector lands
near the chunk that actually holds the answer.

## The Problem

The raw query is often a poor search key:

- **Context-dependent** — "what about the enterprise plan?" means nothing on its own; the referent
  is three turns back. Embed it and you retrieve noise.
- **Terse or keyword-y** — "refund window" is much shorter than the paragraph that answers it, so
  the vectors barely align.
- **Multi-part** — "compare the free and pro tiers on storage and support" is really four
  retrievals fused into one; a single search can't serve them all.

The retriever isn't the problem — the *query* is. Rewrite it into something the index can match.

## Structure

Key Components / Participants:

- **Rewriter** — an LLM (or rules) that turns the raw query into one or more search queries.
- **Strategies** — *contextualize* (resolve pronouns using history), *multi-query* (generate N
  paraphrases), *decompose* (split a multi-part question), *HyDE* (generate a hypothetical answer
  and search with *its* embedding).
- **Retriever** — runs each rewritten query; results are fused (see [[hybrid-search]]).

```
raw query ─┐
history ───┴──▶ rewriter (LLM) ──▶ [q1, q2, q3]  ──▶ retriever ──▶ fuse ──▶ chunks
                (contextualize /       (search-ready,
                 multi-query /          standalone)
                 decompose / HyDE)
```

## When to Use

- Queries arrive mid-conversation with pronouns and implicit context.
- The corpus is written in full sentences but users type keywords (or vice versa).
- Questions are compound and one retrieval can't cover them.
- Recall is low even with good chunks and hybrid search — the query itself is the bottleneck.

## Advantages and Disadvantages

### Advantages
- Turns unsearchable questions into searchable ones — a direct recall boost.
- Multi-query and decomposition cover compound questions a single search can't.
- HyDE closes the "short question vs. long answer" vector gap.
- Cheap relative to the win — one small model call before retrieval.

### Disadvantages
- Adds a model call (latency and cost) before every retrieval.
- A bad rewrite can *steer retrieval wrong* — drift away from what the user meant.
- Multi-query multiplies retrieval work; you must fuse and cap results.

## Common Mistakes

- **Rewriting when you don't need to** — a clear, standalone query needs no rewrite; the extra call
  is pure latency. Gate it.
- **Losing the user's intent** — an over-eager rewrite "corrects" the question into a different one.
  Keep rewrites faithful; prefer expansion over replacement.
- **Not fusing multi-query results** — running three queries and concatenating triples the noise;
  fuse by rank and dedupe.
- **HyDE on factual lookups** — a hallucinated hypothetical answer can pull retrieval toward the
  hallucination. Use it for exploratory queries, not exact-fact ones.

## Key Takeaways

- Fix the query before blaming the retriever — often the query is the bottleneck.
- Contextualize mid-conversation questions into standalone ones.
- Multi-query and decomposition cover what a single search misses; fuse the results.
- Gate rewriting — don't pay for it when the query is already good.

## Implementations

The rewriter is a model call, `callModel(prompt) -> string`, returning one or more search queries.
The naive version searches the raw query verbatim; the idiomatic version contextualizes and expands
into multiple queries, then fuses.

### JavaScript

**❌ Naive**

```js
// Searches the raw question — pronouns and terseness wreck retrieval.
async function retrieve(query) {
  return search(query); // "what about pricing?" → noise
}
```

**✅ Idiomatic**

```js
async function rewrite(query, history) {
  const prompt =
    `Rewrite the user's question into 3 standalone search queries. ` +
    `Resolve any references using the history. Return one per line.\n\n` +
    `History:\n${history}\n\nQuestion: ${query}`;
  return (await callModel(prompt)).split("\n").map((q) => q.trim()).filter(Boolean);
}

async function retrieve(query, history) {
  const queries = await rewrite(query, history);
  const lists = await Promise.all(queries.map((q) => search(q)));
  return fuse(lists).slice(0, 5); // rrf + dedupe from the hybrid-search kata
}
```

**🧠 Tradeoff** — One model call expands the query into standalone, searchable variants; `Promise.all`
runs the retrievals concurrently and `fuse` (RRF) merges them. The recall gain is real, but you've
added a model call on the hot path and multiplied retrieval work — gate the rewrite for queries that
are already clear, and cap the query count.

### Python

**❌ Naive**

```python
def retrieve(query: str) -> list[str]:
    return search(query)
```

**✅ Idiomatic**

```python
def rewrite(query: str, history: str) -> list[str]:
    prompt = (
        "Rewrite the user's question into 3 standalone search queries. "
        "Resolve any references using the history. Return one per line.\n\n"
        f"History:\n{history}\n\nQuestion: {query}"
    )
    return [q.strip() for q in call_model(prompt).splitlines() if q.strip()]

def retrieve(query: str, history: str) -> list[str]:
    queries = rewrite(query, history)
    lists = [search(q) for q in queries]
    return fuse(lists)[:5]
```

**🧠 Tradeoff** — The rewriter returns a list, so *contextualize*, *multi-query*, and *decompose* are
all the same shape — one prompt, N queries out. Swap the prompt (or add a HyDE variant) without
touching `retrieve`. For factual lookups, gate the rewrite behind a cheap "is this query already
standalone?" check to avoid steering retrieval off the user's intent.

### Elixir

**❌ Naive**

```elixir
def retrieve(query), do: search(query)
```

**✅ Idiomatic**

```elixir
defmodule Rewrite do
  def rewrite(query, history) do
    """
    Rewrite the user's question into 3 standalone search queries.
    Resolve any references using the history. Return one per line.

    History:
    #{history}

    Question: #{query}
    """
    |> call_model()
    |> String.split("\n", trim: true)
    |> Enum.map(&String.trim/1)
  end

  def retrieve(query, history) do
    query
    |> rewrite(history)
    |> Task.async_stream(&search/1)
    |> Enum.map(fn {:ok, list} -> list end)
    |> fuse()
    |> Enum.take(5)
  end
end
```

**🧠 Tradeoff** — The rewrite is one piped model call producing a list of queries, and
`Task.async_stream` retrieves them concurrently before `fuse` merges — the same fan-out shape as the
hybrid-search kata, reused. Pattern matching on `{:ok, list}` keeps the happy path clean; add an
`{:error, _}` clause when a retrieval can fail and you want to drop it rather than crash the stream.

### Go

**❌ Naive**

```go
func Retrieve(query string) []string {
    return Search(query)
}
```

**✅ Idiomatic**

```go
func Rewrite(query, history string) []string {
    prompt := fmt.Sprintf(
        "Rewrite the user's question into 3 standalone search queries. "+
            "Resolve any references using the history. Return one per line.\n\n"+
            "History:\n%s\n\nQuestion: %s", history, query)
    var queries []string
    for _, line := range strings.Split(CallModel(prompt), "\n") {
        if q := strings.TrimSpace(line); q != "" {
            queries = append(queries, q)
        }
    }
    return queries
}

func Retrieve(query, history string) []string {
    queries := Rewrite(query, history)
    lists := make([][]string, len(queries))
    var wg sync.WaitGroup
    for i, q := range queries {
        wg.Add(1)
        go func(i int, q string) { defer wg.Done(); lists[i] = Search(q) }(i, q)
    }
    wg.Wait()
    return firstN(RRF(lists, 60), 5)
}
```

**🧠 Tradeoff** — Each rewritten query retrieves in its own goroutine, writing into a pre-sized slot
so there's no shared-map contention, then `RRF` fuses. Passing `i, q` into the closure avoids the
classic loop-variable capture bug. The rewrite call is sequential and on the critical path — the
place to add gating so trivially-clear queries skip it.

## Applications

Real-world uses of Query Rewriting:

- **Conversational RAG** — resolve "it", "that plan", "the second one" into standalone queries.
- **Search UX** — expand short keyword queries into richer semantic ones behind the scenes.
- **Compound questions** — decompose "compare X and Y on A and B" into separate retrievals.
- **HyDE for exploratory search** — generate a hypothetical answer and retrieve with its embedding.
- **Cross-lingual retrieval** — rewrite the query into the corpus's language before searching.

**In modern systems:**

- **Low-code** — a chat-over-your-docs widget that quietly makes follow-up questions searchable.
- **Workflow engine** — a normalization step that turns free-text input into structured search keys.
- **Multi-agent** — an agent that reformulates a task into precise sub-queries before delegating retrieval.

## Related Patterns

- **Retrieval-Augmented Generation** — query rewriting is the front door; it feeds the retriever.
- **Hybrid Search & Reranking** — rewriting boosts recall going in; reranking boosts precision coming out.
- **Prompt Chaining** — rewrite → retrieve → answer is a chain; the rewrite is the first link.
- **Strategy** — contextualize / multi-query / decompose / HyDE are interchangeable rewrite strategies.
