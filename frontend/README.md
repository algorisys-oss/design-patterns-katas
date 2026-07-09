# Frontend (React)

ReactJS + shadcn/ui + Tailwind v4 (Vite). A read-only kata browser: category sidebar with
**search**, kata view, and a `[ JavaScript | Python | Elixir | Go ]` tab switcher colored by
each language. Light/dark toggle. No code execution in v1.

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (rebuilds content, then starts Vite)
```

Other scripts:

```bash
npm run content    # compile ../content/**/*.md → src/data/katas.json
npm run build      # content + production build → dist/
npm run preview    # serve the built dist/
```

## How content flows

`scripts/build-content.mjs` reads `../content/**/*.md`, parses frontmatter + sections,
splits the Implementations section into per-language tab panels, highlights code with
highlight.js, and writes `src/data/katas.json` (git-ignored, regenerated on every build).
The app imports that JSON — so the site is fully **static** and needs no backend. The Go
backend (`../backend`) is an optional alternative content source in dev.

## Search

The sidebar search filters katas by title, intent, tags, category, related patterns, and body
prose. The search string for each kata is precomputed in the content build.
