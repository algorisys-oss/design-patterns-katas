---
id: aggregator
category: messaging
sequence: 5
title: Aggregator
also_known_as: [Gather, Collector]
gof: false
intent: "Collect related individual messages and combine them into a single message once a completion condition is met — the inverse of a splitter, and the 'gather' half of scatter-gather."
frequency: medium
difficulty: intermediate
tags: [messaging, integration, correlation, stateful, scatter-gather]
related: [splitter, fan-out-fan-in, saga]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Buffer incoming messages that belong together — same order, same batch, same request — and, when a
**completion condition** is satisfied (all parts arrived, a count reached, a timeout elapsed), emit
**one aggregated message** combining them. It's a stateful filter: it holds partial groups until they're
whole.

The aggregator is how you rejoin what a splitter (or a scatter to many services) pulled apart. It knows
which messages correlate (by a shared id), how many to expect (or when to give up), and how to fold them
into a result.

## The Problem

When related messages arrive separately — out of order, across time, from parallel workers — you need to
reassemble them, and doing it ad hoc is hard:

- **Correlation** — matching messages that belong to the same group requires tracking a correlation id
  across arrivals.
- **Completion detection** — knowing when a group is *done* (all N parts? a timeout?) is non-trivial,
  especially when some parts may never arrive.
- **Out-of-order arrival** — parallel processing means parts land in any order; you can't just append.
- **State & timeouts** — you must hold partial groups in memory/store and decide what to do when they
  never complete.

## Structure

Key Components:

- **Aggregator** — stateful component holding in-progress groups keyed by correlation id.
- **Correlation id** — the key that groups related messages together.
- **Completion condition** — the rule that decides a group is ready: count reached, all expected parts
  present, or a timeout.
- **Aggregation function** — folds the collected messages into the single output message.
- **Timeout / eviction** — a policy for groups that never complete (emit partial, or discard).

```
Message(a, batch=1) ──┐
Message(b, batch=1) ──┼─► [ Aggregator ] ──complete──► Combined Message(batch=1)
Message(c, batch=1) ──┘   (buffers by correlation id, waits for completion)
```

## When to Use

- Related messages arrive separately and must be recombined into one result.
- You're gathering responses from several services (scatter-gather).
- Results of a split need to be reassembled once all parts are processed.
- You can define a completion condition (count, all-parts, or timeout).

## Advantages and Disadvantages

### Advantages
- **Reassembly** — turns scattered/parallel results back into a coherent whole.
- **Decouples timing** — absorbs out-of-order, cross-time arrivals and emits when ready.
- **Completion semantics** — one place owns "when is this group done."

### Disadvantages
- **Stateful** — must hold partial groups; that state needs memory/persistence and cleanup.
- **Completion is tricky** — deciding when to give up on missing parts (timeouts) risks partial or lost
  results.
- **A bottleneck & failure point** — the aggregator holds critical in-flight state; losing it loses
  groups unless persisted.

## Common Mistakes

- **No timeout for incomplete groups** — waiting forever for a part that will never arrive leaks memory
  and stalls the result; always have a timeout/eviction policy.
- **Losing state on restart** — an in-memory aggregator that crashes drops all partial groups; persist
  state if the groups matter.
- **Wrong completion condition** — emitting before all parts arrive (or never emitting) produces wrong
  or missing results; match the condition to the source.
- **Unbounded group state** — many concurrent incomplete groups can exhaust memory; bound and evict.

## Key Takeaways

- Buffer correlated messages and emit one combined message when a completion condition is met.
- It's the inverse of the splitter and the gather half of scatter-gather.
- Always define completion (count/all-parts/timeout) and a policy for groups that never complete.
- It's stateful — persist the partial groups if losing them is unacceptable.

## Implementations

### JavaScript

*Targets modern JavaScript (ES2015+).*

**❌ Naive**

```js
// Assumes all parts arrive together and in order — breaks with async/parallel results.
function onResults(parts) {
  return combine(parts); // no correlation, no completion handling, no timeout
}
```

**✅ Idiomatic**

```js
// Buffer by correlation id; emit when the count is complete (with a timeout).
function makeAggregator(onComplete, timeoutMs = 5000) {
  const groups = new Map(); // correlationId → { parts, expected, timer }
  return (msg) => {
    let g = groups.get(msg.batchId);
    if (!g) {
      g = { parts: [], expected: msg.total, timer: null };
      g.timer = setTimeout(() => { onComplete(msg.batchId, g.parts, true); groups.delete(msg.batchId); }, timeoutMs);
      groups.set(msg.batchId, g);
    }
    g.parts[msg.seq] = msg.item;                 // out-of-order safe (indexed by seq)
    if (g.parts.filter(Boolean).length === g.expected) { // completion condition
      clearTimeout(g.timer);
      onComplete(msg.batchId, g.parts, false);
      groups.delete(msg.batchId);
    }
  };
}
```

**🧠 Tradeoff** — Keying partial groups by `batchId`, indexing by `seq` (so out-of-order arrivals are
fine), and completing on count-reached *or* timeout is the whole pattern. The timeout is essential — it
bounds memory and guarantees the group eventually resolves (as partial). This in-memory version loses
groups on crash; production aggregators persist the partial state.

### Node.js

*Targets Node.js 24.*

**❌ Naive**

```js
// Collect responses with Promise.all — fine for a fixed set, but no timeout or partial handling.
const results = await Promise.all(services.map((s) => s.query(id))); // one hang blocks forever
```

**✅ Idiomatic**

```js
// Scatter to services, aggregate with a per-request timeout and partial results.
async function scatterGather(services, id, timeoutMs = 2000) {
  const results = await Promise.allSettled(
    services.map((s) =>
      Promise.race([s.query(id), new Promise((_, r) => setTimeout(() => r("timeout"), timeoutMs))]),
    ),
  );
  return results
    .filter((r) => r.status === "fulfilled")   // completion = what arrived in time
    .map((r) => r.value);                        // aggregate the successful parts
}
```

**🧠 Tradeoff** — `Promise.allSettled` + a per-call timeout race is the request-scoped aggregator:
scatter to services, gather what returns in time, and combine — a slow service degrades to a partial
result instead of hanging the whole response. It's simpler than a stateful message aggregator because
the group is one request. For cross-message aggregation over a broker, you need the persistent,
correlated version.

### Python

*Targets Python 3.12.*

**❌ Naive**

```python
# Assumes all parts present at once; no correlation/completion logic.
def aggregate(parts): return combine(parts)
```

**✅ Idiomatic**

```python
import time

class Aggregator:
    def __init__(self, on_complete, timeout=5.0):
        self.groups, self.on_complete, self.timeout = {}, on_complete, timeout
    def add(self, msg):
        g = self.groups.setdefault(msg["batch_id"], {"parts": {}, "expected": msg["total"], "t": time.monotonic()})
        g["parts"][msg["seq"]] = msg["item"]                 # out-of-order safe
        if len(g["parts"]) == g["expected"]:                 # completion by count
            self.on_complete(msg["batch_id"], [g["parts"][i] for i in range(g["expected"])])
            del self.groups[msg["batch_id"]]
    def sweep(self):                                          # periodic timeout eviction
        now = time.monotonic()
        for bid in [b for b, g in self.groups.items() if now - g["t"] > self.timeout]:
            g = self.groups.pop(bid); self.on_complete(bid, list(g["parts"].values()), partial=True)
```

**🧠 Tradeoff** — A dict of partial groups keyed by correlation id, completing on count with a periodic
`sweep` for timeouts, is a clear stateful aggregator. Celery's `chord` does split→aggregate as a
first-class workflow (a group of tasks with a callback). The `sweep`/timeout is what keeps incomplete
groups from leaking; persist `groups` if a crash mustn't lose them.

### Elixir

*Targets Elixir 1.18.*

**❌ Naive**

```elixir
# No correlation or completion — just combines whatever's passed.
def aggregate(parts), do: combine(parts)
```

**✅ Idiomatic**

```elixir
# A GenServer holds partial groups by correlation id; completes on count or a timer.
defmodule Aggregator do
  use GenServer
  def add(msg), do: GenServer.cast(__MODULE__, {:add, msg})

  def handle_cast({:add, %{batch_id: id, seq: seq, total: total, item: item}}, groups) do
    group = Map.get(groups, id, %{parts: %{}, expected: total})
    group = put_in(group.parts[seq], item)
    if map_size(group.parts) == group.expected do
      complete(id, Enum.map(0..(total - 1), &group.parts[&1]))   # completion by count
      {:noreply, Map.delete(groups, id)}
    else
      Process.send_after(self(), {:timeout, id}, 5_000)          # timeout eviction
      {:noreply, Map.put(groups, id, group)}
    end
  end
end
```

**🧠 Tradeoff** — A `GenServer` is the natural home for aggregator state: partial groups live in its
state, `handle_cast` folds arrivals, and `Process.send_after` handles timeouts — all with OTP
supervision. If durability matters, back it with ETS/a database so a restart doesn't drop groups.
Commanded/Broadway offer higher-level aggregation for event-sourced and streaming systems.

### Go

*Targets Go 1.26.*

**❌ Naive**

```go
// Assumes all parts are present; no correlation or completion.
func aggregate(parts []Part) Result { return combine(parts) }
```

**✅ Idiomatic**

```go
// An aggregator goroutine owns the group state (Actor-style); completes on count or timeout.
type group struct {
    parts    map[int]Item
    expected int
    deadline time.Time
}

func Aggregate(in <-chan Msg, out chan<- Result, timeout time.Duration) {
    groups := map[string]*group{}
    ticker := time.NewTicker(time.Second)
    for {
        select {
        case m := <-in:
            g := groups[m.BatchID]
            if g == nil {
                g = &group{parts: map[int]Item{}, expected: m.Total, deadline: time.Now().Add(timeout)}
                groups[m.BatchID] = g
            }
            g.parts[m.Seq] = m.Item
            if len(g.parts) == g.expected { // completion by count
                out <- combine(g); delete(groups, m.BatchID)
            }
        case <-ticker.C: // timeout eviction of stale groups
            for id, g := range groups {
                if time.Now().After(g.deadline) { out <- combinePartial(g); delete(groups, id) }
            }
        }
    }
}
```

**🧠 Tradeoff** — A single goroutine owning the `groups` map (no mutex — the Actor pattern) folds
correlated messages and evicts stale groups on a ticker, giving race-free stateful aggregation. It's
explicit and testable. As always in Go, durability is yours to add — this in-memory aggregator loses
partial groups on crash, so persist them if the groups are precious.

### CSharp

*Targets C# 14 / .NET 10.*

**❌ Naive**

```csharp
// Assumes all parts are already here; no correlation or completion.
static Result Aggregate(IReadOnlyList<Part> parts) => Combine(parts);
```

**✅ Idiomatic**

```csharp
// One task owns the group state (Actor-style); parts and sweep ticks share one channel.
public abstract record Msg;
public sealed record Part(string BatchId, int Seq, int Total, Item Item) : Msg;
public sealed record Sweep : Msg;

sealed class Group
{
    public Dictionary<int, Item> Parts { get; } = new();
    public int Expected { get; init; }
    public DateTime Deadline { get; init; }
}

static async Task Aggregate(ChannelReader<Msg> input, ChannelWriter<Result> output, TimeSpan timeout)
{
    var groups = new Dictionary<string, Group>();
    await foreach (var msg in input.ReadAllAsync())
    {
        switch (msg)
        {
            case Part p:
                if (!groups.TryGetValue(p.BatchId, out var g))
                    groups[p.BatchId] = g = new Group { Expected = p.Total, Deadline = DateTime.UtcNow + timeout };
                g.Parts[p.Seq] = p.Item;                     // out-of-order safe
                if (g.Parts.Count == g.Expected)             // completion by count
                {
                    await output.WriteAsync(Combine(g));
                    groups.Remove(p.BatchId);
                }
                break;
            case Sweep:                                      // timeout eviction of stale groups
                foreach (var (id, stale) in groups.Where(kv => DateTime.UtcNow > kv.Value.Deadline).ToList())
                {
                    await output.WriteAsync(CombinePartial(stale));
                    groups.Remove(id);
                }
                break;
        }
    }
}
// a PeriodicTimer task writes Sweep into the same channel — one owner, no locks.
```

**🧠 Tradeoff** — a single consumer task owning `groups` is the same Actor move as the Go goroutine:
no locks, because only one reader ever touches the state. C# has no `select`, so the tick arrives *as
a message* — a `PeriodicTimer` task writes `Sweep` into the same channel, and one pattern-matching
`switch` handles both kinds. The records make the message set explicit and compiler-checked. It's
still in-memory: groups die with the process, so persist them if they matter.

### Rust

*Targets Rust 1.95 (2024 edition).*

**❌ Naive**

```rust
// Assumes every part is already here; no correlation or completion.
fn aggregate(parts: Vec<Part>) -> AggResult {
    combine_parts(parts)
}
```

**✅ Idiomatic**

```rust
use std::collections::HashMap;
use std::sync::mpsc;
use std::time::{Duration, Instant};

struct Part { batch_id: String, seq: usize, total: usize, item: Item }
struct Group { parts: HashMap<usize, Item>, expected: usize, deadline: Instant }

// One thread owns the groups map; recv_timeout doubles as the sweep tick.
fn aggregate(input: mpsc::Receiver<Part>, output: mpsc::Sender<AggResult>, timeout: Duration) {
    let mut groups: HashMap<String, Group> = HashMap::new();
    loop {
        match input.recv_timeout(Duration::from_secs(1)) {
            Ok(part) => {
                let g = groups.entry(part.batch_id.clone()).or_insert_with(|| Group {
                    parts: HashMap::new(),
                    expected: part.total,
                    deadline: Instant::now() + timeout,
                });
                g.parts.insert(part.seq, part.item);         // out-of-order safe
                if g.parts.len() == g.expected {             // completion by count
                    let done = groups.remove(&part.batch_id).unwrap();
                    output.send(combine(done)).unwrap();
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {        // sweep stale groups
                let stale: Vec<String> = groups.iter()
                    .filter(|(_, g)| Instant::now() > g.deadline)
                    .map(|(id, _)| id.clone())
                    .collect();
                for id in stale {
                    let g = groups.remove(&id).unwrap();
                    output.send(combine_partial(g)).unwrap();
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break, // senders gone — clean exit
        }
    }
}
```

**🧠 Tradeoff** — `recv_timeout` folds Go's two `select` arms into one call: a message means fold it
in, a timeout means sweep. The `match` on the result is exhaustive, so channel hangup is handled
deliberately (`Disconnected` → clean exit) rather than by accident. One thread owning `groups` means
no `Mutex` at all — ownership delivers what the Actor pattern promises. The borrow checker shapes the
shutdown of a group too: you check completion while borrowing, then `remove` in a separate visible step.

### Zig

*Targets Zig 0.17-dev.*

**❌ Naive**

```zig
// Assumes every part is already here; no correlation or completion.
fn aggregate(parts: []const Part) Result {
    return combine(parts);
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// A part or a sweep tick — one tagged union, one exhaustive switch (Go's select, spelled out).
const Msg = union(enum) {
    part: Part,
    sweep: void,
};

const Part = struct { batch_id: []const u8, seq: usize, total: usize, item: Item };
const Group = struct { parts: []?Item, filled: usize, deadline: i64 };

const Aggregator = struct {
    allocator: std.mem.Allocator,
    io: std.Io, // the clock is a capability too — threaded in like the allocator
    groups: std.StringHashMap(Group),
    timeout_ms: i64,

    fn nowMs(self: *Aggregator) i64 {
        return std.Io.Timestamp.now(self.io, .real).toMilliseconds();
    }

    fn handle(self: *Aggregator, msg: Msg) !void {
        switch (msg) {
            .part => |p| try self.add(p),
            .sweep => self.evictStale(),
        }
    }

    fn add(self: *Aggregator, p: Part) !void {
        const entry = try self.groups.getOrPut(p.batch_id);
        if (!entry.found_existing) {
            entry.value_ptr.* = .{
                .parts = try self.allocator.alloc(?Item, p.total), // one slot per seq
                .filled = 0,
                .deadline = self.nowMs() + self.timeout_ms,
            };
            @memset(entry.value_ptr.parts, null);
        }
        const g = entry.value_ptr;
        if (g.parts[p.seq] == null) g.filled += 1;
        g.parts[p.seq] = p.item;                     // out-of-order safe — indexed by seq
        if (g.filled == g.parts.len) {               // completion by count
            complete(p.batch_id, g.parts, false);
            self.allocator.free(g.parts);
            _ = self.groups.remove(p.batch_id);
        }
    }

    fn evictStale(self: *Aggregator) void {          // timeout eviction of stale groups
        var stale_ids: [16][]const u8 = undefined;   // bounded sweep — plenty for a demo
        var n: usize = 0;
        var it = self.groups.iterator();
        while (it.next()) |e| {
            if (self.nowMs() > e.value_ptr.deadline and n < stale_ids.len) {
                stale_ids[n] = e.key_ptr.*;
                n += 1;
            }
        }
        for (stale_ids[0..n]) |id| {
            const g = self.groups.get(id).?;
            complete(id, g.parts, true);             // partial — the timeout resolves the group
            self.allocator.free(g.parts);
            _ = self.groups.remove(id);
        }
    }
};
```

**🧠 Tradeoff** — everything the pattern needs is spelled out: the `parts` slice is allocated per
group (one slot per `seq`, so out-of-order arrival is literal indexing) and freed the moment the
group resolves. There's no runtime, so the timeout isn't a timer — `sweep` is a message you feed in
from your own loop, which is honest about what Go's ticker was doing for you. The clock is honest
too: 0.17 has no ambient `milliTimestamp`, so the aggregator carries an `std.Io` and asks it for
the time, exactly like the allocator beside it. Watch the keys:
`StringHashMap` doesn't copy `batch_id`, so the id must outlive the group — dupe it with the
allocator if the source message doesn't stick around.

### Java

*Targets Java 25.*

**❌ Naive**

```java
// Assumes every part is already here; no correlation or completion.
static Result aggregate(List<Part> parts) { return combine(parts); }
```

**✅ Idiomatic**

```java
record Part(String batchId, int seq, int total, Item item) {}

final class Group {
    final Map<Integer, Item> parts = new HashMap<>();
    final int expected;
    final Instant deadline;
    Group(int expected, Instant deadline) { this.expected = expected; this.deadline = deadline; }
}

// One thread owns the groups map (Actor-style); poll's timeout doubles as the sweep tick.
static void aggregate(BlockingQueue<Part> input, BlockingQueue<Result> output, Duration timeout)
        throws InterruptedException {
    var groups = new HashMap<String, Group>();
    while (true) {
        var part = input.poll(1, TimeUnit.SECONDS);
        if (part != null) {
            var g = groups.computeIfAbsent(part.batchId(),
                    id -> new Group(part.total(), Instant.now().plus(timeout)));
            g.parts.put(part.seq(), part.item());            // out-of-order safe
            if (g.parts.size() == g.expected) {              // completion by count
                output.put(combine(groups.remove(part.batchId())));
            }
        } else {                                             // poll timed out → sweep stale groups
            for (var it = groups.values().iterator(); it.hasNext(); ) {
                var stale = it.next();
                if (Instant.now().isAfter(stale.deadline)) {
                    output.put(combinePartial(stale));
                    it.remove();
                }
            }
        }
    }
}
```

**🧠 Tradeoff** — `poll` with a timeout folds Go's two `select` arms into one call, the same move as
Rust's `recv_timeout`: a part means fold it in, `null` means sweep. One thread owning `groups` is the
Actor discipline — a plain `HashMap`, not a `ConcurrentHashMap`, because only this thread ever touches
it. `computeIfAbsent` makes get-or-create one expression, the `Part` record can't be edited after
arrival, and the iterator's `remove` is the safe way to evict mid-walk. Still in-memory: partial
groups die with the process, so persist them if losing a group is unacceptable.

## Applications

- **Scatter-gather queries** — fan a request to many services/shards and combine their responses
  (backend).
- **Split reassembly** — recombining the per-item results a splitter produced back into a batch result
  (backend).
- **Order completion** — waiting for payment + inventory + shipping confirmations before marking an
  order done (backend).
- **Sensor/data fusion** — combining readings from multiple sources within a time window (backend).
- **Batch response building** — collecting async job results into a single report (backend).

## Related Patterns

- **Splitter** — the inverse: the aggregator recombines what a splitter broke apart, using the
  correlation the splitter attached.
- **Fan-out / Fan-in** — aggregation is the fan-in step; the completion condition is what "wait for all"
  means concretely.
- **Saga** — a saga waits for and correlates step outcomes much like an aggregator, adding compensation
  on failure.
