# Build Checklist

## Milestones

- [x] Scaffold repo (content categories, backend, frontend, docs)
- [x] Lock kata schema + template
- [x] Worked exemplar: Strategy (all 4 languages)
- [ ] Go content API (`net/http`): list + single kata, markdown → JSON
- [ ] Static build script: `content/**/*.md` → static JSON
- [ ] React + shadcn/ui + Tailwind browser: sidebar, kata view, language tabs, light/dark
- [ ] Remaining 22 patterns (content)
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
- [ ] 01 chain-of-responsibility
- [ ] 02 command
- [ ] 03 interpreter
- [ ] 04 iterator
- [ ] 05 mediator
- [ ] 06 memento
- [x] 07 observer
- [ ] 08 state
- [x] 09 strategy  ← exemplar
- [ ] 10 template-method  (no reference article — write fresh)
- [ ] 11 visitor          (no reference article — write fresh)

## Notes

- 21 of 23 patterns have a reference article (source for JS + Applications). Template Method
  and Visitor do not — write those from scratch, matching the house voice.
- Ported code (Python/Elixir/Go) must match the pattern's *behavior*, not the JS line shape
  (LOOPS.md XXXVI).
