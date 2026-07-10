# Software Design & Architecture Katas

**[▶ Live site](https://algorisys-oss.github.io/design-patterns-katas/)** · **[★ Star on GitHub](https://github.com/algorisys-oss/design-patterns-katas)**

A cross-language catalog of the patterns, principles, and playbooks that recur in real software —
taught once, language-agnostically, then shown side by side in **JavaScript, Python, Elixir, and
Go** (with tool tabs for the ops patterns). The point isn't the syntax — it's watching the same
idea take a different shape in a class-based language, a functional one, and a structurally typed
one, and knowing *when not* to reach for it.

It started as the 23 Gang of Four patterns and grew into a **104-lesson catalog** spanning SOLID,
architecture, distributed systems, messaging, data, UI, functional, deployment, AI/LLM systems,
anti-patterns, and end-to-end system playbooks.

## What's Inside

**104 katas across 15 families:**

| Track | Families |
|---|---|
| **Foundations** | Foundations / SOLID (5) |
| **Gang of Four** | Creational (5) · Structural (7) · Behavioral (11) |
| **Modern** | Concurrency (6) · Architectural (8) · Distributed & Cloud (8) · Messaging & Integration (6) · Data & Persistence (5) · Functional (6) · UI & Frontend (6) · Deployment & DevOps (6) · **AI & LLM Patterns (17)** · Anti-Patterns (5) · Playbooks (3) |

Most katas teach the idea language-agnostically, then show four implementations behind a tab
switcher — each with a **naive** version, the **idiomatic** version, and the **tradeoff** between
them — plus real-world **applications** and how the idea shows up in modern low-code, workflow, and
multi-agent systems.

### Lesson shapes

Not every lesson is a GoF pattern, so they don't all share one shape. The `kind:` frontmatter field
records which contract a lesson follows:

| Kind | Shape | Implementations |
|---|---|---|
| **Pattern** | Intent → Problem → Structure → When → Trade-offs → Mistakes → Implementations → Applications → Related | 4 languages, naive → idiomatic → tradeoff |
| **Principle** (SOLID) | The Principle → The Smell → Why It Matters → Benefits/Cautions → … | 4 languages, naive → idiomatic → note |
| **Anti-pattern** | The Anti-Pattern → How It Happens → Why It Hurts → The Refactor → Warning Signs | anti-pattern → refactor |
| **Ops** (deployment) | same skeleton as Pattern | tabs are **tools** (Kubernetes / Terraform / CI-CD / AWS) |
| **Playbook** | Intent → The Shape → The Patterns You'll Reach For → How the Approach Changed → Pitfalls | none — a playbook *assembles* patterns |

The **playbooks** are the reverse of a kata: they start from a system — a JSON low-code framework, a
workflow engine, a multi-agent runtime — and walk back to the patterns that build it.

## Learning Paths

With 104 lessons, start with a track rather than reading top to bottom:

- **New to patterns** — Foundations/SOLID → Creational → Structural → Behavioral. The classic core.
- **Backend architecture** — Layered → Hexagonal → Repository → Unit of Work → Dependency Injection → CQRS → Event Sourcing.
- **Distributed resilience** — Timeout → Retry → Circuit Breaker → Bulkhead → Saga → Cache-Aside → Strangler Fig.
- **Messaging & integration (EIP)** — Message Channel → Pipes and Filters → Content-Based Router → Splitter → Aggregator → Dead-Letter Queue.
- **AI systems** — RAG → Chunking & Embedding → Hybrid Search → Structured Output → Prompt Chaining → ReAct → Tool Use → Reflection → Router → Memory → LLM-as-Judge → Guardrails → Semantic Caching → Model Cascade → Human-in-the-Loop.
- **Capstones** — the three Playbooks tie families together into whole systems.

Cross-references between lessons are clickable; the "Related" links at the bottom of each kata are
the intended way to wander.

## Status

Content-first. The site is a read-only kata browser (no code execution yet). See
[todo.md](todo.md) for the build checklist.

## Tech Stack

- **Frontend:** ReactJS + shadcn/ui + Tailwind CSS
- **Backend:** Go (`net/http`, standard library only) — optional
- **Content:** Markdown + YAML frontmatter, compiled to static JSON at build time

## Hosting

Runs two ways:

1. **With the Go backend** — the API serves katas and the built frontend.
2. **Fully static** — a build step compiles the markdown into JSON, so the React app deploys to
   GitHub Pages or Netlify with no backend.

## Project Structure

```
design-patterns/
├── backend/      # Go net/http content API (optional)
├── frontend/     # React + shadcn/ui + Tailwind; build-content.mjs compiles content → JSON
├── content/      # kata markdown, one folder per family
│   ├── foundations/  creational/  structural/  behavioral/
│   ├── concurrency/  architectural/  distributed/  messaging/  data/
│   ├── functional/  ui/  deployment/  ai/  anti-patterns/  playbooks/
│   └── templates/    # per-kind authoring skeletons (not katas)
├── scripts/      # render-diagrams.mjs (YSL → SVG), lint-content.mjs
├── CLAUDE.md     # build spec + kata schema
├── LOOPS.md      # engineering principles / dev workflow
└── todo.md       # build checklist
```

## Contributing / Authoring

Read [CLAUDE.md](CLAUDE.md) for the kata schema and voice, and [LOOPS.md](LOOPS.md) for the
engineering workflow. Pick the matching skeleton from [content/template.md](content/template.md)
(pattern, principle, anti-pattern, ops, or playbook) to start a new lesson.

Before committing content, run the linter — it fails on dangling `related:` ids, dangling
`[[wiki-links]]`, unknown categories, and language/impl-tab mismatches:

```
node scripts/lint-content.mjs      # or: cd frontend && npm run lint:content
```

Structure diagrams are authored as `structure.ysl` under `content/<family>/diagrams/<slug>/` and
rendered to SVG with `scripts/render-diagrams.mjs`.

## License

MIT
