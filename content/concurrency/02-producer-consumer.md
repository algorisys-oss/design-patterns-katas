---
id: producer-consumer
category: concurrency
sequence: 2
title: Producer–Consumer
also_known_as: [Bounded Buffer]
gof: false
intent: "Decouple code that creates work from code that processes it with a bounded queue between them, so each side runs at its own pace."
frequency: high
difficulty: beginner
tags: [concurrency, queue, backpressure, decoupling, pipeline]
related: [worker-pool, pub-sub, fan-out-fan-in]
languages: [javascript, node-js, python, elixir, go]
---

## Intent

Put a **bounded queue** between the code that produces items and the code that consumes them.
Producers push; consumers pull; neither calls the other directly.

The queue lets the two sides run at different speeds and on different threads. A burst of
production fills the buffer instead of overwhelming the consumer, and a full buffer makes the
producer wait — backpressure without either side knowing the other exists.

## The Problem

The direct approach wires producer to consumer: the producer calls `consumer.handle(item)` and
waits for it to finish before making the next item. That couples them into one lockstep pipeline:

- **Speed mismatch stalls everything** — a fast producer is throttled to the consumer's pace,
  and a slow consumer blocks the producer even when there's more to produce.
- **No buffering** — a momentary spike has nowhere to go; you either drop work or block.
- **Hard to scale a side** — you can't add a second consumer without the producer knowing about
  it and load-balancing by hand.

Batch it into an unbounded list instead and you trade the stall for a memory leak: a fast
producer grows the list forever while the consumer falls behind.

## Structure

Key Components:

- **Producer(s)** — create items and `put` them on the queue. Block (or wait) when it's full.
- **Bounded Queue** — a fixed-capacity buffer, safe for concurrent access.
- **Consumer(s)** — `take` items and process them. Block (or wait) when it's empty.

```
Producer ──put──►  [ ▢ ▢ ▢ ▢ ]  ──take──►  Consumer
                   bounded queue
   waits if full ◄─┘        └─► waits if empty
```

## When to Use

- Production and consumption happen at different, variable rates.
- You want to add or remove consumers (or producers) without touching the other side.
- A spike of work should be absorbed by a buffer rather than dropped or blocked.
- The two stages belong on different threads, processes, or machines.

## Advantages and Disadvantages

### Advantages
- **Decoupling** — sides share only the queue; each can change or scale independently.
- **Backpressure** — a bounded queue slows a fast producer instead of leaking memory.
- **Smoothing** — the buffer absorbs bursts so consumers see a steadier load.

### Disadvantages
- **Latency** — items wait in the queue; not for work that must run the instant it's created.
- **Capacity is a guess** — too small throttles throughput, too large hides a real imbalance.
- **Ordering & loss** — with multiple consumers, strict order needs care; a crash can drop
  in-flight items unless the queue is durable.

## Common Mistakes

- **Unbounded queue** — the classic bug: without a cap there's no backpressure, and a producer
  that outpaces consumers grows the buffer until the process dies.
- **Busy-waiting** — polling an empty queue in a tight loop burns CPU. Use a blocking take or a
  condition/signal so consumers sleep until there's work.
- **Forgetting the shutdown signal** — consumers blocked on an empty queue never exit. Send a
  sentinel ("poison pill") or close the queue so they can stop.
- **Assuming order across consumers** — two consumers pulling from one queue finish in
  nondeterministic order; don't rely on FIFO end-to-end.

## Key Takeaways

- The bounded queue is the whole pattern: it decouples the sides *and* provides backpressure.
- Producers block on full, consumers block on empty — that mutual waiting is the flow control.
- Have an explicit stop signal so blocked consumers can drain and exit.
- It's the substrate under worker pools, pipelines, and most job systems.

## Implementations

### JavaScript

**❌ Naive**

```js
// Producer drives the consumer directly — lockstep, no buffering.
async function run(items, consume) {
  for (const item of items) {
    await consume(item); // producer stalls for every slow consume
  }
}
```

**✅ Idiomatic**

```js
// A bounded async queue: put() waits when full, take() waits when empty.
class BoundedQueue {
  constructor(capacity) {
    this.capacity = capacity;
    this.buffer = [];
    this.waitingTakers = [];
    this.waitingPutters = [];
  }
  put(item) {
    if (this.waitingTakers.length) return void this.waitingTakers.shift()(item);
    if (this.buffer.length < this.capacity) return void this.buffer.push(item);
    return new Promise((resolve) => this.waitingPutters.push(() => (this.buffer.push(item), resolve())));
  }
  take() {
    if (this.buffer.length) {
      const item = this.buffer.shift();
      this.waitingPutters.shift()?.();
      return Promise.resolve(item);
    }
    return new Promise((resolve) => this.waitingTakers.push(resolve));
  }
}

// producer: for (const x of items) await q.put(x)
// consumer: while (true) await consume(await q.take())
```

**🧠 Tradeoff** — JavaScript has no built-in blocking queue, so you build the wait out of
promises: `put`/`take` hand off directly when someone's already waiting, otherwise park a
resolver. It's a real bounded buffer with backpressure, but it's hand-rolled — for streaming
data, Node's streams (next tab) give you the same semantics with far less code.

### Node.js

**❌ Naive**

```js
// Read everything into memory, then process — no backpressure, unbounded buffering.
const fs = require("node:fs");
const lines = fs.readFileSync("huge.log", "utf8").split("\n");
for (const line of lines) process(line);
```

**✅ Idiomatic**

```js
// Streams are producer–consumer with backpressure baked in: pipe() pauses the
// readable when the writable can't keep up.
const { pipeline } = require("node:stream/promises");
const fs = require("node:fs");
const { Transform } = require("node:stream");

const parse = new Transform({
  objectMode: true,
  highWaterMark: 16, // the bounded buffer
  transform(chunk, _enc, cb) {
    cb(null, handle(chunk));
  },
});

await pipeline(fs.createReadStream("huge.log"), splitLines(), parse, writeResults());
```

**🧠 Tradeoff** — Node streams *are* this pattern: the readable is the producer, the writable
the consumer, and `highWaterMark` is the bounded buffer that drives automatic backpressure —
when the consumer lags, the producer is paused for you. You give up the explicit queue object
(harder to inspect depth), but gain correct flow control across the whole pipeline for free.

### Python

**❌ Naive**

```python
# One shared list, no locking, no bound — races and unbounded growth.
buffer = []
# producer thread: buffer.append(item)
# consumer thread: item = buffer.pop(0)  # IndexError when empty; data races
```

**✅ Idiomatic**

```python
import queue, threading

q = queue.Queue(maxsize=100)  # thread-safe, bounded

def producer():
    for item in source():
        q.put(item)            # blocks when full
    q.put(None)                # poison pill to stop the consumer

def consumer():
    while (item := q.get()) is not None:
        handle(item)
        q.task_done()

threading.Thread(target=producer).start()
threading.Thread(target=consumer).start()
```

**🧠 Tradeoff** — `queue.Queue` is purpose-built for this: thread-safe, bounded, with blocking
`put`/`get` so there's no busy-waiting. It's the right tool for I/O-bound producer/consumer
across threads. For CPU-bound work the GIL still applies — reach for `multiprocessing.Queue`
across processes, or `asyncio.Queue` if you're already in an event loop.

### Elixir

**❌ Naive**

```elixir
# Sending straight to a process's mailbox has no bound — a fast producer
# grows the consumer's mailbox without limit and there's no backpressure.
for item <- source, do: send(consumer_pid, {:item, item})
```

**✅ Idiomatic**

```elixir
# GenStage models demand-driven producer/consumer: the consumer asks for N
# items and the producer sends at most that many — backpressure by design.
defmodule Counter do
  use GenStage
  def init(n), do: {:producer, n}
  def handle_demand(demand, n) do
    events = Enum.to_list(n..(n + demand - 1))
    {:noreply, events, n + demand}
  end
end

defmodule Printer do
  use GenStage
  def init(:ok), do: {:consumer, :ok}
  def handle_events(events, _from, state) do
    Enum.each(events, &handle/1)
    {:noreply, [], state}
  end
end

# GenStage.sync_subscribe(printer, to: counter, max_demand: 100)
```

**🧠 Tradeoff** — Naive message passing on the BEAM has no flow control: an unbounded mailbox is
the failure mode. GenStage inverts it to *demand-driven* — consumers pull by signalling demand,
so the producer can never outrun them. It's more ceremony than a channel, but it gives
principled backpressure across a whole pipeline (and Flow/Broadway build on it).

### Go

**❌ Naive**

```go
// Unbuffered send is pure lockstep; a slice buffer is unbounded. Neither
// gives you a tunable buffer with backpressure.
items := []Item{}
// producer: items = append(items, x)   // grows without bound, not concurrency-safe
```

**✅ Idiomatic**

```go
// A buffered channel IS the bounded queue: send blocks when full, receive
// blocks when empty, and close() is the shutdown signal.
func run(source []Item, consumers int) {
    q := make(chan Item, 100) // bounded buffer

    go func() {
        for _, item := range source {
            q <- item // blocks when the buffer is full — backpressure
        }
        close(q) // signal: no more items
    }()

    var wg sync.WaitGroup
    for c := 0; c < consumers; c++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for item := range q { // exits cleanly when q is closed
                handle(item)
            }
        }()
    }
    wg.Wait()
}
```

**🧠 Tradeoff** — A buffered channel is the textbook bounded queue: capacity, blocking on
full/empty, and `close` as the stop signal, all built in. Adding consumers is just more
goroutines ranging over the same channel. The cost is Go's usual one — you own `close` and the
`WaitGroup`; forget to close and the consumers block forever.

## Applications

- **Log & event ingestion** — producers emit events into a queue; consumer workers batch and
  write them to storage (backend).
- **Request buffering** — a web server accepts requests into a bounded queue so a spike waits
  instead of crashing the handlers (backend).
- **UI event loops** — the browser's task queue is producer–consumer: events are produced by
  the platform, consumed one at a time by the loop (frontend).
- **Data pipelines** — ETL stages hand batches downstream through queues, each stage a
  consumer of the last and a producer for the next (backend).
- **Job systems** — every task queue (Redis lists, SQS, RabbitMQ) is producer–consumer with a
  durable buffer in the middle (backend).

**In modern systems:**

- **Workflow engine** — the scheduler produces ready steps; executors consume them, the two sides
  decoupled by the queue between them.
- **Multi-agent** — a planner agent produces subtasks onto a queue that worker agents consume,
  scaling workers independently of the planner.

## Related Patterns

- **Worker Pool** — a worker pool is producer–consumer with a *fixed set* of consumers pulling
  from the shared queue; the pool adds the consumer-count cap.
- **Publish–Subscribe** — pub/sub broadcasts each item to *many* subscribers; a producer–consumer
  queue hands each item to exactly *one* consumer.
- **Fan-out / Fan-in** — chains producer–consumer stages: fan-out is one producer feeding many
  consumers, fan-in is many producers feeding one queue.
