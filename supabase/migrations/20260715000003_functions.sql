-- 003_functions.sql
-- Auth helper functions and can_advance_task gate
-- spec.md FR-003, FR-004, SC-008; contracts/rls-policies.md

-- Resolve access level for the authenticated user
CREATE OR REPLACE FUNCTION auth.user_access_level()
RETURNS TEXT
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT access FROM members WHERE email = auth.email()
$$;

-- Resolve role for the authenticated user
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT role FROM members WHERE email = auth.email()
$$;

-- Resolve member UUID for the authenticated user
CREATE OR REPLACE FUNCTION auth.member_id()
RETURNS UUID
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT id FROM members WHERE email = auth.email()
$$;

-- Main RLS gate: can the current user advance (update status of) this task?
--
-- Rules (in order):
--   1. Terminal stage (publish) → FALSE for everyone, no exceptions.
--   2. admin / superuser → TRUE unconditionally.
--   3. User tier, working stage (owner_role IS NULL) → TRUE if caller is task owner.
--   4. User tier, review stage → TRUE if caller's role matches stage.owner_role.
--
-- This function is SECURITY DEFINER so it can read members/stages without exposing
-- those tables to unauthenticated callers via the USING clause.
CREATE OR REPLACE FUNCTION can_advance_task(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_task     tasks%ROWTYPE;
  v_stage    stages%ROWTYPE;
  v_access   TEXT;
  v_role     TEXT;
  v_memberid UUID;
BEGIN
  SELECT * INTO v_task  FROM tasks  WHERE id = p_task_id;
  SELECT * INTO v_stage FROM stages WHERE id = v_task.status;

  SELECT auth.user_access_level() INTO v_access;
  SELECT auth.user_role()         INTO v_role;
  SELECT auth.member_id()         INTO v_memberid;

  -- Terminal stage: no one can advance (Published is immutable for all tiers)
  IF v_stage.terminal_flag THEN
    RETURN FALSE;
  END IF;

  -- Admin / Super User: bypass ownership check
  IF v_access IN ('admin', 'superuser') THEN
    RETURN TRUE;
  END IF;

  -- User tier: working stage — task owner advances
  IF v_stage.owner_role IS NULL THEN
    RETURN v_task.task_owner_id = v_memberid;
  END IF;

  -- User tier: review stage — role owner advances
  RETURN v_stage.owner_role = v_role;
END;
$$;
