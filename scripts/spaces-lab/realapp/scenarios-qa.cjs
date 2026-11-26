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
    {
      // QF-02: typing a new type and pressing Enter never adds it; the "+ name" row adds it when clicked.
      id: 'qa-typed-type-is-not-added', as: 'admin',
      async run({ page, go }) {
        const t = task(`Lab type typo ${rnd()}`), name = `Zz Lab Type ${rnd()}`
        try {
          await go('/spaces/content?view=sheet')
          const c = await page.waitForSelector(`[data-cell="k:${t}|type"]`, { timeout: 90000 })
          await c.click(); await page.keyboard.type(name); await page.keyboard.press('Enter'); await page.waitForTimeout(1500)
          ok(psql(`select count(*) from content_types where label='${name}'`) === '0', 'Enter did not add the type')
          ok(await page.locator('[data-combo-add]', { hasText: `+ ${name}` }).count() === 1, 'the list offers "+ name" to an admin')
          await page.click('[data-combo-add]'); await page.waitForTimeout(2000)
          ok(psql(`select count(*) from content_types where label='${name}'`) === '1', 'clicking "+ name" adds it')
          ok(psql(`select content_type_label from tasks where id='${t}'`) === name, 'and sets it on the task')
        } finally { drop([t]); psql(`delete from content_types where label='${name}'`) }
      },
    },
    {
      // QF-12: the panel shows Theme and Pillar; Pillar lists only the theme's pillars.
      id: 'qa-panel-theme-and-pillar', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const th = first(`insert into projects (id, name, standing, is_theme) values (gen_random_uuid(), 'Lab panel theme ${n}', true, true) returning id`)
        psql(`insert into content_themes (id, project_id, space_id, position) values (gen_random_uuid(), '${th}', '${space('content')}', -3)`)
        const p1 = first(`insert into content_pillars (id, project_id, name, sort_order) values (gen_random_uuid(), '${th}', 'Lab P1 ${n}', 0) returning id`)
        const p2 = first(`insert into content_pillars (id, project_id, name, sort_order) values (gen_random_uuid(), '${th}', 'Lab P2 ${n}', 1) returning id`)
        const t = task(`Lab pillar task ${n}`); psql(`update tasks set project_id='${th}', pillar_id='${p1}' where id='${t}'`)
        try {
          await go(`/spaces/content?view=board&task=${t}`)
          await page.waitForSelector('[role="dialog"]'); await page.waitForTimeout(800)
          const txt = await page.innerText('[role="dialog"]')
          ok(/Theme/.test(txt) && !/\bProject\b/.test(txt), 'Theme, not "Project"')
          ok(txt.includes(`Lab P1 ${n}`), 'the pillar shows')
          const sel = page.locator('[role="dialog"] select[aria-label="Pillar"]')
          if (!(await sel.count())) await page.locator('[role="dialog"]').getByText(`Lab P1 ${n}`).first().click()
          const opts = await page.locator('[role="dialog"] select[aria-label="Pillar"] option').allTextContents()
          ok(opts.includes(`Lab P2 ${n}`) && opts.length === 3, `only the theme's pillars (and No pillar): ${opts.join(', ')}`)
          await page.selectOption('[role="dialog"] select[aria-label="Pillar"]', p2); await page.waitForTimeout(2000)
          ok(psql(`select pillar_id from tasks where id='${t}'`) === p2, 'changing it saves')
        } finally { drop([t]); psql(`delete from projects where id='${th}'`) }
      },
    },
    {
      // QF-13: Owner, Theme and Channels filter the board.
      id: 'qa-filters-owner-theme-channels', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const th = first(`insert into projects (id, name, standing, is_theme) values (gen_random_uuid(), 'Lab filter theme ${n}', true, true) returning id`)
        const a = task(`Lab filter in theme ${n}`), b = task(`Lab filter other ${n}`)
        psql(`update tasks set project_id='${th}' where id='${a}'`)
        const ch = psql(`select id from task_fields where name_en='Channels'`)
        if (ch) psql(`insert into task_field_values (task_id, field_id, value, updated_at) values ('${a}', '${ch}', '["instagram"]', now()) on conflict (task_id, field_id) do update set value=excluded.value`)
        try {
          await go('/spaces/content?view=board')
          await page.click('[data-filters]'); await page.waitForTimeout(800)
          ok(await page.$(`[data-filter-theme="${th}"]`) !== null, 'a Theme filter')
          ok((await page.$$('[data-filter-owner]')).length > 0, 'an Owner filter')
          if (ch) ok(await page.$(`[data-filter-field="${ch}:instagram"]`) !== null, 'a Channels filter')
          await page.click(`[data-filter-theme="${th}"]`); await page.waitForTimeout(1200)
          ok(await page.$(`[data-task-card="${a}"]`) !== null && !(await page.$(`[data-task-card="${b}"]`)), 'Theme filter keeps only that theme')
          await page.click(`[data-filter-theme="${th}"]`); await page.waitForTimeout(600)
          if (ch) { await page.click(`[data-filter-field="${ch}:instagram"]`); await page.waitForTimeout(1200); ok(await page.$(`[data-task-card="${a}"]`) !== null && !(await page.$(`[data-task-card="${b}"]`)), 'Channels filter keeps tasks with Instagram') }
        } finally { drop([a, b]); psql(`delete from projects where id='${th}'`) }
      },
    },
    {
      // QF-08: removing an option that tasks use asks first.
      id: 'qa-option-in-use-warning', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const f = first(`insert into task_fields (id, kind, name_en, options, position, switchable) values (gen_random_uuid(), 'choice', 'Lab warn ${n}', '{"choices":[{"id":"o1","en":"Used","color":"#3E7BEA"},{"id":"o2","en":"Free","color":"#D6409F"}]}', 90, true) returning id`)
        const t = task(`Lab warn task ${n}`)
        psql(`insert into task_field_values (task_id, field_id, value, updated_at) values ('${t}', '${f}', '"o1"', now())`)
        try {
          await go('/task-types'); await page.click('[data-types-tab="fields"]')
          await page.locator(`[data-field-row="Lab warn ${n}"] [data-field-edit]`).click()
          await page.click('[data-choice-remove="o2"]'); await page.waitForTimeout(400)
          ok(!(await page.$('[data-choice-in-use]')), 'an unused option goes without asking')
          await page.click('[data-choice-remove="o1"]'); await page.waitForTimeout(800)
          const w = await page.innerText('[data-choice-in-use="o1"]').catch(() => '')
          ok(/1 task uses/.test(w), `it says how many tasks use it: ${w}`)
          ok(await page.$('[data-choice-remove="o1"]') !== null, 'the option is still there until confirmed')
        } finally { drop([t]); psql(`delete from task_fields where id='${f}'`) }
      },
    },
    {
      // QF-11: Paste plan keeps Type and Status (Arabic names too) and flags an unknown type.
      id: 'qa-paste-plan-keeps-type-and-status', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const th = first(`insert into projects (id, name, standing, is_theme) values (gen_random_uuid(), 'Lab paste ${n}', true, true) returning id`)
        psql(`insert into content_themes (id, project_id, space_id, position) values (gen_random_uuid(), '${th}', '${space('content')}', -4)`)
        try {
          await go('/spaces/content?view=sheet')
          const h = await page.waitForSelector(`[data-cell="t:${th}|title"]`, { timeout: 90000 })
          await h.click(); await page.keyboard.press('Escape')
          await page.evaluate(text => { const dt = new DataTransfer(); dt.setData('text/plain', text); document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) },
            `Title\tType\tStatus\nLab paste one ${n}\tReel\tمراجعة المحتوى\nLab paste two ${n}\tZzNotAType\tWriting`)
          await page.waitForSelector('[data-plan-preview]', { timeout: 10000 })
          const prev = await page.innerText('[data-plan-preview]')
          ok(/Unknown type “ZzNotAType”/.test(prev), 'the unknown type is flagged')
          await page.click('[data-plan-add]'); await page.waitForTimeout(3500)
          ok(psql(`select values::text from content_rows where title='Lab paste one ${n}'`).replace(/\s/g, '') === '{"type":"Reel","status":"c-final"}', `Type and the Arabic status kept: ${psql(`select values::text from content_rows where title='Lab paste one ${n}'`)}`)
          ok(!psql(`select values::text from content_rows where title='Lab paste two ${n}'`).includes('ZzNotAType'), 'the unknown type is left out')
          ok(psql(`select count(*) from content_types where label='ZzNotAType'`) === '0', 'and never added')
        } finally { psql(`delete from content_rows where project_id='${th}'`); psql(`delete from projects where id='${th}'`) }
      },
    },
    {
      // QF-14, QF-15: the task panel in Arabic.
      id: 'qa-arabic-panel-labels', as: 'admin',
      async run({ page, go, BASE }) {
        const t = task(`Lab arabic panel ${rnd()}`)
        try {
          await page.context().addCookies([{ name: 'fluxo-locale', value: 'ar', url: BASE }])
          await go(`/spaces/content?view=board&task=${t}`)
          await page.waitForSelector('[role="dialog"]'); await page.waitForTimeout(900)
          const txt = await page.innerText('[role="dialog"]')
          const english = ['Status', 'Priority', 'Pipeline', 'Time estimate', 'Activity', 'Empty', '9-stage', '8-stage'].filter(w => new RegExp(`\\b${w}\\b`).test(txt))
          ok(!english.length, `no English labels left: ${english.join(', ')}`)
          ok(/مرحلة/.test(txt), 'the pipeline says how many stages')
        } finally { await page.context().addCookies([{ name: 'fluxo-locale', value: 'en', url: BASE }]); drop([t]) }
      },
    },
    {
      // QF-10: a Number column in the Space sheet takes Arabic digits and refuses letters.
      id: 'qa-sheet-number-arabic-digits', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const f = first(`insert into task_fields (id, kind, name_en, name_ar, options, position, switchable) values (gen_random_uuid(), 'number', 'Lab num ${n}', 'رقم ${n}', '{}', 91, true) returning id`)
        psql(`insert into task_type_fields (type_label, field_id, position) values ('Post', '${f}', 91)`)
        const t = task(`Lab number ${n}`)
        const val = () => psql(`select coalesce((select value::text from task_field_values where task_id='${t}' and field_id='${f}'),'-')`)
        try {
          await go('/spaces/content?view=sheet')
          await page.waitForSelector('[data-add-field]', { timeout: 60000 })
          await page.click('[data-add-field]'); await page.waitForTimeout(600)
          await page.click(`[data-add-item="f:${f}"] [data-add-do]`).catch(() => {}); await page.waitForTimeout(1200); await page.keyboard.press('Escape')
          for (const [text, want] of [['٤٢', '42'], ['abc12', '42'], ['1,5', '1.5']]) {
            const c = await page.waitForSelector(`[data-cell="k:${t}|f:${f}"]`, { timeout: 60000 })
            // Open the cell first: the test browser inserts Arabic digits without key presses, which a real keyboard sends.
            await c.click(); await page.keyboard.press('Enter'); await page.keyboard.press('Control+a'); await page.keyboard.type(text); await page.keyboard.press('Enter'); await page.waitForTimeout(2000); await page.keyboard.press('Escape')
            ok(val() === want, `${text} → ${val()} (want ${want})`)
          }
        } finally { drop([t]); psql(`delete from task_fields where id='${f}'`) }
      },
    },
    {
      // A Checkbox column reads typed yes/no words; anything else is refused.
      id: 'qa-sheet-checkbox-typed-words', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const f = first(`insert into task_fields (id, kind, name_en, options, position, switchable) values (gen_random_uuid(), 'checkbox', 'Lab check ${n}', '{}', 92, true) returning id`)
        psql(`insert into task_type_fields (type_label, field_id, position) values ('Post', '${f}', 92)`)
        const t = task(`Lab checkbox ${n}`)
        const val = () => psql(`select coalesce((select value::text from task_field_values where task_id='${t}' and field_id='${f}'),'-')`)
        try {
          await go('/spaces/content?view=sheet')
          await page.waitForSelector('[data-add-field]', { timeout: 60000 })
          await page.click('[data-add-field]'); await page.waitForTimeout(600)
          await page.click(`[data-add-item="f:${f}"] [data-add-do]`).catch(() => {}); await page.waitForTimeout(1200); await page.keyboard.press('Escape')
          // A click on a checkbox cell toggles it (by design); typing then sets the value from the word.
          for (const [text, want] of [['yes', 'true'], ['no', 'false']]) {
            const c = await page.waitForSelector(`[data-cell="k:${t}|f:${f}"]`, { timeout: 60000 })
            await c.click(); await page.keyboard.type(text); await page.keyboard.press('Enter'); await page.waitForTimeout(2000); await page.keyboard.press('Escape')
            ok(val() === want, `${text} → ${val()} (want ${want})`)
          }
          const c = await page.waitForSelector(`[data-cell="k:${t}|f:${f}"]`, { timeout: 60000 })
          await c.click(); await page.waitForTimeout(1500); const before = val(); await page.keyboard.type('maybe'); await page.keyboard.press('Enter'); await page.waitForTimeout(2000)
          ok(val() === before && /isn't a valid/.test(await page.innerText('body')), 'maybe is refused with a message')
        } finally { drop([t]); psql(`delete from task_fields where id='${f}'`) }
      },
    },
  ]
}
