# Frontend (React)

ReactJS + shadcn/ui + Tailwind CSS. A read-only kata browser: category sidebar, kata view,
and a `[ JavaScript | Python | Elixir | Go ]` tab switcher over each pattern's implementations.
Light/dark theme toggle. No code execution in v1.

## Content source

One content client, two modes:

- **Static mode** (default, backend-free) — fetches pre-built JSON generated from
  `content/**/*.md` by the build script. Deploys to GitHub Pages / Netlify.
- **API mode** — fetches from the Go backend's `/api/katas` during local development.

Not yet implemented — see [../todo.md](../todo.md).
