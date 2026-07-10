---
id: rag
category: ai
sequence: 1
title: Retrieval-Augmented Generation
also_known_as: [RAG, Grounded Generation]
gof: false
kind: pattern
intent: "Retrieve the few documents relevant to a question and put them in the prompt, so the model answers from your data instead of its memory."
frequency: high
difficulty: intermediate
tags: [ai, llm, rag, retrieval, embeddings, grounding]
related: [chunking-embedding, hybrid-search, structured-output, prompt-chaining]
languages: [javascript, python, elixir, go]
---

## Intent

Retrieval-Augmented Generation grounds a model's answer in your own data. Instead of asking the
model what it remembers, you **retrieve** the handful of documents relevant to the question,
put them in the prompt, and ask the model to answer *from that context*.

It is the most common LLM pattern in production because it solves the two things a bare model
can't: it answers questions about data the model never saw (your docs, last week's tickets), and
it grounds the answer in sources you can cite, cutting hallucination.

## The Problem

A bare model call has two failure modes, and stuffing everything into the prompt trades one for
the other:

- **Answer from memory** — the model invents a plausible-sounding answer about your product
  because it has no access to your docs. Confident, wrong, unsourceable.
- **Stuff every document** — you paste the whole knowledge base into the prompt. Now it's
  accurate but you blow the context window, pay for tokens you don't need, and the model's
  attention is diluted across thousands of irrelevant lines.

RAG is the middle path: fetch *only* the relevant few, then generate.

## Structure

Key Components / Participants:

- **Retriever** — takes the query, returns the top-k relevant chunks. Usually an embedding
  similarity search over a vector store, but the interface is all that matters.
- **Vector store** — holds document chunks and their embeddings; answers nearest-neighbour
  queries.
- **Prompt builder** — assembles the retrieved context and the question into one grounded prompt.
- **Generator** — the model call that answers *from the provided context*.

```
question ──▶ embed ──▶ retriever ──▶ top-k chunks
                          │                │
                     vector store          ▼
                                     prompt builder ──▶ generator (model) ──▶ answer
                                     "Answer using ONLY:
                                      <chunks>
                                      Q: <question>"
```

## When to Use

- The answer depends on data the model wasn't trained on — internal docs, recent events, a
  specific user's records.
- You need citations or provenance for the answer.
- The knowledge base is too large to fit (or too expensive to send) in every prompt.
- Facts change often and you can't retrain — update the store, not the model.

## Advantages and Disadvantages

### Advantages
- Grounds answers in your data and makes them citable.
- Knowledge updates are a store write, not a retrain or a fine-tune.
- Sends only the relevant few chunks — cheaper and sharper than stuffing everything.
- The retriever is swappable (keyword, vector, hybrid) behind one interface.

### Disadvantages
- Answer quality is capped by retrieval quality — miss the right chunk and the model can't
  recover ("garbage in, garbage out").
- Adds moving parts: chunking, embedding, a vector store, and their failure modes.
- Chunk boundaries can split the very fact you needed across two chunks.

## Common Mistakes

- **Retrieving too much or too little** — top-1 misses context; top-50 buries the answer and
  costs tokens. Tune k, and rerank (see [[hybrid-search]]).
- **Not instructing the model to stay grounded** — without "answer using only the context, say
  'I don't know' if it's not there," the model quietly falls back to memory and you're back to
  hallucinating.
- **Bad chunking** — chunks too large dilute similarity; too small lose context. This is its own
  pattern ([[chunking-embedding]]).
- **Ignoring the "not found" case** — when retrieval returns nothing relevant, the honest answer
  is "I don't know," not a confident guess.

## Key Takeaways

- RAG = retrieve the relevant few, then generate *from that context*.
- The retriever is an interface; the vector store is one implementation.
- Instruct the model to stay grounded and to admit when the answer isn't in the context.
- Answer quality is retrieval quality — invest there before touching the prompt.

## Implementations

We model the two boundaries as plain functions — `embed(text)` turns text into a vector, and
`callModel(prompt)` is the LLM call — so each language shows the *pattern's* structure, not SDK
boilerplate. The naive version answers from the model's memory; the idiomatic version retrieves
first, then grounds the generation.

### JavaScript

**❌ Naive**

```js
// Answers from the model's memory — no access to your data, no grounding.
async function answer(question) {
  return callModel(`Answer this question: ${question}`);
}
// "What is our refund window?" → a confident, invented number.
```

**✅ Idiomatic**

```js
// A retriever is anything with `retrieve(query, k)`. Here: embedding similarity.
class VectorRetriever {
  constructor(chunks) {
    // chunks: [{ text, embedding }]
    this.chunks = chunks;
  }
  retrieve(queryEmbedding, k = 4) {
    return [...this.chunks]
      .map((c) => ({ c, score: cosine(queryEmbedding, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(({ c }) => c.text);
  }
}

async function answer(question, retriever) {
  const context = retriever.retrieve(embed(question)).join("\n---\n");
  const prompt =
    `Answer the question using ONLY the context below. ` +
    `If the answer isn't there, say "I don't know."\n\n` +
    `Context:\n${context}\n\nQuestion: ${question}`;
  return callModel(prompt); // your model SDK, kept behind one boundary
}
```

**🧠 Tradeoff** — The retriever is a class only because it holds the corpus; a closure over
`chunks` returning a `retrieve` function is just as idiomatic in JS. The win is that `answer`
depends on the *interface* (`retrieve`), so swapping the in-memory search for a real vector DB
(pgvector, Pinecone) never touches the generation code. The cost is the whole retrieval
pipeline you now own.

### Python

**❌ Naive**

```python
def answer(question: str) -> str:
    return call_model(f"Answer this question: {question}")
```

**✅ Idiomatic**

```python
from typing import Protocol

class Retriever(Protocol):
    def retrieve(self, query: str, k: int = 4) -> list[str]: ...

class VectorRetriever:
    def __init__(self, chunks: list[tuple[str, list[float]]]):
        self.chunks = chunks  # (text, embedding)

    def retrieve(self, query: str, k: int = 4) -> list[str]:
        q = embed(query)
        ranked = sorted(self.chunks, key=lambda c: cosine(q, c[1]), reverse=True)
        return [text for text, _ in ranked[:k]]

def answer(question: str, retriever: Retriever) -> str:
    context = "\n---\n".join(retriever.retrieve(question))
    prompt = (
        "Answer the question using ONLY the context below. "
        'If the answer isn\'t there, say "I don\'t know."\n\n'
        f"Context:\n{context}\n\nQuestion: {question}"
    )
    return call_model(prompt)  # your model SDK, kept behind one boundary
```

**🧠 Tradeoff** — `Retriever` as a `Protocol` types the seam without a base class: any object with
`retrieve` satisfies it, so a `KeywordRetriever` or a pgvector-backed one drops in structurally.
That's the Pythonic way to make the retriever swappable. The judgment call is `k` and the
grounding instruction — both matter more to answer quality than the code around them.

### Elixir

**❌ Naive**

```elixir
def answer(question), do: call_model("Answer this question: #{question}")
```

**✅ Idiomatic**

```elixir
defmodule RAG do
  # chunks: [{text, embedding}]
  def retrieve(chunks, query, k \\ 4) do
    q = embed(query)

    chunks
    |> Enum.sort_by(fn {_text, emb} -> cosine(q, emb) end, :desc)
    |> Enum.take(k)
    |> Enum.map(fn {text, _emb} -> text end)
  end

  def answer(question, chunks) do
    context = chunks |> retrieve(question) |> Enum.join("\n---\n")

    """
    Answer the question using ONLY the context below.
    If the answer isn't there, say "I don't know."

    Context:
    #{context}

    Question: #{question}
    """
    |> call_model()
  end
end
```

**🧠 Tradeoff** — Elixir has no vector-DB SDK to hide behind, so the pattern shows as a pure
pipeline: retrieve, join, generate, each a testable function. For a real corpus you'd embed with
Bumblebee and store vectors in Postgres via `pgvector`, but the shape is the same — a `retrieve/3`
function the pipeline calls. If you need a named contract, a `behaviour` with `retrieve/3` lets you
swap implementations; for a single retriever the plain function is leaner.

### Go

**❌ Naive**

```go
func Answer(question string) string {
    return CallModel("Answer this question: " + question)
}
```

**✅ Idiomatic**

```go
// Small implicit interface — any retriever with Retrieve satisfies it.
type Retriever interface {
    Retrieve(query string, k int) []string
}

type VectorRetriever struct {
    Chunks []Chunk // {Text string; Embedding []float64}
}

func (v VectorRetriever) Retrieve(query string, k int) []string {
    q := Embed(query)
    sort.Slice(v.Chunks, func(i, j int) bool {
        return Cosine(q, v.Chunks[i].Embedding) > Cosine(q, v.Chunks[j].Embedding)
    })
    out := make([]string, 0, k)
    for _, c := range v.Chunks[:min(k, len(v.Chunks))] {
        out = append(out, c.Text)
    }
    return out
}

func Answer(question string, r Retriever) string {
    context := strings.Join(r.Retrieve(question, 4), "\n---\n")
    prompt := fmt.Sprintf(
        "Answer the question using ONLY the context below. "+
            "If the answer isn't there, say \"I don't know.\"\n\n"+
            "Context:\n%s\n\nQuestion: %s", context, question)
    return CallModel(prompt) // your model SDK — here a plain HTTP POST behind one boundary
}
```

**🧠 Tradeoff** — Go's implicit interface makes the retriever seam free: `Answer` takes a
`Retriever`, and any type with `Retrieve` satisfies it — no declaration, so a keyword or pgvector
retriever swaps in without touching `Answer`. There's no first-party Claude SDK for Go, so
`CallModel` is a plain HTTP POST to the Messages API; that boundary is exactly where the interface
earns its keep, keeping the transport out of the pattern.

## Applications

Real-world uses of RAG:

- **Documentation Q&A / support bots** — answer from product docs and past tickets, with links.
- **Enterprise search** — "chat with your company knowledge base" over wikis, PDFs, and Slack.
- **Customer-specific answers** — retrieve one user's records before answering about their account.
- **Code assistants** — retrieve the relevant files/functions before generating an edit.
- **Research & analysis** — ground a summary in a specific corpus rather than the open web.

**In modern systems:**

- **Low-code** — a "knowledge" field on a form whose answers are grounded in an attached document set.
- **Workflow engine** — a retrieval step that enriches the payload with context before a decision step.
- **Multi-agent** — the shared context pipeline (retrieve → rerank → summarize) that shapes what
  every agent sees before it reasons.

## Related Patterns

- **Chunking & Embedding** — the ingestion half of RAG: how documents become retrievable vectors.
- **Hybrid Search & Reranking** — better retrieval than pure vector similarity; the quality lever.
- **Query Rewriting** — reshape the question before retrieval so the search actually finds the chunk.
- **Structured Output** — when the grounded answer must be JSON (fields, citations) rather than prose.
- **Prompt Chaining** — RAG is often one link: retrieve → answer → verify against the sources.
