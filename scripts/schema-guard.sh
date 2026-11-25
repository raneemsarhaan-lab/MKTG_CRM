#!/bin/bash
#
# Release safety (user, 25 Nov 2026). `prisma db push --accept-data-loss` applies whatever differs
# between the database and the schema file, drops included, without asking. This runs first: it
# asks Prisma for the SQL the push would run against THIS database, and stops the boot if any
# statement can lose or alter existing data. Additions (new tables, new columns, new indexes and
# keys, a new default) pass.
#
# To let a reviewed, approved destructive change through once, set ALLOW_DESTRUCTIVE_SCHEMA=1 for
# that deploy and remove it afterwards.
set -e
export PATH="$PWD/node_modules/.bin:$PATH"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "  schema guard: no DATABASE_URL — nothing to compare."
  exit 0
fi

sql="$(prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script)"
bad="$(printf '%s\n' "$sql" | grep -Ein 'DROP TABLE|DROP COLUMN|TRUNCATE|RENAME (TO|COLUMN)|SET DATA TYPE|ALTER COLUMN "[^"]+" TYPE|SET NOT NULL|DROP TYPE|DELETE FROM' || true)"

if [ -z "$bad" ]; then
  echo "  schema guard: the change only adds (no drop, rename, type change or NOT NULL on existing columns)."
  exit 0
fi

echo "  ✗ schema guard: the schema push would run statements that can lose or alter data:"
printf '%s\n' "$bad" | sed 's/^/      /'
if [ "${ALLOW_DESTRUCTIVE_SCHEMA:-}" = "1" ]; then
  echo "    ALLOW_DESTRUCTIVE_SCHEMA=1 is set — continuing."
  exit 0
fi
echo "    Stopped before anything was changed. Remove the change from the schema, or approve it"
echo "    and set ALLOW_DESTRUCTIVE_SCHEMA=1 for one deploy."
exit 1
