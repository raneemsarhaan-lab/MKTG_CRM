#!/bin/bash
#
# Spec 027 (US6, T036): where every sheet tab goes in the Sheet view rebuild. It only reads.
#
#   bash scripts/release/sheet-convert-report.sh "<postgres url>" > sheet-convert-report.txt
#
# Run it on a copy restored from a fresh backup of production, never on production itself first.
# For each folder and tab it prints where the tab ends up and what it holds:
#   - the Content and Video sheets (linked_content / linked_video) → that Space's Board tab;
#   - a Space's own workbook (node:space:<id>) → stays in that Space's Sheet view;
#   - a brand's workbook → stays on that brand's page;
#   - an old team folder (Sheets section) → the Space with the same name, or "unmatched: ask the owner";
#   - My tasks workbooks → stay with their person.
# Spreadsheet tabs stay spreadsheet tabs (cells, formats, comments as they are). Nothing is deleted or
# moved by this script. The url is read from the first argument, else DATABASE_URL, and never printed.
set -u
DB="${1:-${DATABASE_URL:-}}"
if [ -z "$DB" ]; then echo "usage: sheet-convert-report.sh <postgres url>   (or set DATABASE_URL)" >&2; exit 2; fi
q() { psql "$DB" -X -Atq -F ' | ' -v ON_ERROR_STOP=1 -c "$1"; }
# Before this release there are no tabs of rows (content_rows.sheet_id): print 0 then.
if [ "$(q "select count(*) from information_schema.columns where table_name = 'content_rows' and column_name = 'sheet_id'")" = "1" ]; then
  TABROWS="(select count(*) from content_rows r where r.sheet_id = s.id)"
else
  TABROWS="0"
fi

echo "# Sheet view rebuild — where every tab goes (read only)"
echo "# taken at $(q "select to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI') || ' UTC'")"
echo
echo "## Tabs"
echo "folder kind | folder | tab kind | tab | hidden | → destination | cells | formats | comments | rows (tabs of rows)"
q "
with spaces as (select id, key, name from team_spaces where archived_at is null)
select f.kind,
       coalesce(f.name, f.linked_key, f.kind),
       s.kind,
       coalesce(s.name, s.linked_key),
       case when s.hidden then 'hidden' else '' end,
       case
         when s.kind = 'linked_content' then 'Board tab of ' || coalesce((select name from spaces where key = 'content'), 'Content')
         when s.kind = 'linked_video'   then 'Board tab of ' || coalesce((select name from spaces where key = 'video'), 'Video')
         when s.kind = 'linked_tasks'   then 'Board tab of its page (' || s.linked_key || ')'
         when f.kind = 'content' then 'stays in ' || coalesce((select name from spaces where key = 'content'), 'Content') || ' Sheet view'
         when f.kind = 'video'   then 'stays in ' || coalesce((select name from spaces where key = 'video'), 'Video') || ' Sheet view'
         when f.kind = 'node' and f.linked_key like 'node:space:%' then 'stays in ' || coalesce((select name from spaces where 'node:space:' || id::text = f.linked_key), '(archived Space)') || ' Sheet view'
         when f.kind = 'node' and f.linked_key like 'node:me:%' then 'stays in its person''s My tasks'
         when f.kind = 'brand' then 'stays on brand ' || coalesce((select name from brands where id = f.brand_id), '?')
         when f.kind = 'team' then coalesce('moves to ' || (select name from spaces where lower(name) = lower(f.name) limit 1) || ' Sheet view (folder change only)', 'UNMATCHED: ask the owner')
         else 'UNKNOWN folder kind: ask the owner'
       end,
       (select count(*) from sheet_cells c where c.sheet_id = s.id),
       (select count(*) from sheet_formats x where x.sheet_id = s.id),
       (select count(*) from sheet_comments x where x.sheet_id = s.id),
       $TABROWS
from sheet_folders f join sheets s on s.folder_id = f.id
order by f.kind, 2, s.position"
echo
echo "## To decide"
n=$(q "select count(*) from sheet_folders f join sheets s on s.folder_id = f.id where f.kind = 'team' and not exists (select 1 from team_spaces sp where sp.archived_at is null and lower(sp.name) = lower(f.name))")
echo "unmatched tabs (team folders with no Space of that name): $n"
echo
echo "## Totals before (compare after the step)"
for t in tasks content_rows content_themes sheet_columns sheet_values sheets sheet_folders sheet_cells sheet_formats sheet_comments; do
  echo "$t=$(q "select count(*) from $t" 2>/dev/null || echo n/a)"
done
