---
id: feature-flags
category: deployment
sequence: 4
title: Feature Flags
also_known_as: [Feature Toggles, Feature Switches]
gof: false
intent: "Wrap new functionality in a runtime switch so it can be turned on or off — per environment, user, or cohort — without redeploying, decoupling 'deploy the code' from 'release the feature'."
frequency: high
difficulty: beginner
tags: [deployment, devops, release, decoupling, experimentation]
related: [canary, blue-green, strategy]
languages: [javascript, go, flag-service, kubernetes]
---

## Intent

Guard a feature behind a **flag** — a runtime condition — so the same deployed code can serve the feature
or not, decided at request time. Flip the flag to release the feature to everyone, a percentage, a beta
cohort, or a single tester; flip it back to disable, all without a new deploy.

This decouples **deployment** from **release**. Code can be merged and deployed continuously — the feature
dark behind a flag — and turned on later when it's ready, independent of the deploy schedule. The same
mechanism enables canary-by-cohort, A/B experiments, kill switches for misbehaving features, and gradual
rollouts.

## The Problem

When a feature goes live the instant its code deploys, deployment and release are fused:

- **Coupled deploy and release** — you can't ship code until the feature is fully ready and approved,
  blocking continuous deployment; long-lived branches pile up instead.
- **All-or-nothing release** — a feature is on for everyone the moment it deploys; no gradual rollout or
  targeting.
- **Risky kill** — disabling a bad feature requires an emergency rollback/redeploy, not a quick switch.
- **No experimentation** — A/B tests and cohort targeting need a redeploy per variant.

## Structure

Key Components:

- **Flag** — a named boolean/variant condition checked at runtime.
- **Flag evaluation** — a check (`isEnabled(flag, context)`) that decides on/off, possibly per user/cohort.
- **Configuration source** — where flag states live: config file, database, or a flag-management service.
- **Targeting rules** — percentage rollout, user/segment targeting, environment overrides.
- **The two paths** — the new behavior when on, the existing behavior when off.

```
Request (user) ──► [ Flag Service ] ──isEnabled?──┬── on ──► New Path
                    (rules: %, cohort, env)         └── off ─► Old Path
   flip the flag → release/disable without redeploying
```

## When to Use

- You want continuous deployment: merge and ship code before the feature is released.
- Features should roll out gradually, to cohorts, or as A/B experiments.
- You need a kill switch to disable a feature instantly without a redeploy.
- Configuration/behavior should vary by environment, user, or segment at runtime.

## Advantages and Disadvantages

### Advantages
- **Decouples deploy from release** — ship dark, release later; enables continuous deployment.
- **Targeted & gradual rollout** — percentage, cohort, and per-user releases; A/B experiments.
- **Instant kill switch** — disable a misbehaving feature in seconds, no redeploy.

### Disadvantages
- **Flag debt** — flags accumulate; stale ones become dead conditionals and confusing config if not removed.
- **Testing combinatorics** — many flags multiply the code paths to test and reason about.
- **Runtime dependency & risk** — a flag service is a dependency; a wrong flag config is its own kind of
  incident.

## Common Mistakes

- **Never removing flags** — flags meant to be temporary (release toggles) that live forever rot into dead
  code and config sprawl; delete them once the feature is fully rolled out.
- **Flags with no default/fallback** — if the flag service is unreachable, evaluation must fall back to a
  safe default, not error.
- **Business logic sprawled across flag checks** — scattering `if isEnabled(...)` everywhere tangles the
  code; centralize evaluation and keep the two paths clean.
- **Using flags as config forever** — long-lived operational toggles are fine, but conflating temporary
  release flags with permanent config confuses their lifecycle.

## Key Takeaways

- A runtime switch decouples deploying code from releasing the feature.
- It enables continuous deployment, targeted/gradual rollout, A/B tests, and instant kill switches.
- Evaluate with a safe fallback default; centralize the check rather than scattering conditionals.
- Retire temporary flags promptly, or flag debt turns into dead code and config confusion.

## Implementations

### JavaScript

**❌ Naive**

```js
// The feature is live the moment this deploys — deploy == release, no targeting, no kill switch.
function checkout(cart) {
  return newCheckoutFlow(cart); // shipping this line releases it to everyone at once
}
```

**✅ Idiomatic**

```js
// Evaluate a flag (with context + safe fallback); the two paths stay clean.
function checkout(cart, user) {
  if (flags.isEnabled("new-checkout", { userId: user.id, plan: user.plan })) {
    return newCheckoutFlow(cart); // released only where the flag says so
  }
  return legacyCheckoutFlow(cart);
}

// flags.isEnabled evaluates rules (%, cohort, env) and falls back safely if the source is down:
const flags = {
  isEnabled: (name, ctx) => {
    try { return rules[name]?.(ctx) ?? false; } catch { return false; } // safe default
  },
};
```

**🧠 Tradeoff** — A single `flags.isEnabled(name, context)` check with a safe fallback decouples releasing
`newCheckoutFlow` from deploying it, and the `context` enables percentage/cohort targeting. Client-side,
SDKs (LaunchDarkly, Unleash, OpenFeature) stream flag updates so flips are instant. The discipline is
keeping the two paths clean and *removing* `new-checkout` once it's 100% — otherwise it's permanent dead
code.

### Go

**❌ Naive**

```go
// Feature hard-wired on at deploy time — no runtime control.
func Checkout(cart Cart) Receipt {
    return newCheckoutFlow(cart) // released by merging this line
}
```

**✅ Idiomatic**

```go
// A flag client evaluated per request with context and a safe default.
func Checkout(ctx context.Context, cart Cart, user User) Receipt {
    if flags.Enabled(ctx, "new-checkout", flagCtx{UserID: user.ID, Plan: user.Plan}) {
        return newCheckoutFlow(cart)
    }
    return legacyCheckoutFlow(cart)
}

// Enabled evaluates rules and defaults to false if the provider errors (fail safe):
func (c Client) Enabled(ctx context.Context, name string, fc flagCtx) bool {
    v, err := c.provider.BoolVariation(ctx, name, fc, false /* default */)
    if err != nil { return false }
    return v
}
```

**🧠 Tradeoff** — A flag client with an explicit `false` default (fail-safe) and per-request context is
idiomatic Go feature flagging; OpenFeature's Go SDK standardizes the provider interface (LaunchDarkly,
Flagsmith, etc.). The explicit default is the key safety property — a flag-service outage disables the new
path rather than erroring. As everywhere, retire the flag and delete `legacyCheckoutFlow` once the rollout
completes.

### Flag Service

**❌ Naive**

```
# Flags hard-coded in a config file baked into the build → changing one requires a redeploy,
# defeating the point (you're back to deploy == release).
```

**✅ Idiomatic**

```json
// A flag-management service holds rules; the app streams updates and flips take effect live.
{
  "new-checkout": {
    "enabled": true,
    "rollout": { "percentage": 25 },              // 25% of users
    "targets": [{ "segment": "beta-testers", "value": true }],
    "environments": { "staging": true, "production": false }
  }
}
// LaunchDarkly / Unleash / Flagsmith: change rules in a dashboard; SDKs push updates in real time.
```

**🧠 Tradeoff** — A dedicated flag-management service (LaunchDarkly, Unleash, Flagsmith, or OpenFeature +
a provider) externalizes flag rules from the build: percentage rollouts, segment targeting, and per-env
overrides changed in a dashboard, streamed to apps so flips are instant — no redeploy, with audit logs and
approvals. The cost is running/paying for the service and depending on it at runtime (hence the fail-safe
defaults). It's what makes flags operationally serious versus a config file.

### Kubernetes

**❌ Naive**

```yaml
# Feature state baked into the image or a static env var → flipping it needs a new rollout.
env: [{ name: NEW_CHECKOUT, value: "true" }]   # change = rebuild/redeploy
```

**✅ Idiomatic**

```yaml
# A ConfigMap (or a flag operator) holds flag state; update it to flip without rebuilding.
apiVersion: v1
kind: ConfigMap
metadata: { name: feature-flags }
data:
  new-checkout: "false"     # kubectl edit / GitOps PR to flip; app watches for changes
---
# app mounts/watches the ConfigMap, or uses a flag operator (e.g. OpenFeature Operator / flagd)
# so the change takes effect without a new image or pod restart.
```

**🧠 Tradeoff** — For infra-level flags, a ConfigMap (flipped via `kubectl` or a GitOps PR) or a flag
operator like `flagd`/OpenFeature Operator lets you change flags declaratively without rebuilding images —
GitOps-friendly and auditable. It's coarser than a full flag service (less per-user targeting) but fits
Kubernetes-native, config-as-code workflows. Watching the ConfigMap (vs. requiring a restart) is what makes
the flip live.

## Applications

- **Continuous deployment** — merging and shipping code dark, releasing features later on their own schedule
  (backend & frontend).
- **Gradual rollouts & canaries** — percentage and cohort targeting at the application layer (backend &
  frontend).
- **A/B testing & experimentation** — serving variants to segments and measuring outcomes (frontend &
  backend).
- **Kill switches** — instantly disabling a broken or abused feature without a rollback (backend).
- **Entitlements & tiering** — gating features by plan/permission at runtime (backend & frontend).

## Related Patterns

- **Canary Release** — feature flags do canary-by-cohort at the application layer; canary does it by traffic
  percentage at the infrastructure layer.
- **Blue-Green Deployment** — flags complement it: ship code to green dark, then release features via flags,
  decoupling the environment switch from feature exposure.
- **Strategy** — a flag choosing between two code paths is a runtime strategy selection; flag targeting is
  the policy that picks the behavior.
