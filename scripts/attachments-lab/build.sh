#!/usr/bin/env bash
# Build the attachments lab: a standalone page that mounts the real
# AttachmentsSection (and the bottom Undo message) with a stub host, for
# scenarios.mjs to drive. No database, no login, no Next server.
# See specs/007-task-attachments/quickstart.md §2.
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

# The pure helpers, for pure.mjs to import in Node.
"$ROOT/node_modules/.bin/esbuild" "$LAB/pure-entry.ts" \
  --bundle --outfile="$OUT/pure.mjs" --format=esm --platform=node \
  --alias:@="$ROOT/src" --log-level=warning

cp "$LAB/index.html" "$OUT/index.html"
cp "$ROOT/node_modules/axe-core/axe.min.js" "$OUT/axe.min.js"
echo "lab built → $OUT"
