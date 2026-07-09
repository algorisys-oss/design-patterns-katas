#!/usr/bin/env bash
# Build the frontend and publish it to GitHub Pages (the `gh-pages` branch).
#
# Wired to `npm run deploy` in frontend/package.json. Runs from anywhere (resolves
# the repo root via git). Uses the local `gh-pages` CLI if installed, otherwise falls
# back to `npx gh-pages` so the script is self-contained on a fresh clone.
#
# Vite's `base: "./"` (frontend/vite.config.ts) makes the build path-relative, and the
# app uses a HashRouter, so it works as a GitHub Pages project site with no extra config.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT/frontend"

echo "▶ Building frontend (npm run build)…"
npm run build

DIST="$ROOT/frontend/dist"
[ -d "$DIST" ] || { echo "deploy: build produced no dist/ at $DIST" >&2; exit 1; }

# GitHub Pages serves files literally — a leading-dot or missing file breaks SPA assets.
# `.nojekyll` disables Jekyll processing so paths like `assets/_*` are served as-is.
touch "$DIST/.nojekyll"

# Prefer the locally-installed CLI; fall back to npx (fetches on demand).
if [ -x "$ROOT/frontend/node_modules/.bin/gh-pages" ]; then
  GH_PAGES=("$ROOT/frontend/node_modules/.bin/gh-pages")
else
  echo "deploy: gh-pages not installed locally, using npx" >&2
  GH_PAGES=(npx --yes gh-pages)
fi

echo "▶ Publishing dist/ to the gh-pages branch…"
"${GH_PAGES[@]}" -d dist --dotfiles

echo "✓ Published to GitHub Pages → https://algorisys-oss.github.io/design-patterns-katas/"
