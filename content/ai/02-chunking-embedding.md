---
id: chunking-embedding
category: ai
sequence: 2
title: Chunking & Embedding
also_known_as: [Document Ingestion, Indexing Pipeline]
gof: false
kind: pattern
intent: "Split documents into right-sized, overlapping units and turn each into a vector, so retrieval can find the specific piece that answers a question."
frequency: high
difficulty: intermediate
tags: [ai, llm, rag, chunking, embeddings, ingestion]
related: [rag, hybrid-search, function-composition, pipes-and-filters]
languages: [javascript, python, elixir, go]
---

## Intent

Chunking & Embedding is the ingestion half of RAG. Before you can retrieve, you have to turn a
pile of documents into searchable units: **split** each document into passages small enough to be
about one thing, then **embed** each passage into a vector. Retrieval quality is decided here — a
retriever can only find chunks that were cut and embedded well.

## The Problem

Two tempting shortcuts both wreck retrieval:

- **One vector per document** — embed a 50-page manual as a single vector and every query looks
  half-relevant. The vector is an average of everything, so it points nowhere in particular and
  nearest-neighbour search returns mush.
- **Split on a fixed character count** — cut every 500 characters and you slice sentences, tables,
  and code blocks in half. The chunk that holds the answer is missing its first line, or the
  answer straddles the boundary between two chunks and neither contains it whole.

The fix is chunks sized to *one idea*, split on natural boundaries, with a little **overlap** so a
fact spanning a boundary survives in at least one chunk.

## Structure

Key Components / Participants:

- **Loader** — reads the raw document (PDF, HTML, Markdown) into text.
- **Splitter** — cuts text into chunks on boundaries (paragraph, sentence), with overlap and a
  target size.
- **Embedder** — maps each chunk to a vector, usually in batches.
- **Store** — persists `(chunk, vector, metadata)` for nearest-neighbour search.

```
document ──▶ loader ──▶ splitter ──▶ chunks ──▶ embedder ──▶ vectors
                        (size + overlap,        (batched)        │
                         on boundaries)                          ▼
                                                          vector store
                                                          (chunk + vector + source)
```

## When to Use

- You're building RAG and need documents to become retrievable — this is the prerequisite.
- Documents are long and heterogeneous (manuals, transcripts, codebases).
- You want retrieval to return a citable passage, not a whole file.

## Advantages and Disadvantages

### Advantages
- Right-sized chunks make similarity search sharp — one chunk, one idea.
- Overlap keeps boundary-spanning facts intact.
- Batch embedding amortizes the per-call cost of the embedding model.
- Metadata on each chunk (source, page) gives you citations for free.

### Disadvantages
- The "right" chunk size is data-dependent and needs tuning per corpus.
- Re-chunking means re-embedding — a full-corpus cost when you change the strategy.
- Structure-blind splitters still mangle tables, code, and lists.

## Common Mistakes

- **Fixed-size character splits** — ignore sentence and paragraph boundaries and you cut facts in
  half. Split on structure first, then size.
- **No overlap** — a definition that starts at the end of chunk A and finishes in chunk B is
  retrievable from neither. A small overlap (10–20%) fixes it.
- **Chunks too large** — a whole section per chunk dilutes the embedding and drags in irrelevant
  text; retrieval gets fuzzy.
- **Embedding one at a time** — a per-chunk network round trip is slow and expensive; batch.
- **Dropping metadata** — without the source, you can retrieve the passage but can't cite it.

## Key Takeaways

- Split on natural boundaries, size to one idea, and add a little overlap.
- Retrieval quality is set at ingestion — you can't retrieve what you chunked badly.
- Batch the embedding calls; carry source metadata through to the store.
- Changing the chunking strategy means re-embedding the corpus — decide early.

## Implementations

The pipeline is `split → embed → store`. We treat `embed(text)` as the model boundary and focus on
the splitter, since that's where the pattern lives. The naive version splits on a raw character
count; the idiomatic version splits on boundaries with overlap.

### JavaScript

**❌ Naive**

```js
// Cuts mid-sentence every N chars; no overlap. Facts split across chunks.
function chunk(text, size = 500) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}
```

**✅ Idiomatic**

```js
// Split on paragraphs, pack up to a target size, carry overlap between chunks.
function chunk(text, { size = 800, overlap = 120 } = {}) {
  const paras = text.split(/\n\s*\n/);
  const chunks = [];
  let buf = "";
  for (const p of paras) {
    if (buf && buf.length + p.length > size) {
      chunks.push(buf);
      buf = buf.slice(-overlap); // keep a tail so boundary facts survive
    }
    buf += (buf ? "\n\n" : "") + p;
  }
  if (buf) chunks.push(buf);
  return chunks;
}

async function ingest(doc, store) {
  const texts = chunk(doc.text);
  const vectors = await embedBatch(texts); // one call, many chunks
  texts.forEach((text, i) =>
    store.add({ text, vector: vectors[i], source: doc.id }));
}
```

**🧠 Tradeoff** — Packing paragraphs up to a size, then carrying an overlap tail, keeps chunks
about one idea without slicing sentences. `embedBatch` amortizes the model call. The cost is that
a paragraph splitter is still structure-naive about tables and code — a Markdown- or AST-aware
splitter is the next step when the corpus demands it.

### Python

**❌ Naive**

```python
def chunk(text: str, size: int = 500) -> list[str]:
    return [text[i:i + size] for i in range(0, len(text), size)]
```

**✅ Idiomatic**

```python
def chunk(text: str, size: int = 800, overlap: int = 120) -> list[str]:
    chunks, buf = [], ""
    for para in text.split("\n\n"):
        if buf and len(buf) + len(para) > size:
            chunks.append(buf)
            buf = buf[-overlap:]          # overlap tail
        buf = f"{buf}\n\n{para}" if buf else para
    if buf:
        chunks.append(buf)
    return chunks

def ingest(doc, store, embed_batch) -> None:
    texts = chunk(doc.text)
    for text, vector in zip(texts, embed_batch(texts)):
        store.add(text=text, vector=vector, source=doc.id)
```

**🧠 Tradeoff** — Plain functions compose the pipeline; `embed_batch` is injected so the ingest
step is testable without a network. Python's ecosystem (LangChain's `RecursiveCharacterTextSplitter`,
`unstructured`) offers structure-aware splitters — reach for them when paragraphs aren't enough,
but the pattern is unchanged: a `chunk` function feeding a batched embed.

### Elixir

**❌ Naive**

```elixir
def chunk(text, size \\ 500) do
  for <<part::binary-size(size) <- text>>, do: part
end
```

**✅ Idiomatic**

```elixir
defmodule Ingest do
  def chunk(text, size \\ 800, overlap \\ 120) do
    text
    |> String.split("\n\n")
    |> Enum.reduce([], fn para, [buf | rest] = acc ->
      cond do
        buf == nil -> [para]
        byte_size(buf) + byte_size(para) > size ->
          [String.slice(buf, -overlap, overlap) <> "\n\n" <> para, buf | rest]
        true -> [buf <> "\n\n" <> para | rest]
      end
    end)
    |> Enum.reverse()
  end

  def ingest(doc, store) do
    chunks = chunk(doc.text)
    chunks
    |> Task.async_stream(&embed/1, max_concurrency: 8)
    |> Enum.zip(chunks)
    |> Enum.each(fn {{:ok, vec}, text} ->
      Store.add(store, text: text, vector: vec, source: doc.id)
    end)
  end
end
```

**🧠 Tradeoff** — The splitter is a `reduce` over paragraphs, and `Task.async_stream` embeds chunks
concurrently with a bounded pool — the idiomatic Elixir way to parallelize the network-bound embed
step without spawning unboundedly. The reduce-with-accumulator is a little denser than the
imperative loop, but it stays pure and the concurrency comes almost for free.

### Go

**❌ Naive**

```go
func Chunk(text string, size int) []string {
    var out []string
    for i := 0; i < len(text); i += size {
        end := min(i+size, len(text))
        out = append(out, text[i:end])
    }
    return out
}
```

**✅ Idiomatic**

```go
func Chunk(text string, size, overlap int) []string {
    var chunks []string
    var buf string
    for _, para := range strings.Split(text, "\n\n") {
        if buf != "" && len(buf)+len(para) > size {
            chunks = append(chunks, buf)
            if len(buf) > overlap {
                buf = buf[len(buf)-overlap:] // overlap tail
            }
        }
        if buf != "" {
            buf += "\n\n"
        }
        buf += para
    }
    if buf != "" {
        chunks = append(chunks, buf)
    }
    return chunks
}

func Ingest(doc Doc, store Store, embedBatch func([]string) [][]float64) {
    texts := Chunk(doc.Text, 800, 120)
    vectors := embedBatch(texts)
    for i, text := range texts {
        store.Add(Chunk{Text: text, Vector: vectors[i], Source: doc.ID})
    }
}
```

**🧠 Tradeoff** — A single pass with a byte buffer keeps the splitter allocation-light, and
`embedBatch` is a `func` parameter so the transport (and its retries) stays out of the loop. Go's
byte-slicing on `overlap` is fine for ASCII; for multi-byte text slice on rune boundaries instead —
a reminder that structure-blind splitting has edge cases in every language.

## Applications

Real-world uses of Chunking & Embedding:

- **Doc/wiki ingestion** — turn Confluence, Notion, and Markdown into a searchable index.
- **PDF & transcript pipelines** — chunk reports, contracts, and call transcripts for retrieval.
- **Codebase indexing** — split by function/class so a code assistant retrieves the right unit.
- **Semantic caching keys** — embed inputs to find near-duplicate past requests (see [[semantic-caching]]).
- **Deduplication & clustering** — group near-identical passages by embedding proximity.

**In modern systems:**

- **Low-code** — an "attach documents" feature that silently chunks and indexes uploads for a Q&A field.
- **Workflow engine** — an ingestion pipeline (load → split → embed → store) as pipes-and-filters stages.
- **Multi-agent** — building the shared knowledge store agents retrieve from before acting.

## Related Patterns

- **Retrieval-Augmented Generation** — the consumer of this pipeline; chunking feeds the retriever.
- **Hybrid Search & Reranking** — makes the most of well-chunked data at query time.
- **Pipes and Filters** — the load → split → embed → store pipeline is the classic form.
- **Function Composition** — each stage is a small function composed into the ingestion flow.
