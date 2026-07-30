-- 002_tables.sql
-- Core table definitions for Fluxo CRM Core
-- spec.md FR-001 (stages), FR-005 (nine_stage immutability), FR-014 (task creation)

-- ─── Members ─────────────────────────────────────────────────────────────────
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

-- ─── Brands ──────────────────────────────────────────────────────────────────
CREATE TABLE brands (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT        NOT NULL UNIQUE,
  color       TEXT        NOT NULL DEFAULT '#64748B',
  logo_url    TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Content types ───────────────────────────────────────────────────────────
CREATE TABLE content_types (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  label      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Stages (seeded via migration; not user-configurable) ────────────────────
CREATE TABLE stages (
  id            TEXT    PRIMARY KEY,
  label_en      TEXT    NOT NULL,
  label_ar      TEXT    NOT NULL,
  phase         TEXT    NOT NULL,
  owner_role    TEXT,                       -- NULL = working stage (task owner)
  terminal_flag BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INTEGER NOT NULL
);

-- ─── SLA configuration ───────────────────────────────────────────────────────
CREATE TABLE sla_config (
  stage_id           TEXT    NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  content_type_label TEXT    NOT NULL REFERENCES content_types(label)
                             ON DELETE CASCADE ON UPDATE CASCADE,
  max_business_days  INTEGER NOT NULL DEFAULT 1 CHECK (max_business_days >= 0),
  PRIMARY KEY (stage_id, content_type_label)
);

-- ─── Tasks ───────────────────────────────────────────────────────────────────
CREATE TABLE tasks (
  id                 UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               TEXT         NOT NULL,
  brand_id           UUID         REFERENCES brands(id) ON DELETE SET NULL,
  content_type_label TEXT         REFERENCES content_types(label)
                                  ON DELETE SET NULL ON UPDATE CASCADE,
  platform           TEXT,
  campaign           TEXT,
  task_owner_id      UUID         NOT NULL REFERENCES members(id),
  initiator_role     TEXT         NOT NULL,
  nine_stage         BOOLEAN      NOT NULL DEFAULT FALSE,
  status             TEXT         NOT NULL DEFAULT 'todo' REFERENCES stages(id),
  stage_date         DATE         NOT NULL DEFAULT CURRENT_DATE,
  due_date           DATE         NOT NULL,
  hours_estimate     NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (hours_estimate >= 0),
  cover_image_url    TEXT,
  priority           TEXT         NOT NULL DEFAULT 'Medium'
                                  CHECK (priority IN ('Low', 'Medium', 'High')),
  created_by         UUID         REFERENCES members(id),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Prevent nine_stage from changing after creation (FR-005, SC-008)
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

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Task comments (append-only per spec) ────────────────────────────────────
CREATE TABLE task_comments (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES members(id),
  body       TEXT        NOT NULL CHECK (LENGTH(TRIM(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Task attachments ────────────────────────────────────────────────────────
CREATE TABLE task_attachments (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename    TEXT        NOT NULL,
  url         TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX tasks_status_idx       ON tasks (status);
CREATE INDEX tasks_owner_idx        ON tasks (task_owner_id);
CREATE INDEX tasks_due_date_idx     ON tasks (due_date);
CREATE INDEX task_comments_task_idx ON task_comments (task_id);
CREATE INDEX members_email_idx      ON members (email);
