# DB Schema: Fluxo CRM Core

**Feature**: `specs/002-fluxo-crm-core`
**Date**: 2026-07-15

Full Postgres migration. Run in this order: extensions → tables → functions → RLS → seed.

---

## 001_extensions.sql

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

---

## 002_tables.sql

```sql
-- ─── Members ────────────────────────────────────────────────────────────────
CREATE TABLE members (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT        NOT NULL,
  email            TEXT        NOT NULL UNIQUE,
  role             TEXT        NOT NULL,
  access           TEXT        NOT NULL DEFAULT 'user'
                               CHECK (access IN ('admin', 'superuser', 'user')),
  capacity_hrs_wk  INTEGER     NOT NULL DEFAULT 40 CHECK (capacity_hrs_wk > 0),
  status           TEXT        NOT NULL DEFAULT 'Available'
                               CHECK (status IN ('Available', 'Busy')),
  color            TEXT,
  avatar_url       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Brands ─────────────────────────────────────────────────────────────────
CREATE TABLE brands (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT        NOT NULL UNIQUE,
  color       TEXT        NOT NULL DEFAULT '#64748B',
  logo_url    TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Content types ──────────────────────────────────────────────────────────
CREATE TABLE content_types (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  label      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Stages (seeded; not user-configurable) ─────────────────────────────────
CREATE TABLE stages (
  id           TEXT        PRIMARY KEY,
  label_en     TEXT        NOT NULL,
  label_ar     TEXT        NOT NULL,
  phase        TEXT        NOT NULL,
  owner_role   TEXT,                       -- NULL = working stage (task owner)
  terminal_flag BOOLEAN    NOT NULL DEFAULT FALSE,
  sort_order   INTEGER     NOT NULL
);

-- ─── SLA configuration ──────────────────────────────────────────────────────
CREATE TABLE sla_config (
  stage_id           TEXT    NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  content_type_label TEXT    NOT NULL REFERENCES content_types(label)
                             ON DELETE CASCADE ON UPDATE CASCADE,
  max_business_days  INTEGER NOT NULL DEFAULT 1 CHECK (max_business_days >= 0),
  PRIMARY KEY (stage_id, content_type_label)
);

-- ─── Tasks ──────────────────────────────────────────────────────────────────
CREATE TABLE tasks (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               TEXT        NOT NULL,
  brand_id           UUID        REFERENCES brands(id) ON DELETE SET NULL,
  content_type_label TEXT        REFERENCES content_types(label)
                                 ON DELETE SET NULL ON UPDATE CASCADE,
  platform           TEXT,
  campaign           TEXT,
  task_owner_id      UUID        NOT NULL REFERENCES members(id),
  initiator_role     TEXT        NOT NULL,
  nine_stage         BOOLEAN     NOT NULL DEFAULT FALSE,
  status             TEXT        NOT NULL DEFAULT 'todo' REFERENCES stages(id),
  stage_date         DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date           DATE        NOT NULL,
  hours_estimate     NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (hours_estimate >= 0),
  cover_image_url    TEXT,
  priority           TEXT        NOT NULL DEFAULT 'Medium'
                                 CHECK (priority IN ('Low', 'Medium', 'High')),
  created_by         UUID        REFERENCES members(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent nine_stage from changing after creation via trigger
CREATE OR REPLACE FUNCTION prevent_nine_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.nine_stage IS DISTINCT FROM NEW.nine_stage THEN
    RAISE EXCEPTION 'nine_stage is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lock_nine_stage
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION prevent_nine_stage_change();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Task comments (append-only) ────────────────────────────────────────────
CREATE TABLE task_comments (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES members(id),
  body       TEXT        NOT NULL CHECK (LENGTH(TRIM(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Task attachments ───────────────────────────────────────────────────────
CREATE TABLE task_attachments (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename    TEXT        NOT NULL,
  url         TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 003_functions.sql

```sql
-- Resolve the current authenticated user's member record email
-- (auth.email() is built in to Supabase; these wrap it for RLS readability)

CREATE OR REPLACE FUNCTION auth.user_access_level()
RETURNS TEXT
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT access FROM members WHERE email = auth.email()
$$;

CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT role FROM members WHERE email = auth.email()
$$;

CREATE OR REPLACE FUNCTION auth.member_id()
RETURNS UUID
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT id FROM members WHERE email = auth.email()
$$;

-- Main gate: can the current user advance (move) this task?
-- Returns FALSE if the task is at the terminal Published stage.
-- Returns TRUE for admin/superuser unconditionally (except Published).
-- Returns TRUE for a user if they own the current stage.
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

  -- Terminal stage: no one advances
  IF v_stage.terminal_flag THEN
    RETURN FALSE;
  END IF;

  -- Admin / Super User: bypass ownership check
  IF v_access IN ('admin', 'superuser') THEN
    RETURN TRUE;
  END IF;

  -- User tier: must own the current stage
  -- Working stage (owner_role IS NULL): task owner advances
  IF v_stage.owner_role IS NULL THEN
    RETURN v_task.task_owner_id = v_memberid;
  END IF;

  -- Review stage: the role owner advances
  RETURN v_stage.owner_role = v_role;
END;
$$;
```

---

## 004_rls.sql

See [`rls-policies.md`](rls-policies.md) for the full policies.

---

## 005_seed.sql

```sql
-- Stages
INSERT INTO stages (id, label_en, label_ar, phase, owner_role, terminal_flag, sort_order) VALUES
  ('todo',        'To Do',           'افكار للتنفيذ',                'Intake',  NULL,                  FALSE, 0),
  ('c-prog',      'Writing',         'كتابة المحتوى',               'Content', NULL,                  FALSE, 1),
  ('c-final',     'Content Review',  'مراجعة المحتوى',              'Content', 'Marketing Manager',   FALSE, 2),
  ('c-check',     'Islam Check',     'موافقة نهائية على المحتوى',   'Content', 'Managing Director',   FALSE, 3),
  ('r-design',    'Ready to Design', 'جاهز للتصميم',               'Design',  NULL,                  FALSE, 4),
  ('d-prog',      'Designing',       'تصميم',                       'Design',  NULL,                  FALSE, 5),
  ('d-check',     'Design Review',   'مراجعة التصميم',              'Design',  'Brand Director',      FALSE, 6),
  ('final-check', 'Final Check',     'المراجعة النهائية',           'Ship',    'Marketing Manager',   FALSE, 7),
  ('publish',     'Published',       'تم النشر',                    'Ship',    NULL,                  TRUE,  8);

-- Brands
INSERT INTO brands (name, color) VALUES
  ('Forefront Consulting',    '#B4322F'),
  ('Omnisight',               '#0E7C7B'),
  ('The Strategy Community',  '#7A5A2E'),
  ('Islam Personal Branding', '#1E293B');

-- Content types
INSERT INTO content_types (label) VALUES
  ('Post'), ('Video'), ('Reel'), ('Design'), ('Email'), ('Story'), ('Deck'), ('Other');

-- SLA config (matches kanban-board.html defaults)
INSERT INTO sla_config (stage_id, content_type_label, max_business_days) VALUES
  ('todo',        'Post',    1), ('todo',        'Video', 2), ('todo',        'Reel',   2),
  ('todo',        'Design',  1), ('todo',        'Email', 1), ('todo',        'Story',  1),
  ('todo',        'Deck',    3), ('todo',        'Other', 2),
  ('c-prog',      'Post',    2), ('c-prog',      'Video', 4), ('c-prog',      'Reel',   3),
  ('c-prog',      'Design',  2), ('c-prog',      'Email', 2), ('c-prog',      'Story',  1),
  ('c-prog',      'Deck',    5), ('c-prog',      'Other', 3),
  ('c-final',     'Post',    1), ('c-final',     'Video', 1), ('c-final',     'Reel',   1),
  ('c-final',     'Design',  1), ('c-final',     'Email', 1), ('c-final',     'Story',  1),
  ('c-final',     'Deck',    2), ('c-final',     'Other', 1),
  ('c-check',     'Post',    1), ('c-check',     'Video', 2), ('c-check',     'Reel',   1),
  ('c-check',     'Design',  1), ('c-check',     'Email', 1), ('c-check',     'Story',  1),
  ('c-check',     'Deck',    2), ('c-check',     'Other', 1),
  ('r-design',    'Post',    1), ('r-design',    'Video', 2), ('r-design',    'Reel',   2),
  ('r-design',    'Design',  1), ('r-design',    'Email', 1), ('r-design',    'Story',  1),
  ('r-design',    'Deck',    2), ('r-design',    'Other', 2),
  ('d-prog',      'Post',    2), ('d-prog',      'Video', 5), ('d-prog',      'Reel',   4),
  ('d-prog',      'Design',  3), ('d-prog',      'Email', 2), ('d-prog',      'Story',  1),
  ('d-prog',      'Deck',    4), ('d-prog',      'Other', 3),
  ('d-check',     'Post',    1), ('d-check',     'Video', 2), ('d-check',     'Reel',   2),
  ('d-check',     'Design',  1), ('d-check',     'Email', 1), ('d-check',     'Story',  1),
  ('d-check',     'Deck',    2), ('d-check',     'Other', 1),
  ('final-check', 'Post',    1), ('final-check', 'Video', 1), ('final-check', 'Reel',   1),
  ('final-check', 'Design',  1), ('final-check', 'Email', 1), ('final-check', 'Story',  1),
  ('final-check', 'Deck',    1), ('final-check', 'Other', 1),
  ('publish',     'Post',    0), ('publish',     'Video', 0), ('publish',     'Reel',   0),
  ('publish',     'Design',  0), ('publish',     'Email', 0), ('publish',     'Story',  0),
  ('publish',     'Deck',    0), ('publish',     'Other', 0);

-- Members (emails must match Google Workspace accounts)
-- Passwords are not set here — users sign in via Google OAuth only.
-- Insert into members after confirming each person has a matching auth.users record
-- OR use a trigger to auto-create the member record on first OAuth login (deferred).
-- For local dev: manually insert seed members and set their UUIDs to match auth.users.

INSERT INTO members (name, email, role, access, capacity_hrs_wk, status) VALUES
  ('Raneem',                       'raneem@forefront.consulting',  'Marketing Manager',           'admin',     40, 'Available'),
  ('Islam',                        'islam@forefront.consulting',   'Managing Director',            'superuser', 20, 'Busy'),
  ('Brand Director',               'brand@forefront.consulting',   'Brand Director',               'superuser', 35, 'Busy'),
  ('Digital Marketing Specialist', 'dms@forefront.consulting',     'Digital Marketing Specialist', 'superuser', 40, 'Available'),
  ('Content Creator',              'content@forefront.consulting', 'Content Creator',              'user',      40, 'Available'),
  ('Graphic Designer',             'design@forefront.consulting',  'Graphic Designer',             'user',      40, 'Available'),
  ('Video Editor',                 'video@forefront.consulting',   'Video Editor',                 'user',      40, 'Available');
```

---

## Indexes

```sql
CREATE INDEX tasks_status_idx      ON tasks (status);
CREATE INDEX tasks_owner_idx       ON tasks (task_owner_id);
CREATE INDEX tasks_due_date_idx    ON tasks (due_date);
CREATE INDEX task_comments_task_idx ON task_comments (task_id);
CREATE INDEX members_email_idx     ON members (email);
```

---

## Realtime Setup

Enable Realtime on the `tasks` table in Supabase Dashboard → Database → Replication, or:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
```
