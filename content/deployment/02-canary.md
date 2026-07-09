---
id: canary
category: deployment
sequence: 2
title: Canary Release
also_known_as: [Canary Deployment, Progressive Delivery]
gof: false
intent: "Roll a new version out to a small slice of traffic first, watch its metrics, and only widen the rollout if it's healthy — limiting the blast radius of a bad release."
frequency: high
difficulty: intermediate
tags: [deployment, devops, progressive-delivery, risk, observability]
related: [blue-green, rolling-deployment, feature-flags]
languages: [kubernetes, service-mesh, terraform, ci-cd]
---

## Intent

Release the new version to a **small percentage** of traffic — 1%, 5%, 10% — while everyone else stays on
the stable version. Watch the canary's error rate, latency, and business metrics. If it looks healthy,
progressively increase its share (10% → 25% → 50% → 100%); if it degrades, route everyone back to stable.

The name comes from "canary in a coal mine": the small exposed group is the early-warning system. A bad
release harms a fraction of users for a short time instead of everyone at once, and you catch problems with
real production traffic — the load, data, and edge cases no staging environment reproduces — before they're
universal.

## The Problem

Releasing to everyone simultaneously (even with instant rollback) still exposes everyone to a bad version
at once:

- **Full blast radius** — a subtle bug that passed testing hits 100% of users the moment it's live.
- **Staging isn't production** — real traffic patterns, data, scale, and third-party quirks surface issues
  no pre-prod environment catches.
- **Late detection** — problems are found only after everyone's affected, when the damage (lost orders,
  errors) is already done.
- **High-stakes releases** — every deploy is nerve-wracking because there's no way to limit exposure while
  you gain confidence.

## Structure

Key Components:

- **Stable version** — serves the majority of traffic.
- **Canary version** — the new version serving a small, controlled percentage.
- **Traffic splitter** — a router/mesh/load balancer that sends a weighted share to each version.
- **Metrics & analysis** — monitoring error rate, latency, and KPIs on the canary vs. stable.
- **Promotion / rollback** — automated or manual progression to more traffic, or a return to 0% on
  regression.

```
                     ┌── 90% ──► Stable (v1)
Router / Mesh ───────┤
   (weighted split)  └── 10% ──► Canary (v2) ──► watch metrics → promote or roll back
```

## When to Use

- You want to limit the blast radius of releases and gain confidence gradually.
- You have good observability (error rate, latency, KPIs) to judge canary health.
- Real production traffic is needed to validate the change (load, data, edge cases).
- Releases are frequent and you want progressive, automatable delivery.

## Advantages and Disadvantages

### Advantages
- **Limited blast radius** — a bad release affects a small slice, briefly, not everyone.
- **Real-traffic validation** — catch issues staging can't reproduce, with production load and data.
- **Automatable & data-driven** — promote or roll back based on metrics, not gut feel.

### Disadvantages
- **Needs strong observability** — without reliable metrics you can't tell if the canary is healthy.
- **Slower rollout** — full release takes multiple stages, not one switch.
- **Version skew** — two versions run simultaneously; they and the shared data/schema must be compatible.

## Common Mistakes

- **Canary too small or too brief to be significant** — 0.1% for two minutes won't surface real issues;
  size and duration must give statistically meaningful signal.
- **No automated analysis / clear rollback criteria** — "eyeballing a dashboard" misses regressions; define
  metric thresholds that trigger rollback.
- **Ignoring version skew** — the canary and stable sharing a database need compatible schemas; a breaking
  migration bites both.
- **Sticky sessions breaking the split** — routing a user inconsistently between versions mid-session
  causes bugs; pin sessions or keep versions compatible.

## Key Takeaways

- Shift a small % to the new version, watch its metrics, then widen or roll back.
- It limits blast radius and validates against real traffic — safer than all-at-once.
- Requires good observability and clear, ideally automated, promote/rollback criteria.
- Two versions coexist, so ensure schema/API compatibility across the rollout.

## Implementations

### Kubernetes

**❌ Naive**

```yaml
# A single Deployment rolling to v2 sends progressively MORE traffic to new pods with no
# metric gating — it's a rollout, not a canary; nothing watches health before widening.
# kubectl set image deployment/app app=myapp:v2   ← no controlled % or analysis
```

**✅ Idiomatic**

```yaml
# Argo Rollouts: a canary strategy with weighted steps and automated analysis.
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata: { name: app }
spec:
  strategy:
    canary:
      steps:
        - setWeight: 10          # 10% to the new version
        - pause: { duration: 5m } # observe
        - analysis: { templates: [{ templateName: error-rate }] } # auto-rollback if bad
        - setWeight: 50
        - pause: { duration: 5m }
        - setWeight: 100          # full promotion
  template:
    spec: { containers: [{ name: app, image: myapp:v2 }] }
```

**🧠 Tradeoff** — Argo Rollouts (or Flagger) turns canary into a declarative, automated flow: weighted
steps, pauses to observe, and `analysis` templates that query Prometheus and auto-rollback on threshold
breach — progressive delivery without hand-driving `kubectl`. The cost is running the controller and
writing trustworthy analysis metrics, plus the two-version coexistence constraints; the payoff is
metric-gated releases you don't babysit.

### Service Mesh

**❌ Naive**

```yaml
# Splitting traffic by scaling replica counts is coarse and imprecise — the "percentage" is
# really "fraction of pods", not real weighted routing, and it can't gate on metrics.
```

**✅ Idiomatic**

```yaml
# Istio VirtualService: precise weighted routing between stable and canary subsets.
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata: { name: app }
spec:
  http:
    - route:
        - destination: { host: app, subset: stable }
          weight: 90                       # 90% stable
        - destination: { host: app, subset: canary }
          weight: 10                       # 10% canary — bump to 25/50/100 to promote
# (optionally match headers to route internal users / a cohort to the canary first)
```

**🧠 Tradeoff** — A service mesh (Istio, Linkerd) gives *precise*, request-level weighted routing
independent of replica counts, plus header-based routing (send employees or a beta cohort to the canary
first) and rich mesh metrics to judge health. It's the most flexible canary substrate. The cost is running
the mesh — real operational weight — which is only justified if you're already using it or need its
traffic-management and observability.

### Terraform

**❌ Naive**

```hcl
# One target group; changing its backends to v2 shifts everyone at once — no gradual weight.
```

**✅ Idiomatic**

```hcl
# Weighted forwarding across stable/canary target groups; ramp the weight via a variable.
resource "aws_lb_listener_rule" "canary" {
  action {
    type = "forward"
    forward {
      target_group { arn = aws_lb_target_group.stable.arn; weight = 100 - var.canary_weight }
      target_group { arn = aws_lb_target_group.canary.arn; weight = var.canary_weight } # e.g. 10
    }
  }
}
# terraform apply -var canary_weight=10  →  25  →  50  →  100  (or back to 0 to roll back)
```

**🧠 Tradeoff** — ALB weighted target groups (declared in Terraform) express canary as a `canary_weight`
you ramp with reviewed `apply`s — versioned, auditable traffic shifts, and rollback is applying weight 0.
It's coarser and slower than a mesh (apply per step), but needs no extra infrastructure beyond the load
balancer. Pair it with CloudWatch alarms for the analysis half; Terraform handles the traffic weighting.

### CI/CD

**❌ Naive**

```yaml
# Deploy pipeline flips 100% to the new version and moves on — no staged exposure or metric check.
- run: ./deploy.sh v2 --all
```

**✅ Idiomatic**

```yaml
# Progressive pipeline: shift a slice, check metrics, gate promotion on the result.
steps:
  - run: ./set-weight.sh canary 10        # 10% to v2
  - run: ./wait-and-check.sh 5m           # query error-rate/latency; fail the job if bad → rollback
  - run: ./set-weight.sh canary 50
  - run: ./wait-and-check.sh 5m
  - run: ./set-weight.sh canary 100       # promote
  # on any check failure: ./set-weight.sh canary 0  (roll back to stable)
```

**🧠 Tradeoff** — A pipeline that ramps weight, waits, and *gates* each promotion on a metric check (query
Prometheus/Datadog, fail the job to trigger rollback) implements canary at the CI/CD layer over whatever
router you use. It keeps the logic visible and toolable. The critical piece is the `wait-and-check` — a
real, trustworthy analysis, not a fixed sleep — because the whole rollout's safety rides on it.

## Applications

- **High-traffic web services** — the standard release strategy at scale (Google, Netflix, Meta) to limit
  risk (backend).
- **Progressive delivery tooling** — Argo Rollouts, Flagger, Spinnaker automate metric-gated canaries
  (backend).
- **Mobile/API backends** — validating a new backend version against real client traffic before full
  rollout (backend).
- **ML model rollout** — shadow/canary a new model on a slice of requests, comparing outcomes (backend).
- **Feature-flag canaries** — enabling a feature for a growing cohort is a canary at the application layer
  (backend & frontend).

## Related Patterns

- **Blue-Green Deployment** — the all-at-once cousin: switch everyone between two environments rather than
  ramping a percentage; simpler but full blast radius on the flip.
- **Rolling Deployment** — replaces instances incrementally but usually without metric-gated traffic
  weighting; canary adds the "watch a small slice first" discipline.
- **Feature Flags** — canary by *user cohort* at the application layer, and the way to decouple releasing a
  feature from deploying the code.
