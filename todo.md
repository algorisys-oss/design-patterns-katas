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

## Notes

- 21 of 23 patterns have a reference article (source for JS + Applications). Template Method
  and Visitor were written from scratch, matching the house voice.
- Ported code (Python/Elixir/Go) matches the pattern's *behavior*, not the JS line shape
  (LOOPS.md XXXVI).
- `[~]` = in progress. Legend mirrors the `progress` API statuses:
  `completed` = `[x]`, `in-progress` = `[~]`, `todo` = `[ ]`.
