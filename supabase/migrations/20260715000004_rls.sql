-- 004_rls.sql
-- Row Level Security policies for all tables
-- contracts/rls-policies.md, spec.md SC-008, FR-003, FR-004, FR-014

-- ─── Enable RLS on all tables ────────────────────────────────────────────────
ALTER TABLE members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands           ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_types    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

-- ─── members ─────────────────────────────────────────────────────────────────
-- All authenticated users can read members (dropdown population, board avatars)
CREATE POLICY "members_select"
  ON members FOR SELECT TO authenticated
  USING (true);

-- Only admin can add new members
CREATE POLICY "members_insert"
  ON members FOR INSERT TO authenticated
  WITH CHECK (auth.user_access_level() = 'admin');

-- Admin can update any member; user can update their own record
CREATE POLICY "members_update_admin"
  ON members FOR UPDATE TO authenticated
  USING (auth.user_access_level() = 'admin');

CREATE POLICY "members_update_self_status"
  ON members FOR UPDATE TO authenticated
  USING (id = auth.member_id());

-- Admin can remove members
CREATE POLICY "members_delete"
  ON members FOR DELETE TO authenticated
  USING (auth.user_access_level() = 'admin');

-- ─── brands ──────────────────────────────────────────────────────────────────
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

-- ─── content_types ───────────────────────────────────────────────────────────
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

-- ─── stages (read-only; managed via migrations only) ─────────────────────────
CREATE POLICY "stages_select"
  ON stages FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policies — no authenticated user can modify stages.

-- ─── sla_config ──────────────────────────────────────────────────────────────
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

-- ─── tasks ───────────────────────────────────────────────────────────────────
-- All authenticated users can read all tasks
CREATE POLICY "tasks_select"
  ON tasks FOR SELECT TO authenticated USING (true);

-- Only admin and superuser can create tasks (FR-014)
CREATE POLICY "tasks_insert"
  ON tasks FOR INSERT TO authenticated
  WITH CHECK (auth.user_access_level() IN ('admin', 'superuser'));

-- Stage advance gate (SC-008 — enforced at DB level, not UI)
-- SECURITY NOTE: No `task_owner_id = auth.member_id()` clause here.
-- That clause would allow task owners to bypass review stage ownership and
-- un-publish published tasks. can_advance_task() already handles working-stage
-- ownership correctly (returns TRUE when caller IS the task owner at a working stage).
CREATE POLICY "tasks_update"
  ON tasks FOR UPDATE TO authenticated
  USING (
    -- Admin/superuser can update any task field
    auth.user_access_level() IN ('admin', 'superuser')
    OR
    -- Single gate for all user-tier updates; handles both working and review stages
    can_advance_task(id)
  );

-- Only admin can delete tasks
CREATE POLICY "tasks_delete"
  ON tasks FOR DELETE TO authenticated
  USING (auth.user_access_level() = 'admin');

-- ─── task_comments ───────────────────────────────────────────────────────────
-- All authenticated users can read comments
CREATE POLICY "task_comments_select"
  ON task_comments FOR SELECT TO authenticated USING (true);

-- Any authenticated user can add a comment authored as themselves
CREATE POLICY "task_comments_insert"
  ON task_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.member_id());

-- No UPDATE or DELETE — comments are append-only per spec

-- ─── task_attachments ────────────────────────────────────────────────────────
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
