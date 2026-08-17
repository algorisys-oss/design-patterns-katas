# Authoring Templates

This catalog holds several *kinds* of lesson, and they don't all share the same shape. Pick the
template that matches what you're writing, copy it, and fill it in. The `kind:` frontmatter field
records which shape a lesson uses; the frontend and build read it.

| Kind | `kind:` | Families | Sections (the pedagogical contract) | Impl tabs |
|---|---|---|---|---|
| **Pattern** | `pattern` | creational, structural, behavioral, concurrency, architectural, distributed, messaging, data, functional, ui, ai | Intent · The Problem · Structure · When to Use · Advantages/Disadvantages · Common Mistakes · Key Takeaways · **Implementations** · Applications · Related Patterns | one tab per language (js/node/python/elixir/go/java/csharp/rust/zig for code patterns), ❌ Naive → ✅ Idiomatic → 🧠 Tradeoff |
| **Principle** | `principle` | foundations (SOLID) | The Principle · The Smell · Why It Matters · Benefits and Cautions · Common Mistakes · Key Takeaways · **Implementations** · Applications · Related Principles & Patterns | one tab per language, ❌ Naive → ✅ Idiomatic → 🧠 Note |
| **Anti-pattern** | `anti-pattern` | anti-patterns | The Anti-Pattern · How It Happens · Why It Hurts · The Refactor · Warning Signs · Key Takeaways · **Implementations** · Related Patterns | ❌ Anti-Pattern → ✅ Refactor (languages that make the point) |
| **Ops** | `pattern` | deployment (and some distributed/messaging) | same skeleton as Pattern | tabs are **tools** (`[kubernetes, terraform, ci-cd, aws]`), config per tool, no Naive/Idiomatic split |
| **Playbook** | `playbook` | playbooks | Intent · The Shape · The Patterns You'll Reach For · How the Approach Changed · Pitfalls · Related Playbooks | **none** — `languages: []`; a playbook assembles patterns, it doesn't implement one |

## Templates

- [templates/pattern.md](templates/pattern.md) — the design-pattern skeleton (the common case)
- [templates/principle.md](templates/principle.md) — SOLID / foundations
- [templates/anti-pattern.md](templates/anti-pattern.md) — a trap and its refactor
- [templates/ops.md](templates/ops.md) — deployment / infrastructure, with tool tabs
- [templates/playbook.md](templates/playbook.md) — a whole system built from the patterns

## Rules that apply to every kind

- **Frontmatter `related:` holds kata *ids* only** — `node scripts/lint-content.mjs` fails on
  an unknown id, a category not in `categories.json`, or a `languages:` list that disagrees with
  the actual `### ` implementation tabs.
- **Structure diagrams** are optional but encouraged: author a `structure.ysl` under
  `content/<category>/diagrams/<NN-slug>/`, then run `scripts/render-diagrams.mjs`. The build
  inlines the rendered SVG into the Structure section.
- **Port behavior, not syntax** — show each language's idiomatic form, not a transliteration
  (see [../CLAUDE.md](../CLAUDE.md) and [../LOOPS.md](../LOOPS.md)).
- Files and folders are lowercase-hyphenated; kata files are `NN-<slug>.md`, numbered per family.

See [../CLAUDE.md](../CLAUDE.md) for the full schema and voice, and
[behavioral/09-strategy.md](behavioral/09-strategy.md) for the worked pattern exemplar.
