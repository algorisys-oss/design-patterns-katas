---
id: leader-election
category: distributed
sequence: 8
title: Leader Election
also_known_as: [Leader/Follower, Coordinator Election]
gof: false
intent: "Have a group of identical nodes agree on one 'leader' to coordinate work, and automatically elect a new one if the leader fails — so exactly one node acts at a time."
frequency: medium
difficulty: advanced
tags: [distributed, coordination, consensus, high-availability, single-writer]
related: [saga, circuit-breaker, actor]
languages: [javascript, node-js, python, elixir, go, csharp, rust, zig, java]
---

## Intent

Run several identical nodes for availability, but let only **one** — the **leader** — perform the
work that must happen in a single place (a scheduler, a writer, a coordinator). The nodes agree on
who the leader is; if it dies, the survivors detect it and **elect** a new leader, so the role
never disappears and is never held by two nodes at once.

It's how you get high availability *and* single-writer semantics: many nodes for redundancy, one
active at a time for correctness. The moment the active node fails, another takes over — ideally in
seconds, with no human in the loop.

## The Problem

Some work must be done by exactly one node, but you can't run just one node (it would be a single
point of failure):

- **Split brain** — run the coordinator on every node and they all act: two schedulers fire the
  same job twice, two writers corrupt shared state.
- **Single point of failure** — run it on one node and its crash stops the work entirely until
  someone intervenes.
- **Manual failover is slow** — a human noticing and promoting a standby means minutes-to-hours of
  downtime and pager fatigue.
- **Agreement is genuinely hard** — nodes must agree on one leader despite network partitions and
  crashes, where "is it dead or just slow?" has no perfect answer.

## Structure

Key Components:

- **Nodes / Candidates** — the identical instances, any of which can be leader.
- **Coordinator / Election mechanism** — how they agree: a consensus service (ZooKeeper, etcd,
  Consul), a database lock, or a consensus protocol (Raft, Paxos).
- **Lease / Lock** — the leader holds a time-limited lease it must renew; if it stops, the lease
  expires and triggers a new election.
- **Leader** — the one node doing the coordinated work; **Followers** stand by, ready to take over.

```
                    ┌──────► Leader (holds the lease, does the work)
Coordinator ──elect─┤
   (lease)          ├──────► Follower A (standby)
                    └──────► Follower B (standby)
     leader's lease expires → survivors elect a new leader
```

## When to Use

- A task must run on exactly one node (scheduled jobs, a single writer, a partition owner).
- You need high availability: automatic, fast failover when the active node dies.
- Multiple instances run for redundancy but must coordinate a singleton responsibility.
- You have (or can add) a consensus/lock service to arbitrate.

## Advantages and Disadvantages

### Advantages
- **High availability** — the singleton role survives node failure via automatic re-election.
- **No split brain** — a correct election guarantees at most one leader acts at a time.
- **Fast, hands-off failover** — a survivor takes over in seconds without human intervention.

### Disadvantages
- **Consensus is hard** — correct election under partitions is subtle; rolling your own invites
  split brain. Use a proven system.
- **Failover isn't instant** — there's a detection + election gap where no leader acts; work pauses
  briefly.
- **Dependency on a coordinator** — you now rely on ZooKeeper/etcd/Consul (itself a cluster to run)
  or a database lock's correctness.

## Common Mistakes

- **Home-grown consensus** — implementing election by hand almost always allows split brain under
  partition; delegate to etcd/ZooKeeper/Consul or a Raft library.
- **No lease expiry (fencing)** — a paused leader (GC, network blip) that resumes thinking it's still
  leader while a new one was elected causes two leaders; use fencing tokens so stale leaders are
  rejected.
- **Assuming instant failover** — building as if the leader is *always* present ignores the election
  gap; the work must tolerate a brief pause.
- **Leader doing too much** — funneling all work through the leader recreates the bottleneck; the
  leader should coordinate, not be the only worker.

## Key Takeaways

- Many nodes for availability, one leader for correctness — with automatic re-election on failure.
- Correct election needs consensus; don't hand-roll it, use etcd/ZooKeeper/Consul or Raft.
- Leases + fencing tokens prevent a resumed stale leader from acting alongside a new one.
- Expect (and design for) a brief no-leader gap during failover.

## Implementations

### JavaScript

**❌ Naive**

```js
// Every instance runs the scheduler — the job fires N times, once per node.
setInterval(() => runNightlyBilling(), everyDay); // split brain: all nodes bill
```

**✅ Idiomatic**

```js
// Acquire a short TTL lock in Redis; only the holder is leader, and it must renew.
async function tryBecomeLeader(redis, id, ttlMs = 10_000) {
  // SET key id NX PX ttl — succeeds only if no one holds it
  const won = await redis.set("leader", id, "NX", "PX", ttlMs);
  return won === "OK";
}

async function leaderLoop(redis, id) {
  setInterval(async () => {
    const isLeader = await tryBecomeLeader(redis, id);
    if (isLeader || (await redis.get("leader")) === id) {
      await redis.pexpire("leader", 10_000); // renew the lease
      runNightlyBilling();                    // only the leader runs it
    }
  }, 5_000);
}
```

**🧠 Tradeoff** — A Redis `SET NX PX` lease is a pragmatic, lightweight election: whoever grabs the
key is leader and renews it; if it stops renewing, the key expires and another node grabs it. It's
simple and good enough for many "run this on one node" needs. But single-Redis locks aren't true
consensus — under failover/partition they can grant two leaders, so add **fencing tokens** (a
monotonic counter checked by the protected resource) for correctness, or use Redlock/etcd.

### Node.js

**❌ Naive**

```js
// A cron in every replica — the cluster runs the job once per instance.
cron.schedule("0 2 * * *", cleanupExpiredSessions); // fires on all N nodes
```

**✅ Idiomatic**

```js
// Delegate election to etcd: campaign for leadership, run work only while elected.
const { Etcd3 } = require("etcd3");
const client = new Etcd3();
const election = client.election("session-cleanup");

async function run() {
  const campaign = election.campaign(process.env.HOSTNAME); // blocks until elected
  campaign.on("elected", () => {
    startCleanupCron(); // only the leader schedules the job
  });
  campaign.on("error", () => stopCleanupCron()); // lost leadership → stop
}
```

**🧠 Tradeoff** — Leaning on etcd's election API gives *real* consensus (Raft under the hood):
`elected`/`error` events tell each node exactly when it holds or loses leadership, with correct
fencing. You run and depend on an etcd cluster, which is the honest cost — but you get split-brain
safety you shouldn't try to reproduce with a plain lock. This is the recommended path for
correctness.

### Python

**❌ Naive**

```python
# Each worker process runs the scheduler; the task executes once per process.
schedule.every().day.at("02:00").do(rebuild_search_index)  # on every replica
```

**✅ Idiomatic**

```python
# A leader lease in a coordination store (here, a simple DB row with expiry + fencing token).
def try_acquire_leadership(db, node_id, ttl=15):
    now = time.time()
    # atomically take the lease if it's free or expired, bumping a fencing token
    row = db.execute("""
        UPDATE leader SET holder=%s, expires_at=%s, token=token+1
        WHERE expires_at < %s RETURNING token
    """, (node_id, now + ttl, now)).fetchone()
    return row.token if row else None

def loop(db, node_id):
    while True:
        token = try_acquire_leadership(db, node_id)
        if token is not None:
            rebuild_search_index(fencing_token=token)  # protected work checks the token
        time.sleep(5)
```

**🧠 Tradeoff** — A single-row DB lease with an atomic conditional update is a workable election
when you already have a strongly-consistent database and don't want another dependency, and the
monotonic `token` gives you fencing against a stale leader. It's simpler than running ZooKeeper, but
its correctness rides entirely on the database's atomicity and your fencing discipline; for serious
use, `kazoo` (ZooKeeper) or etcd is the sturdier choice.

### Elixir

**❌ Naive**

```elixir
# A GenServer started on every node runs the periodic work on every node.
def handle_info(:tick, state) do
  do_periodic_work()                       # runs on all nodes in the cluster
  Process.send_after(self(), :tick, 60_000)
  {:noreply, state}
end
```

**✅ Idiomatic**

```elixir
# :global registration makes the cluster agree on ONE named process; restart on failure.
def start_link(_) do
  case GenServer.start_link(__MODULE__, :ok, name: {:global, __MODULE__}) do
    {:ok, pid} -> {:ok, pid}                       # this node won — it's the singleton
    {:error, {:already_started, pid}} -> {:ok, pid} # another node holds it
  end
end
# If the node holding the :global name dies, the name frees and a supervisor on
# another node starts it — automatic failover. (Horde/:pg give richer, partition-aware options.)
```

**🧠 Tradeoff** — The BEAM has cluster-wide coordination built in: `:global` name registration
gives a single named process across nodes — a natural leader — and OTP supervision restarts it
elsewhere on failure. For partition-tolerant, correct handoff you graduate to `Horde` or Raft
(`ra`), since `:global` can briefly split-brain during a netsplit. Still, no external coordinator is
needed for the common case — a genuine BEAM advantage.

### Go

**❌ Naive**

```go
// Every pod runs the ticker; the job runs on all of them.
for range time.Tick(time.Hour) {
    reconcile() // runs on every replica — duplicated work
}
```

**✅ Idiomatic**

```go
// Kubernetes/etcd leader election: OnStartedLeading runs work; OnStoppedLeading halts it.
import "k8s.io/client-go/tools/leaderelection"

leaderelection.RunOrDie(ctx, leaderelection.LeaderElectionConfig{
    Lock:          lock,             // a Lease object in etcd/k8s
    LeaseDuration: 15 * time.Second,
    RenewDeadline: 10 * time.Second,
    RetryPeriod:   2 * time.Second,
    Callbacks: leaderelection.LeaderCallbacks{
        OnStartedLeading: func(ctx context.Context) { reconcileLoop(ctx) }, // leader only
        OnStoppedLeading: func() { log.Println("lost leadership") },        // stop cleanly
    },
})
```

**🧠 Tradeoff** — In the Go/Kubernetes world, `client-go`'s `leaderelection` (backed by an etcd
Lease) is the standard, correct answer — it's how controllers ensure one active instance, with lease
renewal and clean callbacks on gaining/losing leadership. You depend on the k8s/etcd control plane,
but that's already there in that environment, and it gives you proven consensus rather than a
hand-rolled lock.

### CSharp

**❌ Naive**

```csharp
// Every replica schedules the job — it fires once per node, N times per night.
using var timer = new PeriodicTimer(TimeSpan.FromHours(24));
while (await timer.WaitForNextTickAsync())
    RunNightlyBilling(); // all N instances bill: split brain by default

static void RunNightlyBilling() => Console.WriteLine("billing run");
```

**✅ Idiomatic**

```csharp
// Simulated cluster: a shared lease store arbitrates; nodes campaign each tick.
var store = new LeaseStore(ttl: 3);
var nodes = new[] { new Node("node-1", store), new Node("node-2", store) };

for (var tick = 0; tick < 10; tick++)
{
    foreach (var node in nodes)
        if (node.Alive) node.Campaign(tick);
    if (tick == 4) nodes[0].Crash(); // leader stops renewing — its lease expires at tick 7
}
// node-1 elected leader (term 1)
// node-1 crashed
// node-2 elected leader (term 2)

public sealed class LeaseStore(int ttl)
{
    private readonly Lock _gate = new();
    private string? _holder;
    private int _expiresAt;
    public int Term { get; private set; }

    // Atomic in the real store (etcd, a DB row); the lock stands in for that here.
    public int? TryAcquire(string nodeId, int now)
    {
        lock (_gate)
        {
            var mine = _holder == nodeId;
            if (mine || _holder is null || now >= _expiresAt)
            {
                if (!mine) Term++; // a new holder gets a new fencing term
                (_holder, _expiresAt) = (nodeId, now + ttl);
                return Term;
            }
            return null; // a live lease belongs to someone else
        }
    }
}

public sealed class Node(string id, LeaseStore store)
{
    public bool Alive { get; private set; } = true;
    private int? _term;

    public void Crash() { Alive = false; Console.WriteLine($"{id} crashed"); }

    public void Campaign(int now)
    {
        var term = store.TryAcquire(id, now);
        if (term is int t && t != _term)
            Console.WriteLine($"{id} elected leader (term {t})");
        _term = term;
        // a non-null _term means: do the singleton work, guarded by the fencing term
    }
}
```

**🧠 Tradeoff** — The whole cluster fits in one process because election is just state plus rules:
a lease, a TTL, a monotonic term. The `Lock` stands in for the atomicity a real coordination store
gives you across machines — which is exactly what you must *not* hand-roll in production. In .NET
that means an etcd/ZooKeeper client, a Kubernetes Lease, or a SQL-row lease like the Python tab —
and the fencing term is the part teams skip and later regret, because a paused-and-resumed leader
holding a stale term is how two leaders act at once.

### Rust

**❌ Naive**

```rust
use std::thread;
use std::time::Duration;

fn run_nightly_billing() {
    println!("billing run");
}

// Every replica runs this loop — the job fires once per node.
fn main() {
    loop {
        run_nightly_billing(); // all N nodes bill: split brain by default
        thread::sleep(Duration::from_secs(24 * 60 * 60));
    }
}
```

**✅ Idiomatic**

```rust
// Simulated cluster: node threads share one lease; the mutex plays the coordination store.
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

struct Lease {
    holder: Option<String>,
    expires_at: Instant,
    term: u64, // fencing token: bumps on every change of holder
}

impl Lease {
    // Atomic in the real store (etcd, a DB row); the mutex stands in for that here.
    fn try_acquire(&mut self, node: &str, ttl: Duration) -> Option<u64> {
        let now = Instant::now();
        let mine = self.holder.as_deref() == Some(node);
        if mine || self.holder.is_none() || now >= self.expires_at {
            if !mine {
                self.term += 1; // a new holder gets a new fencing term
            }
            self.holder = Some(node.to_string());
            self.expires_at = now + ttl;
            Some(self.term)
        } else {
            None // a live lease belongs to someone else
        }
    }
}

fn campaign(lease: Arc<Mutex<Lease>>, id: &str, renewals: u32) {
    let mut last = None;
    for _ in 0..renewals {
        let term = lease.lock().unwrap().try_acquire(id, Duration::from_millis(150));
        if term.is_some() && term != last {
            println!("{id} elected leader (term {})", term.unwrap());
        }
        last = term;
        // a Some(term) means: do the singleton work, guarded by the fencing term
        thread::sleep(Duration::from_millis(50)); // renew well inside the ttl
    }
    println!("{id} stopped renewing"); // a crash is just this: the lease quietly expires
}

fn main() {
    let lease = Lease { holder: None, expires_at: Instant::now(), term: 0 };
    let lease = Arc::new(Mutex::new(lease));

    let a = { let l = Arc::clone(&lease); thread::spawn(move || campaign(l, "node-1", 4)) };
    thread::sleep(Duration::from_millis(10)); // let node-1 win the first election
    let b = { let l = Arc::clone(&lease); thread::spawn(move || campaign(l, "node-2", 12)) };

    a.join().unwrap(); // node-1 "crashes" after 4 renewals…
    b.join().unwrap(); // …its lease expires, and node-2 takes over
}
// node-1 elected leader (term 1)
// node-1 stopped renewing
// node-2 elected leader (term 2)
// node-2 stopped renewing
```

**🧠 Tradeoff** — `Arc<Mutex<Lease>>` plays the coordination store: the mutex provides the atomic
check-and-set that etcd or a DB row provides across machines, and ownership makes the sharing
explicit — no thread touches the lease except through the lock. That's the honest limit, too: in
one process the mutex *is* correct arbitration, but across machines nothing in the language helps,
and this exact logic reimplemented over the network is the home-grown consensus the Common
Mistakes section warns about. In production Rust you'd call etcd or use a Raft crate; the
simulation's value is making leases, expiry, and fencing terms concrete.

### Zig

**❌ Naive**

```zig
const std = @import("std");

fn runNightlyBilling() void {
    std.debug.print("billing run\n", .{});
}

// Deployed on N replicas, every replica runs this same loop.
pub fn main() void {
    var day: u32 = 0;
    while (day < 3) : (day += 1) { // stand-in for "every night at 02:00"
        runNightlyBilling(); // all N nodes bill: split brain by default
    }
}
```

**✅ Idiomatic**

```zig
const std = @import("std");

// Simulated cluster on a logical clock: a lease, a TTL, and a fencing term.
const Lease = struct {
    holder: ?[]const u8 = null,
    expires_at: u32 = 0,
    term: u32 = 0, // fencing token: bumps on every change of holder
    ttl: u32,

    // Atomic in the real store (etcd, a DB row); single-threaded here, so it just is.
    fn tryAcquire(self: *Lease, node: []const u8, now: u32) ?u32 {
        const mine = self.holder != null and std.mem.eql(u8, self.holder.?, node);
        if (mine or self.holder == null or now >= self.expires_at) {
            if (!mine) self.term += 1; // a new holder gets a new fencing term
            self.holder = node;
            self.expires_at = now + self.ttl;
            return self.term;
        }
        return null; // a live lease belongs to someone else
    }
};

const Node = struct {
    id: []const u8,
    alive: bool = true,
    term: ?u32 = null,

    fn campaign(self: *Node, lease: *Lease, now: u32) void {
        const term = lease.tryAcquire(self.id, now);
        if (term) |t| {
            if (self.term == null or self.term.? != t)
                std.debug.print("{s} elected leader (term {d})\n", .{ self.id, t });
        }
        self.term = term;
        // a non-null term means: do the singleton work, guarded by the fencing term
    }
};

pub fn main() void {
    var lease = Lease{ .ttl = 3 };
    var nodes = [_]Node{ .{ .id = "node-1" }, .{ .id = "node-2" } };

    var tick: u32 = 0;
    while (tick < 10) : (tick += 1) {
        for (&nodes) |*node| {
            if (node.alive) node.campaign(&lease, tick);
        }
        if (tick == 4) {
            nodes[0].alive = false; // leader crashes; its lease expires at tick 7
            std.debug.print("node-1 crashed\n", .{});
        }
    }
}
// node-1 elected leader (term 1)
// node-1 crashed
// node-2 elected leader (term 2)
```

**🧠 Tradeoff** — Running the cluster on a logical clock makes the demo deterministic and shows
that election is only state plus rules — no allocation, no threads, every transition visible.
That explicitness is Zig's teaching advantage here, and also the honest boundary: the language
gives you nothing for the distributed part, and a Zig service in production talks to etcd or
Consul like any other client rather than growing its own consensus. The detail worth carrying
away is the fencing term — the protected work must check it, or a crashed-and-revived node-1
still holding term 1 would act beside the term-2 leader.

### Java

**❌ Naive**

```java
import java.time.Duration;

// Deployed on N replicas, every replica runs this same loop.
public class Demo {
    public static void main(String[] args) throws InterruptedException {
        while (true) {
            System.out.println("billing run"); // all N nodes bill: split brain by default
            Thread.sleep(Duration.ofHours(24));
        }
    }
}
```

**✅ Idiomatic**

```java
// Simulated cluster on a logical clock: a lease, a TTL, and a fencing term.
class LeaseStore {
    private final int ttl;
    private String holder;
    private int expiresAt;
    private int term; // fencing token: bumps on every change of holder

    LeaseStore(int ttl) { this.ttl = ttl; }

    // Atomic in the real store (etcd, ZooKeeper, a DB row); synchronized stands in here.
    synchronized Integer tryAcquire(String nodeId, int now) {
        var mine = nodeId.equals(holder);
        if (mine || holder == null || now >= expiresAt) {
            if (!mine) term++; // a new holder gets a new fencing term
            holder = nodeId;
            expiresAt = now + ttl;
            return term;
        }
        return null; // a live lease belongs to someone else
    }
}

class Node {
    final String id;
    boolean alive = true;
    private Integer term;

    Node(String id) { this.id = id; }

    void crash() { alive = false; System.out.println(id + " crashed"); }

    // Campaigning every tick doubles as the heartbeat: winning renews the lease.
    void campaign(LeaseStore store, int now) {
        var t = store.tryAcquire(id, now);
        if (t != null && !t.equals(term))
            System.out.println(id + " elected leader (term " + t + ")");
        term = t;
        // a non-null term means: do the singleton work, guarded by the fencing term
    }
}

public class Demo {
    public static void main(String[] args) {
        var store = new LeaseStore(3);
        var nodes = new Node[] { new Node("node-1"), new Node("node-2") };

        for (var tick = 0; tick < 10; tick++) {
            for (var node : nodes)
                if (node.alive) node.campaign(store, tick);
            if (tick == 4) nodes[0].crash(); // leader stops renewing — its lease expires at tick 7
        }
        // node-1 elected leader (term 1)
        // node-1 crashed
        // node-2 elected leader (term 2)
    }
}
```

**🧠 Tradeoff** — The simulation shows that election is only state plus rules: a lease, a TTL, a
monotonic term. `synchronized` stands in for the atomic check-and-set a real coordination store
provides across machines — and that store is exactly what you don't hand-roll. In production Java
you delegate: Apache Curator's `LeaderLatch`/`LeaderSelector` over ZooKeeper, an etcd client's
election API, or a Kubernetes `Lease` when you're already on that platform. What carries over
unchanged is the fencing term — the protected work must check it, or a paused-and-resumed node-1
still holding term 1 acts beside the term-2 leader.

## Applications

- **Kubernetes controllers/operators** — exactly one active controller reconciles state via leader
  election over an etcd Lease (backend).
- **Scheduled jobs** — ensuring a cron/batch task runs once across a replicated fleet, not once per
  replica (backend).
- **Distributed databases** — a partition/shard has one leader accepting writes (Raft/Paxos), with
  followers replicating (backend).
- **Message/stream processing** — one consumer owns a partition at a time; ownership transfers on
  failure (Kafka consumer groups) (backend).
- **Singleton services** — any "there must be exactly one" coordinator, cache warmer, or sequencer in
  an HA deployment (backend).

## Related Patterns

- **Saga** — a saga orchestrator is often a singleton elected via leader election so one coordinator
  drives each workflow.
- **Circuit Breaker / health checks** — leader liveness is detected the same way; a failed health
  check frees the lease and triggers re-election.
- **Actor** — a cluster-singleton actor (one named process across nodes) is leader election applied
  to the actor model.
