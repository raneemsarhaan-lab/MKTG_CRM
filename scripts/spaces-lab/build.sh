#!/usr/bin/env bash
# Build the Spaces lab (spec 021): the pure model for pure.mjs, and — once
# entry.tsx exists — a standalone page that mounts the real Space components
# with a stub host, for scenarios.mjs to drive. No database, no login.
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
    --alias:@="$ROOT/src" \
    --alias:next/navigation="$ROOT/scripts/notify-lab/stubs/navigation.ts" \
    --alias:next/link="$ROOT/scripts/notify-lab/stubs/link.tsx" \
    --define:process.env.NODE_ENV='"development"' \
    --log-level=warning
  cp "$LAB/index.html" "$OUT/index.html"
  cp "$ROOT/node_modules/axe-core/axe.min.js" "$OUT/axe.min.js"
fi
echo "lab built → $OUT"
