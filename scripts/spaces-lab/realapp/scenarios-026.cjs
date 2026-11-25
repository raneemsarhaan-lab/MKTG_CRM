// Spec 026: one sheet per Space — plain and linked rows, Make task, unlink, child rows, and where sheets live.
module.exports = (EMAIL, psql, ok) => {
  const rnd = () => String(Math.floor(1e5 + Math.random() * 9e5))
  const first = sql => psql(sql).split(/\n/)[0]
  const who = k => psql(`select id from members where email='${EMAIL[k]}'`)
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const brand = () => first(`select id from brands order by name limit 1`)
  const f = name => psql(`select id from task_fields where name_en='${name}' and retired_at is null`)
  const theme = (name, spaceKey, pos = -10) => {
    const id = first(`insert into projects (id, name, standing, is_theme, owner_id, brand_id) values (gen_random_uuid(), '${name}', true, true, '${who('admin')}', '${brand()}') returning id`)
    psql(`insert into content_themes (id, project_id, space_id, position) values (gen_random_uuid(), '${id}', '${space(spaceKey)}', ${pos})`)
    return id
  }
  const pillar = (projectId, name, i = 0) => first(`insert into content_pillars (id, project_id, name, sort_order) values (gen_random_uuid(), '${projectId}', '${name}', ${i}) returning id`)
  const row = (projectId, spaceKey, title, o = {}) => first(`insert into content_rows (id, project_id, space_id, pillar_id, parent_id, position, title, task_id, values, created_by, updated_at)
    values (gen_random_uuid(), '${projectId}', '${space(spaceKey)}', ${o.pillar ? `'${o.pillar}'` : 'null'}, ${o.parent ? `'${o.parent}'` : 'null'}, ${o.pos ?? 1}, '${title}', ${o.task ? `'${o.task}'` : 'null'}, '${JSON.stringify(o.values ?? {})}'::jsonb, '${who('admin')}', now()) returning id`)
  const cleanup = ids => {
    for (const id of ids) {
      psql(`delete from tasks where project_id='${id}' and parent_task_id is not null`)
      psql(`delete from tasks where project_id='${id}'`)
      psql(`delete from content_rows where project_id='${id}'`)
      psql(`delete from content_themes where project_id='${id}'`)
      psql(`delete from projects where id='${id}'`)
    }
  }
  const openSheet = async (page, go, key, themeId) => {
    await go(`/spaces/${key}?view=sheet`)
    await page.waitForSelector(`[data-row="t:${themeId}"]`, { timeout: 90000 })
  }
  const makeTask = async (page, rowId, spaceKey) => {
    await page.click(`[data-make-task="${rowId}"]`)
    await page.waitForSelector('[data-make-task-dialog]')
    if (spaceKey) await page.selectOption('[data-make-space]', space(spaceKey))
    await page.click('[data-make-task-go]')
    await page.waitForFunction(() => !document.querySelector('[data-make-task-dialog]'), null, { timeout: 30000 })
    await page.waitForTimeout(1500)
  }

  return [
    {
      id: '026-make-task-in-a-chosen-space-with-the-row-values', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const th = theme(`Lab sheet theme ${n}`, 'content')
        const pl = pillar(th, `Lab pillar ${n}`)
        // A plain row with a date, a Caption (a task field) and a stage label.
        const r = row(th, 'content', `Lab plain row ${n}`, { pillar: pl, values: { [`f:${f('Caption')}`]: 'Hello from the row', status: 'c-prog' } })
        psql(`update content_rows set date='2026-12-20' where id='${r}'`)
        try {
          await openSheet(page, go, 'content', th)
          ok(await page.isVisible(`[data-make-task="${r}"]`), 'a plain row\'s Task cell says Make task')
          ok(psql(`select count(*) from tasks where project_id='${th}'`) === '0', 'a plain row is not a task')
          await makeTask(page, r, 'design')
          const t = psql(`select task_id from content_rows where id='${r}'`)
          ok(!!t, 'the row is linked')
          ok(psql(`select name || '|' || status || '|' || coalesce(media_board,'') || '|' || to_char(publish_date,'YYYY-MM-DD') || '|' || (brand_id='${brand()}')::text || '|' || (pillar_id='${pl}')::text from tasks where id='${t}'`)
            === `Lab plain row ${n}|r-design|design|2026-12-20|true|true`, 'the task is in the Design Space, at its start, with the row\'s title, date, brand, theme and pillar')
          ok(psql(`select count(*) from task_spaces where task_id='${t}' and space_id='${space('design')}'`) === '1', 'it shows in the chosen Space')
          ok(psql(`select value #>> '{}' from task_field_values where task_id='${t}' and field_id='${f('Caption')}'`) === 'Hello from the row', 'the row\'s Caption went to the task')
          ok(psql(`select values::text from content_rows where id='${r}'`) === '{}', 'the row no longer keeps its own copy')
          // The Task cell: the task's name as a link, its Space and its stage.
          await page.waitForSelector(`[data-task-cell="${t}"]`, { timeout: 30000 })
          const cell = await page.textContent(`[data-task-cell="${t}"]`)
          ok(cell.includes(`Lab plain row ${n}`) && cell.includes('Design'), `the Task cell names the task and its Space: ${cell}`)
        } finally { cleanup([th]) }
      },
    },
    {
      id: '026-linked-row-and-panel-share-one-caption', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const th = theme(`Lab sheet theme ${n}`, 'content')
        const a = pillar(th, `Lab pillar A ${n}`, 0), b = pillar(th, `Lab pillar B ${n}`, 1)
        const t = first(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at,project_id,pillar_id)
          values (gen_random_uuid(), 'Lab linked ${n}', '${brand()}', 'Post', '${who('admin')}', '${who('admin')}', 'Marketing Manager', true, 'c-prog', now(), 'Normal', now(), '${th}', '${a}') returning id`)
        psql(`insert into task_spaces (task_id, space_id, added_via) values ('${t}', '${space('content')}', 'created')`)
        const r = row(th, 'content', `Lab linked ${n}`, { pillar: a, task: t })
        const cap = f('Caption')
        try {
          await openSheet(page, go, 'content', th)
          // Edit Caption in the sheet → the task has it.
          const cell = `[data-cell="k:${t}|f:${cap}"]`
          await page.waitForSelector(cell, { timeout: 30000 })
          await page.click(cell)
          await page.keyboard.type('Typed in the sheet')
          await page.keyboard.press('Enter')
          await page.waitForTimeout(2000)
          ok(psql(`select value #>> '{}' from task_field_values where task_id='${t}' and field_id='${cap}'`) === 'Typed in the sheet', 'Caption typed in the sheet is the task\'s')
          // Edit Caption on the task → the sheet shows it.
          psql(`update task_field_values set value='"Typed in the panel"' where task_id='${t}' and field_id='${cap}'`)
          await openSheet(page, go, 'content', th)
          await page.waitForSelector(cell, { timeout: 30000 })
          ok((await page.textContent(cell)).includes('Typed in the panel'), 'the task\'s Caption shows in the sheet')
          // Moving the row to another pillar changes the task's pillar.
          await page.click(`[data-cell="k:${t}|pillar"]`)
          await page.locator('[role="menuitem"]', { hasText: `Lab pillar B ${n}` }).first().click()
          await page.waitForTimeout(2000)
          ok(psql(`select pillar_id from tasks where id='${t}'`) === b, 'the task\'s pillar follows the row')
          // Unlink: the row keeps its last values as plain text; the task stays in its Space.
          await page.click(`[data-cell="k:${t}|rowNo"]`)
          await page.locator('[role="menuitem"]', { hasText: 'Unlink task' }).first().click()
          await page.waitForTimeout(2000)
          ok(psql(`select coalesce(task_id::text,'-') from content_rows where id='${r}'`) === '-', 'unlinked')
          ok(psql(`select title || '|' || (values ->> 'f:${cap}') || '|' || (values ->> 'status') from content_rows where id='${r}'`) === `Lab linked ${n}|Typed in the panel|c-prog`, 'the row keeps its title, Caption and stage as plain text')
          ok(psql(`select (dropped_at is null)::text || '|' || status from tasks where id='${t}'`) === 'true|c-prog', 'the task carries on')
          ok(psql(`select count(*) from task_spaces where task_id='${t}' and space_id='${space('content')}'`) === '1', 'in its Space')
          await openSheet(page, go, 'content', th)
          ok(await page.isVisible(`[data-make-task="${r}"]`), 'and the sheet doesn\'t link it again by itself')
        } finally { cleanup([th]) }
      },
    },
    {
      id: '026-child-row-makes-a-subtask', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const th = theme(`Lab sheet theme ${n}`, 'content')
        const parent = row(th, 'content', `Lab parent ${n}`, { pos: 1 })
        const child = row(th, 'content', `Lab child ${n}`, { parent, pos: 1 })
        try {
          await openSheet(page, go, 'content', th)
          // A child row can't be linked while its parent is plain.
          ok(await page.isVisible(`[data-row="l:${child}"] [data-make-task-blocked]`), 'the child says to link the parent first')
          await makeTask(page, parent, 'content')
          const pt = psql(`select task_id from content_rows where id='${parent}'`)
          ok(!!pt, 'the parent row is linked')
          await page.waitForSelector(`[data-make-task="${child}"]`, { timeout: 30000 })
          await page.click(`[data-make-task="${child}"]`)
          await page.waitForSelector('[data-make-task-dialog] [data-make-subtask]')
          ok(!(await page.$('[data-make-space]')), 'a child row has no Space to choose')
          await page.click('[data-make-task-go]')
          await page.waitForFunction(() => !document.querySelector('[data-make-task-dialog]'), null, { timeout: 30000 })
          await page.waitForTimeout(1500)
          const ct = psql(`select task_id from content_rows where id='${child}'`)
          ok(!!ct && psql(`select parent_task_id from tasks where id='${ct}'`) === pt, 'the child row is a subtask of the parent\'s task')
          ok(psql(`select count(*) from task_spaces where task_id='${ct}' and space_id='${space('content')}'`) === '1', 'in the same Space')
        } finally { cleanup([th]) }
      },
    },
    {
      id: '026-every-space-has-a-sheet-and-sheets-section-is-gone', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const th = theme(`Lab design theme ${n}`, 'design')
        const r = row(th, 'design', `Lab design row ${n}`)
        try {
          // The Design Space's Sheet view is its own sheet of rows, apart from the Content Space's.
          await openSheet(page, go, 'design', th)
          ok(await page.isVisible(`[data-row="l:${r}"]`), 'the Design Space\'s sheet shows its rows')
          await go('/spaces/content?view=sheet')
          await page.waitForSelector('.fx-board-page.is-sheet', { timeout: 60000 })
          ok(!(await page.$(`[data-row="t:${th}"]`)), 'and they aren\'t on the Content Space\'s sheet')
          // A Space › Brand folder shows that brand's themes only.
          const other = first(`select id from brands order by name offset 1 limit 1`)
          await go(`/spaces/design/${other}?view=sheet`)
          await page.waitForSelector('.fx-board-page.is-sheet', { timeout: 60000 })
          ok(!(await page.$(`[data-row="t:${th}"]`)), 'a folder shows only its brand\'s rows')
          await go(`/spaces/design/${brand()}?view=sheet`)
          await page.waitForSelector(`[data-row="t:${th}"]`, { timeout: 60000 })
          ok(true, 'and the brand\'s own folder has them')
          // The Sheets section is gone from the sidebar.
          ok(!(await page.$('[data-nav-tree] a[href="/sheets"]')) && !(await page.$('aside a[href="/sheets"]')), 'no Sheets entry in the sidebar')
          // Its old addresses lead to the page that owns the sheet.
          await go('/sheets')
          await page.waitForSelector('.fx-board-page.is-sheet', { timeout: 60000 })
          ok(page.url().includes('/spaces/content'), `the old Sheets address leads to the Content Space: ${page.url()}`)
          await go(`/sheets/${psql(`select id from sheet_folders where kind='video'`)}`)
          await page.waitForSelector('.fx-board-page.is-sheet', { timeout: 60000 })
          ok(page.url().includes('/spaces/video'), `an old folder address leads to its Space: ${page.url()}`)
          // The Video Space's sheet: videos are rows.
          await go('/spaces/video?view=sheet')
          await page.waitForSelector('.fx-board-page.is-sheet', { timeout: 60000 })
          ok(!(await page.$('[data-new-clip]')), 'the Video Space has the same sheet, not the old Video sheet')
        } finally { cleanup([th]) }
      },
    },
    {
      // §1, as changed by the user on 24 Nov 2026: the Brand page's Sheet view is the brand's tasks from every
      // Space (no strip of Spaces); a Space's rows for the brand are in its brand folder.
      id: '026-brand-page-sheet-shows-rows-of-every-space', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const td = theme(`Lab brand design ${n}`, 'design')
        const rd = row(td, 'design', `Lab design line ${n}`)
        const b = brand()
        try {
          await go(`/brands/${b}?view=sheet`)
          await page.waitForSelector('[data-node-workbook] [data-task-sheet]', { timeout: 90000 })
          ok(!(await page.$('[data-brand-sheet-strip]')) && !(await page.$('[data-brand-sheet]')), "no Sheets by Space strip on the brand's page")
          ok(await page.locator('[data-task-sheet] [data-col-head="space"]').count() === 1, "the brand's tasks from every Space, with a Space column")
          // The Space's rows for the brand are in that Space's brand folder, plain rows included.
          await go(`/spaces/design/${b}?view=sheet`)
          await page.waitForSelector(`[data-row="l:${rd}"]`, { timeout: 60000 })
          await makeTask(page, rd, null)
          const made = psql(`select task_id from content_rows where id='${rd}'`)
          ok(!!made && psql(`select brand_id from tasks where id='${made}'`) === b, 'Make task in the brand folder makes the task for this brand')
          await go(`/brands/${b}?view=sheet`)
          await page.waitForSelector(`[data-task-sheet] [data-row="t:${made}"]`, { timeout: 60000 })
          ok(true, "and it shows on the brand's sheet")
        } finally { cleanup([td]) }
      },
    },
    {
      // §6: a column is a Task field from the library, or Sheet only; all are shown, hidden, moved and renamed in the Fields drawer.
      id: '026-columns-task-field-or-sheet-only', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const th = theme(`Lab column theme ${n}`, 'design')
        const r = row(th, 'design', `Lab column row ${n}`)
        // A field of the library that no task type carries: it isn't on the sheet until someone adds it.
        const fid = first(`insert into task_fields (id, name_en, kind, position) values (gen_random_uuid(), 'Lab field ${n}', 'text', 990) returning id`)
        const key = `f:${fid}`, sheet = `rows:${space('design')}`
        const rec = col => psql(`select coalesce(name,'') || '|' || position || '|' || shown_default || '|' || array_to_string(shown_in, ',') from sheet_columns where sheet='${sheet}' and key='${col}'`)
        try {
          await openSheet(page, go, 'design', th)
          ok(!(await page.$(`[data-col-head="${key}"]`)), "a library field no type carries isn't a column yet")
          // Fields (25 Nov 2026): + Column opens the Add column panel — the field is on in Design, not shown yet.
          psql(`update members set sheet_layouts='{}' where email='${EMAIL.admin}'`)
          await page.click('[data-content-sheet] [data-add-column]')
          await page.waitForSelector(`[data-add-section="on"] [data-add-item="${key}"]`)
          ok(await page.isVisible('[data-add-new]'), '+ Column ends with + New field (a task field or a sheet-only column)')
          // An admin shapes the Space default here (Just me would change only their own view).
          await page.click(`[data-add-section="on"] [data-add-item="${key}"] [data-add-do]`)
          await page.waitForSelector(`[data-col-head="${key}"]`, { timeout: 30000 })
          ok((await page.locator(`[data-col-head="${key}"]`).innerText()).includes(`Lab field ${n}`), 'the chosen library field is a column, named by the field')
          // A plain row holds its own value in it.
          await page.click(`[data-cell="l:${r}|${key}"]`)
          await page.keyboard.type(`Plain value ${n}`)
          await page.keyboard.press('Enter')
          await page.waitForTimeout(1500)
          ok(psql(`select values->>'${key}' from content_rows where id='${r}'`) === `Plain value ${n}`, 'a plain row holds its own value in a task-field column')
          // The Fields drawer: rename, move, hide — in the Space default (admins).
          await page.click('[data-fields-btn]')
          await page.waitForSelector(`[data-fields-drawer] [data-field-row="${key}"]`)
          await page.click('[data-fields-mode="default"]')
          // Shown above in my own view; the Space default shows it too.
          await page.click(`[data-fields-drawer] [data-field-switch="${key}"]`).catch(() => {})
          await page.waitForTimeout(1200)
          if ((await page.getAttribute(`[data-fields-drawer] [data-field-switch="${key}"]`, 'aria-checked')) !== 'true') await page.click(`[data-fields-drawer] [data-field-switch="${key}"]`)
          await page.waitForTimeout(1200)
          await page.click(`[data-field-rename="${key}"]`)
          await page.waitForSelector('[data-column-rename] input')
          await page.fill('[data-column-rename] input', `Lab renamed ${n}`)
          await page.keyboard.press('Enter')
          await page.waitForFunction(k => document.querySelector(`[data-col-head="${k}"]`)?.textContent?.includes('Lab renamed'), key, { timeout: 30000 })
          await page.waitForTimeout(1500)
          ok(rec(key).startsWith(`Lab renamed ${n}|`), 'renamed from the Fields drawer (on this sheet)')
          ok(psql(`select name_en from task_fields where id='${fid}'`) === `Lab field ${n}`, "the library field keeps its own name")
          const posBefore = Number(rec(key).split('|')[1])
          await page.locator(`[data-fields-drawer] [data-field-row="${key}"] button`, { hasText: '↑' }).click()
          await page.waitForTimeout(1500)
          // (Columns of fields retired since may sit between, so the place moves up by one or more.)
          ok(Number(rec(key).split('|')[1]) < posBefore, 'moved up from the Fields drawer')
          await page.click(`[data-fields-drawer] [data-field-switch="${key}"]`)
          await page.waitForTimeout(1500)
          ok(rec(key).endsWith('|false|'), 'hidden from the Fields drawer (the Space default)')
          ok(psql(`select values->>'${key}' from content_rows where id='${r}'`) === `Plain value ${n}`, 'hiding keeps the values')
          await page.click('[data-fields-close]')
          // Sheet only: a column of the sheet's own, from + New field.
          await page.click('[data-content-sheet] [data-add-column]')
          await page.click('[data-add-new]')
          await page.fill('[data-new-name]', `Lab only ${n}`)
          await page.click('[data-new-place="sheet"]')
          await page.click('[data-new-kind="text"]')
          await page.click('[data-new-add]')
          await page.waitForFunction(name => [...document.querySelectorAll('[data-col-head]')].some(h => h.textContent?.includes(name)), `Lab only ${n}`, { timeout: 30000 })
          await page.waitForTimeout(1000)
          ok(psql(`select kind from sheet_columns where sheet='${sheet}' and name='Lab only ${n}' and deleted_at is null`) === 'text', 'Sheet only adds a column that belongs to the sheet')
          // The Content Space's sheet is not changed by any of it.
          ok(psql(`select count(*) from sheet_columns where sheet='content' and (key='${key}' or name='Lab only ${n}')`) === '0', "another Space's sheet keeps its own columns")
        } finally {
          psql(`delete from sheet_columns where sheet='${sheet}' and (key='${key}' or name='Lab only ${n}')`)
          psql(`delete from sheet_columns where key='${key}'`)
          psql(`delete from task_fields where id='${fid}'`)
          psql(`update members set sheet_layouts='{}' where email='${EMAIL.admin}'`)
          cleanup([th])
        }
      },
    },
    {
      id: '026-paste-plan-makes-plain-rows-only', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const th = theme(`Lab paste theme ${n}`, 'content')
        try {
          await openSheet(page, go, 'content', th)
          const before = psql('select count(*) from tasks')
          // A pasted plan with a Theme column and no target row: rows under that theme, never tasks.
          await page.click(`[data-cell="t:${th}|title"]`)
          await page.keyboard.press('Escape')
          await page.evaluate(text => {
            const dt = new DataTransfer(); dt.setData('text/plain', text)
            document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
          }, `Lab pasted one ${n}\nLab pasted two ${n}`)
          await page.waitForSelector('[data-plan-preview]', { timeout: 10000 })
          await page.click('[data-plan-add]')
          await page.waitForTimeout(3500)
          ok(psql(`select count(*) from content_rows where project_id='${th}' and task_id is null and title like 'Lab pasted % ${n}'`) === '2', 'two plain rows')
          ok(psql('select count(*) from tasks') === before, 'and no task was created')
        } finally { cleanup([th]) }
      },
    },
  ]
}
