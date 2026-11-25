#!/bin/bash
# Fields clean-up report (owner's request of 25 Nov 2026, section 5). READS ONLY: changes nothing.
#
#   bash scripts/release/fields-report.sh "<database url>" > fields-report.md
#
# Lists, for approval before anything is applied:
#   1. Platform and Channels: tasks whose Platform would be copied into an empty Channels; tasks
#      where both are set and differ.
#   2. Regular (sheet-only) columns whose name matches a standard or custom field (brand, owner,
#      priority, caption…), each value compared with the task's real value; for "brand", suggested
#      brands where the task has none.
#   3. The Task and Link task columns of each Space's sheet: rows whose Task link and Link task differ.
#   4. Archive or restore: where the column is shown today (it moves to the row menu).
#   5. Fields that move from standard to custom: the Spaces where each shows today (they stay on there).
#
# Output contains task names (production data): keep it local; don't commit it.
set -euo pipefail
DB="${1:?database url}"
q() { psql "$DB" -At -F $'\t' -c "$1"; }
row() { sed 's/\t/ | /g; s/^/| /; s/$/ |/'; }

echo "# Fields clean-up report"
echo
echo "Database read at $(date -u +%Y-%m-%dT%H:%M:%SZ). Nothing was changed."
echo

CH=$(q "select id from task_fields where name_en='Channels' and retired_at is null limit 1")
echo "## 1. Platform and Channels"
echo
if [ -z "$CH" ]; then echo "No Channels field."; else
  echo "Choices of Channels: $(q "select string_agg(c->>'id' || '=' || (c->>'en'), ', ') from task_fields, jsonb_array_elements(options->'choices') c where id='$CH'")"
  echo
  echo "### Platform copied into Channels (Channels empty): $(q "select count(*) from tasks t where coalesce(t.platform,'')<>'' and not exists (select 1 from task_field_values v where v.task_id=t.id and v.field_id='$CH')") tasks"
  echo
  echo "| Platform value | Tasks | Matching Channels choice |"
  echo "|---|---|---|"
  q "select t.platform, count(*), coalesce((select c->>'en' from task_fields f, jsonb_array_elements(f.options->'choices') c where f.id='$CH' and lower(c->>'en')=lower(t.platform) limit 1), 'NO MATCH: needs a choice') from tasks t where coalesce(t.platform,'')<>'' and not exists (select 1 from task_field_values v where v.task_id=t.id and v.field_id='$CH') group by 1 order by 2 desc" | row
  echo
  echo "### Both set and different"
  echo
  echo "| Task | Platform | Channels |"
  echo "|---|---|---|"
  q "select t.name, t.platform, v.value::text from tasks t join task_field_values v on v.task_id=t.id and v.field_id='$CH' where coalesce(t.platform,'')<>'' and not (v.value::text ilike '%' || t.platform || '%') order by 1" | row
  echo
fi

echo "## 2. Regular columns named like a field"
echo
echo "| Sheet | Column | Kind | Values | Matches field |"
echo "|---|---|---|---|---|"
q "select c.sheet, c.name, c.kind, (select count(*) from sheet_values v where v.column_id=c.id),
     case when lower(trim(c.name)) in ('brand','owner','assignee','type','status','due','due date','publishing date','publish date','title','priority','tags','tag','start','start date','channels','channel','platform','theme','pillar','caption','tov','working doc','design link','linkedin link','published link') then 'yes'
          when exists (select 1 from task_fields f where f.retired_at is null and lower(f.name_en)=lower(trim(c.name))) then 'yes (library)' else '' end
   from sheet_columns c where c.deleted_at is null and c.key like 'c:%' order by 5 desc, 1, 2" | row
echo
for COL in $(q "select c.id from sheet_columns c where c.deleted_at is null and c.key like 'c:%' and lower(trim(c.name)) = 'brand'"); do
  echo "### \"$(q "select name || '\" on ' || sheet from sheet_columns where id='$COL'")"
  echo
  echo "| Task | Value in the column | Task's real Brand | Result |"
  echo "|---|---|---|---|"
  q "select t.name, v.value, coalesce(b.name,'(none)'),
       case when b.id is null and exists (select 1 from brands x where lower(x.name)=lower(trim(v.value)) or lower(coalesce(x.short_name,''))=lower(trim(v.value))) then 'SUGGESTED brand'
            when b.id is not null and (lower(b.name)=lower(trim(v.value)) or lower(coalesce(b.short_name,''))=lower(trim(v.value))) then 'same'
            else 'DIFFERS' end
     from sheet_values v join tasks t on t.id=v.task_id left join brands b on b.id=t.brand_id where v.column_id='$COL' and coalesce(v.value,'')<>'' order by 4, 1" | row
  echo
done
for COL in $(q "select c.id from sheet_columns c where c.deleted_at is null and c.key like 'c:%' and lower(trim(c.name)) in ('owner','assignee','priority','type','status')"); do
  NAME=$(q "select lower(trim(name)) from sheet_columns where id='$COL'")
  case "$NAME" in
    owner) REAL="(select name from members m where m.id=t.task_owner_id)";;
    assignee) REAL="(select name from members m where m.id=t.assignee_id)";;
    priority) REAL="t.priority";;
    type) REAL="t.content_type_label";;
    status) REAL="t.status";;
  esac
  echo "### \"$(q "select name || '\" on ' || sheet from sheet_columns where id='$COL'")"
  echo
  echo "| Task | Value in the column | Task's real value | Result |"
  echo "|---|---|---|---|"
  q "select t.name, coalesce((select m.name from members m where m.id::text=v.value), v.value), coalesce($REAL,'(none)'),
       case when lower(coalesce((select m.name from members m where m.id::text=v.value), v.value))=lower(coalesce($REAL,'')) then 'same' else 'DIFFERS' end
     from sheet_values v join tasks t on t.id=v.task_id where v.column_id='$COL' and coalesce(v.value,'')<>'' order by 4, 1" | row
  echo
done

echo "## 3. Task and Link task on the sheets"
echo
echo "Rows linked to a task: $(q "select count(*) from content_rows where task_id is not null"). Tasks with a linked Design or Video task: $(q "select count(distinct content_task_id) from tasks where content_task_id is not null and dropped_at is null")."
echo
echo "| Sheet row | Row's task | Its linked Design/Video task |"
echo "|---|---|---|"
q "select r.title, t.name, (select string_agg(m.name || ' (' || m.media_board || ')', ', ') from tasks m where m.content_task_id=t.id and m.dropped_at is null) from content_rows r join tasks t on t.id=r.task_id where exists (select 1 from tasks m where m.content_task_id=t.id and m.dropped_at is null) order by 1" | row
echo

echo "## 4. Archive or restore"
echo
echo "Sheets with the column set by hand: $(q "select coalesce(string_agg(sheet || ' (' || case when shown_default then 'default' else array_to_string(shown_in, ',') end || ')', ', '), 'none') from sheet_columns where key in ('archive','drop') and deleted_at is null")."
echo "Archived tasks today: $(q "select count(*) from tasks where dropped_at is not null")."
echo

echo "## 5. Fields that become custom: where they show today"
echo
echo "| Field | Tasks with a value | Spaces where it is on (no Space turned it off) |"
echo "|---|---|---|"
for F in priority:"tasks where priority is not null and priority<>'None'" tags:"task_tags" start:"tasks where start_date is not null" theme:"tasks where project_id is not null" pillar:"tasks where pillar_id is not null" doc:"task_attachments where link_role='working_doc'" design:"task_attachments where link_role='design'" post:"tasks where coalesce(post_url,'')<>''" published:"tasks where coalesce(published_url,'')<>''"; do
  K="${F%%:*}"; W="${F#*:}"
  N=$(q "select count(*) from $W")
  ON=$(q "select coalesce(string_agg(name, ', ' order by sort_order), '') from team_spaces where archived_at is null and coalesce(settings->'fields'->'$K'->>'shown','true')<>'false'")
  echo "| $K | $N | $ON |"
done
for F in $(q "select id from task_fields where retired_at is null order by position"); do
  N=$(q "select name_en from task_fields where id='$F'")
  V=$(q "select count(*) from task_field_values where field_id='$F'")
  ON=$(q "select coalesce(string_agg(s.name, ', ' order by s.sort_order), '') from team_spaces s, task_fields f where f.id='$F' and s.archived_at is null and coalesce(s.settings->'fields'->'$F'->>'shown', case when f.options->>'default_on'='false' then 'false' else 'true' end)<>'false'")
  echo "| $N | $V | $ON |"
done
echo
echo "## Totals (before)"
echo
for T in tasks task_field_values sheet_columns sheet_values content_rows task_tags task_attachments; do echo "- $T: $(q "select count(*) from $T")"; done
