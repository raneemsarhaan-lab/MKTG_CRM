-- 005_seed.sql
-- Reference data: stages, brands, content types, SLA matrix, seed members
-- data-model.md §Seed Data

-- ─── Stages ──────────────────────────────────────────────────────────────────
-- Canonical pipeline stages (constitution.md §II)
-- English labels match spec.md FR-001 and quickstart.md Scenario 3
INSERT INTO stages (id, label_en, label_ar, phase, owner_role, terminal_flag, sort_order) VALUES
  ('todo',        'To Do',           'افكار للتنفيذ',              'Intake',  NULL,                FALSE, 0),
  ('c-prog',      'Writing',         'كتابة المحتوى',              'Content', NULL,                FALSE, 1),
  ('c-final',     'Content Review',  'مراجعة المحتوى',             'Content', 'Marketing Manager', FALSE, 2),
  ('c-check',     'Islam Check',     'موافقة نهائية على المحتوى',  'Content', 'Managing Director', FALSE, 3),
  ('r-design',    'Ready to Design', 'جاهز للتصميم',               'Design',  NULL,                FALSE, 4),
  ('d-prog',      'Designing',       'تصميم',                      'Design',  NULL,                FALSE, 5),
  ('d-check',     'Design Review',   'مراجعة التصميم',             'Design',  'Brand Director',    FALSE, 6),
  ('final-check', 'Final Check',     'المراجعة النهائية',          'Ship',    'Marketing Manager', FALSE, 7),
  ('publish',     'Published',       'تم النشر',                   'Ship',    NULL,                TRUE,  8);

-- ─── Brands ──────────────────────────────────────────────────────────────────
INSERT INTO brands (name, color) VALUES
  ('Forefront Consulting',    '#B4322F'),
  ('Omnisight',               '#0E7C7B'),
  ('The Strategy Community',  '#7A5A2E'),
  ('Islam Personal Branding', '#1E293B');

-- ─── Content types ───────────────────────────────────────────────────────────
INSERT INTO content_types (label) VALUES
  ('Post'), ('Video'), ('Reel'), ('Design'), ('Email'), ('Story'), ('Deck'), ('Other');

-- ─── SLA matrix (default business-day limits) ────────────────────────────────
-- Rows = stages that have active work SLAs
-- Columns = content types
INSERT INTO sla_config (stage_id, content_type_label, max_business_days) VALUES
  -- todo
  ('todo', 'Post', 1), ('todo', 'Video', 2), ('todo', 'Reel', 2),
  ('todo', 'Design', 1), ('todo', 'Email', 1), ('todo', 'Story', 1),
  ('todo', 'Deck', 3), ('todo', 'Other', 2),
  -- c-prog (Writing)
  ('c-prog', 'Post', 2), ('c-prog', 'Video', 4), ('c-prog', 'Reel', 3),
  ('c-prog', 'Design', 2), ('c-prog', 'Email', 2), ('c-prog', 'Story', 1),
  ('c-prog', 'Deck', 5), ('c-prog', 'Other', 3),
  -- c-final (Content Review)
  ('c-final', 'Post', 1), ('c-final', 'Video', 1), ('c-final', 'Reel', 1),
  ('c-final', 'Design', 1), ('c-final', 'Email', 1), ('c-final', 'Story', 1),
  ('c-final', 'Deck', 2), ('c-final', 'Other', 1),
  -- c-check (Islam Check)
  ('c-check', 'Post', 1), ('c-check', 'Video', 2), ('c-check', 'Reel', 1),
  ('c-check', 'Design', 1), ('c-check', 'Email', 1), ('c-check', 'Story', 1),
  ('c-check', 'Deck', 2), ('c-check', 'Other', 1),
  -- r-design (Ready to Design)
  ('r-design', 'Post', 1), ('r-design', 'Video', 2), ('r-design', 'Reel', 2),
  ('r-design', 'Design', 1), ('r-design', 'Email', 1), ('r-design', 'Story', 1),
  ('r-design', 'Deck', 2), ('r-design', 'Other', 2),
  -- d-prog (Designing)
  ('d-prog', 'Post', 2), ('d-prog', 'Video', 5), ('d-prog', 'Reel', 4),
  ('d-prog', 'Design', 3), ('d-prog', 'Email', 2), ('d-prog', 'Story', 1),
  ('d-prog', 'Deck', 4), ('d-prog', 'Other', 3),
  -- d-check (Design Review)
  ('d-check', 'Post', 1), ('d-check', 'Video', 2), ('d-check', 'Reel', 2),
  ('d-check', 'Design', 1), ('d-check', 'Email', 1), ('d-check', 'Story', 1),
  ('d-check', 'Deck', 2), ('d-check', 'Other', 1),
  -- final-check (Final Check)
  ('final-check', 'Post', 1), ('final-check', 'Video', 1), ('final-check', 'Reel', 1),
  ('final-check', 'Design', 1), ('final-check', 'Email', 1), ('final-check', 'Story', 1),
  ('final-check', 'Deck', 1), ('final-check', 'Other', 1),
  -- publish (Published — SLA is 0, terminal stage)
  ('publish', 'Post', 0), ('publish', 'Video', 0), ('publish', 'Reel', 0),
  ('publish', 'Design', 0), ('publish', 'Email', 0), ('publish', 'Story', 0),
  ('publish', 'Deck', 0), ('publish', 'Other', 0);

-- ─── Members ─────────────────────────────────────────────────────────────────
-- These emails must match Google Workspace accounts used for OAuth login.
-- Users sign in via Google OAuth; no passwords are stored.
-- If a member's auth.users UUID is known, set it here by updating the id column
-- after this INSERT. Otherwise leave UUIDs auto-generated and update after first login.
INSERT INTO members (name, email, role, access, capacity_hrs_wk, status) VALUES
  ('Raneem',                       'raneem@forefront.consulting',  'Marketing Manager',           'admin',     40, 'Available'),
  ('Islam',                        'islam@forefront.consulting',   'Managing Director',            'superuser', 20, 'Busy'),
  ('Brand Director',               'brand@forefront.consulting',   'Brand Director',               'superuser', 35, 'Busy'),
  ('Digital Marketing Specialist', 'dms@forefront.consulting',     'Digital Marketing Specialist', 'superuser', 40, 'Available'),
  ('Content Creator',              'content@forefront.consulting', 'Content Creator',              'user',      40, 'Available'),
  ('Graphic Designer',             'design@forefront.consulting',  'Graphic Designer',             'user',      40, 'Available'),
  ('Video Editor',                 'video@forefront.consulting',   'Video Editor',                 'user',      40, 'Available');

-- ─── Realtime ────────────────────────────────────────────────────────────────
-- Enable Realtime replication on tasks table (live board updates, celebration broadcast)
-- Alternatively: Supabase Dashboard → Database → Replication → tasks
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
