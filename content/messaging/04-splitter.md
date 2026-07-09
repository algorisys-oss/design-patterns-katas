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
languages: [javascript, node-js, python, elixir, go]
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
