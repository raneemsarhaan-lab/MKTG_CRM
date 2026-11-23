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
          await go('/spaces/planning?view=sheet')
          const cell = `[data-task-sheet] [data-cell$="${t}|publish"]`
          await page.waitForSelector(cell, { timeout: 60000 })
          const sheet = psql(`select id from sheets where linked_key='tasks:space:${space('planning')}'`)
          ok(!!sheet, 'the Space sheet exists')
          psql(`insert into sheet_formats (sheet_id, row_key, col_key, style) values ('${sheet}', '${t}', 'publish', '{"num":{"kind":"date","pattern":"ddd d mmm yyyy"}}') on conflict (sheet_id, row_key, col_key) do update set style=excluded.style`)
          await go('/spaces/planning?view=sheet')
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
          await go('/spaces/planning?view=sheet')
          const cellA = `[data-task-sheet] [data-cell$="${a}|title"]`, cellB = `[data-task-sheet] [data-cell$="${b}|title"]`
          await page.waitForSelector(cellA, { timeout: 60000 })
          const sheet = psql(`select id from sheets where linked_key='tasks:space:${space('planning')}'`)
          psql(`insert into sheet_comments (id, sheet_id, row_key, col_key, author_id, body) select gen_random_uuid(), '${sheet}', '${a}', 'title', id, 'Check the hook' from members where email='${EMAIL.admin}'`)
          await go('/spaces/planning?view=sheet')
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
  ]
}
