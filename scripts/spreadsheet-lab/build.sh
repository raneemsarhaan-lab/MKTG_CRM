#!/usr/bin/env bash
# Build the spreadsheet lab (spec 013): the pure modules for Node checks and
# for the browser (where the HTML clipboard reader needs a real DOMParser),
# and, once the UI exists, a standalone page with a stub server (entry.tsx).
# No database, no Next server. See specs/013-spreadsheet-editing/quickstart.md §1.
set -euo pipefail
LAB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$LAB/../.." && pwd)"
OUT="$LAB/out"
mkdir -p "$OUT"

"$ROOT/node_modules/.bin/esbuild" "$LAB/pure-entry.ts" \
  --bundle --outfile="$OUT/pure.mjs" --format=esm --platform=node \
  --alias:@="$ROOT/src" --log-level=warning
"$ROOT/node_modules/.bin/esbuild" "$LAB/pure-entry.ts" \
  --bundle --outfile="$OUT/pure-browser.js" --format=iife --global-name=SheetPure \
  --alias:@="$ROOT/src" --log-level=warning

if [ -f "$LAB/entry.tsx" ]; then
  node "$LAB/gen.mjs" "$ROOT" "$OUT"
  "$ROOT/node_modules/.bin/esbuild" "$LAB/entry.tsx" \
    --bundle --outfile="$OUT/bundle.js" --jsx=automatic --format=iife \
    --alias:@="$ROOT/src" --alias:next/navigation="$ROOT/scripts/notify-lab/stubs/navigation.ts" --alias:next/link="$ROOT/scripts/notify-lab/stubs/link.tsx" \
    --define:process.env.NODE_ENV='"development"' --log-level=warning
  cp "$LAB/index.html" "$OUT/index.html"
  cp "$ROOT/node_modules/axe-core/axe.min.js" "$OUT/axe.min.js"
fi
echo "lab built → $OUT"
