# Design Patterns Katas

Learn the classic Gang of Four design patterns once, then see each one side by side in
**JavaScript, Python, Elixir, and Go**. The point isn't the syntax — it's watching the same
idea take a different shape in a class-based language, a functional one, and a structurally
typed one.

## What's Inside

- All 23 GoF patterns, grouped into **Creational**, **Structural**, and **Behavioral**.
- Each kata teaches the pattern language-agnostically, then shows four implementations with a
  language tab switcher. Every implementation carries a naive version, the idiomatic version,
  and the tradeoff between them.
- Real-world **applications** for each pattern — payment flows, auth, validation, theming,
  games — drawn from the reference articles.

## Status

Content-first. The site is a read-only kata browser (no code execution yet). See
[todo.md](todo.md) for the build checklist.

## Tech Stack

- **Frontend:** ReactJS + shadcn/ui + Tailwind CSS
- **Backend:** Go (`net/http`, standard library only) — optional
- **Content:** Markdown + YAML frontmatter

## Hosting

Runs two ways:

1. **With the Go backend** — the API serves katas and the built frontend.
2. **Fully static** — a build step compiles the markdown into JSON, so the React app deploys
   to GitHub Pages or Netlify with no backend.

## Project Structure

```
design-patterns/
├── backend/      # Go net/http content API (optional)
├── frontend/     # React + shadcn/ui + Tailwind
├── content/      # kata markdown, by category
│   ├── creational/
│   ├── structural/
│   └── behavioral/
├── CLAUDE.md     # build spec + kata schema
├── LOOPS.md      # engineering principles / dev workflow
└── todo.md       # 23-pattern checklist
```

## Contributing / Authoring

Read [CLAUDE.md](CLAUDE.md) for the kata schema and voice, and [LOOPS.md](LOOPS.md) for the
engineering workflow. Copy [content/template.md](content/template.md) to start a new kata.

## License

MIT
