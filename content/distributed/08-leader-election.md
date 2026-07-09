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
languages: [javascript, node-js, python, elixir, go]
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
