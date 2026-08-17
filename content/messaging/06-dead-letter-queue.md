---
id: dead-letter-queue
category: messaging
sequence: 6
title: Dead Letter Queue
also_known_as: [DLQ, Dead Letter Channel, Invalid Message Channel]
gof: false
intent: "Route messages that can't be processed — after retries, or because they're malformed or unroutable — to a separate queue instead of dropping them or blocking the main flow."
frequency: high
difficulty: beginner
tags: [messaging, integration, error-handling, resilience, poison-message]
related: [retry, message-channel, circuit-breaker]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Give failed messages somewhere to go. When a consumer can't process a message — it's malformed, it
fails every retry, or it has no valid destination — move it to a dedicated **dead letter queue** rather
than discarding it or endlessly redelivering it. The main queue keeps flowing; the failures are
preserved for inspection, alerting, and later replay.

The DLQ solves the **poison message** problem: one message a consumer can never handle would otherwise
be redelivered forever, blocking the queue and wasting resources. Shunting it aside keeps the pipeline
healthy while ensuring nothing is silently lost.

## The Problem

A message that can't be processed puts you in a bad spot with the usual options:

- **Poison message blocks the queue** — a message that fails every time is redelivered endlessly,
  stalling the consumer and starving good messages behind it.
- **Dropping loses data** — silently discarding a failed message means lost orders, lost events, no
  audit trail, and no way to recover.
- **Infinite retries waste resources** — retrying a permanently-broken message forever burns CPU and
  hammers downstream systems.
- **Failures are invisible** — without a place for them, failed messages leave no signal that something
  needs attention.

## Structure

Key Components:

- **Main queue** — the normal channel consumers process from.
- **Consumer** — processes messages; on repeated/permanent failure, routes the message to the DLQ.
- **Dead letter queue** — a separate channel holding messages that couldn't be processed, with failure
  metadata (error, attempts, timestamp).
- **Retry policy** — how many attempts before a message is dead-lettered.
- **Monitoring & replay** — alerting on DLQ depth, plus tooling to inspect and re-submit fixed messages.

```
Producer ──► [ Main Queue ] ──► Consumer ──success──► done
                                   │ fails N times / invalid
                                   ▼
                          [ Dead Letter Queue ] ──► inspect · alert · replay
```

## When to Use

- Consumers can encounter messages they can't process (malformed, permanently failing).
- You must not lose messages, but also must not block the queue on poison messages.
- You want visibility into failures (metrics, alerts) and the ability to replay after a fix.
- A retry policy is in place, and you need a terminal destination when retries are exhausted.

## Advantages and Disadvantages

### Advantages
- **No lost messages** — failures are preserved for inspection and replay, not dropped.
- **Main flow stays healthy** — poison messages are removed so good messages keep processing.
- **Visibility & recovery** — DLQ depth is an alertable signal, and messages can be fixed and replayed.

### Disadvantages
- **Operational burden** — someone must monitor, triage, and replay the DLQ, or it's just a landfill.
- **Ordering loss** — dead-lettering a message breaks strict ordering for that stream.
- **Silent accumulation** — an unwatched DLQ hides a growing problem; it needs alerting to be useful.

## Common Mistakes

- **No DLQ at all** — the default of "drop or retry forever" is the worst of both; give failures a home.
- **DLQ with no monitoring** — messages pile up unnoticed; alert on DLQ depth and age.
- **No replay path** — a DLQ you can't re-submit from is a graveyard; build inspection and replay tooling.
- **Dead-lettering transient failures too eagerly** — sending a message to the DLQ on the first blip
  wastes the retry that would have succeeded; retry transient errors first, DLQ on exhaustion.

## Key Takeaways

- Route unprocessable messages to a dedicated queue instead of dropping or endlessly retrying them.
- It solves the poison-message problem and keeps the main queue flowing.
- Dead-letter after retries are exhausted; distinguish transient from permanent failures.
- A DLQ is only useful with monitoring/alerting and a replay path — otherwise it's a silent landfill.

## Implementations

### JavaScript

**❌ Naive**

```js
// A failure either throws (redelivered forever) or is swallowed (message lost).
queue.consume((msg) => {
  process(msg); // throws on a poison message → redelivered endlessly, or caught and dropped
});
```

**✅ Idiomatic**

```js
// Retry transient failures; after max attempts, move the message to a DLQ with metadata.
async function consume(msg) {
  const attempts = (msg.attempts ?? 0) + 1;
  try {
    await process(msg.body);
  } catch (err) {
    if (attempts < MAX_ATTEMPTS && isTransient(err)) {
      return queue.requeue({ ...msg, attempts }); // retry
    }
    await deadLetterQueue.push({                   // give up → DLQ, not lost
      body: msg.body, attempts, error: String(err), failedAt: Date.now(),
    });
  }
}
```

**🧠 Tradeoff** — Tracking `attempts`, retrying transient errors, and pushing to a DLQ with failure
metadata on exhaustion is the whole pattern: poison messages leave the main flow but are preserved with
context for triage. The metadata (`error`, `attempts`) is what makes the DLQ actionable. You still owe
monitoring and a replay tool, or the DLQ just accumulates.

### Node.js

**❌ Naive**

```js
// nack with requeue=true on failure → the poison message loops forever.
ch.consume("orders", (msg) => {
  try { handle(JSON.parse(msg.content)); ch.ack(msg); }
  catch { ch.nack(msg, false, true); } // requeue forever
});
```

**✅ Idiomatic**

```js
// RabbitMQ dead-letters natively: configure a DLX; nack without requeue routes there.
await ch.assertExchange("dlx", "fanout", { durable: true });
await ch.assertQueue("orders.dlq", { durable: true });
await ch.bindQueue("orders.dlq", "dlx", "");
await ch.assertQueue("orders", {
  durable: true,
  deadLetterExchange: "dlx",           // where rejected messages go
  arguments: { "x-delivery-limit": 5 }, // quorum queues: auto-DLQ after 5 deliveries
});

ch.consume("orders", (msg) => {
  try { handle(JSON.parse(msg.content)); ch.ack(msg); }
  catch { ch.nack(msg, false, false); } // don't requeue → broker routes to the DLQ
});
```

**🧠 Tradeoff** — RabbitMQ (and SQS, and most brokers) provide dead-lettering as infrastructure: a
dead-letter exchange plus a delivery limit auto-routes exhausted/rejected messages to a DLQ, so you
`nack` without requeue and the broker does the rest. It's more robust than hand-rolled retry counting
(survives consumer restarts). You still configure alerting on the DLQ and a replay/shovel path.

### Python

**❌ Naive**

```python
# Exception either crashes the worker loop or the message is lost.
def consume(msg):
    process(msg)   # poison message repeats forever, or is dropped on a bare except
```

**✅ Idiomatic**

```python
# Retry with backoff; after max attempts, publish to a DLQ with failure context.
def consume(msg):
    attempts = msg.get("attempts", 0) + 1
    try:
        process(msg["body"])
    except Exception as err:
        if attempts < MAX_ATTEMPTS and is_transient(err):
            requeue({**msg, "attempts": attempts})       # retry
        else:
            dlq.put({"body": msg["body"], "attempts": attempts,
                     "error": repr(err), "failed_at": time.time()})   # DLQ

# Celery does this declaratively: autoretry_for + max_retries, and a dead-letter routing key.
```

**🧠 Tradeoff** — Explicit attempt tracking + DLQ publish works, but Celery and Kombu make it
declarative: `autoretry_for`/`max_retries` for the retry policy and broker dead-letter routing for the
terminal queue, so the framework enforces the boundary between transient-retry and permanent-DLQ. Either
way, the DLQ needs a dashboard/alert and a replay task to matter.

### Elixir

**❌ Naive**

```elixir
# A crashing handler just lets the message be redelivered (or lost), forever.
def handle_message(_, %{data: data} = msg, _) do
  process!(data)  # raises on poison message → redelivered repeatedly
  msg
end
```

**✅ Idiomatic**

```elixir
# Broadway supports retries and failed-message handling; route exhausted ones to a DLQ.
def handle_message(_processor, message, _context) do
  Broadway.Message.update_data(message, &process!/1)
rescue
  err -> Broadway.Message.failed(message, inspect(err)) # marks it failed
end

# handle_failed/2 decides retry vs. dead-letter based on attempts/metadata:
def handle_failed(messages, _context) do
  Enum.each(messages, fn m -> DLQ.publish(m.data, m.status) end) # preserve, don't lose
  messages
end
```

**🧠 Tradeoff** — Broadway gives Elixir first-class failed-message handling: `Broadway.Message.failed`
plus `handle_failed/2` is the hook where you decide retry vs. dead-letter and publish to a DLQ with the
failure reason. The BEAM's "let it crash" pairs with it — a supervised processor restarts, while the DLQ
captures the message that caused the crash. You still add DLQ monitoring and replay.

### Go

**❌ Naive**

```go
// On error, either re-enqueue forever or drop the message.
func consume(msg Msg) {
    if err := process(msg); err != nil {
        queue.Requeue(msg) // poison message loops indefinitely
    }
}
```

**✅ Idiomatic**

```go
// Retry transient errors up to a limit, then publish to the DLQ with context.
func consume(msg Msg) {
    err := process(msg.Body)
    if err == nil {
        return
    }
    if msg.Attempts < maxAttempts && transient(err) {
        msg.Attempts++
        queue.Requeue(msg) // retry
        return
    }
    dlq.Publish(DeadLetter{ // give up → DLQ, preserved with metadata
        Body: msg.Body, Attempts: msg.Attempts, Error: err.Error(), FailedAt: time.Now(),
    })
}
```

**🧠 Tradeoff** — Explicit attempt counting, a transient-vs-permanent check, and a `dlq.Publish` on
exhaustion give a clear, testable dead-letter path. With managed brokers (SQS, NATS JetStream, Kafka)
you configure a redelivery limit and DLQ at the infrastructure level instead, and the consumer just
returns an error. Either way, Go leaves the operational pieces — alerting on DLQ depth and a replay
command — explicitly to you.

### CSharp

**❌ Naive**

```csharp
// On error, either requeue forever or drop the message.
static async Task Consume(Msg msg)
{
    try { Process(msg.Body); }
    catch { await queue.Writer.WriteAsync(msg); } // poison message loops indefinitely
}
```

**✅ Idiomatic**

```csharp
// Retry transient errors up to a limit; exception filters route the rest to the DLQ.
static async Task Consume(Msg msg, ChannelWriter<Msg> retry, ChannelWriter<DeadLetter> dlq)
{
    try
    {
        Process(msg.Body);
    }
    catch (Exception err) when (msg.Attempts < MaxAttempts && IsTransient(err))
    {
        await retry.WriteAsync(msg with { Attempts = msg.Attempts + 1 }); // retry
    }
    catch (Exception err)
    {
        await dlq.WriteAsync(new DeadLetter(         // give up → DLQ, preserved with context
            msg.Body, msg.Attempts, err.Message, DateTime.UtcNow));
    }
}

public sealed record Msg(string Body, int Attempts = 0);
public sealed record DeadLetter(string Body, int Attempts, string Error, DateTime FailedAt);
```

**🧠 Tradeoff** — exception filters put the retry decision into the catch dispatch itself: the
`when` clause retries transient failures with budget left, and the plain `catch` below is the
terminal DLQ path — the control flow reads exactly like the policy. `with` produces the
incremented-attempts copy without mutating the original. The channels here are in-process; Azure
Service Bus and SQS ship the same thing as infrastructure (`MaxDeliveryCount` plus a built-in DLQ),
like the RabbitMQ tab — and either way you still owe alerting and replay.

### Rust

**❌ Naive**

```rust
// On error, requeue forever — the poison message never leaves.
fn consume(msg: Msg, queue: &mpsc::Sender<Msg>) {
    if process(&msg.body).is_err() {
        queue.send(msg).unwrap(); // redelivered indefinitely
    }
}
```

**✅ Idiomatic**

```rust
use std::sync::mpsc;
use std::time::SystemTime;

// Transient vs permanent is a type, not a heuristic.
enum ProcessError {
    Transient(String), // network blip, lock timeout — worth retrying
    Permanent(String), // malformed payload — will never succeed
}

struct Msg { body: String, attempts: u32 }
struct DeadLetter { body: String, attempts: u32, error: String, failed_at: SystemTime }

const MAX_ATTEMPTS: u32 = 5;

fn consume(msg: Msg, retry: &mpsc::Sender<Msg>, dlq: &mpsc::Sender<DeadLetter>) {
    match process(&msg.body) {
        Ok(()) => {}
        Err(ProcessError::Transient(_)) if msg.attempts < MAX_ATTEMPTS => {
            retry.send(Msg { attempts: msg.attempts + 1, ..msg }).unwrap(); // retry
        }
        Err(ProcessError::Transient(reason)) | Err(ProcessError::Permanent(reason)) => {
            dlq.send(DeadLetter {                    // give up → DLQ, preserved with context
                body: msg.body,
                attempts: msg.attempts,
                error: reason,
                failed_at: SystemTime::now(),
            }).unwrap();
        }
    }
}
```

**🧠 Tradeoff** — the real move is the error enum: `Transient` vs `Permanent` is a type, not an
`is_transient()` string check, and the exhaustive `match` won't compile until every failure kind has
a destination — add a variant and the compiler walks you to each unrouted site. The guard plus
or-pattern reads like the policy: transient with budget → retry; everything else → DLQ. `..msg`
struct-update moves the body into the retried message with no clone. As in Go, the queues are
in-process — durability, alerting, and replay are still yours.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// On error, requeue forever — the poison message never leaves the loop.
fn consume(msg: Msg) !void {
    process(msg.body) catch {
        try main_queue.push(msg); // redelivered indefinitely
    };
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// The failure kinds are a closed error set — the switch below must route every one.
const ProcessError = error{ Transient, Permanent };

const Msg = struct { body: []const u8, attempts: u32 };
const DeadLetter = struct { body: []const u8, attempts: u32, err: ProcessError, failed_at: i64 };

const max_attempts = 5;

// Queue(T) is any explicit FIFO you own — a comptime-generic ring buffer, say.
fn consume(io: std.Io, msg: Msg, retry: *Queue(Msg), dlq: *Queue(DeadLetter)) !void {
    process(msg.body) catch |err| switch (err) {
        error.Transient => {
            if (msg.attempts < max_attempts) {
                try retry.push(.{ .body = msg.body, .attempts = msg.attempts + 1 }); // retry
            } else {
                try deadLetter(io, dlq, msg, err); // retry budget spent
            }
        },
        error.Permanent => try deadLetter(io, dlq, msg, err), // never retry a malformed message
    };
}

fn deadLetter(io: std.Io, dlq: *Queue(DeadLetter), msg: Msg, err: ProcessError) !void {
    try dlq.push(.{                                  // give up → DLQ, preserved with context
        .body = msg.body,
        .attempts = msg.attempts,
        .err = err,
        .failed_at = std.Io.Timestamp.now(io, .real).toMilliseconds(), // the clock is an io capability
    });
}
```

**🧠 Tradeoff** — Zig's error sets do what Rust's enum did: `error{Transient, Permanent}` is a
closed set, and `catch |err| switch (err)` must handle every member, so an unrouted failure kind is
a compile error. The `DeadLetter` struct carries the error value itself, not a stringified guess.
There's no broker to lean on — the queues are structs you wrote — so the operational half of the
pattern (depth alerts, a replay loop) is also code you must write, which at least keeps it visible.

### Java

**❌ Naive**

```java
// On error, requeue forever — the poison message never leaves.
static void consume(Msg msg, BlockingQueue<Msg> queue) throws InterruptedException {
    try { process(msg.body()); }
    catch (Exception err) { queue.put(msg); } // redelivered indefinitely
}
```

**✅ Idiomatic**

```java
// Transient vs permanent is a checked exception type — the catch dispatch IS the routing policy.
sealed abstract class ProcessException extends Exception
        permits TransientException, PermanentException {}
final class TransientException extends ProcessException {}  // network blip — worth retrying
final class PermanentException extends ProcessException {}  // malformed — will never succeed

record Msg(String body, int attempts) {}
record DeadLetter(String body, int attempts, String error, Instant failedAt) {}

static final int MAX_ATTEMPTS = 5;

static void consume(Msg msg, BlockingQueue<Msg> retry, BlockingQueue<DeadLetter> dlq)
        throws InterruptedException {
    try {
        process(msg.body());
    } catch (ProcessException err) {
        switch (err) {                                          // sealed → exhaustive, no default
            case TransientException _ when msg.attempts() < MAX_ATTEMPTS ->
                retry.put(new Msg(msg.body(), msg.attempts() + 1)); // retry
            case TransientException _, PermanentException _ ->  // budget spent, or malformed
                dlq.put(new DeadLetter(                         // give up → DLQ, preserved with context
                    msg.body(), msg.attempts(), err.toString(), Instant.now()));
        }
    }
}
```

**🧠 Tradeoff** — making transient-vs-permanent a checked exception type puts the policy in
`process`'s signature: callers can't compile without handling it, and because the set is `sealed`,
the switch over the caught exception is exhaustive with no `default` — add a third failure kind and
every consumer breaks until it routes it, exactly Rust's enum guarantee. The guarded case plus the
two-pattern case reads like the policy: transient with budget → retry, everything else → DLQ. In
production Java this tab is usually broker configuration instead — a JMS redelivery policy moves the
message to `ActiveMQ.DLQ` after `maximumRedeliveries`, and an SQS redrive policy shifts it to the DLQ
once `maxReceiveCount` deliveries fail. There the consumer just throws, and the broker's counting
survives restarts in a way a hand-carried `attempts` field doesn't. Either way you still owe alerting
on DLQ depth and a replay path.

## Applications

- **Message brokers** — SQS redrive policies, RabbitMQ dead-letter exchanges, and Kafka DLQ topics are
  built-in DLQ support (backend).
- **Background jobs** — Sidekiq/Celery/Oban move exhausted jobs to a dead/failed set for inspection and
  retry (backend).
- **Event pipelines** — malformed or unprocessable events routed aside so the stream keeps flowing
  (backend).
- **Webhook delivery** — failed webhook deliveries dead-lettered after retries for manual replay
  (backend).
- **Data ingestion** — records that fail validation captured in a DLQ for correction and re-import
  (backend).

**In modern systems:**

- **Workflow engine** — a step that exhausts its retries lands in a DLQ for inspection instead of
  killing the whole run.
- **Multi-agent** — tasks an agent can't complete after N tries are parked for human review rather
  than looping forever and draining the budget.

## Related Patterns

- **Retry** — the DLQ is where retries *end*: exhaust transient retries first, dead-letter on permanent
  failure or when the retry budget runs out.
- **Message Channel** — a DLQ is a specialized channel; the pattern is "route failures to their own
  channel instead of the main one."
- **Circuit Breaker** — complementary resilience: the breaker stops calling a failing dependency, the DLQ
  captures the messages that couldn't be processed meanwhile.
