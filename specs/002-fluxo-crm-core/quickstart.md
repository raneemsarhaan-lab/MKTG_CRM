# Quickstart Validation Guide: Fluxo CRM Core

**Feature**: `specs/002-fluxo-crm-core`
**Date**: 2026-07-15

This guide validates the full Fluxo CRM Core end-to-end after implementation. Run scenarios in order.

---

## Prerequisites

1. Next.js dev server running: `npm run dev` (defaults to http://localhost:3000)
2. Supabase project configured with:
   - Google OAuth provider enabled, redirect URL set to `http://localhost:3000/auth/callback`
   - All migrations applied (`001_extensions` → `005_seed`)
   - RLS enabled on all tables
   - Realtime enabled on `tasks` table
3. `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Seed data present (check Supabase Studio → Table Editor → members → 7 rows)

---

## Scenario 1 — Domain-Restricted Login (FR-037)

**Steps**:
1. Navigate to http://localhost:3000 — should redirect to `/login`.
2. Click "Sign in with Google".
3. Authenticate with an email NOT ending in `@forefront.consulting`.

**Expected**:
- Redirected back to `/login?error=domain`
- Error message visible: "Access restricted to @forefront.consulting accounts"
- Not logged in

**Steps** (success case):
1. Sign in with `raneem@forefront.consulting` (or a seeded Google account).

**Expected**:
- Redirected to `/overview`
- Greeting: "Good [morning/afternoon/evening], Raneem"

---

## Scenario 2 — Personal Dashboard (US4, FR-020–FR-023)

**Steps**:
1. Log in as Raneem.
2. Navigate to `/overview`.

**Expected**:
- Four BigStat cards in a row: Overdue (red gradient), In Progress (purple gradient), Published this week (lime gradient), Capacity % (amber gradient)
- CapacityBar below cards (dark, lime→violet gradient fill)
- "My Day" panel: tasks assigned to Raneem due today or past-due
- "Up Next" panel: tasks assigned to Raneem due within next 7 days
- Team Digest: all members listed with avatar, role, status dot, active task count

**Alert badge check**:
1. In Supabase Studio, set a task's `due_date` to a past date for Raneem.
2. Reload overview.

**Expected**: Task shows **Overdue** badge (red background).

**Admin capacity gate**:
- Logged in as Raneem (admin): capacity field in MemberCard is an editable `<input>`.
- Log out; log in as a User-tier member: capacity shows as plain text.

---

## Scenario 3 — Kanban Board loads with 9 columns (FR-009, FR-034)

**Steps**:
1. Navigate to `/board`.

**Expected**:
- 9 columns: To Do | Writing | Content Review | Islam Check | Ready to Design | Designing | Design Review | Final Check | Published
- Each column header shows the English label AND the Arabic label below it
- Column headers use the stage color gradient
- StatStrip above columns showing total tasks, in-progress count, due today count
- Task cards visible in their respective columns

---

## Scenario 4 — Task advance (own stage, US1, FR-003, FR-017)

**Steps**:
1. Log in as the Content Creator member (`content@forefront.consulting`).
2. Navigate to `/board`.
3. Find a task in "Writing" (`c-prog`) assigned to Content Creator.
4. Click the task card → TaskModal opens.
5. Click "Advance to Content Review" button (lime button).

**Expected**:
- Celebration overlay fires for this user
- Four Arabic reaction buttons visible: زغروطة, تسقيف, انا مبهور بيا, طبلة
- Click any reaction → audio plays, confetti fires
- Dismiss (×) → overlay closes
- Task card has moved to "Content Review" column on the board
- Other board viewers see the change on next refresh

---

## Scenario 5 — Cannot advance another user's stage (FR-003, SC-008)

**Steps**:
1. Log in as Content Creator.
2. Find a task in "Content Review" (`c-final`) — owned by Marketing Manager.
3. Click the card → TaskModal opens.

**Expected**:
- No advance button visible (or advance section is entirely absent)
- The task detail is readable but non-actionable for this user

**Network manipulation check** (SC-008):
1. Open browser DevTools → Network tab.
2. Try to call the `moveTask` Server Action for a task in `c-final` as Content Creator.

**Expected**: Server Action returns `{ success: false, error: ... }` — DB RLS prevents the update.

---

## Scenario 6 — Admin can advance any stage (FR-004, US2)

**Steps**:
1. Log in as Raneem (admin).
2. Navigate to `/board`.
3. Find a task in any review stage.
4. Click the card → "Advance to [next stage]" button visible (ink/dark button, not lime — not own stage).
5. Click it.

**Expected**:
- Task moves to next stage immediately
- **No celebration overlay** (admin is overriding, not personally advancing their own stage)
- Board updates for all viewers on next refresh

---

## Scenario 7 — Published stage is terminal (FR-002, US1 Scenario 3)

**Steps**:
1. Log in as Raneem (admin).
2. Find a task in "Published" column.
3. Click the card → TaskModal opens.

**Expected**:
- No advance button (advance section hidden)
- No other option to move the task out of Published

---

## Scenario 8 — Capacity Dashboard (US5, FR-026–FR-028)

**Steps**:
1. Log in as Raneem (admin).
2. Navigate to `/capacity`.

**Expected**:
- Member cards visible for all team members
- Each card shows: active task count, hours assigned, capacity limit, fill bar
- If any member's hours exceed their capacity: fill bar is coral/red

**Non-admin gate**:
1. Log out; log in as Content Creator.
2. Navigate to `/capacity` (or try the URL directly).

**Expected**: Redirected away (to `/overview` or 403 page). Capacity tab not visible in sidebar.

---

## Scenario 9 — Settings: add a member (US6, FR-029–FR-033)

**Steps**:
1. Log in as Raneem (admin).
2. Navigate to `/settings` → Team tab.
3. Fill in: Name="Test User", Email="test@forefront.consulting", Role="Content Creator", Access="User".
4. Click "Add Member".

**Expected**:
- New member appears immediately in the member table (no reload)
- Member appears in task assignee dropdown when creating a task

---

## Scenario 10 — Settings: remove member with active tasks (FR-031)

**Steps**:
1. Ensure a member has at least one active (non-Published) task.
2. Navigate to Settings → Team.
3. Click the remove button for that member.

**Expected**:
- Warning dialog appears: "This member owns N active task(s). Reassign them before removing."
- Removal does NOT proceed until tasks are reassigned or user explicitly confirms reassignment
- Cancelling the dialog leaves the member intact

---

## Scenario 11 — Settings: change SLA value takes effect immediately (FR-033)

**Steps**:
1. In Settings → Workflow tab → SLA matrix.
2. Change "Video" + "Writing" stage SLA from 4 to 1 day.
3. Go to the board, find a Video task in Writing stage that has been there for 2 days.

**Expected**:
- Task's AlertStatus badge immediately shows "Will Miss" (> 1 day) or "Stuck" (> 3 days)
- Badge updates on next board load without any deploy or restart

---

## Scenario 12 — Bilingual UI (FR-034–FR-036)

**Steps**:
1. Click the language toggle (AR ↔ EN) in the interface.

**Expected**:
- Stage labels switch between English (To Do, Writing, etc.) and Arabic (افكار للتنفيذ, كتابة المحتوى, etc.)
- Layout direction switches to RTL when Arabic is selected (sidebar on right, text right-aligned)
- No layout breaks: columns still fill the screen, cards still readable

---

## Scenario 13 — 8-stage vs 9-stage (FR-005)

**Steps**:
1. Log in as Raneem (admin) and create a new task with any settings.
2. Advance this task through Content Review to confirm it skips Islam Check.

**Expected**:
- After Content Review (c-final), task advances directly to Ready to Design (r-design)
- Islam Check column appears empty for this task

**Steps** (9-stage):
1. Log in as Content Creator and create a task (Content Creator initiator → nine_stage=true).
   *Note: If FR-014 assumption holds and Users cannot create tasks, simulate by inserting a task directly via Supabase Studio with `nine_stage=true`.*
2. Advance the task to Content Review.

**Expected**:
- After Content Review, task advances to Islam Check
- Islam Check column shows the task
- After Islam Check, advances to Ready to Design

---

## Design Fidelity Spot-Check

Inspect in browser DevTools (Computed Styles):

| Element | Expected |
|---|---|
| Page background | `#F7F7F7` |
| Sidebar background | `#17181A` |
| Lime accent (advance button, badge) | `#C8F24E` |
| Coral danger (overdue badge bg) | near `#F8E7E5` with text `#C0453E` |
| Kanban column `todo` border | `#64748B` |
| Kanban column `publish` border | `#22C55E` |
| Task card border radius | `14px` |
| Heading font | Montserrat |
| Body text font | Inter |
| Celebration overlay copy font | Caveat |

---

## Reference

- Spec: [spec.md](spec.md)
- Data model: [data-model.md](data-model.md)
- DB schema: [contracts/db-schema.md](contracts/db-schema.md)
- RLS policies: [contracts/rls-policies.md](contracts/rls-policies.md)
- Server actions: [contracts/server-actions.md](contracts/server-actions.md)
- Component API: [contracts/component-api.md](contracts/component-api.md)
