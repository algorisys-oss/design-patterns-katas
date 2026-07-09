#!/usr/bin/env bash
# Start the Design Patterns Katas app for local development.
#
# The site is content-first and static: the frontend compiles content/**/*.md
# into JSON and serves everything itself — no backend required. The Go backend
# (backend/) is optional; when it's built, pass --with-backend to run both.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$ROOT/frontend"
WITH_BACKEND=0
[[ "${1:-}" == "--with-backend" ]] && WITH_BACKEND=1

command -v node >/dev/null 2>&1 || { echo "error: node is required (https://nodejs.org)"; exit 1; }

# Install frontend deps on first run.
if [[ ! -d "$FRONTEND/node_modules" ]]; then
  echo "==> installing frontend dependencies"
  (cd "$FRONTEND" && npm install)
fi

PIDS=()
cleanup() { echo; echo "==> stopping"; for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

# Optional Go backend on :6000.
if [[ "$WITH_BACKEND" == "1" ]]; then
  if [[ -f "$ROOT/backend/go.mod" ]]; then
    command -v go >/dev/null 2>&1 || { echo "error: go is required for --with-backend"; exit 1; }
    echo "==> starting Go backend on http://localhost:6000"
    (cd "$ROOT/backend" && go run ./cmd/server) &
    PIDS+=("$!")
  else
    echo "note: backend not implemented yet; running frontend only"
  fi
fi

# Frontend dev server on :5173 (rebuilds content, then starts Vite).
echo "==> starting frontend on http://localhost:5173"
(cd "$FRONTEND" && npm run dev) &
PIDS+=("$!")

wait
