---
id: ops-pattern-slug
category: deployment        # deployment | (also fits some distributed / messaging patterns)
sequence: 0
title: Ops Pattern Name
also_known_as: []
gof: false
kind: pattern
intent: "One sentence describing the release/ops pattern."
frequency: medium
difficulty: intermediate
tags: [deployment, devops]
related: []
languages: [kubernetes, terraform, ci-cd, aws]   # the "language" tabs are TOOLS here, not programming languages
---

## Intent

One crisp sentence, then a short paragraph.

## The Problem

The operational pain — downtime, risky big-bang releases, config drift.

## Structure

Key Components / Participants:

- **Component** — …

```
optional ASCII sketch (replaced by the rendered SVG if a structure.ysl exists)
```

## When to Use

- …

## Advantages and Disadvantages

### Advantages
- …

### Disadvantages
- …

## Common Mistakes

- **Mistake** — why it bites.

## Key Takeaways

- …

## Implementations

The tabs are **tools**, not programming languages — set `languages:` accordingly (e.g.
`[kubernetes, terraform, ci-cd, aws]`). Each tab shows the config/manifest that realizes the
pattern in that tool; there is no ❌ Naive / ✅ Idiomatic split — a short intro plus the
canonical snippet per tool.

### Kubernetes

```yaml
# the manifest that realizes the pattern
```

### Terraform

```hcl
```

### CI/CD

```yaml
```

### AWS

```
# console/CLI/service configuration
```

## Applications

- …

## Related Patterns

- **Neighbour** — how it differs.
