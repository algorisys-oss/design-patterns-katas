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
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
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

*Targets modern JavaScript (ES2015+).*

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

*Targets Node.js 24.*

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

*Targets Python 3.12.*

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

*Targets Elixir 1.18.*

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

*Targets Go 1.26.*

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

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// Read all, transform all in memory — stages welded, nothing streams.
var rows = File.ReadAllLines("events.log")
    .Select(line => Format(Enrich(Parse(line)))) // parse + enrich + format inline
    .ToList();
File.WriteAllLines("out.csv", rows);
```

**✅ Idiomatic**

```csharp
// Each filter is a Task reading one channel and writing the next (a pipe).
using System.Threading.Channels;

static ChannelReader<TOut> Filter<TIn, TOut>(ChannelReader<TIn> input, Func<TIn, TOut> fn)
{
    var output = Channel.CreateBounded<TOut>(64); // bounded pipe = backpressure
    _ = Task.Run(async () =>
    {
        await foreach (var item in input.ReadAllAsync())
            await output.Writer.WriteAsync(fn(item));
        output.Writer.Complete(); // completion flows down the pipeline
    });
    return output.Reader;
}

// wire the pipeline: source → parse → enrich → format → sink
var parsed = Filter(source, Parse);
var enriched = Filter(parsed, Enrich);
var formatted = Filter(enriched, Format);
await foreach (var row in formatted.ReadAllAsync()) Write(row);
```

**🧠 Tradeoff** — `Channel<T>` pipes with a `Task` per filter are the .NET shape of Go's version:
stages run concurrently, bounded channels throttle a fast source, and `Complete()` is the
close-the-channel discipline that lets shutdown ripple through. When you don't need concurrency,
don't pay for it — LINQ over `IEnumerable`/`IAsyncEnumerable` (`lines.Select(Parse).Select(Enrich)`)
is already lazy pipes-and-filters in-process. TPL Dataflow packages this same idea with batching
and parallelism knobs when the hand-rolled version grows.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// One loop welds every stage together over a fully collected Vec.
let mut out = Vec::new();
for line in lines {
    out.push(format_row(enrich(parse(line)))); // all in memory, stages inseparable
}
```

**✅ Idiomatic**

```rust
use std::io::{BufRead, BufReader};
use std::sync::mpsc::{self, Receiver};
use std::thread;

// Iterator adapters are lazy filters: nothing runs until the sink pulls.
let file = BufReader::new(File::open("events.log")?);
let pipeline = file
    .lines()
    .map_while(Result::ok)
    .map(parse)      // each .map is a filter; reorder/insert freely
    .map(enrich)
    .map(format_row);

for row in pipeline {
    write(row); // streams one line at a time, memory-flat
}

// To give a slow stage its own thread, make the pipe an mpsc channel:
fn stage<I: Send + 'static, O: Send + 'static>(rx: Receiver<I>, f: fn(I) -> O) -> Receiver<O> {
    let (tx, out) = mpsc::sync_channel(64); // bounded pipe = backpressure
    thread::spawn(move || {
        for x in rx {
            tx.send(f(x)).unwrap();
        }
    });
    out
}
```

**🧠 Tradeoff** — iterator chains are Rust's native sequential pipes-and-filters: lazy, allocation-
free, and each `.map` monomorphizes down to roughly the hand-written loop, so composition costs
nothing. Concurrency isn't free the way Go's is — you make the pipe explicit with `mpsc` and a
thread per stage, and ownership moves each message down the pipe, so stages can't share mutable
state by accident. The bounded `sync_channel` gives the backpressure; the receiver loop ending when
the sender drops gives clean shutdown.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// One loop welds every stage together — recomposing means editing this loop.
while (lines.next()) |line| {
    const parsed = parse(line);
    const enriched = enrich(parsed);
    writeRow(formatRow(enriched)); // parse + enrich + format inseparable
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// No closures in Zig — a filter is a plain function over one message type,
// and the pipeline is an array of function pointers: stages as data.
const Filter = *const fn (Event) Event;

// each filter: one transform, no shared state
fn stamp(e: Event) Event { var out = e; out.ts = now(); return out; }
fn locate(e: Event) Event { var out = e; out.region = lookup(out.ip); return out; }
fn redact(e: Event) Event { var out = e; out.ip = ""; return out; }

// reorder, insert, or drop stages here — the filters never change:
const stages = [_]Filter{ stamp, locate, redact };

fn run(log: []const u8) void {
    var lines = std.mem.tokenizeScalar(u8, log, '\n');
    while (lines.next()) |line| {
        var event = parse(line);                  // source adapter: bytes → Event
        for (stages) |filter| event = filter(event); // the pipe: each stage transforms
        writeRow(event);                          // sink: Event → csv row
    }
}
```

**🧠 Tradeoff** — without closures, the honest Zig pipeline fixes one message type and makes each
filter a `*const fn (Event) Event` in an array: the pipeline is data you can recompose at runtime,
and type-changing work (parse, format) sits at the edges as source and sink adapters. It streams
line by line with zero allocation in the loop. The comptime alternative — an inline chain of
calls — has zero indirection but recomposition means editing code. For concurrent stages, give
each filter a thread and use the mutex+condvar bounded queue from Message Channel as the pipe:
Go's shape, hand-assembled.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// Read all, transform all in memory — stages welded, nothing streams.
var out = new ArrayList<String>();
for (var line : Files.readAllLines(Path.of("events.log"))) {
    out.add(format(enrich(parse(line)))); // parse + enrich + format inline
}
Files.write(Path.of("out.csv"), out);
```

**✅ Idiomatic**

```java
// Stream.map chains are lazy filters; the terminal operation pulls one line at a time.
try (var lines = Files.lines(Path.of("events.log"));
     var sink = Files.newBufferedWriter(Path.of("out.csv"))) {
    lines.map(Pipeline::parse)      // each .map is a filter; reorder/insert freely
         .map(Pipeline::enrich)
         .map(Pipeline::format)
         .forEach(row -> write(sink, row)); // streams, memory-flat
}

// To give a slow stage its own thread, make the pipe a BlockingQueue:
static <I, O> BlockingQueue<O> stage(BlockingQueue<I> in, Function<I, O> fn) {
    var out = new ArrayBlockingQueue<O>(64); // bounded pipe = backpressure
    Thread.startVirtualThread(() -> {
        try {
            while (true) out.put(fn.apply(in.take()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    });
    return out;
}

// wire it: source → parse → enrich → format → sink
// var parsed = stage(source, Pipeline::parse);
// var enriched = stage(parsed, Pipeline::enrich);
// var formatted = stage(enriched, Pipeline::format);
```

**🧠 Tradeoff** — `Stream` is Java's sequential pipes-and-filters: `Files.lines` is lazy, each
`.map` a filter, and nothing runs until the terminal `forEach` pulls — huge files stream without
materializing. `.parallel()` is one word but shares the common pool and suits CPU-bound, unordered
work, not a pipeline with a slow stage. For that you make the pipe explicit — a bounded
`BlockingQueue` and a virtual thread per filter, Go's shape in `java.util.concurrent` — and
inherit the manual costs: no closed channel, so end-of-stream is a poison pill or interruption.
Stay with streams until one stage genuinely needs its own thread.

## Applications

- **ETL / data pipelines** — extract → transform → load as composable filter stages (backend).
- **Compilers** — lex → parse → optimize → codegen is the classic pipes-and-filters architecture
  (backend).
- **Stream processing** — Kafka Streams, Flink, and Beam pipelines chain operators over event streams
  (backend).
- **Request/response middleware** — HTTP middleware and interceptors are filters over the
  request/response pipe (backend).
- **Media processing** — decode → resize → watermark → encode pipelines for images/video (backend).

**In modern systems:**

- **Workflow engine** — the linear engine *is* pipes-and-filters: each step transforms the payload
  and passes it to the next.
- **Low-code** — a field value flows through parse → validate → format filters declared in its
  JSON.
- **Multi-agent** — a context pipeline (retrieve → rerank → summarize) shapes what the model sees
  before it runs.

## Related Patterns

- **Function Composition** — pipes-and-filters is composition at the system/stream level, with filters
  as components and pipes as channels rather than in-memory function calls.
- **Message Channel** — pipes *are* channels; the pattern chains channels between transforming stages.
- **Fan-out / Fan-in** — the way to scale a single slow filter: parallelize that stage across workers,
  then merge.
