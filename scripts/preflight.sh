#!/bin/bash
#
# Checks that run before the build, and would have caught a live outage.
#
# A merge left conflict markers in two files. In the TypeScript one they
# landed inside a comment, so tsc was happy and the build passed; in
# migrate.sh they were code, and migrate.sh runs before `next start`. The
# result was a deploy whose build log was clean and whose every request —
# down to favicon.ico — answered 502, because nothing ever listened.
#
# Neither the typechecker nor the bundler looks at shell scripts, and neither
# objects to a marker inside a comment. So look for both here, at build time,
# where a failure is loud and costs a minute rather than an afternoon.
set -e

fail=0

echo "▶ Checking for unresolved merge conflicts..."
# ^<<<<<<< at the start of a line, which is what git writes and what nothing
# else does. Searched over tracked files only.
if git grep -In -E '^(<{7}|={7}|>{7})( |$)' -- . ':(exclude)scripts/preflight.sh' 2>/dev/null; then
  echo "  ✗ Conflict markers above. Resolve them before building."
  fail=1
else
  echo "  ✓ None."
fi

echo "▶ Checking shell scripts parse..."
for f in scripts/*.sh; do
  [ "$f" = "scripts/preflight.sh" ] && continue
  if bash -n "$f"; then
    echo "  ✓ $f"
  else
    echo "  ✗ $f does not parse — it runs at boot, so this would be a 502."
    fail=1
  fi
done

exit $fail
