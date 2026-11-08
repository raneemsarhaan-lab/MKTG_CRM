#!/usr/bin/env bash
# Build the notifications lab (spec 012): the pure modules for Node checks,
# and (once the UI exists) a standalone page with a stub host. No database.
# See specs/012-notifications/quickstart.md §1.
set -euo pipefail
LAB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$LAB/../.." && pwd)"
OUT="$LAB/out"
mkdir -p "$OUT"

"$ROOT/node_modules/.bin/esbuild" "$LAB/pure-entry.ts" \
  --bundle --outfile="$OUT/pure.mjs" --format=esm --platform=node \
  --alias:@="$ROOT/src" --log-level=warning

if [ -f "$LAB/entry.tsx" ]; then
  node "$LAB/gen.mjs" "$ROOT" "$OUT"
  "$ROOT/node_modules/.bin/esbuild" "$LAB/entry.tsx" \
    --bundle --outfile="$OUT/bundle.js" --jsx=automatic --format=iife \
    --alias:@="$ROOT/src" --define:process.env.NODE_ENV='"development"' --log-level=warning
  cp "$LAB/index.html" "$OUT/index.html"
  cp "$ROOT/node_modules/axe-core/axe.min.js" "$OUT/axe.min.js"
fi
echo "lab built → $OUT"
