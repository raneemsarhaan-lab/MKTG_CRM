# Constitution Check: spec 012 (for the PR description)

| Principle | How this PR meets it |
|---|---|
| **§I Design System Fidelity** | Colours are `NOTIFY_UI` in `src/lib/tokens.ts` and the matching `--nt-*` variables, plus the header's `--hd-*`. Two text tokens were added after axe flagged contrast on the unread tint: `--nt-blue-text` (#1D4ED8) and `--nt-muted-on-tint` (#4B5563). The look follows `design/notifications.html`. |
| **§II Workflow Pipeline Integrity** | Stages, move rules, SLAs and celebrations are unchanged. Notifications are recorded after an action's own write, in their own transaction (`notifyAfter`), so a failure there never blocks a move, comment or upload. "Stage holders" reuse `holdsStage`. |
| **§III Role-Based Feature Access** | Every notification action acts only for the signed-in member, on their own rows. Recipients follow the existing roles and stages. No new permission. |
| **§IV Design-Driven Development** | `design/notifications.html` was published and approved before the UI work. It covers the bell, panel, rows, toasts, task panel (Follow, replies), settings, history, the phone-alert offer, phones and Arabic. |
| **§V Cultural UX** | A `notifications` namespace in English and Arabic with parity checked in the lab. Sentences are built at display time with ICU plural and gender select; members without a gender get neutral phrasing. Every surface mirrors in Arabic. Phone alerts and emails use the member's stored language. |
| **§VI State Architecture** | Types first in `src/types/index.ts`. Server state: `notifications`, `task_followers`, `notification_settings` (changes from defaults only), `push_subscriptions`, `due_reminders`, `email_digests`, and new member and comment columns (data-model). Browser storage: only "Not now" on the phone-alert offer. |
| **Tech Stack** | **One new dependency, `web-push`**, for VAPID signing and payload encryption. Justified in plan.md, Complexity Tracking. Please sign off. The constitution's stack table still lists Supabase and Vercel; the app has been on Prisma and Cranl since before spec 005. That drift is noted, not changed here. |
| **Schema** | Additive only (data-model §1–§2), applied with `scripts/migrate.sh`. Launch backfill in `scripts/backfill.sh`, safe to run twice. |

**Recorded supersession.** Spec 006's Mentions and Team tabs (FR-030 to FR-034, FR-040 to FR-042) moved to the bell (spec 012 R12, FR-080). The Inbox keeps To do and Done, and its number counts to-dos only. A note is at the top of `specs/006-board-inbox/spec.md`.
