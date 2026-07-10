---
id: semantic-caching
category: ai
sequence: 15
title: Semantic Caching
also_known_as: [Embedding Cache, Similarity Cache]
gof: false
kind: pattern
intent: "Cache model responses keyed by meaning, so a near-duplicate request returns a stored answer instead of a fresh, expensive call."
frequency: medium
difficulty: intermediate
tags: [ai, llm, caching, embeddings, cost, latency]
related: [memoization, cache-aside, proxy, chunking-embedding]
languages: [javascript, python, elixir, go]
---

## Intent

Semantic Caching serves a cached answer when a new request *means the same thing* as a past one,
even if the words differ. Ordinary caching keys on exact input; two users asking "what's your refund
policy?" and "how do I get a refund?" miss each other and both pay for a full model call. Semantic
caching keys on the input's **embedding** and matches by similarity, so paraphrases hit the same
entry — cutting cost and latency on the repetitive long tail of real traffic.

## The Problem

Exact-match caching barely helps LLM traffic:

- **Natural language varies infinitely** — the same question arrives in a hundred phrasings, and an
  exact-key cache treats each as a miss. Hit rates stay near zero.
- **LLM calls are the expensive part** — every miss is a slow, paid generation. On a support bot
  where 40% of questions are the same five FAQs in different words, exact caching leaves that saving
  on the table.

Matching by meaning turns "the same question, reworded" into a cache hit.

## Structure

Key Components / Participants:

- **Embedder** — turns the request into a vector (see [[chunking-embedding]]).
- **Cache store** — holds `(embedding, request, response)` entries and answers nearest-neighbour
  queries.
- **Threshold** — the similarity cutoff above which a match counts as a hit (the key tuning knob).
- **Fallback** — on a miss, call the model, then store the new `(embedding, request, response)`.

```
request ──▶ embed ──▶ nearest entry ──▶ similarity ≥ threshold?
                                             │
                        ┌────────────────────┴───────────────────┐
                        yes (HIT)                            no (MISS)
                        return cached response          call model ──▶ store ──▶ return
```

## When to Use

- A meaningful fraction of requests are semantic duplicates (FAQs, common queries).
- The model call dominates cost or latency and answers are stable enough to reuse.
- Slightly-stale or approximate answers are acceptable for the cached class of queries.
- You can tolerate the (small) risk of a near-match returning a not-quite-right answer.

## Advantages and Disadvantages

### Advantages
- Real hit rates on natural-language traffic where exact caching gets ~zero.
- Cuts cost and latency on the repetitive tail — often the majority of volume.
- Sits in front of any model as a [[cache-aside]] layer; the caller is unchanged.
- Tunable: raise the threshold for precision, lower it for hit rate.

### Disadvantages
- A too-low threshold serves subtly-wrong answers to *similar-but-different* questions.
- Adds an embed + vector lookup to every request (cheap, but non-zero).
- Stale answers if the underlying data changed — needs invalidation for volatile content.
- Personalized or context-dependent answers must not be cached across users.

## Common Mistakes

- **Threshold too loose** — "how do I cancel?" and "how do I renew?" can embed close together;
  a low cutoff serves the wrong answer. Tune conservatively and monitor false hits.
- **Caching personalized answers** — a response about *this user's* account must never be served to
  another. Scope the cache key by user/context, or don't cache it.
- **No invalidation** — caching answers over data that changes (prices, inventory) serves stale
  facts. Expire by TTL or invalidate on write.
- **Ignoring the embed cost** — every request now embeds; batch or use a small, fast embedder so the
  cache layer doesn't cost more than it saves on low-hit traffic.

## Key Takeaways

- Key on meaning (embedding), not exact text, to hit paraphrases.
- The similarity threshold is the dial: precision vs. hit rate.
- Scope by user/context and invalidate on stale data — never serve the wrong or old answer.
- It's [[cache-aside]] with a vector lookup; the model call is the miss path.

## Implementations

The cache embeds the request, looks up the nearest entry, and returns it on a hit above threshold,
else calls the model and stores. The naive version is exact-key; the idiomatic version matches by
similarity.

### JavaScript

**❌ Naive**

```js
// Exact-string key — every rephrase misses.
const cache = new Map();
async function ask(q) {
  if (cache.has(q)) return cache.get(q);
  const a = await callModel(q);
  cache.set(q, a);
  return a;
}
```

**✅ Idiomatic**

```js
class SemanticCache {
  constructor(threshold = 0.92) {
    this.entries = []; // [{ embedding, response }]
    this.threshold = threshold;
  }

  async ask(query) {
    const q = await embed(query);
    const hit = this.nearest(q);
    if (hit && hit.score >= this.threshold) return hit.response; // HIT

    const response = await callModel(query);                     // MISS
    this.entries.push({ embedding: q, response });
    return response;
  }

  nearest(q) {
    let best = null;
    for (const e of this.entries) {
      const score = cosine(q, e.embedding);
      if (!best || score > best.score) best = { ...e, score };
    }
    return best;
  }
}
```

**🧠 Tradeoff** — Keying on the embedding and matching above `threshold` turns paraphrases into hits — the
whole win. `0.92` is deliberately conservative; monitor for false hits and tune. The linear `nearest` is
fine for a small cache; back it with a real vector index (Redis, pgvector) at scale. Scope the entries by
user for anything personalized, and add a TTL for answers over changing data.

### Python

**❌ Naive**

```python
_cache: dict[str, str] = {}
def ask(q: str) -> str:
    if q in _cache:
        return _cache[q]
    a = call_model(q)
    _cache[q] = a
    return a
```

**✅ Idiomatic**

```python
class SemanticCache:
    def __init__(self, threshold: float = 0.92):
        self.entries: list[tuple[list[float], str]] = []  # (embedding, response)
        self.threshold = threshold

    def ask(self, query: str) -> str:
        q = embed(query)
        best = max(self.entries, key=lambda e: cosine(q, e[0]), default=None)
        if best and cosine(q, best[0]) >= self.threshold:
            return best[1]                                # HIT
        response = call_model(query)                      # MISS
        self.entries.append((q, response))
        return response
```

**🧠 Tradeoff** — A [[cache-aside]] layer keyed by similarity: the model call is the miss path, and the
threshold is the precision/hit-rate dial. `max(..., default=None)` handles the cold cache cleanly. This is
semantic [[memoization]] — same idea as caching a pure function's result, generalized from exact key to
near key. Swap the list for a real ANN index in production; scope and TTL as the data demands.

### Elixir

**❌ Naive**

```elixir
def ask(cache, q) do
  case Map.get(cache, q) do
    nil -> a = call_model(q); {a, Map.put(cache, q, a)}
    a -> {a, cache}
  end
end
```

**✅ Idiomatic**

```elixir
defmodule SemanticCache do
  # entries: [{embedding, response}]; threshold e.g. 0.92
  def ask(entries, query, threshold \\ 0.92) do
    q = embed(query)

    best =
      entries
      |> Enum.map(fn {emb, resp} -> {cosine(q, emb), resp} end)
      |> Enum.max_by(&elem(&1, 0), fn -> {0.0, nil} end)

    case best do
      {score, resp} when score >= threshold -> {resp, entries}          # HIT
      _ -> resp = call_model(query); {resp, [{q, resp} | entries]}      # MISS
    end
  end
end
```

**🧠 Tradeoff** — With no mutable state, the cache is threaded: `ask` takes entries and returns the answer
plus updated entries, so a caller (or a GenServer wrapping this) owns the store. `Enum.max_by` with a
default handles the empty cache. Pattern matching the `{score, resp}` guard expresses "hit only above
threshold" cleanly. For a shared cache, wrap this in a GenServer or use `:ets` for concurrent reads.

### Go

**❌ Naive**

```go
var cache = map[string]string{}

func Ask(q string) string {
    if a, ok := cache[q]; ok {
        return a
    }
    a := CallModel(q)
    cache[q] = a
    return a
}
```

**✅ Idiomatic**

```go
type entry struct {
    emb  []float64
    resp string
}

type SemanticCache struct {
    entries   []entry
    threshold float64
    mu        sync.RWMutex
}

func (c *SemanticCache) Ask(query string) string {
    q := Embed(query)

    c.mu.RLock()
    best, score := entry{}, -1.0
    for _, e := range c.entries {
        if s := Cosine(q, e.emb); s > score {
            best, score = e, s
        }
    }
    c.mu.RUnlock()

    if score >= c.threshold {
        return best.resp // HIT
    }

    resp := CallModel(query) // MISS
    c.mu.Lock()
    c.entries = append(c.entries, entry{q, resp})
    c.mu.Unlock()
    return resp
}
```

**🧠 Tradeoff** — A `sync.RWMutex` makes the cache safe for concurrent callers — reads (the common case)
take the read lock, only a miss takes the write lock. The threshold gates hits. The linear scan under the
read lock is fine at small scale; a real deployment fronts a vector store and this struct becomes a thin
[[proxy]] over it. Scope entries per user and expire them for data that changes.

## Applications

Real-world uses of Semantic Caching:

- **FAQ / support bots** — the same handful of questions in endless phrasings hit one entry each.
- **Search & autocomplete** — cache answers to semantically-common queries.
- **Expensive RAG pipelines** — skip retrieve-and-generate when a near-identical question was answered.
- **API cost control** — a caching layer in front of the model to cap spend on repetitive traffic.
- **Latency-sensitive UX** — instant cached answers for the common case, model call for the rest.

**In modern systems:**

- **Multi-agent** — cache tool/model results shared across agents working the same problem.
- **Workflow engine** — memoize an expensive LLM step keyed by the semantic content of its input.
- **Low-code** — a transparent cache behind an "AI answer" field so common questions are free and instant.

## Related Patterns

- **Memoization** — semantic caching is memoization generalized from exact key to near key.
- **Cache-Aside** — the load-through structure: check cache, miss → call model → store.
- **Proxy** — a caching proxy in front of the model that intercepts and serves repeats.
- **Chunking & Embedding** — the same embedding machinery, here used to key the cache.
