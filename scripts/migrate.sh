#!/bin/bash
set -e

# Run the tools from node_modules directly rather than through npx.
#
# The deployment sets npm's deprecated `production` config, so every npm and
# npx invocation printed "npm warn config production Use --omit=dev instead" —
# four red lines in a startup log that is otherwise the only place a real
# failure shows up. Nothing here needs npm to find a binary.
export PATH="$PWD/node_modules/.bin:$PATH"

# Prisma checks for a newer version on every command and advertises v7 in a red
# box. Prisma 7 changes how `datasource db { url = env(...) }` resolves and will
# not load this schema, which is why package.json pins ^5.22.0 — so the advert
# is not merely noise, it points at a change that would break the app.
export PRISMA_HIDE_UPDATE_MESSAGE=true
export CHECKPOINT_DISABLE=1

# ── why every step below is time-boxed ────────────────────────────────────
#
# This script runs before `next start`, so nothing listens on the port until
# it finishes. That makes any step that can block forever a step that can hold
# a deploy open forever — and one did: a deploy sat "in progress" for six hours
# with a build log that had completed in a minute. A step waiting on a database
# lock waits without printing anything, and the platform, seeing no port, waits
# with it.
#
# So: a limit on each step, and a clear line saying which one ran out. Fast and
# loud beats silent and indefinite — the app is equally unreachable either way,
# but only one of them tells you why.
step() {                     # step <seconds> <fatal|optional> <label> <cmd...>
  local limit=$1 mode=$2 label=$3; shift 3
  echo "▶ ${label}..."
  local started=$SECONDS

  # Captured on the command itself, not after an `if`: the exit status of an
  # `if` whose branch was not taken is 0, so reading $? there reports every
  # failure as a success — and this function's failure path ends in `exit`,
  # which would have made that "exit 0" and carried straight on to serving
  # pages against a schema that was never pushed.
  local code=0
  timeout --signal=TERM --kill-after=15s "${limit}s" "$@" || code=$?

  if [ "$code" -eq 0 ]; then
    echo "  ✓ ${label} — $(( SECONDS - started ))s"
    return 0
  fi

  if [ "$code" -eq 124 ] || [ "$code" -eq 137 ]; then
    echo "  ✗ ${label} — gave up after ${limit}s."
    echo "    Nothing here reaches the network, so a stall here is the"
    echo "    database: a lock held by the previous container, or a pool with"
    echo "    no connections left."
  else
    echo "  ✗ ${label} — exited ${code}."
  fi
  if [ "$mode" = "optional" ]; then
    echo "    Continuing — this step loads data, it does not define the schema."
    return 0
  fi
  exit "$code"
}

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
# Before the import, not after: the import refuses to run without an admin
# member, so if the admin account is the broken thing, putting the reset last
# means it never runs at all. That is precisely the situation it exists for.
step 60  fatal   "Checking for an admin reset" \
  tsx scripts/reset-admin.ts

<<<<<<< HEAD
# Moves older uploads out of the database and into the bucket, if one is
# configured. Optional and idempotent: it only looks at rows that still hold
# their bytes, so a second run has nothing to do.
step 900 optional "Moving stored files into the bucket" \
  tsx scripts/migrate-attachments.ts

=======
>>>>>>> origin/main
# The two importers only add rows. If either fails the app still works, with
# whatever it already had — so they must never be the reason nobody can log in.
step 900 optional "Importing ClickUp tasks (if an export is present)" \
  tsx scripts/import-clickup.ts
step 600 optional "Loading the Aspiring / Focus plan" \
  tsx scripts/import-plan.ts

echo "✅ Database migration complete."
