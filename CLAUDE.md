# CLAUDE.md — Design Patterns Katas

A cross-language design-patterns learning platform. Every classic GoF pattern is taught
once (language-agnostic) and then shown side by side in **JavaScript, Python, Elixir, Go,
Java, C#, Rust, and Zig** so learners compare idioms, not just syntax.

## Development Workflow

Follow [LOOPS.md](LOOPS.md) — the engineering principles and agent-loop rules that govern
all work in this repo. In particular: read before you write (I), surgical scope-locked
changes (IV), prove it works (V), port behavior not syntax (XXXVI), and write like a human
with no AI slop (XX). When those rules conflict with anything below, LOOPS.md wins.

## Scope (Initial Release)

- **Coverage:** all 23 GoF patterns (see the checklist in [todo.md](todo.md)).
- **Execution:** content-first. The site is a **read-only kata browser** with language tabs.
  No Run button, no sandbox in v1. Live execution is a later phase.
- **Languages per kata:** JavaScript, Python, Elixir, Go, Java, C#, Rust, Zig (code-pattern
  categories; AI/UI/deployment katas keep their own smaller sets).
- **Hosting:** must run two ways — (a) Go API + React dev server, and (b) a fully **static
  site** (GitHub Pages / Netlify) with no backend. A build step compiles the markdown into
  static JSON the React app fetches, so the same content works in both modes.

## Tech Stack

- **Backend:** Go standard library (`net/http`), no framework. Serves the content API and,
  in production, the built frontend. Optional — the static build does not need it.
- **Frontend:** ReactJS + shadcn/ui + Tailwind CSS. Fetches katas from `/api/katas` (Go mode)
  or from pre-built static JSON (static mode) behind one content client.
- **Content:** Markdown with YAML frontmatter (schema below). A build script compiles
  `content/**/*.md` into static JSON for backend-free hosting.

## Project Structure

```
design-patterns/
├── backend/      # Go net/http content API
├── frontend/     # React + shadcn/ui + Tailwind
├── content/      # kata markdown, grouped by GoF category
│   ├── creational/
│   ├── structural/
│   └── behavioral/
├── CLAUDE.md     # this file
├── LOOPS.md      # engineering principles (dev workflow)
├── README.md
└── todo.md       # 23-pattern build checklist
```

## Naming

- All files and folders are **lowercase-hyphenated**: `content/behavioral/09-strategy.md`.
- Kata files: `NN-<pattern-slug>.md`, numbered per category in GoF order.

## Content Categories & Order

- **creational/** — 01 abstract-factory, 02 builder, 03 factory-method, 04 prototype, 05 singleton
- **structural/** — 01 adapter, 02 bridge, 03 composite, 04 decorator, 05 facade, 06 flyweight, 07 proxy
- **behavioral/** — 01 chain-of-responsibility, 02 command, 03 interpreter, 04 iterator,
  05 mediator, 06 memento, 07 observer, 08 state, 09 strategy, 10 template-method, 11 visitor

## Kata Schema

Frontmatter (metadata only — the loader reads this; the body carries the teaching):

```yaml
---
id: strategy
category: behavioral        # creational | structural | behavioral
sequence: 9                 # order within the category
title: Strategy
also_known_as: [Policy]
gof: true
intent: "Define a family of algorithms, encapsulate each one, and make them interchangeable."
frequency: medium           # low | medium | high  (mirrors the article dot-rating)
difficulty: intermediate    # beginner | intermediate | advanced
tags: [behavioral, algorithms, open-closed, runtime-swap]
related: [state, template-method, factory-method]
languages: [javascript, python, elixir, go, java, csharp, rust, zig]
---
```

Body sections, in order:

1. `## Intent` — one crisp sentence, then a short paragraph.
2. `## The Problem` — the mess the pattern removes (usually growing conditionals).
3. `## Structure` — Key Components / Participants (Context, Strategy, Concrete Strategies…).
   A short ASCII sketch is welcome; UML images are optional.
4. `## When to Use` — bullets.
5. `## Advantages and Disadvantages` — `### Advantages` / `### Disadvantages`.
6. `## Common Mistakes` — the pitfalls, with *why* they bite.
7. `## Key Takeaways` — concise recap.
8. `## Implementations` — one `### JavaScript` / `### Python` / `### Elixir` / `### Go`
   subsection each. Every language carries, in order:
   - `❌ Naive` — the version that works but doesn't scale (conditionals, coupling).
   - `✅ Idiomatic` — the pattern expressed in *that language's* idioms.
   - `🧠 Tradeoff` — one paragraph on what the idiomatic version costs and buys.
   The frontend builds the language-tab switcher from these subsections.
9. `## Applications` — real-world uses drawn from the reference articles
   (payment, auth, validation, theming, games…). Short bullets, frontend/backend where useful.
10. `## Related Patterns` — how this differs from its GoF neighbours.

See [content/template.md](content/template.md) for the per-kind authoring templates (pattern,
principle, anti-pattern, ops, playbook) and the lesson-shape table, and
[content/behavioral/09-strategy.md](content/behavioral/09-strategy.md) for the worked exemplar.
Run `node scripts/lint-content.mjs` before committing content — it fails on dangling `related:`
ids, dangling `[[wiki-links]]`, unknown categories, and language/impl-tab mismatches.

## Reference Material

The `~/Downloads/articles/design-patterns/` PDFs are Rajesh Pillai's JavaScript pattern
articles. They are the source for the **JavaScript** implementation and for the
**Applications** section (their real-world "10+ examples" are applications of the pattern).
Match the pattern's *behavior* when porting to Python/Elixir/Go — do not transliterate JS.

## Voice

Teach like the articles: definition-first, warm and direct, pragmatic about how each
language differs from the classical GoF (class-based) form. Name the tradeoff. Remind
learners not to cargo-cult patterns — awareness of a pattern includes knowing when *not*
to use it. No AI slop (LOOPS.md XX).

## Porting Rules (per language)

Every language tab opens with an italic `*Targets <language/toolchain version>.*` line
(directly under the `### <Language>` heading) so readers know which version the code was
written and tested against. Current targets: modern JavaScript (ES2015+), Node.js 24,
Python 3.12, Elixir 1.18, Go 1.26, Java 25, C# 14 / .NET 10, Rust 1.95 (2024 edition),
Zig 0.17-dev. Bump the lines when the toolchains move.

- **JavaScript** — ES6 classes for the class-based patterns; object literals / closures where
  that is the JS-native form. Source from the articles.
- **Python** — first-class functions and `typing.Protocol`/`abc` where a real interface helps.
  Prefer a function or a `Protocol` over a deep class hierarchy when Python would.
- **Elixir** — behaviours for named contracts; higher-order functions and pattern matching for
  the functional form. No mutable state — thread it or use a process where the pattern needs it.
- **Go** — small implicit interfaces; a `func` type for single-method strategies. Idiomatic,
  no inheritance.
- **Java** — latest LTS (25): records, sealed interfaces, pattern matching for `switch`,
  lambdas and method references; any single-method contract is a functional interface, so
  a lambda replaces the strategy class. Streams where they read well; virtual threads and
  `java.util.concurrent` for concurrency patterns. Java is the GoF book's home language —
  the classical form usually fits as written; the lesson is what modern Java replaces it with.
- **C#** — latest C# (14 / .NET 10): file-scoped namespaces, records, pattern matching,
  primary constructors, sealed classes. A `Func<>`/delegate for single-method strategies;
  interfaces where the contract carries more than one member. LINQ where it reads well.
  Demo code may use top-level statements.
- **Rust** — traits for contracts; enums + `match` where the variant set is closed; closures
  and `fn` types for single-method strategies. Name the `Box<dyn Trait>` (dynamic dispatch)
  vs generic-bound (monomorphized) choice when the pattern forces it. Ownership stays
  idiomatic — no `Rc<RefCell<...>>` unless the pattern genuinely needs shared mutation,
  and say so when it does.
- **Zig** — no interfaces, no closures: use comptime generics for static polymorphism and
  the function-pointer vtable idiom (like `std.mem.Allocator`) when dispatch must be
  runtime. Tagged unions + `switch` for closed variant sets. Pass allocators explicitly
  where allocation happens. Zig is pre-1.0 and churns: snippets target the repo's local
  toolchain — **0.17-dev (master, via asdf)** — and must compile on it. That generation
  moved blocking primitives behind the `std.Io` capability (`std.Io.Threaded` provides
  the `io`; `Io.Mutex`, `Io.Condition`, `io.sleep`, `Io.Timestamp.now`) — thread `io`
  explicitly, same philosophy as allocators.

## Git

Branch for non-trivial work; commit when the user asks. Keep diffs scope-locked (LOOPS.md IV).
