---
id: splitter
category: messaging
sequence: 4
title: Splitter
also_known_as: [Sequencer]
gof: false
intent: "Break a single message containing multiple elements into a series of individual messages, so each element can be routed and processed on its own."
frequency: medium
difficulty: beginner
tags: [messaging, integration, decomposition, fan-out, batch]
related: [aggregator, content-based-router, fan-out-fan-in]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Take one message that holds a **collection** — an order with many line items, a batch upload, a
document with many records — and emit **one message per element**. Downstream, each element flows and
is processed independently instead of being trapped inside the composite.

Splitting lets you apply per-element routing, parallelism, and error handling. A batch of 1,000 records
becomes 1,000 messages that can be distributed across workers, routed by content, and retried
individually — and a poison record fails alone instead of failing the whole batch.

## The Problem

Processing a composite message as one lump is limiting:

- **No per-element handling** — you can't route, prioritize, or retry individual items when they're
  bundled together.
- **No parallelism** — the whole batch is processed by one consumer sequentially; you can't spread items
  across workers.
- **All-or-nothing failure** — one bad item fails the entire batch, and re-processing redoes the good
  items too.
- **Coarse granularity** — monitoring, throttling, and backpressure operate on batches, not the real
  unit of work (the item).

## Structure

Key Components:

- **Composite message** — the incoming message containing multiple elements.
- **Splitter** — reads the composite and emits one message per element (often preserving order and a
  correlation id back to the original).
- **Element messages** — the individual outgoing messages, each self-contained.
- **Correlation** — metadata (batch id, sequence number) so results can be re-associated later (see
  Aggregator).

```
Composite Message { items: [a, b, c] } ──► [ Splitter ] ──► Message(a)
                                                          ──► Message(b)
                                                          ──► Message(c)
```

## When to Use

- A message carries a collection whose elements should be processed independently.
- You want to parallelize per-element work across consumers.
- Individual elements need their own routing, retry, or error handling.
- The natural unit of work is the item, not the batch.

## Advantages and Disadvantages

### Advantages
- **Per-element processing** — route, prioritize, retry, and monitor each item individually.
- **Parallelism** — distribute elements across workers for throughput.
- **Isolated failure** — a bad element fails alone, not the whole batch.

### Disadvantages
- **Loss of batch context** — elements lose their grouping unless you attach correlation metadata.
- **More messages** — one big message becomes many; overhead and broker load multiply.
- **Reassembly cost** — if results must be recombined, you now need an Aggregator and correlation.

## Common Mistakes

- **Dropping correlation** — splitting without a batch id/sequence makes it impossible to reassemble or
  know when all parts are done; always tag elements.
- **Ignoring ordering** — if order matters downstream, the splitter must attach sequence numbers;
  parallel processing reorders otherwise.
- **Splitting when you shouldn't** — if elements are only meaningful together (a transaction), splitting
  breaks atomicity.
- **Unbounded fan-out** — a huge composite becomes a flood of messages; throttle or paginate the split.

## Key Takeaways

- A splitter turns one composite message into one message per element.
- It enables per-element routing, parallelism, and isolated failure.
- Attach correlation (batch id, sequence) so results can be reassembled and completion detected.
- Pairs with Aggregator (recombine) and content-based routing (per-element destinations).

## Implementations

### JavaScript

*Targets modern JavaScript (ES2015+).*

**❌ Naive**

```js
// The whole order is processed as one unit — a bad item fails everything.
function processOrder(order) {
  for (const item of order.items) reserve(item); // one throw aborts the rest; no isolation
}
```

**✅ Idiomatic**

```js
// Split into per-item messages carrying correlation back to the order.
function split(order) {
  return order.items.map((item, i) => ({
    orderId: order.id,          // correlation id
    seq: i,                     // sequence for ordering/reassembly
    total: order.items.length,
    item,
  }));
}
// each element message is dispatched independently (routed, retried, parallelized):
split(order).forEach((msg) => itemQueue.push(msg));
```

**🧠 Tradeoff** — Emitting one message per item, each carrying `orderId`/`seq`/`total`, lets items be
processed independently and later reassembled or checked for completion. The correlation metadata is
the important part — without it, split elements are orphans. In-process this is a `map`; across services
each element becomes a real queued message.

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// A batch message handled whole; one failure requires reprocessing the entire batch.
ch.consume("uploads", (msg) => {
  const batch = JSON.parse(msg.content);
  batch.records.forEach(importRecord); // no per-record ack/retry
  ch.ack(msg);
});
```

**✅ Idiomatic**

```js
// Splitter consumes the batch and re-publishes one message per record, with correlation.
ch.consume("uploads", (msg) => {
  const batch = JSON.parse(msg.content);
  batch.records.forEach((record, seq) => {
    ch.sendToQueue("records", Buffer.from(JSON.stringify(
      { batchId: batch.id, seq, total: batch.records.length, record },
    )), { persistent: true });
  });
  ch.ack(msg); // batch consumed; records now flow individually
});
// record consumers ack/retry per record — a poison record fails alone.
```

**🧠 Tradeoff** — A splitter consuming a batch queue and re-publishing per-record messages gives each
record its own ack/retry lifecycle, so a poison record dead-letters alone and good records aren't
reprocessed. It multiplies message count (broker load) and needs the `batchId`/`seq` correlation, but
it turns batch failures into isolated ones and enables per-record parallelism.

### Python

*Targets Python 3.12.*

**❌ Naive**

```python
# Whole batch imported together; a single bad row aborts all.
def import_batch(batch):
    for row in batch["rows"]:
        import_row(row)   # one exception loses the batch's progress
```

**✅ Idiomatic**

```python
# Yield per-element messages with correlation; each is enqueued/processed independently.
def split(batch):
    total = len(batch["rows"])
    for seq, row in enumerate(batch["rows"]):
        yield {"batch_id": batch["id"], "seq": seq, "total": total, "row": row}

for msg in split(batch):
    records_queue.put(msg)   # each row now a first-class message (route, retry, parallelize)
```

**🧠 Tradeoff** — A generator splitter yields correlated per-row messages lazily, so even a huge batch
streams into individual work items without materializing all messages at once. Celery's `group`/`chord`
formalize split-then-aggregate as a workflow. The correlation fields enable an aggregator to know when
all rows of a batch are done.

### Elixir

*Targets Elixir 1.18.*

**❌ Naive**

```elixir
# Process the batch as one; a failing element crashes the whole handling.
def handle_batch(batch), do: Enum.each(batch.rows, &import_row/1)
```

**✅ Idiomatic**

```elixir
# Split into correlated messages; Enum/Stream fan them out, each handled on its own.
def split(batch) do
  total = length(batch.rows)
  batch.rows
  |> Enum.with_index()
  |> Enum.map(fn {row, seq} ->
    %{batch_id: batch.id, seq: seq, total: total, row: row}
  end)
end

split(batch) |> Enum.each(&Broadway.push(&1))  # each row a message; Broadway processes concurrently
```

**🧠 Tradeoff** — Splitting with `Enum.with_index` to attach `seq` produces correlated messages that
`Broadway`/`Flow` then process concurrently with per-message acking — a bad row fails and dead-letters
alone. Elixir's process isolation means an element crashing takes only its own task down. The
correlation carries into an aggregator or a completion tracker.

### Go

*Targets Go 1.26.*

**❌ Naive**

```go
// The batch is one unit of work; any error abandons the rest.
func importBatch(b Batch) error {
    for _, row := range b.Rows {
        if err := importRow(row); err != nil { return err } // stops the whole batch
    }
    return nil
}
```

**✅ Idiomatic**

```go
// Split onto a channel of correlated element messages; workers process independently.
type RecordMsg struct {
    BatchID string
    Seq     int
    Total   int
    Row     Row
}

func split(b Batch, out chan<- RecordMsg) {
    for i, row := range b.Rows {
        out <- RecordMsg{BatchID: b.ID, Seq: i, Total: len(b.Rows), Row: row}
    }
}
// a worker pool consumes `out`; each record is retried/dead-lettered on its own.
```

**🧠 Tradeoff** — Emitting correlated `RecordMsg` values onto a channel lets a worker pool (the
Worker/Fan-out patterns) process records concurrently, each with independent error handling. Across
services the channel is a broker subject and each record a durable message. Go makes the fan-out
natural; the `BatchID`/`Seq` fields are what let a downstream aggregator recombine or detect completion.

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// The batch is one unit of work; the first throw abandons the rest.
static void ImportBatch(Batch batch)
{
    foreach (var row in batch.Rows) ImportRow(row); // one exception loses the whole batch
}
```

**✅ Idiomatic**

```csharp
// each row becomes a first-class message on the in-process queue:
foreach (var msg in Split(batch))
    await records.Writer.WriteAsync(msg); // workers read the channel; each row fails or retries alone

// Split with LINQ: one correlated message per row, lazily.
static IEnumerable<RecordMsg> Split(Batch batch) =>
    batch.Rows.Select((row, seq) => new RecordMsg(batch.Id, seq, batch.Rows.Count, row));

// The element message is immutable value data — correlation can't be edited in flight.
public sealed record RecordMsg(string BatchId, int Seq, int Total, Row Row);
```

**🧠 Tradeoff** — `Select` with the index overload *is* the splitter, and it's lazy like the Python
generator: a million-row batch streams into messages one at a time instead of materializing them all.
The `record` freezes each element message, so `BatchId`/`Seq` can't be mutated in flight. A
`Channel<RecordMsg>` is the in-process stand-in for a broker queue — across services each write becomes
a durable publish, and the correlation fields are what a downstream aggregator needs.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// The batch is one unit of work; the first error abandons the rest.
fn import_batch(batch: &Batch) -> Result<(), ImportError> {
    for row in &batch.rows {
        import_row(row)?; // stops the whole batch
    }
    Ok(())
}
```

**✅ Idiomatic**

```rust
use std::sync::mpsc;

// One message per row, carrying correlation back to the batch.
struct RecordMsg {
    batch_id: String,
    seq: usize,
    total: usize,
    row: Row,
}

// The channel's message set is a closed enum — workers must handle every variant.
enum Msg {
    Record(RecordMsg),
    Done,
}

fn split(batch: Batch, out: &mpsc::Sender<Msg>) {
    let total = batch.rows.len();
    for (seq, row) in batch.rows.into_iter().enumerate() {
        let msg = RecordMsg { batch_id: batch.id.clone(), seq, total, row };
        out.send(Msg::Record(msg)).unwrap();
    }
    out.send(Msg::Done).unwrap(); // explicit end-of-batch
}

// a worker thread drains the channel; each record fails or retries alone.
fn worker(rx: mpsc::Receiver<Msg>) {
    for msg in rx {
        match msg {
            Msg::Record(r) => {
                if let Err(err) = import_row(&r.row) {
                    dead_letter(r, err); // this record fails alone
                }
            }
            Msg::Done => break,
        }
    }
}
```

**🧠 Tradeoff** — `into_iter()` moves each row out of the batch and into its message, so the split is
literal: afterwards there's no batch left to lean on, only self-contained messages. The `Msg` enum
closes the message set — the worker's `match` won't compile until every variant has a destination.
(`Done` is belt-and-braces; dropping the last `Sender` also ends the loop.) Note that an mpsc
`Receiver` has one owner, so fanning records across workers means one channel per worker or a shared
`Mutex<Receiver>` — across services, the channel is a broker subject.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// The batch is one unit of work; the first error abandons the rest.
fn importBatch(batch: Batch) !void {
    for (batch.rows) |row| try importRow(row); // one error stops the whole batch
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// The queue's element type is a tagged union — it names every message it can carry.
const Msg = union(enum) {
    record: RecordMsg,
    done: void,
};

const RecordMsg = struct {
    batch_id: []const u8,
    seq: usize,
    total: usize,
    row: Row,
};

// Split the batch into an explicitly allocated queue of correlated messages.
fn split(allocator: std.mem.Allocator, batch: Batch) ![]Msg {
    const msgs = try allocator.alloc(Msg, batch.rows.len + 1);
    for (batch.rows, 0..) |row, seq| {
        msgs[seq] = .{ .record = .{
            .batch_id = batch.id,
            .seq = seq,
            .total = batch.rows.len,
            .row = row,
        } };
    }
    msgs[batch.rows.len] = .done; // explicit end-of-batch
    return msgs;
}

// A worker drains the queue with an exhaustive switch; each record fails alone.
fn drain(queue: []const Msg) void {
    for (queue) |msg| switch (msg) {
        .record => |r| importRow(r.row) catch |err| deadLetter(r, err),
        .done => {},
    };
}

// const queue = try split(allocator, batch);
// defer allocator.free(queue);   // the caller owns the fan-out's memory
// drain(queue);
```

**🧠 Tradeoff** — the fan-out cost other languages hide is visible here: the splitter allocates
`rows.len + 1` messages and the caller owns the `free`. The tagged union plus exhaustive `switch` is
the honest Zig for a closed message set — add a variant and every consumer breaks until it routes it.
One caution: the messages borrow `batch.id` rather than copying it, so the batch must outlive the
queue — dupe the id with the allocator if it doesn't.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// The batch is one unit of work; the first exception abandons the rest.
static void importBatch(Batch batch) {
    for (var row : batch.rows()) importRow(row); // one exception loses the whole batch
}
```

**✅ Idiomatic**

```java
// The queue's message set is sealed — the worker's switch must route every kind.
sealed interface Msg permits RecordMsg, Done {}
record RecordMsg(String batchId, int seq, int total, Row row) implements Msg {}
record Done() implements Msg {}

// Split the batch onto a BlockingQueue of correlated element messages.
static void split(Batch batch, BlockingQueue<Msg> out) throws InterruptedException {
    var total = batch.rows().size();
    for (var seq = 0; seq < total; seq++) {
        out.put(new RecordMsg(batch.id(), seq, total, batch.rows().get(seq)));
    }
    out.put(new Done()); // explicit end-of-batch
}

// A worker drains the queue; each record fails or retries alone.
static void worker(BlockingQueue<Msg> in) throws InterruptedException {
    while (true) {
        switch (in.take()) {
            case RecordMsg r -> {
                try { importRow(r.row()); }
                catch (Exception err) { deadLetter(r, err); } // this record fails alone
            }
            case Done d -> { return; }
        }
    }
}
```

**🧠 Tradeoff** — records freeze each element message, so `batchId`/`seq` can't be edited in flight,
and the sealed interface closes the message set the way Rust's enum did: the switch over `Msg` won't
compile until every kind has a destination — no `default` to hide behind. `put` blocks when the queue
is full, so a huge batch backpressures the splitter instead of flooding memory. Unlike an mpsc
receiver, a `BlockingQueue` takes multiple consumers safely — point a pool of virtual threads at it
for fan-out (each worker then needs its own `Done` sentinel). Across services the queue becomes a
broker destination, and the correlation fields are what the downstream aggregator needs.

## Applications

- **Order processing** — splitting an order into per-line-item fulfillment messages (backend).
- **Batch/file imports** — one uploaded file split into per-record messages for parallel, isolated
  processing (backend).
- **Bulk notifications** — a "notify these 10,000 users" message split into per-user sends (backend).
- **Document processing** — a multi-page/multi-record document split into per-unit work (backend).
- **Scatter phase of scatter-gather** — splitting a request to query many sources before aggregating
  (backend).

## Related Patterns

- **Aggregator** — the inverse and frequent partner: recombine the split elements' results into one,
  using the correlation the splitter attached.
- **Content-Based Router** — split elements are often then routed individually to the right destination
  by type.
- **Fan-out / Fan-in** — splitting is the fan-out step; processing the elements in parallel and merging
  is fan-in.
