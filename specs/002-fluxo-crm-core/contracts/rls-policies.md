# RLS Policies: Fluxo CRM Core

**Feature**: `specs/002-fluxo-crm-core`
**Date**: 2026-07-15

All policies assume `auth.user_access_level()`, `auth.user_role()`, and `auth.member_id()` functions are defined (see `db-schema.md` `003_functions.sql`).

---

## Enable RLS

```sql
ALTER TABLE members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands          ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_types   ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;
```

---

## members

```sql
-- All authenticated users can read members (needed for dropdown population, board avatars)
CREATE POLICY "members_select"
  ON members FOR SELECT TO authenticated
  USING (true);

-- Only admin can add new members
CREATE POLICY "members_insert"
  ON members FOR INSERT TO authenticated
  WITH CHECK (auth.user_access_level() = 'admin');

-- Admin can update any member; a user can update their own status/avatar_url only
-- (Fine-grained: admin patches anything; user patches own status only)
CREATE POLICY "members_update_admin"
  ON members FOR UPDATE TO authenticated
  USING (auth.user_access_level() = 'admin');

CREATE POLICY "members_update_self_status"
  ON members FOR UPDATE TO authenticated
  USING (id = auth.member_id());
-- Note: two UPDATE policies — Postgres ORs them. The self-update policy is
-- intentionally broad here; restrict to specific columns via Server Action validation.

-- Admin can remove members
CREATE POLICY "members_delete"
  ON members FOR DELETE TO authenticated
  USING (auth.user_access_level() = 'admin');
```

---

## brands

```sql
CREATE POLICY "brands_select"
  ON brands FOR SELECT TO authenticated USING (true);

CREATE POLICY "brands_insert"
  ON brands FOR INSERT TO authenticated
  WITH CHECK (auth.user_access_level() = 'admin');

CREATE POLICY "brands_update"
  ON brands FOR UPDATE TO authenticated
  USING (auth.user_access_level() = 'admin');

CREATE POLICY "brands_delete"
  ON brands FOR DELETE TO authenticated
  USING (auth.user_access_level() = 'admin');
```

---

## content_types

```sql
CREATE POLICY "content_types_select"
  ON content_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "content_types_insert"
  ON content_types FOR INSERT TO authenticated
  WITH CHECK (auth.user_access_level() = 'admin');

CREATE POLICY "content_types_update"
  ON content_types FOR UPDATE TO authenticated
  USING (auth.user_access_level() = 'admin');

CREATE POLICY "content_types_delete"
  ON content_types FOR DELETE TO authenticated
  USING (auth.user_access_level() = 'admin');
```

---

## stages

Stages are managed via migrations only. No user can INSERT/UPDATE/DELETE stages.

```sql
CREATE POLICY "stages_select"
  ON stages FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policies — no authenticated user can modify stages.
```

---

## sla_config

```sql
CREATE POLICY "sla_config_select"
  ON sla_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "sla_config_insert"
  ON sla_config FOR INSERT TO authenticated
  WITH CHECK (auth.user_access_level() = 'admin');

CREATE POLICY "sla_config_update"
  ON sla_config FOR UPDATE TO authenticated
  USING (auth.user_access_level() = 'admin');

CREATE POLICY "sla_config_delete"
  ON sla_config FOR DELETE TO authenticated
  USING (auth.user_access_level() = 'admin');
```

---

## tasks

```sql
-- All authenticated users can read all tasks
CREATE POLICY "tasks_select"
  ON tasks FOR SELECT TO authenticated USING (true);

-- Only admin and superuser can create tasks (FR-014)
CREATE POLICY "tasks_insert"
  ON tasks FOR INSERT TO authenticated
  WITH CHECK (auth.user_access_level() IN ('admin', 'superuser'));

-- Stage advance: only if can_advance_task() returns true
-- This policy governs UPDATE operations that change task.status.
-- It also governs other field updates — Server Action validation restricts
-- which fields are actually patched, but RLS uses the row-level gate.
CREATE POLICY "tasks_update"
  ON tasks FOR UPDATE TO authenticated
  USING (
    -- Admin/superuser can update any task field
    auth.user_access_level() IN ('admin', 'superuser')
    OR
    -- Stage owner can advance (handles both working stages and review stages).
    -- can_advance_task() already checks task_owner_id for working stages,
    -- so a separate task_owner_id clause is NOT needed and would be a
    -- security hole (it would let task owners bypass review stage ownership
    -- and un-publish published tasks).
    can_advance_task(id)
  );

-- Only admin can delete tasks
CREATE POLICY "tasks_delete"
  ON tasks FOR DELETE TO authenticated
  USING (auth.user_access_level() = 'admin');
```

> **Note on tasks_update**: `can_advance_task()` is the single gate for all task updates by non-admin users. It returns TRUE only when:
> - The task is not in the terminal (`publish`) stage, AND
> - The caller is admin/superuser, OR the caller owns the current stage (task owner for working stages, matching role for review stages).
>
> Granular field-level control (e.g., preventing a user from changing `nine_stage`) is handled by:
> 1. The `prevent_nine_stage_change` trigger (blocks any change to `nine_stage`)
> 2. Server Action validation (only sends the fields it intends to change)
>
> SC-008 requires that permissions are meaningful even if a user "manipulates the UI or network traffic." The `can_advance_task()` function and the `prevent_nine_stage_change` trigger provide the DB-level enforcement. The former `task_owner_id = auth.member_id()` clause has been deliberately removed — it was a security hole that allowed task owners to bypass review stage ownership and move tasks out of `publish`.

---

## task_comments

```sql
-- All authenticated users can read comments
CREATE POLICY "task_comments_select"
  ON task_comments FOR SELECT TO authenticated USING (true);

-- Any authenticated user can add a comment on their own behalf
CREATE POLICY "task_comments_insert"
  ON task_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.member_id());

-- No UPDATE or DELETE — comments are append-only (spec: Comment is append-only)
```

---

## task_attachments

```sql
CREATE POLICY "task_attachments_select"
  ON task_attachments FOR SELECT TO authenticated USING (true);

-- Admin/superuser can add attachments
CREATE POLICY "task_attachments_insert"
  ON task_attachments FOR INSERT TO authenticated
  WITH CHECK (auth.user_access_level() IN ('admin', 'superuser'));

-- Admin can remove attachments
CREATE POLICY "task_attachments_delete"
  ON task_attachments FOR DELETE TO authenticated
  USING (auth.user_access_level() = 'admin');
```

---

## Testing RLS

### Test cases to verify in Supabase Studio / psql

```sql
-- 1. Attempt to advance a Published task (should fail)
SET request.jwt.claims TO '{"email":"content@forefront.consulting"}';
UPDATE tasks SET status = 'final-check' WHERE status = 'publish';
-- Expected: 0 rows affected (can_advance_task returns FALSE for terminal stage)

-- 2. User-tier member cannot advance a review-stage task they don't own
SET request.jwt.claims TO '{"email":"content@forefront.consulting"}';
UPDATE tasks SET status = 'd-check' WHERE status = 'c-final' LIMIT 1;
-- Expected: 0 rows affected (user is not Marketing Manager)

-- 3. Admin can advance any task
SET request.jwt.claims TO '{"email":"raneem@forefront.consulting"}';
UPDATE tasks SET status = 'c-final', stage_date = CURRENT_DATE WHERE status = 'c-prog' LIMIT 1;
-- Expected: 1 row affected

-- 4. Attempt to change nine_stage (should throw)
UPDATE tasks SET nine_stage = NOT nine_stage WHERE id = '<any-task-id>';
-- Expected: ERROR: nine_stage is immutable after creation

-- 5. User cannot create a task
SET request.jwt.claims TO '{"email":"content@forefront.consulting"}';
INSERT INTO tasks (name, task_owner_id, initiator_role, nine_stage, due_date)
VALUES ('Test', auth.member_id(), 'Content Creator', TRUE, CURRENT_DATE + 7);
-- Expected: ERROR: new row violates row-level security policy
```
