---
id: rolling-deployment
category: deployment
sequence: 3
title: Rolling Deployment
also_known_as: [Rolling Update, Ramped Deployment]
gof: false
intent: "Replace the old version with the new one incrementally — a few instances at a time — so the service stays up throughout and no second environment is needed."
frequency: high
difficulty: beginner
tags: [deployment, devops, zero-downtime, incremental, health-checks]
related: [blue-green, canary, feature-flags]
languages: [kubernetes, docker, ci-cd, aws]
---

## Intent

Upgrade a service **incrementally**: spin up a few instances of the new version, wait for them to pass
health checks, then retire a few old ones — and repeat until every instance runs the new version. At all
times a healthy mix serves traffic, so there's no downtime and no need for a whole second environment.

It's the default zero-downtime strategy for clustered/replicated services: cheaper than blue-green (no
duplicate environment) and simpler than canary (no metric-gated traffic weighting). You trade the instant
all-at-once switch for a gradual, in-place replacement that keeps capacity up throughout.

## The Problem

Replacing all instances at once — or taking the service down to upgrade — is disruptive:

- **Downtime** — stopping everything to deploy the new version means an outage window.
- **Capacity loss** — replacing all instances simultaneously drops serving capacity during the swap.
- **All-at-once risk** — every instance flips together, so a broken new version takes the whole service
  down with no healthy old instances left.
- **No health gating** — a naive replace doesn't wait to confirm new instances are actually serving before
  removing old ones.

## Structure

Key Components:

- **Replica set** — the pool of instances behind a load balancer.
- **Rolling controller** — replaces instances in batches, respecting surge/unavailable limits.
- **Health checks / readiness probes** — confirm a new instance is serving before old ones are removed.
- **Surge & max-unavailable** — knobs controlling how many extra/absent instances during the roll.
- **Automatic rollback** — halting and reversing the roll if new instances fail health checks.

```
Service ──► Old Pods (v1) [ ■ ■ ■ ■ ]   replicas draining ↓
        └─► New Pods (v2) [ ■ ■ □ □ ]   replicas ramping ↑
   a few at a time, health-checked, until all are v2 — capacity maintained throughout
```

## When to Use

- Replicated/clustered services where instances are interchangeable behind a load balancer.
- You want zero downtime without paying for a second full environment.
- New instances have reliable health/readiness checks.
- The new and old versions can coexist briefly (compatible API/schema).

## Advantages and Disadvantages

### Advantages
- **No extra environment** — replaces in place; cheaper than blue-green.
- **Zero downtime** — a healthy mix always serves traffic; capacity is maintained.
- **Built-in** — orchestrators (Kubernetes, ECS, Swarm) do it natively with health gating.

### Disadvantages
- **Mixed versions during the roll** — old and new run simultaneously; both must be compatible.
- **Slower rollback** — reversing means rolling back through the batches, not an instant switch.
- **No blast-radius control** — unlike canary, it's not metric-gated; a bad version rolls out to everyone
  (just gradually) unless health checks catch it.

## Common Mistakes

- **No/weak readiness probes** — removing old instances before new ones actually serve causes errors or an
  outage mid-roll; gate on real readiness.
- **Incompatible versions coexisting** — a breaking API/schema change while both versions run breaks
  requests during the roll; keep changes backward-compatible.
- **Surge/unavailable set wrong** — too aggressive drops capacity; too conservative makes rolls glacial;
  tune to your capacity headroom.
- **Assuming it's a canary** — a rolling update isn't metric-gated; add canary/analysis if you need
  blast-radius control by traffic percentage.

## Key Takeaways

- Replace instances in batches, health-checking new ones before retiring old ones — no downtime, no second
  environment.
- It's the cheap default for clustered services; blue-green adds instant rollback, canary adds metric-gated
  exposure.
- Old and new coexist during the roll, so keep versions compatible.
- Readiness probes are what make it safe — without them, "rolling" becomes "rolling outage."

## Implementations

### Kubernetes

**❌ Naive**

```yaml
# Recreate strategy: kill all old pods, then start new ones → a downtime gap.
spec:
  strategy: { type: Recreate }   # all v1 down before v1... err v2 comes up → outage window
```

**✅ Idiomatic**

```yaml
# RollingUpdate with surge/unavailable limits and a readiness probe — the default, done right.
apiVersion: apps/v1
kind: Deployment
metadata: { name: app }
spec:
  replicas: 6
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1            # at most 1 extra pod during the roll
      maxUnavailable: 0      # never drop below 6 serving → no capacity loss
  template:
    spec:
      containers:
        - name: app
          image: myapp:v2
          readinessProbe:     # a pod joins the Service only when READY
            httpGet: { path: /healthz, port: 8080 }
# kubectl rollout status deployment/app   ·   kubectl rollout undo deployment/app  (rollback)
```

**🧠 Tradeoff** — Kubernetes' native `RollingUpdate` with `maxUnavailable: 0` and a real `readinessProbe`
is zero-downtime rolling out of the box: new pods must pass readiness before old ones are removed, and
`kubectl rollout undo` reverses it. It's the cheap default (no second environment). The constraints are the
usual: versions coexist mid-roll (keep compatible), and it's not metric-gated — health checks, not
business metrics, decide, so pair with canary for blast-radius control.

### Docker

**❌ Naive**

```bash
# Stop the container, then start the new image — a gap where nothing serves.
docker stop app && docker rm app && docker run -d --name app myapp:v2   # downtime between stop and ready
```

**✅ Idiomatic**

```yaml
# Docker Swarm service update: rolling by default with health checks and rollback config.
services:
  app:
    image: myapp:v2
    deploy:
      replicas: 6
      update_config:
        parallelism: 1          # one task at a time
        order: start-first       # start new before stopping old → no capacity dip
        failure_action: rollback # auto-roll-back on failed health checks
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/healthz"]
# docker service update --image myapp:v2 app   ← rolls with the config above
```

**🧠 Tradeoff** — Docker Swarm's `update_config` with `order: start-first` and a `healthcheck` gives
rolling updates with automatic rollback for Compose/Swarm setups — the same incremental, health-gated
replacement without Kubernetes. It fits smaller deployments. You still ensure versions coexist during the
roll and that the health check truly reflects readiness, since it gates the whole rollout.

### CI/CD

**❌ Naive**

```bash
# Loop that replaces every node at once (or with no health wait) — capacity dips or an outage.
for host in $HOSTS; do ssh $host "deploy v2"; done   # all together, no readiness gate
```

**✅ Idiomatic**

```bash
# Roll node-by-node: drain, deploy, health-check, return to pool — abort on failure.
for host in $HOSTS; do
  lb-drain "$host"                       # stop sending it new traffic
  ssh "$host" "deploy v2 && systemctl restart app"
  until curl -fs "http://$host:8080/healthz"; do sleep 2; done  # wait until healthy
  lb-add "$host"                         # back into rotation
done                                     # (abort + re-add drained nodes on failure = rollback)
```

**🧠 Tradeoff** — For non-orchestrated fleets, a pipeline that drains a node from the load balancer,
deploys, waits for health, then re-adds it — one at a time — is rolling deployment by hand. Capacity stays
up (only one node out at a time) and a failed health check aborts the roll. It's more script to own than an
orchestrator's built-in rolling, but it's the same principle and works anywhere you have a load balancer
and health endpoint.

### AWS

**❌ Naive**

```
# Update the Auto Scaling Group's launch template and terminate all instances at once → outage.
```

**✅ Idiomatic**

```
# ECS rolling update (or ASG instance refresh) with min-healthy-percent and health checks.
Service:
  DeploymentConfiguration:
    MinimumHealthyPercent: 100   # never below full capacity during the roll
    MaximumPercent: 150          # allow 50% surge to bring up new tasks first
  HealthCheckGracePeriodSeconds: 30
# ECS replaces tasks incrementally, waiting for ALB health checks before draining old tasks.
```

**🧠 Tradeoff** — AWS ECS rolling deployments (and ASG instance refresh) provide managed rolling with
`MinimumHealthyPercent`/`MaximumPercent` controlling surge and capacity, and ALB health checks gating each
step — the platform maintains capacity and drains old tasks only after new ones are healthy. You configure
the percentages and trust the health check; the orchestrator handles the incremental replacement and can
auto-roll-back via CodeDeploy on alarms.

## Applications

- **Kubernetes workloads** — the default Deployment strategy for stateless services (backend).
- **Container orchestrators** — ECS, Nomad, and Swarm roll service updates natively (backend).
- **Auto Scaling Groups** — instance refresh rolls a fleet to a new AMI/launch template (backend).
- **Managed app platforms** — Heroku/App Engine roll new releases across dynos/instances (backend).
- **Stateless web tiers** — the common case: interchangeable replicas behind a load balancer (backend).

## Related Patterns

- **Blue-Green Deployment** — trades the second environment for instant all-at-once switch and rollback;
  rolling is cheaper but rollback is slower and versions mix.
- **Canary Release** — adds metric-gated, percentage-based exposure; a rolling update is health-gated but
  not traffic-weighted by business metrics.
- **Feature Flags** — decouple release from deploy so a rolling deploy ships code dark, enabled later per
  flag.
