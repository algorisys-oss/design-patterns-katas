# Backend (Go)

Go `net/http` content API. Standard library only, no framework. **Optional** — the static
build (see `frontend/`) serves the same content with no backend.

Planned endpoints:

| Endpoint            | Method | Description                              |
|---------------------|--------|------------------------------------------|
| `/api/health`       | GET    | Health check                             |
| `/api/katas`        | GET    | List all katas grouped by category       |
| `/api/katas/{id}`   | GET    | One kata with parsed frontmatter + body  |

The server reads `../content/**/*.md`, parses YAML frontmatter, and returns JSON. In
production it also serves the built frontend from `frontend/dist/`.

Not yet implemented — see [../todo.md](../todo.md).
