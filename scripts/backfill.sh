#!/bin/bash
#
# ── The data loaders, run after the server is already listening ───────────
#
# None of these define the schema. They move files into the bucket, put back
# rows for files still in it, and import tasks and plans. The app serves every
# page without them, with whatever it already has — so they must never be the
# reason nobody can reach the site, and until now they were: they ran ahead of
# `next start`, so a slow import was an outage.
#
# Deliberately not `set -e`. A failure here is a step that did not load some
# data, not a reason to stop; `step ... optional` says so on each one, and the
# server carries on regardless because it is a different process by now.
#
# Two containers can run this at once during a rolling deploy. Everything here
# upserts or skips what already exists, so the second run finds nothing to do
# rather than duplicating the first.
#
# Set SKIP_BACKFILL=1 to leave it out of a boot entirely.

. "$(dirname "$0")/lib-step.sh"

echo "▶ Backfill starting in the background — the server is already up."

# Moves older uploads out of the database and into the bucket, if one is
# configured. Idempotent: it only looks at rows that still hold their bytes,
# so a second run has nothing to do.
step 900 optional "Moving stored files into the bucket" \
  tsx scripts/migrate-attachments.ts

# Inert unless RECOVER_ORPHANED_FILES=1. Puts back rows for files still in the
# bucket whose rows an earlier version of the importer deleted.
step 300 optional "Checking for files to recover" \
  tsx scripts/recover-attachments.ts

step 900 optional "Importing ClickUp tasks (if an export is present)" \
  tsx scripts/import-clickup.ts
step 600 optional "Loading the Aspiring / Focus plan" \
  tsx scripts/import-plan.ts

echo "✅ Backfill complete."
