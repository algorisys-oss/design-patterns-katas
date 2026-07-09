# Build Checklist

## Milestones

- [x] Scaffold repo (content categories, backend, frontend, docs)
- [x] Lock kata schema + template
- [x] Worked exemplar: Strategy
- [x] Static build script: `content/**/*.md` → JSON (frontend/scripts/build-content.mjs)
- [x] React + shadcn/ui + Tailwind browser: sidebar, search, kata view, language tabs, light/dark
- [x] dev.sh (one-command start)
- [x] SOLID foundations category (5 principles)
- [x] Node.js language tab (frontend/backend JS split) for pattern katas
- [ ] Remaining behavioral patterns (7) + Node.js retrofit of the 13 earlier patterns
- [ ] Optional Go content API (`net/http`) — static build covers hosting for now
- [ ] Move content to fetched JSON asset (shrink JS bundle)
- [ ] Static deploy (GitHub Pages / Netlify)

## Patterns (23 GoF)

### Creational
- [ ] 01 abstract-factory
- [ ] 02 builder
- [ ] 03 factory-method
- [ ] 04 prototype
- [ ] 05 singleton

### Structural
- [ ] 01 adapter
- [ ] 02 bridge
- [ ] 03 composite
- [ ] 04 decorator
- [ ] 05 facade
- [ ] 06 flyweight
- [ ] 07 proxy

### Behavioral
- [x] 01 chain-of-responsibility
- [x] 02 command
- [x] 03 interpreter
- [ ] 04 iterator
- [ ] 05 mediator
- [ ] 06 memento
- [x] 07 observer
- [x] 08 state
- [x] 09 strategy  ← exemplar (needs Node.js retrofit)
- [ ] 10 template-method  (no reference article — write fresh)
- [ ] 11 visitor          (no reference article — write fresh)

## Notes

- 21 of 23 patterns have a reference article (source for JS + Applications). Template Method
  and Visitor do not — write those from scratch, matching the house voice.
- Ported code (Python/Elixir/Go) must match the pattern's *behavior*, not the JS line shape
  (LOOPS.md XXXVI).
