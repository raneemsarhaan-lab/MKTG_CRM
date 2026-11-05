#!/usr/bin/env bash
# Build the header lab: a standalone page that mounts the real Board header
# (BoardHeader, BoardToolbar, BrandMenu, FiltersButton, ViewMenu, the compact
# InboxButton) with a stub host, for scenarios.mjs to drive. No database, no
# login, no Next server. See specs/011-board-header/quickstart.md §1.
set -euo pipefail
LAB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$LAB/../.." && pwd)"
OUT="$LAB/out"
mkdir -p "$OUT"

node "$LAB/gen.mjs" "$ROOT" "$OUT"

"$ROOT/node_modules/.bin/esbuild" "$LAB/entry.tsx" \
  --bundle --outfile="$OUT/bundle.js" --jsx=automatic --format=iife \
  --alias:@="$ROOT/src" \
  --define:process.env.NODE_ENV='"development"' \
  --log-level=warning

cp "$LAB/index.html" "$OUT/index.html"
cp "$ROOT/node_modules/axe-core/axe.min.js" "$OUT/axe.min.js"
echo "lab built → $OUT"
