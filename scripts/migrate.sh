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

echo "▶ Pushing Prisma schema to database..."
# --skip-generate: db push runs the generator behind a spinner, and with no
# terminal attached the spinner's cursor codes land in the log as ^[[2K^[[1A.
# Generating separately, once, keeps the output readable.
prisma db push --accept-data-loss --skip-generate
prisma generate --no-hints

echo "▶ Seeding reference data and default users..."
# tsx directly rather than `prisma db seed`, which only shells out to this same
# command and then narrates having done so.
tsx prisma/seed.ts

# Inert unless ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD are both set. The
# way back in when nobody can sign in — see scripts/reset-admin.ts.
#
# Before the import, not after: the import refuses to run without an admin
# member, so if the admin account is the broken thing, putting the reset last
# means it never runs at all. That is precisely the situation it exists for.
tsx scripts/reset-admin.ts

echo "▶ Importing ClickUp tasks (if an export is present)..."
tsx scripts/import-clickup.ts

echo "▶ Loading the Aspiring / Focus plan..."
tsx scripts/import-plan.ts

echo "✅ Database migration complete."
