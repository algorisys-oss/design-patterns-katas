---
id: hybrid-search
category: ai
sequence: 3
title: Hybrid Search & Reranking
also_known_as: [Dense + Sparse Retrieval, Two-Stage Retrieval]
gof: false
kind: pattern
intent: "Retrieve with both keyword and vector search, merge the results, then rerank the merged set so the best chunks land at the top."
frequency: high
difficulty: advanced
tags: [ai, llm, rag, retrieval, reranking, search]
related: [rag, chunking-embedding, query-rewriting, strategy]
languages: [javascript, python, elixir, go]
---

## Intent

Hybrid Search & Reranking is the quality lever for RAG. Pure vector search is good at meaning but
blind to exact terms; keyword search is the opposite. Run **both**, merge their results, then
**rerank** the merged set with a more precise scorer so the chunk that actually answers the
question ends up in the top few you send to the model.

## The Problem

A single retriever leaves answers on the table:

- **Vector-only** — misses exact identifiers, error codes, part numbers, and rare terms. Ask for
  "error E-4021" and cosine similarity happily returns passages about *errors in general*.
- **Keyword-only (BM25)** — misses synonyms and paraphrase. Ask "how do I get my money back" and a
  chunk titled "Refund policy" scores zero because the words don't overlap.

Even when you retrieve the right chunk, it may sit at rank 8 while three near-misses rank above it.
The model reads top-to-bottom and weights early context more — order matters. Reranking fixes the
order that first-stage retrieval got roughly right.

## Structure

Key Components / Participants:

- **Sparse retriever** — keyword/BM25 search; exact-term recall.
- **Dense retriever** — embedding similarity; semantic recall.
- **Fusion** — merges the two ranked lists into one (Reciprocal Rank Fusion is the common,
  score-free way).
- **Reranker** — a second-stage, higher-precision scorer (a cross-encoder or an LLM) that reorders
  the merged candidates.

```
query ──┬──▶ sparse (BM25) ──┐
        │                     ├──▶ fuse (RRF) ──▶ candidates ──▶ rerank ──▶ top-k
        └──▶ dense (vectors) ─┘                                  (cross-encoder
                                                                  / LLM scorer)
```

## When to Use

- Queries mix exact terms (IDs, names, codes) with natural-language intent.
- Recall from a single retriever is leaving the right chunk out of the top-k.
- The corpus has jargon or synonyms that vector search alone doesn't bridge.
- You can afford a second-stage rerank over a small candidate set (retrieve 50, rerank to 5).

## Advantages and Disadvantages

### Advantages
- Catches both exact-term and semantic matches — higher recall than either alone.
- Reranking sharply improves precision-at-k, which is what the model actually sees.
- Fusion (RRF) needs no score calibration between the two retrievers — it merges ranks.
- Each retriever and the reranker are swappable behind their interfaces.

### Disadvantages
- More moving parts and more latency — two searches plus a rerank per query.
- Reranking a large candidate set is expensive; you must bound the set first.
- Two indexes (inverted + vector) to build and keep in sync.

## Common Mistakes

- **Reranking everything** — a cross-encoder over 10,000 chunks is unusable. First-stage retrieval
  narrows to ~50; the reranker refines those.
- **Naively averaging scores** — BM25 and cosine live on different scales; averaging is
  meaningless. Fuse by rank (RRF), or normalize deliberately.
- **Skipping fusion, concatenating instead** — dumping both lists back to back double-counts
  overlaps and loses the signal that a chunk ranked high in *both*.
- **Ignoring latency budget** — two retrievers plus a rerank can blow an interactive latency target;
  measure it.

## Key Takeaways

- Combine sparse (exact) and dense (semantic) retrieval — neither alone is enough.
- Fuse by rank (RRF) to avoid calibrating incompatible scores.
- Rerank a *small* candidate set to fix precision-at-k, the order the model reads.
- Retrieve wide, rerank narrow.

## Implementations

We treat `sparse(query)` and `dense(query)` as retriever boundaries returning ranked chunk IDs, and
`rerank(query, ids)` as a precise scorer. The naive version uses one retriever; the idiomatic
version fuses two with RRF and reranks the top candidates.

### JavaScript

**❌ Naive**

```js
// One retriever, whatever it misses is simply gone.
async function search(query, k = 5) {
  return dense(query, k); // semantic only — misses exact terms
}
```

**✅ Idiomatic**

```js
// Reciprocal Rank Fusion: score by 1/(k0 + rank) across both lists.
function rrf(lists, k0 = 60) {
  const scores = new Map();
  for (const list of lists) {
    list.forEach((id, rank) =>
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k0 + rank)));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

async function search(query, k = 5) {
  const [s, d] = await Promise.all([sparse(query, 50), dense(query, 50)]);
  const fused = rrf([s, d]).slice(0, 25);    // retrieve wide
  const reranked = await rerank(query, fused); // rerank narrow
  return reranked.slice(0, k);
}
```

**🧠 Tradeoff** — `Promise.all` runs the two retrievers concurrently, RRF fuses by rank so BM25 and
cosine never have to share a scale, and the rerank only touches 25 candidates. The win is
recall *and* precision; the cost is a two-index setup and a rerank call on the hot path — budget
its latency.

### Python

**❌ Naive**

```python
def search(query: str, k: int = 5) -> list[str]:
    return dense(query, k)
```

**✅ Idiomatic**

```python
from collections import defaultdict

def rrf(lists: list[list[str]], k0: int = 60) -> list[str]:
    scores: dict[str, float] = defaultdict(float)
    for lst in lists:
        for rank, doc_id in enumerate(lst):
            scores[doc_id] += 1 / (k0 + rank)
    return sorted(scores, key=scores.get, reverse=True)

def search(query: str, k: int = 5) -> list[str]:
    fused = rrf([sparse(query, 50), dense(query, 50)])[:25]
    return rerank(query, fused)[:k]
```

**🧠 Tradeoff** — RRF is a few lines over a `defaultdict`; the retrievers and reranker are injected
functions, so swapping BM25 for Elasticsearch or the reranker for a Cohere/cross-encoder model is a
call-site change, not a rewrite. Run the two retrievers with `asyncio.gather` when they're I/O-bound
to reclaim the latency the extra stage costs.

### Elixir

**❌ Naive**

```elixir
def search(query, k \\ 5), do: dense(query, k)
```

**✅ Idiomatic**

```elixir
defmodule Hybrid do
  def rrf(lists, k0 \\ 60) do
    lists
    |> Enum.flat_map(fn list ->
      list |> Enum.with_index() |> Enum.map(fn {id, rank} -> {id, 1 / (k0 + rank)} end)
    end)
    |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))
    |> Enum.map(fn {id, scores} -> {id, Enum.sum(scores)} end)
    |> Enum.sort_by(&elem(&1, 1), :desc)
    |> Enum.map(&elem(&1, 0))
  end

  def search(query, k \\ 5) do
    [sparse: [query, 50], dense: [query, 50]]
    |> Task.async_stream(fn {fun, args} -> apply(__MODULE__, fun, args) end)
    |> Enum.map(fn {:ok, list} -> list end)
    |> rrf()
    |> Enum.take(25)
    |> then(&rerank(query, &1))
    |> Enum.take(k)
  end
end
```

**🧠 Tradeoff** — `Task.async_stream` fires both retrievers concurrently, then the results flow
through a pure `rrf` pipeline into the rerank. Fusion as a group-by-and-sum reads cleanly in
Elixir's pipeline style. The cost, as always here, is that the real retrievers (a BM25 index, a
vector store) live outside the process — this shows the orchestration, which is the pattern.

### Go

**❌ Naive**

```go
func Search(query string, k int) []string {
    return Dense(query, k)
}
```

**✅ Idiomatic**

```go
func RRF(lists [][]string, k0 float64) []string {
    scores := map[string]float64{}
    for _, list := range lists {
        for rank, id := range list {
            scores[id] += 1 / (k0 + float64(rank))
        }
    }
    ids := make([]string, 0, len(scores))
    for id := range scores {
        ids = append(ids, id)
    }
    sort.Slice(ids, func(i, j int) bool { return scores[ids[i]] > scores[ids[j]] })
    return ids
}

func Search(query string, k int) []string {
    var s, d []string
    var wg sync.WaitGroup
    wg.Add(2)
    go func() { defer wg.Done(); s = Sparse(query, 50) }()
    go func() { defer wg.Done(); d = Dense(query, 50) }()
    wg.Wait()

    fused := RRF([][]string{s, d}, 60)
    if len(fused) > 25 {
        fused = fused[:25]
    }
    return Rerank(query, fused)[:k]
}
```

**🧠 Tradeoff** — A `WaitGroup` runs the two retrievers as goroutines and joins before fusing — the
idiomatic Go fan-out/fan-in for the concurrent retrieval. RRF over a map is straightforward. The
sort captures `scores` in the closure, which is fine here; for very large candidate sets a slice of
structs avoids repeated map lookups.

## Applications

Real-world uses of Hybrid Search & Reranking:

- **Enterprise & product search** — queries mix product names/SKUs with natural language.
- **Support Q&A** — user phrasing ("get my money back") vs. doc terms ("refund"), bridged by hybrid.
- **Code search** — exact symbol names (sparse) plus "where do we handle retries" (dense).
- **Legal/medical retrieval** — precise terminology where missing an exact term is unacceptable.
- **RAG quality upgrades** — the usual first fix when a pure-vector RAG returns near-misses.

**In modern systems:**

- **Low-code** — a search widget whose relevance "just works" across jargon and plain language.
- **Workflow engine** — a retrieval step that fuses multiple sources before enriching the payload.
- **Multi-agent** — a research agent that fans out sparse and dense queries, then reranks for its peers.

## Related Patterns

- **Retrieval-Augmented Generation** — hybrid search is the high-quality retriever RAG plugs in.
- **Chunking & Embedding** — good chunks are what both retrievers search over.
- **Query Rewriting** — reshape the query before hybrid search for another recall boost.
- **Strategy** — each retriever and the reranker are interchangeable strategies behind one search call.
