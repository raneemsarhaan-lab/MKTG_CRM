// Spec 015 follow-ups (user, 2026-11-23): number formats show on task sheets.
module.exports = (EMAIL, psql, ok) => {
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  return [
    {
      id: '015-number-format-shows-on-task-sheet', as: 'admin',
      async run({ page, go }) {
        const t = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at,publish_date)
          select gen_random_uuid(), 'Lab 015 format ' || floor(random()*1e6)::text, (select id from brands order by name limit 1), 'Post',
            m.id, m.id, m.role, true, 'c-prog', now(), 'Medium', now(), '2026-11-23' from members m where m.email='${EMAIL.admin}' returning id`).split(/\n/)[0]
        psql(`insert into task_spaces (task_id, space_id, added_via) values ('${t}', '${space('planning')}', 'manual') on conflict do nothing`)
        try {
          await go(`/brands/${psql('select id from brands order by name limit 1')}?view=sheet&sheet=tasks`)
          const cell = `[data-task-sheet] [data-cell$="${t}|publish"]`
          await page.waitForSelector(cell, { timeout: 60000 })
          const sheet = psql(`select id from sheets where linked_key='tasks:brand:${psql('select id from brands order by name limit 1')}'`)
          ok(!!sheet, 'the Space sheet exists')
          psql(`insert into sheet_formats (sheet_id, row_key, col_key, style) values ('${sheet}', '${t}', 'publish', '{"num":{"kind":"date","pattern":"ddd d mmm yyyy"}}') on conflict (sheet_id, row_key, col_key) do update set style=excluded.style`)
          await go(`/brands/${psql('select id from brands order by name limit 1')}?view=sheet&sheet=tasks`)
          await page.waitForSelector(`${cell} [data-num-shown]`, { timeout: 30000 })
          const text = (await page.textContent(`${cell} [data-num-shown]`))?.trim()
          ok(text === 'Mon 23 Nov 2026', `the date pattern shows: ${text}`)
        } finally {
          psql(`delete from sheet_formats where row_key='${t}'`)
          psql(`update tasks set dropped_at=now() where id='${t}'`)
        }
      },
    },
    {
      id: '015-paste-special-carries-comments', as: 'admin',
      async run({ page, go, BASE }) {
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
        const mk = name => psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at)
          select gen_random_uuid(), '${name}', (select id from brands order by name limit 1), 'Post',
            m.id, m.id, m.role, true, 'c-prog', now(), 'Medium', now() from members m where m.email='${EMAIL.admin}' returning id`).split(/\n/)[0]
        const n = Math.floor(Math.random() * 1e6)
        const a = mk(`Lab 015 A ${n}`), b = mk(`Lab 015 B ${n}`)
        for (const t of [a, b]) psql(`insert into task_spaces (task_id, space_id, added_via) values ('${t}', '${space('planning')}', 'manual') on conflict do nothing`)
        try {
          await go(`/brands/${psql('select id from brands order by name limit 1')}?view=sheet&sheet=tasks`)
          const cellA = `[data-task-sheet] [data-cell$="${a}|title"]`, cellB = `[data-task-sheet] [data-cell$="${b}|title"]`
          await page.waitForSelector(cellA, { timeout: 60000 })
          const sheet = psql(`select id from sheets where linked_key='tasks:brand:${psql('select id from brands order by name limit 1')}'`)
          psql(`insert into sheet_comments (id, sheet_id, row_key, col_key, author_id, body) select gen_random_uuid(), '${sheet}', '${a}', 'title', id, 'Check the hook' from members where email='${EMAIL.admin}'`)
          await go(`/brands/${psql('select id from brands order by name limit 1')}?view=sheet&sheet=tasks`)
          await page.waitForSelector(cellA, { timeout: 60000 })
          await page.locator(cellA).click()
          await page.keyboard.press('Control+c')
          await page.waitForTimeout(400)
          await page.locator(cellB).click()
          await page.keyboard.press('Control+Alt+v')
          await page.waitForSelector('[data-paste-special]', { timeout: 10000 })
          await page.click('[data-ps="comments"]')
          await page.click('[data-paste-special] [data-ok]')
          await page.waitForTimeout(2500)
          ok(psql(`select count(*) from sheet_comments where sheet_id='${sheet}' and row_key='${b}' and col_key='title' and body='Check the hook' and deleted_at is null`) === '1', 'the thread was copied to the pasted cell')
          ok(psql(`select name from tasks where id='${b}'`) === `Lab 015 B ${n}`, 'Comments only leaves the value alone')
        } finally {
          psql(`delete from sheet_comments where row_key in ('${a}','${b}')`)
          psql(`update tasks set dropped_at=now() where id in ('${a}','${b}')`)
        }
      },
    },
    {
      id: '015-comment-undo-and-redo', as: 'admin',
      async run({ page, go }) {
        const t = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at)
          select gen_random_uuid(), 'Lab 015 undo ' || floor(random()*1e6)::text, (select id from brands order by name limit 1), 'Post',
            m.id, m.id, m.role, true, 'c-prog', now(), 'Medium', now() from members m where m.email='${EMAIL.admin}' returning id`).split(/\n/)[0]
        psql(`insert into task_spaces (task_id, space_id, added_via) values ('${t}', '${space('planning')}', 'manual') on conflict do nothing`)
        const live = () => psql(`select count(*) from sheet_comments where row_key='${t}' and col_key='title' and deleted_at is null`)
        try {
          await go(`/brands/${psql('select id from brands order by name limit 1')}?view=sheet&sheet=tasks`)
          const cell = `[data-task-sheet] [data-cell$="${t}|title"]`
          await page.waitForSelector(cell, { timeout: 60000 })
          await page.locator(cell).click()
          await page.keyboard.press('Control+Alt+m')
          await page.waitForSelector('[data-cmt-input]', { timeout: 10000 })
          await page.fill('[data-cmt-input]', 'Undo me')
          await page.click('[data-cmt-send]')
          await page.waitForTimeout(2000)
          ok(live() === '1', 'the comment was added')
          await page.keyboard.press('Escape')
          await page.locator(cell).click()
          await page.keyboard.press('Control+z')
          await page.waitForTimeout(2500)
          ok(live() === '0', 'Ctrl+Z removes it')
          await page.keyboard.press('Control+y')
          await page.waitForTimeout(2500)
          ok(live() === '1', 'Ctrl+Y brings it back')
        } finally {
          psql(`delete from sheet_comments where row_key='${t}'`)
          psql(`update tasks set dropped_at=now() where id='${t}'`)
        }
      },
    },
    {
      id: '015-comment-undo-on-blank-sheet', as: 'admin',
      async run({ page, go }) {
        const folder = psql(`insert into sheet_folders (id, kind, name) values (gen_random_uuid(), 'team', 'Lab 015 ' || floor(random()*1e6)) returning id`).split(/\n/)[0]
        const sheet = psql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Undo', 0, 5, 5) returning id`).split(/\n/)[0]
        psql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 5) g`)
        psql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 5) g`)
        const live = () => psql(`select count(*) from sheet_comments where sheet_id='${sheet}' and deleted_at is null`)
        try {
          await go(`/sheets/${folder}?sheet=${sheet}`)
          const first = page.locator(`[data-blank-sheet="${sheet}"] .fx-sheet-tr[data-row]`).nth(0).locator('.fx-sheet-td').nth(1)
          await first.waitFor({ timeout: 60000 })
          await first.click()
          await page.keyboard.press('Control+Alt+m')
          await page.waitForSelector('[data-cmt-input]', { timeout: 10000 })
          await page.fill('[data-cmt-input]', 'Undo me too')
          await page.click('[data-cmt-send]')
          await page.waitForTimeout(2000)
          ok(live() === '1', 'the comment was added')
          await page.keyboard.press('Escape')
          await first.click()
          await page.keyboard.press('Control+z')
          await page.waitForTimeout(2500)
          ok(live() === '0', 'Ctrl+Z removes it')
          await page.keyboard.press('Control+y')
          await page.waitForTimeout(2500)
          ok(live() === '1', 'Ctrl+Y brings it back')
        } finally {
          psql(`delete from sheet_folders where id='${folder}'`)
        }
      },
    },
    {
      id: '015-merge-shrinks-when-edge-row-deleted', as: 'admin',
      async run({ page, go }) {
        const folder = psql(`insert into sheet_folders (id, kind, name) values (gen_random_uuid(), 'team', 'Lab 015 merge ' || floor(random()*1e6)) returning id`).split(/\n/)[0]
        const sheet = psql(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Merge', 0, 6, 4) returning id`).split(/\n/)[0]
        psql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 6) g`)
        psql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 4) g`)
        const row = n => psql(`select id from sheet_rows where sheet_id='${sheet}' and position=${n}`)
        const col = n => psql(`select id from sheet_cols where sheet_id='${sheet}' and position=${n}`)
        // A1:B3 merged.
        psql(`insert into sheet_merges (id, sheet_id, top_row, bottom_row, left_col, right_col) values (gen_random_uuid(), '${sheet}', '${row(1)}', '${row(3)}', '${col(1)}', '${col(2)}')`)
        try {
          await go(`/sheets/${folder}?sheet=${sheet}`)
          const first = page.locator(`[data-blank-sheet="${sheet}"] .fx-sheet-tr[data-row]`).nth(0).locator('.fx-sheet-td').nth(1)
          await first.waitFor({ timeout: 60000 })
          await first.click({ button: 'right' })
          await page.click('[data-item="deleteRow"]')
          await page.waitForTimeout(3000)
          const m = psql(`select (select position from sheet_rows where id=top_row)||'-'||(select position from sheet_rows where id=bottom_row)||'|'||(select position from sheet_cols where id=left_col)||'-'||(select position from sheet_cols where id=right_col) from sheet_merges where sheet_id='${sheet}'`)
          ok(!!m && m.endsWith('|1-2'), `the merge is still there, two columns wide: ${m}`)
          ok(psql(`select count(*) from sheet_merges where sheet_id='${sheet}'`) === '1', 'one merge')
          ok(psql(`select count(*) from sheet_rows r join sheet_merges g on g.top_row=r.id where g.sheet_id='${sheet}'`) === '1', 'its top is a live row')
        } finally {
          psql(`delete from sheet_folders where id='${folder}'`)
        }
      },
    },
  ]
}
