---
id: pipes-and-filters
category: messaging
sequence: 2
title: Pipes and Filters
also_known_as: [Pipeline]
gof: false
intent: "Break a processing task into independent filters connected by pipes, each filter doing one transformation and passing its output to the next — so stages compose, reorder, and scale independently."
frequency: high
difficulty: beginner
tags: [messaging, integration, pipeline, composition, streaming]
related: [function-composition, message-channel, producer-consumer]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Divide a task into a chain of **filters** — independent components that each read a message, perform
one transformation, and write the result — joined by **pipes**, the channels carrying data from one
filter to the next. Data streams through the pipeline, one stage at a time.

Because each filter knows only its input and output pipe (not its neighbors), you can reorder, insert,
remove, reuse, and independently scale stages. It's function composition raised to the messaging/
system level: small transforming components wired into a whole, often running as separate processes
over a stream.

## The Problem

A single monolithic transformation is rigid and unscalable:

- **One big function** — a step that decodes, validates, enriches, and encodes all at once is hard to
  test, change, or reuse in parts.
- **No independent scaling** — if one stage is the bottleneck, you can't scale just that stage.
- **Can't reorder or reuse** — logic welded into a monolith can't be recomposed for a different flow.
- **All-or-nothing processing** — no natural place to stream, checkpoint, or parallelize between stages.

## Structure

Key Components:

- **Filter** — a component that transforms its input to output; ideally stateless and single-purpose.
- **Pipe** — the channel connecting one filter's output to the next filter's input.
- **Source / Sink** — the pipeline's origin (produces messages) and terminus (consumes results).
- **Pipeline** — the composed chain; each stage independent and unaware of the others.

```
Source ─pipe─► [Filter: parse] ─pipe─► [Filter: enrich] ─pipe─► [Filter: format] ─pipe─► Sink
        each filter transforms and forwards; stages are independent & reorderable
```

## When to Use

- A task decomposes into ordered, independent transformation stages.
- Stages should scale, deploy, or be reused independently.
- You want to stream data through, processing incrementally rather than all at once.
- Different pipelines can be assembled from the same filters.

## Advantages and Disadvantages

### Advantages
- **Composable & reusable** — filters recombine into different pipelines; each is testable alone.
- **Independent scaling** — scale or parallelize the bottleneck stage without touching others.
- **Streaming** — data flows incrementally, enabling backpressure and low latency-to-first-result.

### Disadvantages
- **Overhead between stages** — serialization/transport between filters (especially cross-process) costs.
- **Error handling spread** — a failure mid-pipeline needs a policy (drop, dead-letter, retry) at each stage.
- **Shared context is awkward** — filters are meant to be independent; threading global state through them
  fights the design.

## Common Mistakes

- **Stateful filters that assume order/context** — filters relying on hidden shared state break reuse
  and parallelism; keep them stateless transforms.
- **Chunky filters** — a "filter" doing five things is a monolith in disguise; one filter, one transform.
- **No backpressure** — a fast source overrunning a slow filter with no flow control floods the pipe;
  use bounded pipes/streams.
- **Ignoring partial failure** — no per-stage error policy means one bad message can wedge the pipeline.

## Key Takeaways

- Chain single-purpose filters with pipes; data streams through one stage at a time.
- Filters are independent — reorder, reuse, and scale them separately.
- It's composition at the system/stream level, with backpressure between stages.
- Keep filters stateless and give each stage an error policy.

## Implementations

### JavaScript

**❌ Naive**

```js
// One function does every stage — untestable in parts, not reusable.
function process(raw) {
  const parsed = JSON.parse(raw);
  const enriched = { ...parsed, ts: Date.now(), region: lookup(parsed.ip) };
  return csvRow(enriched); // parse + enrich + format welded together
}
```

**✅ Idiomatic**

```js
// Independent filters composed into a pipeline (compose from the Functional family).
const parse = (raw) => JSON.parse(raw);
const enrich = (o) => ({ ...o, ts: Date.now(), region: lookup(o.ip) });
const format = (o) => csvRow(o);

const pipeline = (...filters) => (input) => filters.reduce((acc, f) => f(acc), input);
const process = pipeline(parse, enrich, format); // reorder/insert stages freely
```

**🧠 Tradeoff** — Splitting into `parse`/`enrich`/`format` filters composed by a `pipeline` makes each
stage testable and reusable, and inserting a `validate` filter is one edit. In-process this is
synchronous function composition; for large data you'd use streaming filters (async generators,
transform streams) so it processes incrementally rather than materializing everything.

### Node.js

**❌ Naive**

```js
// Read all, transform all in memory — no streaming, no per-stage scaling.
const lines = fs.readFileSync("events.log", "utf8").split("\n");
const out = lines.map(parse).map(enrich).map(format).join("\n");
fs.writeFileSync("out.csv", out);
```

**✅ Idiomatic**

```js
// Stream transforms are filters; pipeline() wires them with backpressure between stages.
const { pipeline } = require("node:stream/promises");
const { Transform } = require("node:stream");

const filter = (fn) =>
  new Transform({ objectMode: true, transform(chunk, _e, cb) { cb(null, fn(chunk)); } });

await pipeline(
  fs.createReadStream("events.log"),
  splitLines(),
  filter(parse),
  filter(enrich),
  filter(format),
  fs.createWriteStream("out.csv"),
);
```

**🧠 Tradeoff** — Node streams *are* pipes and filters: each `Transform` is a filter, `pipeline()`
connects them with automatic backpressure so a slow stage throttles the source. It streams instead of
buffering the whole file, and stages can be reused across pipelines. The cost is the stream API's
ceremony and per-stage error handling, worth it for large or continuous data.

### Python

**❌ Naive**

```python
# Monolithic transform over a fully-materialized list.
rows = [format(enrich(parse(line))) for line in open("events.log")]  # all in memory, welded
```

**✅ Idiomatic**

```python
# Generator filters compose into a lazy, streaming pipeline.
def parse(lines):   (yield from (json.loads(l) for l in lines))
def enrich(objs):   (yield from ({**o, "ts": now(), "region": lookup(o["ip"])} for o in objs))
def format(objs):   (yield from (csv_row(o) for o in objs))

def pipeline(source, *filters):
    stream = source
    for f in filters:
        stream = f(stream)      # each filter wraps the previous stream, lazily
    return stream

for row in pipeline(open("events.log"), parse, enrich, format):
    write(row)                  # streams one at a time
```

**🧠 Tradeoff** — Generator filters give Python lazy, streaming pipes-and-filters: each filter is a
generator transforming a stream, composed without materializing intermediates — memory-flat over huge
inputs. It's idiomatic and reusable. For cross-process/parallel stages you'd graduate to a task
framework (Celery chains, Airflow, or `multiprocessing` pipelines), trading simplicity for scale.

### Elixir

**❌ Naive**

```elixir
# Eager, monolithic transform of a whole list.
File.stream!("events.log") |> Enum.map(&parse/1) |> Enum.map(&enrich/1) |> Enum.map(&format/1)
```

**✅ Idiomatic**

```elixir
# Stream composes lazy filters; the pipe operator wires them; Flow/Broadway parallelize.
"events.log"
|> File.stream!()
|> Stream.map(&parse/1)        # each Stream.map is a lazy filter
|> Stream.map(&enrich/1)
|> Stream.map(&format/1)
|> Stream.into(File.stream!("out.csv"))
|> Stream.run()

# for concurrent, partitioned stages: Flow (over GenStage) parallelizes each filter.
```

**🧠 Tradeoff** — Elixir's `Stream` gives lazy pipes-and-filters and `|>` wires them beautifully:
each `Stream.map` is a filter, nothing is materialized until run. For concurrency, `Flow` (built on
GenStage) turns the same pipeline into partitioned, parallel stages with backpressure, and `Broadway`
adds durable ingestion from brokers. The language makes the sequential form trivial and offers a clean
upgrade path to parallel.

### Go

**❌ Naive**

```go
// One function chains transforms inline over a slice — no streaming or stage isolation.
for _, line := range lines {
    out = append(out, format(enrich(parse(line))))
}
```

**✅ Idiomatic**

```go
// Each filter is a stage reading one channel and writing the next (a pipe).
func filter[I, O any](in <-chan I, fn func(I) O) <-chan O {
    out := make(chan O)
    go func() { defer close(out); for x := range in { out <- fn(x) } }()
    return out
}

// wire the pipeline: source → parse → enrich → format → sink
parsed := filter(source, parse)
enriched := filter(parsed, enrich)
formatted := filter(enriched, format)
for row := range formatted { write(row) }
```

**🧠 Tradeoff** — Go channels are the pipes and goroutines the filters: each `filter` stage runs
concurrently, connected by channels that provide backpressure, and you can fan-out a slow stage across
workers (the Fan-out/Fan-in pattern). Generics keep it typed. It's genuinely concurrent
pipes-and-filters in the standard library — the cost is wiring channels and closing them correctly, the
usual Go bargain of explicitness.

## Applications

- **ETL / data pipelines** — extract → transform → load as composable filter stages (backend).
- **Compilers** — lex → parse → optimize → codegen is the classic pipes-and-filters architecture
  (backend).
- **Stream processing** — Kafka Streams, Flink, and Beam pipelines chain operators over event streams
  (backend).
- **Request/response middleware** — HTTP middleware and interceptors are filters over the
  request/response pipe (backend).
- **Media processing** — decode → resize → watermark → encode pipelines for images/video (backend).

## Related Patterns

- **Function Composition** — pipes-and-filters is composition at the system/stream level, with filters
  as components and pipes as channels rather than in-memory function calls.
- **Message Channel** — pipes *are* channels; the pattern chains channels between transforming stages.
- **Fan-out / Fan-in** — the way to scale a single slow filter: parallelize that stage across workers,
  then merge.
