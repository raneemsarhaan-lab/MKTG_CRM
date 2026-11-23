#!/bin/bash
set -e

# ── What runs before the port opens, and nothing else ─────────────────────
#
# This script blocks `next start`, so every second it spends is a second the
# platform's proxy has no upstream and answers 502 to every request — the
# board, Settings, Team, favicon, all of it.
#
# It used to carry the data loaders as well. Their timeouts alone summed to
# fifty-six minutes, and "optional" only meant the deploy would not abort — it
# still blocked the port for as long as it ran. On a cold database, moving
# files into the bucket and importing three hundred ClickUp tasks is minutes of
# a site that is simply down; if the platform's health check gives up first it
# kills the container and starts the whole chain again, which is a crash loop
# that never serves a single request.
#
# So only what the app cannot answer one request without lives here. Everything
# that merely adds or moves rows moved to backfill.sh, which runs after the
# server is already listening.

. "$(dirname "$0")/lib-step.sh"

# The schema and the reference rows the app cannot render without. Fatal:
# serving pages against a schema that was never pushed fails on every request,
# which is worse than not starting.
step 180 fatal   "Pushing Prisma schema to database" \
  prisma db push --accept-data-loss --skip-generate
step 120 fatal   "Generating the Prisma client" \
  prisma generate --no-hints
step 300 fatal   "Seeding reference data and default users" \
  tsx prisma/seed.ts

# Inert unless ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD are both set. The
# way back in when nobody can sign in — see scripts/reset-admin.ts.
#
# Blocking rather than deferred: it is the way back into a locked-out
# deployment, and a repair that lands some minutes after the server does is a
# repair you cannot rely on being finished when you go to use it.
step 60  fatal   "Checking for an admin reset" \
  tsx scripts/reset-admin.ts

echo "✅ Schema ready — starting the server."
