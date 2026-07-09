# Handoff — Design Patterns Katas

Snapshot for resuming work. Written 2026-07-09. Branch: `main`. Last commit: `a4de96f`.

## TL;DR

All 23 GoF patterns are written and complete. Since the last commit there is an
**uncommitted batch** spanning three threads (below). The current blocker is **yappy** —
its DSL can only render name-only class boxes, not article-grade UML. Rajesh is fixing
yappy separately; once that lands we re-render the diagrams and wire them into the frontend.

## Uncommitted state

Nothing below is committed yet. `git status` at handoff time:

- **13 content `.md` files modified** — Node.js language tab retrofitted into every
  creational + structural pattern and `09-strategy` (added `node-js` to `languages:` and a
  `### Node.js` implementation block with a backend-flavored ❌/✅/🧠).
- **Frontend UX polish** (4 files):
  - `frontend/src/lib/content.ts` — new `orderedKatas` + `getAdjacent(id)` for page nav.
  - `frontend/src/components/kata-view.tsx` — clickable tag-filter links + Prev/Next footer.
  - `frontend/src/App.tsx`, `frontend/src/components/sidebar.tsx` — tag filtering via
    `?tag=` query param.
- **New, untracked:**
  - `scripts/render-diagrams.mjs` — headless yappy → SVG renderer (see below).
  - `content/*/diagrams/*/` — 28 diagram dirs, each with `structure.ysl` (source) +
    `structure.svg` (rendered, name-only boxes). Covers all 23 patterns + 5 SOLID.

Decision pending: whether to commit this batch as a checkpoint before continuing.
Recommended — it's a coherent, working increment.

## Thread 1 — Structure diagrams (active, blocked on yappy)

**Done:** 28/28 `.ysl` sources authored and rendered to SVG via
`scripts/render-diagrams.mjs`. The script drives the yappy vite app headlessly through
Playwright (`window.Yappy.importDSL(src)` → `window.Yappy.exportSVG(false)`).

**How to re-render** (after yappy fixes):
1. Start yappy: `cd ~/work/algo/yappy && npx vite --port 5173 --strictPort`
2. From yappy dir (so Playwright resolves):
   `node ~/lab/katas/design-patterns/scripts/render-diagrams.mjs`
3. It discovers every `content/**/diagrams/**/*.{mmd,ysl}` and writes a sibling `.svg`.

**Blocker — yappy DSL gaps.** Current SVGs are name-only boxes (no members, no distinct
UML arrowheads). Full analysis with file:line pointers into the yappy codebase is in
`~/work/algo/yappy/docs/dsl-uml-gaps.md`. The four gaps:
1. `classDiagram` members never render — field-name mismatch (`umlAttributes/umlMethods`
   set by the engine vs. `attributesText/methodsText` read by the renderer). ⭐ highest impact
2. Aggregation `o--` drops the left-hand class node.
3. No distinct UML arrowheads — `<|--`, `*--`, `o--`, `..>` all draw the same arrow.
4. YSL/text `[class]` has no member syntax.

**Plan once yappy is fixed:** rewrite the `.ysl` sources (or switch to Mermaid
`classDiagram`) to include members + real UML relations, re-render, then wire in (Thread 3).

## Thread 2 — Node.js content retrofit (done, uncommitted)

The 13 modified `.md` files add the Node.js tab to the earlier patterns, matching the
behavioral set. `todo.md` already marks this `[x]`. Just needs committing.

## Thread 3 — Wire diagrams into the frontend (not started — next milestone)

The immediate *unblocked* piece of work (does not depend on the yappy fix — can use the
name-only SVGs now and re-render later):
- Copy/import the SVGs into the frontend as assets.
- Render each pattern's `structure.svg` in its **Structure** section in `kata-view`.
- The build step (`frontend/scripts/build-content.mjs`) may need to carry a diagram path
  into the kata JSON so both Go-mode and static-mode find it.

## Resume checklist

1. Decide: commit the current batch as a checkpoint (recommended).
2. If yappy is fixed → re-render diagrams (Thread 1 steps above), verify members/arrowheads.
3. Wire diagrams into the frontend (Thread 3).
4. Remaining `todo.md` milestones: Go content API (optional), move content to fetched JSON
   asset, static deploy (GH Pages / Netlify).

## Key paths

- Diagram renderer: `scripts/render-diagrams.mjs`
- Diagram sources/output: `content/<category>/diagrams/<NN-slug>/structure.{ysl,svg}`
- yappy gaps analysis: `~/work/algo/yappy/docs/dsl-uml-gaps.md`
- yappy repo: `~/work/algo/yappy`
- Frontend content client: `frontend/src/lib/content.ts`
- Build step: `frontend/scripts/build-content.mjs`
- Milestones/checklist: `todo.md`
