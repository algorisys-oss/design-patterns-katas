---
id: blue-green
category: deployment
sequence: 1
title: Blue-Green Deployment
also_known_as: [Red-Black Deployment]
gof: false
intent: "Run two identical production environments — one live (blue), one idle (green) — deploy the new version to the idle one, then switch all traffic at once, with instant rollback by switching back."
frequency: high
difficulty: intermediate
tags: [deployment, devops, release, zero-downtime, rollback]
related: [canary, rolling-deployment, feature-flags]
languages: [kubernetes, terraform, ci-cd, aws]
---

## Intent

Keep **two identical production environments**. At any time one — call it *blue* — is live and serving all
traffic; the other — *green* — is idle. To release, deploy the new version to green, verify it in a
production-equivalent setting, then flip the router so **all** traffic goes to green in one atomic switch.
Blue stays intact as the instant rollback target.

The release becomes a single routing change rather than a risky in-place upgrade. There's zero downtime
(the switch is instant), you validate the new version against real infrastructure before it takes traffic,
and if anything goes wrong you switch back to blue in seconds — no re-deploy, no scramble.

## The Problem

Upgrading a single live environment in place is risky:

- **Downtime or disruption** — replacing the running version means a window where the app is down or in a
  mixed state.
- **Slow, painful rollback** — if the new version is broken, rolling back means another deploy under
  pressure while users suffer.
- **No production validation** — you can't fully test the new version in a production-identical environment
  before it's serving real traffic.
- **All-or-nothing risk with no safety net** — a bad release affects everyone with nowhere to fall back to
  instantly.

## Structure

Key Components:

- **Blue environment** — the currently live production environment.
- **Green environment** — an identical idle environment where the new version is deployed and verified.
- **Router / Load balancer** — the single switch that directs all traffic to blue or green.
- **The switch** — an atomic cutover of traffic from one environment to the other.
- **Rollback** — switching traffic back to the previous environment.

```
                       ┌── 100% ──► Blue (v1, live)
Load Balancer ─────────┤
   (the switch)        └── 0% → switch ──► Green (v2, staged & verified)
   flip → all traffic to Green; Blue kept as instant rollback
```

## When to Use

- You need zero-downtime releases with instant, reliable rollback.
- You can afford to run two full production environments (cost/infrastructure).
- The new version can be validated in a production-identical environment before cutover.
- Releases are relatively infrequent, significant, and benefit from an all-at-once switch.

## Advantages and Disadvantages

### Advantages
- **Zero downtime** — the switch is instantaneous; no service gap.
- **Instant rollback** — flip back to the previous environment in seconds if the release fails.
- **Production validation** — test the new version on real infrastructure before it takes traffic.

### Disadvantages
- **Double the infrastructure** — running two full environments costs money and complexity.
- **Data/state coupling** — a shared database means schema changes must be compatible with both versions
  during the switch.
- **All-at-once exposure** — unlike canary, every user hits the new version simultaneously; a subtle bug
  affects everyone at once.

## Common Mistakes

- **Incompatible database migrations** — a schema change that breaks the old version means you can't roll
  back; use backward/forward-compatible (expand-contract) migrations.
- **Stateful sessions pinned to blue** — in-memory session state lost on switch logs everyone out;
  externalize session state.
- **Green isn't truly identical** — config/scale drift between environments means "it worked in green"
  doesn't guarantee blue's replacement works; keep them identical (IaC).
- **Forgetting to decommission/repurpose** — leaving old blue running forever doubles cost; it becomes the
  next green.

## Key Takeaways

- Two identical environments; one live, one idle. Deploy to idle, verify, switch all traffic atomically.
- Zero downtime and instant rollback (switch back) are the headline benefits.
- The database is the hard part — migrations must be compatible with both versions across the switch.
- It's all-at-once (unlike canary): everyone moves together, so validate thoroughly before flipping.

## Implementations

### Kubernetes

**❌ Naive**

```yaml
# In-place: kubectl set image on the live Deployment — the running app is replaced under load,
# and rollback means another image change under pressure.
# kubectl set image deployment/app app=myapp:v2   ← risky, no isolated verification
```

**✅ Idiomatic**

```yaml
# Two Deployments (blue/green); the Service selector is the switch.
apiVersion: apps/v1
kind: Deployment
metadata: { name: app-green }         # the new version, deployed & verified first
spec:
  selector: { matchLabels: { app: web, version: green } }
  template:
    metadata: { labels: { app: web, version: green } }
    spec: { containers: [{ name: app, image: myapp:v2 }] }
---
apiVersion: v1
kind: Service
metadata: { name: app }
spec:
  selector: { app: web, version: blue }   # ← flip to `green` to switch ALL traffic atomically
  ports: [{ port: 80 }]
# switch:   kubectl patch service app -p '{"spec":{"selector":{"version":"green"}}}'
# rollback: patch the selector back to `version: blue`
```

**🧠 Tradeoff** — Two labeled Deployments with the Service `selector` as the switch is the classic
Kubernetes blue-green: you verify `app-green` (port-forward, smoke tests) before patching the selector,
and rollback is one patch back to blue. It doubles running pods (cost) and, as everywhere, the shared
database must tolerate both versions during the flip. Argo Rollouts automates the whole flow with a
`BlueGreen` strategy.

### Terraform

**❌ Naive**

```hcl
# Mutating the live resource in place — Terraform replaces/updates the serving infrastructure directly.
resource "aws_instance" "app" {
  ami = var.new_ami   # changing this recreates the live instance → downtime, no fallback
}
```

**✅ Idiomatic**

```hcl
# Two target groups (blue/green); a listener rule variable is the switch.
resource "aws_lb_target_group" "blue"  { name = "app-blue"  /* ... */ }
resource "aws_lb_target_group" "green" { name = "app-green" /* ... */ }

resource "aws_lb_listener" "app" {
  # point 100% at the "live_color" — flip the variable and apply to switch
  default_action {
    type             = "forward"
    target_group_arn = var.live_color == "blue" ? aws_lb_target_group.blue.arn : aws_lb_target_group.green.arn
  }
}
# terraform apply -var live_color=green   ← atomic switch; set back to blue to roll back
```

**🧠 Tradeoff** — Declaring both target groups and switching a `live_color` variable makes the cutover a
reviewed, versioned `terraform apply` — the environments are codified and identical, and rollback is
re-applying with the old value. The cost is running both target groups' backends. Weighted forwarding
also lets Terraform express canary; blue-green is the 100/0 special case.

### CI/CD

**❌ Naive**

```bash
# Deploy script overwrites the live release directory in place — a failed deploy leaves it broken.
rsync -a ./build/ /var/www/app/     # no isolated slot, no atomic switch, messy rollback
```

**✅ Idiomatic**

```yaml
# GitHub Actions: deploy to the idle slot, verify, then flip a symlink/router atomically.
jobs:
  deploy:
    steps:
      - run: ./deploy.sh green            # deploy new version to the idle environment
      - run: ./smoke-test.sh green         # verify green in production-like conditions
      - run: ln -sfn /releases/green /var/www/current   # atomic switch (symlink swap)
      # rollback step (manual/auto on failure): ln -sfn /releases/blue /var/www/current
```

**🧠 Tradeoff** — A pipeline that deploys to the idle slot, smoke-tests it, then swaps an atomic pointer
(symlink, or a cloud "swap slots" API like Azure App Service deployment slots) is blue-green at the CI/CD
level. The atomic swap is the key — no half-deployed state — and rollback is swapping the pointer back.
You maintain two release slots and ensure the verify step is trustworthy, since the whole cutover trusts
it.

### AWS

**❌ Naive**

```
# Manually update the running service to the new task/version and hope — no staged environment,
# rollback = redeploy the old version by hand under incident pressure.
```

**✅ Idiomatic**

```
# CodeDeploy blue/green for ECS/Lambda: it provisions the green task set, shifts the
# ALB listener from blue to green, and keeps blue for automatic rollback.
DeploymentGroup:
  DeploymentStyle: { DeploymentType: BLUE_GREEN, DeploymentOption: WITH_TRAFFIC_CONTROL }
  BlueGreenDeploymentConfiguration:
    TerminateBlueInstancesOnDeploymentSuccess: { Action: TERMINATE, TerminationWaitTimeInMinutes: 5 }
# CodeDeploy: launches green, runs hooks/validation, shifts the listener, auto-rolls-back on alarms.
```

**🧠 Tradeoff** — AWS CodeDeploy (for ECS/Lambda) and Elastic Beanstalk's swap-environment-URLs give
managed blue-green: the platform stands up green, shifts the load balancer, watches CloudWatch alarms, and
auto-rolls-back to blue on failure — you don't script the cutover. The trade is buying into the AWS
tooling and paying for the parallel green environment during the deploy window; in return the risky parts
(traffic shift, rollback on alarm) are automated.

## Applications

- **Web applications & APIs** — zero-downtime releases with instant rollback for user-facing services
  (backend).
- **Managed platforms** — Azure App Service / AWS Elastic Beanstalk deployment-slot swaps (backend).
- **Serverless** — Lambda alias traffic shifting between versions (backend).
- **Kubernetes** — Argo Rollouts `BlueGreen` strategy for cluster workloads (backend).
- **Database-light services** — stateless services where the shared-state problem is minimal, making the
  switch cleanest (backend).

## Related Patterns

- **Canary Release** — the gradual alternative: shift a *small percentage* to the new version and watch,
  rather than switching everyone at once.
- **Rolling Deployment** — replaces instances incrementally within one environment (no second environment,
  but slower and briefly mixed).
- **Feature Flags** — decouple *release* from *deploy*: ship code to green dark, then enable features per
  flag, complementing the environment switch.
