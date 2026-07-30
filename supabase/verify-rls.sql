-- verify-rls.sql
-- T013: DB-Level RLS Security Gate verification
-- Run each block in Supabase SQL Editor (Dashboard → SQL Editor)
-- All 5 tests MUST pass before proceeding to Phase 3+ implementation.
--
-- IMPORTANT: Run 005_seed.sql first so the members table has data.
-- Also insert at least 2 test tasks via Supabase Studio before running tests 1–3:
--   - One task in 'publish' status
--   - One task in 'c-final' status (owned by Content Creator, not Marketing Manager)
--   - One task in 'c-prog' status (assigned to any member)

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TEST 1: Nobody can advance a Published task (terminal stage lock)
-- Expected: 0 rows affected
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SET request.jwt.claims TO '{"sub":"test","email":"content@forefront.consulting","role":"authenticated"}';
SET ROLE authenticated;

UPDATE tasks SET status = 'final-check'
WHERE status = 'publish'
LIMIT 1;
-- VERIFY: rowcount = 0

RESET ROLE;
RESET request.jwt.claims;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TEST 2: Content Creator cannot advance a review-stage task (owns wrong role)
-- c-final stage owner_role = 'Marketing Manager'; Content Creator cannot advance
-- Expected: 0 rows affected
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SET request.jwt.claims TO '{"sub":"test","email":"content@forefront.consulting","role":"authenticated"}';
SET ROLE authenticated;

UPDATE tasks SET status = 'r-design', stage_date = CURRENT_DATE
WHERE status = 'c-final'
LIMIT 1;
-- VERIFY: rowcount = 0

RESET ROLE;
RESET request.jwt.claims;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TEST 3: Admin can advance any task (raneem = admin)
-- Expected: 1 row affected
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SET request.jwt.claims TO '{"sub":"test","email":"raneem@forefront.consulting","role":"authenticated"}';
SET ROLE authenticated;

UPDATE tasks SET status = 'c-final', stage_date = CURRENT_DATE
WHERE status = 'c-prog'
LIMIT 1;
-- VERIFY: rowcount = 1

RESET ROLE;
RESET request.jwt.claims;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TEST 4: nine_stage is immutable after creation (trigger fires)
-- Expected: ERROR: nine_stage is immutable after creation
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- (Run as superuser / postgres role — bypass RLS to test the trigger directly)
-- Replace <any-task-id> with a real UUID from the tasks table
DO $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM tasks LIMIT 1;
  UPDATE tasks SET nine_stage = NOT nine_stage WHERE id = v_id;
  RAISE EXCEPTION 'ERROR: trigger did NOT fire — nine_stage was mutated. FAIL.';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%nine_stage is immutable%' THEN
      RAISE NOTICE 'TEST 4 PASS: nine_stage immutability trigger fired correctly.';
    ELSE
      RAISE EXCEPTION 'TEST 4 FAIL: unexpected error: %', SQLERRM;
    END IF;
END;
$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TEST 5: User-tier member cannot INSERT a task (tasks_insert RLS)
-- Expected: ERROR: new row violates row-level security policy
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SET request.jwt.claims TO '{"sub":"test","email":"content@forefront.consulting","role":"authenticated"}';
SET ROLE authenticated;

INSERT INTO tasks (name, task_owner_id, initiator_role, nine_stage, due_date)
VALUES ('Test Task', auth.member_id(), 'Content Creator', TRUE, CURRENT_DATE + 7);
-- VERIFY: ERROR: new row violates row-level security policy for table "tasks"

RESET ROLE;
RESET request.jwt.claims;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RESULTS RECORD — fill in after running each test:
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--
-- TEST 1 (Published lock):         [ ] PASS  /  [ ] FAIL   rows affected: ___
-- TEST 2 (Role-based advance):     [ ] PASS  /  [ ] FAIL   rows affected: ___
-- TEST 3 (Admin advance):          [ ] PASS  /  [ ] FAIL   rows affected: ___
-- TEST 4 (nine_stage immutable):   [ ] PASS  /  [ ] FAIL   error message: ___
-- TEST 5 (User cannot INSERT):     [ ] PASS  /  [ ] FAIL   error message: ___
--
-- All 5 must PASS before Phase 3+ development. Record results in tasks.md T013.
