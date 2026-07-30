-- 006_workspace_settings.sql
-- Global workspace configuration: weekly capacity default and nine_stage default
-- spec.md FR-005 (Islam Check variant), constitution.md §IV

CREATE TABLE workspace_settings (
  id                   INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  capacity_hrs_per_wk  INTEGER NOT NULL DEFAULT 40 CHECK (capacity_hrs_per_wk > 0),
  nine_stage_default   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Single-row table: enforce via constraint
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws_select"
  ON workspace_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "ws_update"
  ON workspace_settings FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members WHERE email = auth.email() AND access = 'admin')
  );

-- Seed the single row
INSERT INTO workspace_settings (id, capacity_hrs_per_wk, nine_stage_default)
VALUES (1, 40, false);
