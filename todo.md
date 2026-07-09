# Build Checklist

Completion status is also available programmatically — see
[frontend/src/lib/progress.ts](frontend/src/lib/progress.ts). In the browser console:
`KatasProgress.summary()`, `KatasProgress.byStatus("todo")`, `KatasProgress.markCompleted(id)`.

## Milestones

- [x] Scaffold repo (content categories, backend, frontend, docs)
- [x] Lock kata schema + template
- [x] Worked exemplar: Strategy
- [x] Static build script: `content/**/*.md` → JSON (frontend/scripts/build-content.mjs)
- [x] React + shadcn/ui + Tailwind browser: sidebar, search, kata view, language tabs, light/dark
- [x] dev.sh (one-command start)
- [x] SOLID foundations category (5 principles)
- [x] Node.js language tab (frontend/backend JS split) for pattern katas
- [x] Remaining behavioral patterns (7) + Node.js retrofit of the 13 earlier patterns
- [x] Structure diagrams (SVG) per pattern + all 5 SOLID — 28 rendered via yappy
- [x] Rich UML (members, «interface»/«abstract» stereotypes, distinct arrowheads) — native
      YSL tree layout through the fixed yappy export (the DSL gaps are closed)
- [x] Wire diagrams into the frontend (inlined into each kata's Structure section, both themes)
- [x] Attribution footer baked into every diagram SVG
- [x] Footer status bar (copyright, www.algorisys.com, version, hard-reload)
- [~] Static deploy (GitHub Pages) — `scripts/deploy.sh` wired to `npm run deploy`; not yet published
- [ ] Move content to fetched JSON asset (shrink JS bundle)
- [ ] Optional Go content API (`net/http`) — static build covers hosting for now

## Patterns (23 GoF + 5 SOLID)

All 28 katas are written and carry a structure diagram.

### Foundations (SOLID)
- [x] 01 single-responsibility
- [x] 02 open-closed
- [x] 03 liskov-substitution
- [x] 04 interface-segregation
- [x] 05 dependency-inversion

### Creational
- [x] 01 abstract-factory
- [x] 02 builder
- [x] 03 factory-method
- [x] 04 prototype
- [x] 05 singleton

### Structural
- [x] 01 adapter
- [x] 02 bridge
- [x] 03 composite
- [x] 04 decorator
- [x] 05 facade
- [x] 06 flyweight
- [x] 07 proxy

### Behavioral
- [x] 01 chain-of-responsibility
- [x] 02 command
- [x] 03 interpreter
- [x] 04 iterator
- [x] 05 mediator
- [x] 06 memento
- [x] 07 observer
- [x] 08 state
- [x] 09 strategy  ← exemplar
- [x] 10 template-method
- [x] 11 visitor

## Beyond GoF — extended taxonomy

The catalog isn't limited to the 23 GoF patterns. Categories are a one-entry data change in
[frontend/src/lib/categories.json](frontend/src/lib/categories.json); a family with no katas
just doesn't render yet. Planned modern families (empty until content lands):

- **concurrency** — worker pool, producer–consumer, future/promise, actor, pub/sub,
  fan-out/fan-in, semaphore/rate-limiter, read-write lock, barrier
- **architectural** — MVC/MVP/MVVM, layered, hexagonal (ports & adapters), repository,
  unit of work, dependency injection, service locator, CQRS, event sourcing
- **distributed** (cloud) — circuit breaker, retry, bulkhead, timeout, saga, sidecar,
  strangler fig, cache-aside, leader election
- **messaging** — message channel/router, pipes & filters, aggregator, splitter, pub/sub
- **data** — repository, unit of work, data mapper, active record, identity map
- **functional** — result/option/either, currying & partial application, memoization,
  composition/pipeline, lens, transducer
- **ui** — component/container, state management, provider, render props, hooks
- **deployment** (devops) — blue-green, canary, rolling, feature flags, IaC, GitOps
- **anti-patterns** — a short set for contrast

### Concurrency (first family — pilot complete)
- [x] 01 worker-pool  ← exemplar for the family
- [x] 02 producer-consumer
- [x] 03 future-promise
- [x] 04 actor
- [x] 05 pub-sub
- [x] 06 fan-out-fan-in

## Notes

- 21 of 23 patterns have a reference article (source for JS + Applications). Template Method
  and Visitor were written from scratch, matching the house voice.
- Beyond-GoF katas set `gof: false`; concurrency uses structure/sequence diagrams and leans on
  each language's native primitives (Go channels, Elixir processes, JS promises, Python
  futures) — that contrast is the point of the family.
- Ported code (Python/Elixir/Go) matches the pattern's *behavior*, not the JS line shape
  (LOOPS.md XXXVI).
- `[~]` = in progress. Legend mirrors the `progress` API statuses:
  `completed` = `[x]`, `in-progress` = `[~]`, `todo` = `[ ]`.
