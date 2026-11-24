#!/bin/bash
#
# Release check: counts and fingerprints of everything that matters, as sorted `name=value` lines.
# Run it before the release, on the rehearsal copy after its migrations, and on production after
# the deploy; `diff` the outputs. It only reads. It works on the schema before and after the
# release: a table or column that isn't there yet prints `n/a`.
#
#   bash scripts/release/counts.sh "<postgres url>" > counts-before.txt
#   CUTOFF="$(grep '^meta.cutoff=' counts-before.txt | cut -d= -f2-)" bash scripts/release/counts.sh "<url>" > counts-after.txt
#
# The fingerprints of tasks cover the tasks that existed at the cutoff (the moment of the first
# run), so tasks the release adds don't hide a change to an old one. Pass the first run's cutoff to
# the later runs, as above.
#
# The url is read from the first argument, else from DATABASE_URL. It is never printed.
set -u
DB="${1:-${DATABASE_URL:-}}"
if [ -z "$DB" ]; then echo "usage: counts.sh <postgres url>   (or set DATABASE_URL)" >&2; exit 2; fi
CUTOFF="${CUTOFF:-$(psql "$DB" -X -Atq -c "select to_char(now() at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')")}"
OLD="created_at <= '${CUTOFF}'::timestamptz"

one()  { local v; v="$(psql "$DB" -X -Atq -v ON_ERROR_STOP=1 -c "$2" 2>/dev/null)" && echo "$1=${v}" || echo "$1=n/a"; }
many() { local v; v="$(psql "$DB" -X -Atq -F '=' -v ON_ERROR_STOP=1 -c "$2" 2>/dev/null)" && { [ -n "$v" ] && echo "$v" | sed "s|^|$1.|" || true; } || echo "$1=n/a"; }

{
echo "meta.cutoff=${CUTOFF}"
# ── every table, exactly ──
for t in $(psql "$DB" -X -Atq -c "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1"); do
  one "rows.$t" "select count(*) from \"$t\""
done

# ── tasks ──
many "tasks.by_stage"    "select status, count(*) from tasks group by 1 order by 1"
many "tasks.by_brand"    "select coalesce(b.name, '(no brand)'), count(*) from tasks t left join brands b on b.id=t.brand_id group by 1 order by 1"
many "tasks.by_priority" "select coalesce(priority, '(none)'), count(*) from tasks group by 1 order by 1"
many "tasks.by_type"     "select coalesce(content_type_label, '(none)'), count(*) from tasks group by 1 order by 1"
one  "tasks.archived"    "select count(*) from tasks where dropped_at is not null"
one  "tasks.live"        "select count(*) from tasks where dropped_at is null"
one  "tasks.subtasks"    "select count(*) from tasks where parent_task_id is not null"
one  "tasks.clips"       "select count(*) from task_clips"
one  "tasks.with_project" "select count(*) from tasks where project_id is not null"
one  "tasks.with_due_date" "select count(*) from tasks where due_date is not null"
one  "tasks.with_publish_date" "select count(*) from tasks where publish_date is not null"
many "tasks.by_kind"     "select kind, count(*) from tasks group by 1 order by 1"
many "tasks.by_media_board" "select coalesce(media_board, '(content)'), count(*) from tasks group by 1 order by 1"
one  "tasks.linked_media" "select count(*) from tasks where content_task_id is not null"
# The tasks that existed before the release: none may go; their names, people and briefs may not change.
one  "tasks.existing_at_cutoff" "select count(*) from tasks where $OLD"
one  "tasks.fingerprint.ids_names" "select md5(coalesce(string_agg(id::text || '|' || name, ',' order by id), '')) from tasks where $OLD"
one  "tasks.fingerprint.owners_assignees" "select md5(coalesce(string_agg(id::text || '|' || task_owner_id::text || '|' || coalesce(assignee_id::text, ''), ',' order by id), '')) from tasks where $OLD"
one  "tasks.fingerprint.briefs" "select md5(coalesce(string_agg(id::text || '|' || md5(coalesce(description, '')), ',' order by id), '')) from tasks where $OLD"

# ── task fields ──
many "field_values.by_field" "select f.name_en, count(*) from task_field_values v join task_fields f on f.id=v.field_id group by 1 order by 1"
one  "field_values.fingerprint" "select md5(coalesce(string_agg(task_id::text || field_id::text || value::text, ',' order by task_id, field_id), '')) from task_field_values"

# ── sheets ──
many "sheets.by_kind"        "select kind, count(*) from sheets group by 1 order by 1"
many "sheet_folders.by_kind" "select kind, count(*) from sheet_folders group by 1 order by 1"
one  "sheet_rows"            "select count(*) from sheet_rows"
one  "sheet_cells"           "select count(*) from sheet_cells"
one  "sheet_cells.fingerprint" "select md5(coalesce(string_agg(row_id::text || col_id::text || md5(value), ',' order by row_id, col_id), '')) from sheet_cells"
many "custom_columns.by_sheet" "select sheet, count(*) from sheet_columns where key like 'c:%' and deleted_at is null group by 1 order by 1"
one  "custom_columns.total"  "select count(*) from sheet_columns where key like 'c:%' and deleted_at is null"
one  "custom_columns.fingerprint.names" "select md5(coalesce(string_agg(id::text || '|' || coalesce(name, '') || '|' || coalesce(kind, ''), ',' order by id), '')) from sheet_columns where key like 'c:%'"
one  "custom_values"         "select count(*) from sheet_values"
one  "custom_values.fingerprint" "select md5(coalesce(string_agg(column_id::text || task_id::text || md5(value), ',' order by column_id, task_id), '')) from sheet_values"
one  "sheet_formats"         "select count(*) from sheet_formats"
one  "sheet_formats.fingerprint" "select md5(coalesce(string_agg(sheet_id::text || row_key || col_key || md5(style::text), ',' order by sheet_id, row_key, col_key), '')) from sheet_formats"
one  "sheet_merges"          "select count(*) from sheet_merges"
one  "sheet_rules"           "select count(*) from sheet_rules"
one  "row_heights"           "select count(*) from linked_row_heights"
one  "content_rows.plain"    "select count(*) from content_rows where task_id is null"
one  "content_rows.linked"   "select count(*) from content_rows where task_id is not null"
many "content_rows.by_space" "select coalesce(s.key, '(none)'), count(*) from content_rows r left join team_spaces s on s.id=r.space_id group by 1 order by 1"
many "content_themes.by_space" "select coalesce(s.key, '(none)'), count(*) from content_themes r left join team_spaces s on s.id=r.space_id group by 1 order by 1"

# ── comments, attachments, links ──
one  "task_comments"         "select count(*) from task_comments"
one  "task_comments.fingerprint" "select md5(coalesce(string_agg(id::text || md5(body), ',' order by id), '')) from task_comments"
one  "sheet_comments.live"   "select count(*) from sheet_comments where deleted_at is null"
one  "sheet_comments.all"    "select count(*) from sheet_comments"
one  "sheet_comments.fingerprint" "select md5(coalesce(string_agg(id::text || row_key || col_key || md5(body), ',' order by id), '')) from sheet_comments"
one  "attachments.total"     "select count(*) from task_attachments"
one  "attachments.links"     "select count(*) from task_attachments where url is not null"
one  "attachments.in_bucket" "select count(*) from task_attachments where storage_key is not null"
one  "attachments.in_database" "select count(*) from task_attachments where data is not null"
one  "attachments.fingerprint" "select md5(coalesce(string_agg(id::text || task_id::text || filename || coalesce(url, '') || coalesce(storage_key, ''), ',' order by id), '')) from task_attachments"
one  "brand_assets"          "select count(*) from brand_assets"

# ── projects, themes, pillars ──
one  "projects.total"        "select count(*) from projects"
one  "projects.themes"       "select count(*) from projects where is_theme"
one  "projects.fingerprint.names" "select md5(coalesce(string_agg(id::text || '|' || name, ',' order by id), '')) from projects where name not like 'Videos · %'"
one  "project_steps"         "select count(*) from project_steps"
one  "pillars"               "select count(*) from content_pillars"

# ── Spaces, hours, people, followers ──
one  "team_spaces"           "select count(*) from team_spaces"
one  "space_stages"          "select count(*) from space_stages"
one  "task_spaces"           "select count(*) from task_spaces"
one  "hours.work_days"       "select count(*) from work_days"
one  "hours.fingerprint"     "select md5(coalesce(string_agg(w::text, ',' order by w::text), '')) from work_days w"
one  "users"                 "select count(*) from members"
one  "users.fingerprint"     "select md5(coalesce(string_agg(id::text || '|' || email || '|' || role || '|' || access, ',' order by id), '')) from members"
one  "followers"             "select count(*) from task_followers"
one  "notifications"         "select count(*) from notifications"
one  "one_time_steps_done"   "select string_agg(key, ' ' order by key) from tombstones where kind='migration'"
} | sort
