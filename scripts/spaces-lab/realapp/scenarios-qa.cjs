// QA 26 Nov 2026 (F31): checks for the release fixes in the running app. The pure rules are in
// scripts/spaces-lab/qa-fixes.lab.ts (npm run lab:qa).
module.exports = (EMAIL, psql, ok) => {
  const rnd = () => String(Math.floor(1e5 + Math.random() * 9e5))
  const first = sql => psql(sql).split(/\n/)[0]
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const who = key => psql(`select id from members where email='${EMAIL[key]}'`)
  const BASE = process.env.BASE ?? 'http://localhost:3100'
  const task = (name, o = {}) => {
    const id = first(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at)
      select gen_random_uuid(), $$${name}$$, (select id from brands order by name limit 1), 'Post', m.id, m.id, m.role, true, '${o.status ?? 'c-prog'}', now(), 'Medium', now()
      from members m where m.email='${EMAIL[o.owner ?? 'admin']}' returning id`)
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space(o.space ?? 'content')}', 'manual') on conflict do nothing`)
    psql(`insert into task_assignees (task_id, member_id, position) values ('${id}', '${who(o.owner ?? 'admin')}', 0) on conflict do nothing`)
    return id
  }
  const drop = ids => psql(`delete from tasks where id in ('${ids.filter(Boolean).join("','")}')`)

  return [
    {
      // F01: nobody who isn't an admin is left without a Space after the release.
      id: 'qa-every-member-has-a-space', as: 'admin',
      async run() {
        const n = psql(`select count(*) from members m where m.access <> 'admin' and not exists (select 1 from team_space_members s where s.member_id=m.id)`)
        ok(n === '0', `members without a Space: ${n}`)
      },
    },
    {
      // F04: a task added in a Space's brand folder gets that brand.
      id: 'qa-folder-new-task-gets-its-brand', as: 'admin',
      async run({ page, go }) {
        const b = psql(`select id from brands order by name desc limit 1`), name = `Lab folder brand ${rnd()}`
        try {
          await go(`/spaces/content/${b}?view=board`)
          await page.getByRole('button', { name: /^(Add task|New task|New post|New design|New clip)$/ }).first().click()
          await page.fill('input[placeholder="Task name — or paste a list"]', name)
          await page.locator('button', { hasText: /^Create Task$/i }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select brand_id from tasks where name='${name}'`) === b, 'the task has the folder\'s brand')
        } finally { psql(`delete from tasks where name='${name}'`) }
      },
    },
    {
      // F06: a user's stage menu stops at the next approval stage.
      id: 'qa-user-cannot-skip-approval', as: 'content',
      async run({ page, go }) {
        const t = task(`Lab approvals ${rnd()}`, { owner: 'content', status: 'c-prog' })
        try {
          await go(`/spaces/content?view=board&task=${t}`)
          await page.locator('button[aria-label^="Stage:"]').first().click()
          const list = '[role="listbox"][aria-label="Move to a stage"]'
          await page.waitForSelector(list)
          const blocked = await page.$$eval(`${list} [data-stage-blocked]`, els => els.length)
          const open = await page.$$eval(`${list} [role="option"]:not([data-stage-blocked])`, els => els.length)
          ok(blocked > 0, `stages past the next approval are greyed (${blocked})`)
          ok(open > 0, 'earlier stages and the next one stay open')
        } finally { drop([t]) }
      },
    },
    {
      // F10: a sixth wrong password for one address in 15 minutes is refused with a wait.
      id: 'qa-login-limit', as: 'admin',
      async run({ page }) {
        const email = `lab-limit-${rnd()}@example.test`, ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`
        const codes = []
        for (let i = 0; i < 6; i++) {
          const r = await page.request.post(`${BASE}/api/login`, { data: { email, password: 'wrong' }, headers: { 'x-forwarded-for': ip } })
          codes.push(r.status())
        }
        ok(codes.slice(0, 5).every(c => c === 401), `the first five are wrong passwords: ${codes}`)
        ok(codes[5] === 429, `the sixth must wait: ${codes[5]}`)
      },
    },
    {
      // F07/F09: an edit made offline waits, says so, and saves when the connection is back.
      id: 'qa-offline-edit-saves-later', as: 'admin',
      async run({ page, go }) {
        const t = task(`Lab offline ${rnd()}`)
        try {
          await go('/spaces/content?view=sheet')
          const cell = `[data-cell="k:${t}|title"]`
          await page.waitForSelector(cell, { timeout: 90000 })
          await page.context().setOffline(true)
          await page.dblclick(cell)
          await page.keyboard.press('Control+a')
          await page.keyboard.type(`Lab offline saved ${t.slice(0, 6)}`)
          await page.keyboard.press('Enter')
          await page.waitForTimeout(1500)
          ok(!psql(`select name from tasks where id='${t}'`).includes('saved'), 'nothing reaches the server while offline')
          const said = await page.locator('text=/offline/i').count()
          ok(said > 0, 'the page says the edit will save later')
          await page.context().setOffline(false)
          await page.waitForTimeout(10000)
          ok(psql(`select name from tasks where id='${t}'`).includes('saved'), 'saved once back online')
        } finally { await page.context().setOffline(false); drop([t]) }
      },
    },
    {
      // F09: an edit made on an older copy doesn't overwrite what someone else saved meanwhile.
      id: 'qa-edit-does-not-overwrite-a-newer-change', as: 'admin',
      async run({ page, go }) {
        const t = task(`Lab conflict ${rnd()}`)
        try {
          await go('/spaces/content?view=sheet')
          const cell = `[data-cell="k:${t}|title"]`
          await page.waitForSelector(cell, { timeout: 90000 })
          // Someone else renames it after this page loaded.
          psql(`update tasks set name='Lab conflict theirs', updated_at=now() + interval '1 second' where id='${t}'`)
          await page.dblclick(cell)
          await page.keyboard.press('Control+a')
          await page.keyboard.type('Lab conflict mine')
          await page.keyboard.press('Enter')
          await page.waitForTimeout(3000)
          ok(psql(`select name from tasks where id='${t}'`) === 'Lab conflict theirs', 'their change stays')
          ok(await page.locator('text=/Someone changed this/').count() > 0, 'the page says why the edit was not saved')
        } finally { drop([t]) }
      },
    },
    {
      // F29: a spreadsheet tab that uses the Link task column offers Make task on titled rows with no task.
      id: 'qa-make-task-on-spreadsheet-rows', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), folder = psql(`select id from sheet_folders where kind='content'`)
        const sheet = first(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Lab link ${n}', 92, 4, 3) returning id`)
        const plainSheet = first(`insert into sheets (id, folder_id, kind, name, position, row_count, col_count) values (gen_random_uuid(), '${folder}', 'blank', 'Lab plain ${n}', 93, 3, 2) returning id`)
        try {
          const rows = psql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 4) g returning id`).split(/\n/)
          const cols = psql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${sheet}', g from generate_series(1, 3) g returning id`).split(/\n/)
          const cell = (r, c, v) => psql(`insert into sheet_cells (sheet_id, row_id, col_id, value) values ('${sheet}', '${r}', '${c}', $$${v}$$)`)
          cell(rows[0], cols[0], 'Title'); cell(rows[0], cols[1], 'Task'); cell(rows[0], cols[2], 'Notes')
          cell(rows[1], cols[0], `Lab spreadsheet row ${n}`)
          cell(rows[2], cols[2], 'only a note')
          psql(`update sheets set task_map='${JSON.stringify({ taskCol: cols[1], fields: { [cols[0]]: 'title' } })}' where id='${sheet}'`)
          const prow = psql(`insert into sheet_rows (id, sheet_id, position) select gen_random_uuid(), '${plainSheet}', g from generate_series(1, 3) g returning id`).split(/\n/)
          const pcol = psql(`insert into sheet_cols (id, sheet_id, position) select gen_random_uuid(), '${plainSheet}', g from generate_series(1, 2) g returning id`).split(/\n/)
          psql(`insert into sheet_cells (sheet_id, row_id, col_id, value) values ('${plainSheet}', '${prow[1]}', '${pcol[0]}', 'Lab plain row ${n}')`)
          await go(`/spaces/content?view=sheet&tab=${sheet}`)
          await page.waitForSelector(`[data-blank-sheet="${sheet}"]`, { timeout: 60000 })
          await page.waitForTimeout(2000)
          ok(!!(await page.$(`[data-create-task="${rows[1]}"]`)), 'a titled row with no task offers Make task')
          ok(!(await page.$(`[data-create-task="${rows[2]}"]`)), 'a row with no title does not')
          await go(`/spaces/content?view=sheet&tab=${plainSheet}`)
          await page.waitForSelector(`[data-blank-sheet="${plainSheet}"]`, { timeout: 60000 })
          await page.waitForTimeout(1500)
          ok(!(await page.$('[data-create-task]')), 'a tab without the Link task column offers none')
        } finally { psql(`delete from sheets where id in ('${sheet}', '${plainSheet}')`) }
      },
    },
    {
      // Owner, 26 Nov 2026: brands missing on video tasks are set from the Video Space's Sheet (Brand column).
      id: 'qa-set-brand-from-video-sheet', as: 'admin',
      async run({ page, go }) {
        const t = first(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at)
          select gen_random_uuid(), 'Lab brandless video ${rnd()}', null, 'Video', m.id, m.id, m.role, true, 'r-design', now(), 'Medium', now() from members m where m.id='${who('admin')}' returning id`)
        psql(`insert into task_spaces (task_id, space_id, added_via) values ('${t}', '${space('video')}', 'manual') on conflict do nothing`)
        const want = psql(`select id || '|' || name from brands order by name desc limit 1`).split('|')
        try {
          await go('/spaces/video?view=sheet')
          await page.waitForSelector('[data-add-field]', { timeout: 60000 })
          if (!(await page.$('[data-col-head="brand"], [data-brand-cell]'))) {
            await page.click('[data-add-field]')
            await page.waitForSelector('[data-add-section="standard"] [data-add-item="brand"] [data-add-do]', { timeout: 20000 })
            await page.click('[data-add-section="standard"] [data-add-item="brand"] [data-add-do]')
            await page.waitForTimeout(1500)
            await page.keyboard.press('Escape')
          }
          const cell = `[data-cell="k:${t}|brand"]`
          await page.waitForSelector(cell, { timeout: 60000 })
          await page.click(cell)
          const opts = page.locator('[role="option"], [role="menuitemradio"], [role="menuitem"]')
          await opts.first().waitFor({ timeout: 10000 })
          ok(await opts.filter({ hasText: 'No brand' }).count() === 1, 'the Brand cell opens a list of brands, with No brand')
          await opts.filter({ hasText: want[1] }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select coalesce(brand_id::text, '-') from tasks where id='${t}'`) === want[0], `the task now has the brand ${want[1]}`)
        } finally { drop([t]) }
      },
    },
    {
      // Owner, 26 Nov 2026: many rows at once — select them, then Brand in the bar at the bottom.
      id: 'qa-set-brand-on-many-rows', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const mk = i => {
          const id = first(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at)
            select gen_random_uuid(), 'Lab bulk brand ${n} ${i}', null, 'Video', m.id, m.id, m.role, true, 'r-design', now(), 'Medium', now() from members m where m.id='${who('admin')}' returning id`)
          psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('video')}', 'manual') on conflict do nothing`)
          return id
        }
        const ids = [mk(1), mk(2), mk(3)]
        const want = psql(`select id || '|' || name from brands order by name desc limit 1`).split('|')
        try {
          await go('/spaces/video?view=sheet')
          await page.waitForSelector(`[data-cell="k:${ids[0]}|title"]`, { timeout: 60000 })
          await page.click(`[data-cell="k:${ids[0]}|title"]`)
          await page.click(`[data-cell="k:${ids[2]}|title"]`, { modifiers: ['Shift'] })
          await page.waitForSelector('[data-bulk-bar] [data-bulk="brand"]', { timeout: 10000 })
          await page.click('[data-bulk-bar] [data-bulk="brand"]')
          await page.locator('[data-bulk-bar] button, [data-bulk-bar] [role="menuitem"]').filter({ hasText: want[1] }).first().click()
          await page.waitForTimeout(3000)
          const set = psql(`select count(*) from tasks where id in ('${ids.join("','")}') and brand_id='${want[0]}'`)
          ok(set === '3', `all three rows now have ${want[1]}: ${set}`)
        } finally { drop(ids) }
      },
    },
  ]
}
