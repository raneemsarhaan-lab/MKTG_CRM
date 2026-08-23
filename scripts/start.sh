#!/bin/bash
set -e

# ── Boot ──────────────────────────────────────────────────────────────────
#
# Schema first and blocking, because a server answering requests against a
# schema that was never pushed fails every one of them. Then the port opens.
# Then the data loaders run alongside a site that is already up.
#
# The order matters more than it looks: everything between the container
# starting and `next start` is time the platform's proxy has no upstream and
# answers 502. Keeping that window to the schema push and the seed is the
# difference between a deploy people do not notice and a deploy that reads as
# an outage.

export PATH="$PWD/node_modules/.bin:$PATH"

bash "$(dirname "$0")/migrate.sh"

if [ "${SKIP_BACKFILL:-}" = "1" ]; then
  echo "▶ Backfill skipped (SKIP_BACKFILL=1)."
else
  # Backgrounded, sharing this process's stdout so its progress still lands in
  # the deploy log. It dies with the container, and every step in it is safe to
  # have been interrupted.
  bash "$(dirname "$0")/backfill.sh" &
fi

# exec, so the server is this process rather than a child of it: the platform's
# stop signal reaches Next itself instead of a shell that would have to pass it
# on, and a container that does not shut down cleanly is one that gets killed.
exec next start
