// Sheet 2b: adding themes, pillars, rows and child rows on the Content sheet; moving and removing them.
module.exports = (EMAIL, psql, ok) => {
  const rnd = () => String(Math.floor(1e5 + Math.random() * 9e5))
  const who = k => psql(`select id from members where email='${EMAIL[k]}'`)
  const first = sql => psql(sql).split(/\n/)[0]
  const theme = (name, pos) => {
    const id = first(`insert into projects (id, name, standing, is_theme, owner_id) values (gen_random_uuid(), '${name}', true, true, '${who('admin')}') returning id`)
    psql(`insert into content_themes (id, project_id, position) values (gen_random_uuid(), '${id}', ${pos ?? 1000 + Math.random()})`)
    return id
  }
  const pillar = (projectId, name, i = 0) => first(`insert into content_pillars (id, project_id, name, sort_order) values (gen_random_uuid(), '${projectId}', '${name}', ${i}) returning id`)
  const row = (projectId, title, o = {}) => first(`insert into content_rows (id, project_id, pillar_id, parent_id, position, title, task_id, created_by, updated_at)
    values (gen_random_uuid(), '${projectId}', ${o.pillar ? `'${o.pillar}'` : 'null'}, ${o.parent ? `'${o.parent}'` : 'null'}, ${o.pos ?? 1}, '${title}', ${o.task ? `'${o.task}'` : 'null'}, '${who('admin')}', now()) returning id`)
  const task = (projectId, name, o = {}) => first(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at,project_id,pillar_id)
    values (gen_random_uuid(), '${name}', (select id from brands order by name limit 1), 'Post', '${who('admin')}', '${who('content')}', 'Content Creator', true, 'todo', now(), 'Normal', now(), '${projectId}', ${o.pillar ? `'${o.pillar}'` : 'null'}) returning id`)
  const cleanup = ids => {
    for (const id of ids) {
      psql(`delete from tasks where project_id='${id}'`)
      psql(`delete from content_rows where project_id='${id}'`)
      psql(`delete from content_themes where project_id='${id}'`)
      psql(`delete from projects where id='${id}'`)
    }
  }
  const open = async (page, go) => {
    await go('/spaces/content?view=sheet')
    await page.waitForSelector('[data-content-sheet]', { timeout: 60000 })
  }
  const menu = async (page, cell, item) => {
    await page.click(`[data-cell="${cell}"]`)
    await page.locator('[role="menuitem"]', { hasText: item }).first().click()
  }
  const typeDraft = async (page, text) => {
    await page.waitForSelector('.fx-sheet-tr.is-draft input, .fx-sheet-tr.is-draft textarea', { timeout: 10000 })
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)
  }

  return [
    {
      id: '2b-theme-from-project-or-new', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const existing = first(`insert into projects (id, name, standing) values (gen_random_uuid(), 'Lab project ${n}', true) returning id`)
        const a = theme(`Lab theme A ${n}`, 0.5)
        try {
          await open(page, go)
          // + Theme from an existing project: the theme takes its name.
          await page.click('[data-add-theme]')
          await page.waitForSelector('[data-theme-add]')
          await page.selectOption('[data-theme-project]', existing)
          await page.click('[data-theme-add-save]')
          await page.waitForTimeout(2500)
          ok(psql(`select count(*) from content_themes where project_id='${existing}'`) === '1', 'the project is a theme on the sheet')
          ok(await page.isVisible(`[data-row="t:${existing}"]`), 'it shows, with its "+ Row" line')
          ok(await page.isVisible(`[data-row="a:${existing}"]`), '"+ Row" under the new theme')
          // Insert theme above A, as a new project.
          await menu(page, `t:${a}|title`, 'Insert theme above')
          await page.waitForSelector('[data-theme-add]')
          await page.click('[data-theme-mode="new"]')
          await page.fill('[data-theme-editor] input >> nth=0', `Lab new ${n}`)
          await page.click('[data-theme-editor] button[type="submit"]')
          await page.waitForTimeout(2500)
          const fresh = psql(`select id from projects where name='Lab new ${n}'`)
          ok(!!fresh, 'a new project is made')
          ok(Number(psql(`select position from content_themes where project_id='${fresh}'`)) < 0.5, 'inserted above A')
        } finally { cleanup([existing, a, psql(`select id from projects where name='Lab new ${n}'`)].filter(Boolean)) }
      },
    },
    {
      id: '2b-rows-pillars-children-and-tab', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), th = theme(`Lab rows ${n}`, 0.1)
        try {
          await open(page, go)
          // + Pillar from the theme's menu.
          await menu(page, `t:${th}|title`, '+ Pillar')
          await page.keyboard.type(`Pillar ${n}`)
          await page.keyboard.press('Enter')
          await page.waitForTimeout(2000)
          const pl = psql(`select id from content_pillars where project_id='${th}'`)
          ok(!!pl, 'the pillar is added to the theme\'s project')
          // "+ Row" under the pillar: Enter adds the row and starts the next one.
          await page.click(`[data-row="a:${th}:${pl}"] [data-col="title"]`)
          await typeDraft(page, `First ${n}`)
          await typeDraft(page, `Second ${n}`)
          await page.keyboard.press('Escape')
          ok(psql(`select count(*) from content_rows where project_id='${th}' and pillar_id='${pl}' and task_id is null`) === '2', 'two plain rows in the pillar')
          const r1 = psql(`select id from content_rows where title='First ${n}'`), r2 = psql(`select id from content_rows where title='Second ${n}'`)
          ok(Number(psql(`select position from content_rows where id='${r1}'`)) < Number(psql(`select position from content_rows where id='${r2}'`)), 'in the order typed')
          // A plain row takes a date.
          await page.click(`[data-cell="l:${r1}|date"]`)
          await page.keyboard.type('20/12/2026')
          await page.keyboard.press('Enter')
          await page.waitForTimeout(1500)
          ok(psql(`select date::text from content_rows where id='${r1}'`) === '2026-12-20', 'a plain row keeps its date')
          // Tab on Second's number: a child of First. Shift+Tab: back out.
          await page.click(`[data-cell="l:${r2}|rowNo"]`)
          await page.keyboard.press('Escape')
          await page.keyboard.press('Tab')
          await page.waitForTimeout(2000)
          ok(psql(`select parent_id from content_rows where id='${r2}'`) === r1, 'Tab: a child of the row above')
          ok(await page.isVisible(`[data-add-row="child:${r1}"]`), 'its own "+ Child row" line')
          // One level only: First can't go under anything, and a child can't take children.
          await page.click(`[data-cell="l:${r2}|rowNo"]`)
          ok(!(await page.locator('[role="menuitem"]', { hasText: 'Add child row' }).count()), 'a child row has no "Add child row"')
          await page.keyboard.press('Escape')
          await page.keyboard.press('Shift+Tab')
          await page.waitForTimeout(2000)
          ok(psql(`select parent_id from content_rows where id='${r2}'`) === '', 'Shift+Tab: out again')
          // Insert row above, from the row menu.
          await menu(page, `l:${r1}|rowNo`, 'Insert row above')
          await typeDraft(page, `Zero ${n}`)
          await page.keyboard.press('Escape')
          ok(Number(psql(`select position from content_rows where title='Zero ${n}'`)) < Number(psql(`select position from content_rows where id='${r1}'`)), 'inserted above')
          // Add child row from the menu.
          await menu(page, `l:${r1}|rowNo`, 'Add child row')
          await typeDraft(page, `Kid ${n}`)
          await page.keyboard.press('Escape')
          ok(psql(`select parent_id from content_rows where title='Kid ${n}'`) === r1, 'Add child row makes a child')
        } finally { cleanup([th]) }
      },
    },
    {
      id: '2b-make-task-link-and-drag', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), a = theme(`Lab drag A ${n}`, 0.1), b = theme(`Lab drag B ${n}`, 0.2)
        const plA = pillar(a, `PA ${n}`), plB = pillar(b, `PB ${n}`)
        const plain = row(a, `Plain ${n}`, { pillar: plA, pos: 1 }), other = row(a, `Other ${n}`, { pillar: plA, pos: 2 })
        const t = task(a, `Linked ${n}`, { pillar: plA })
        try {
          await open(page, go)
          ok(!!psql(`select id from content_rows where task_id='${t}'`), 'a task in a theme gets a linked row')
          // Create task from a plain row.
          await menu(page, `l:${plain}|status`, 'Create task')
          await page.waitForTimeout(2500)
          const made = psql(`select task_id from content_rows where id='${plain}'`)
          ok(!!made, 'the row is linked to a new task')
          ok(psql(`select project_id || '|' || pillar_id || '|' || status from tasks where id='${made}'`) === `${a}|${plA}|todo`, 'in the theme and pillar, at To Do')
          // Drag the linked row onto theme B's pillar: the task follows.
          const lr = psql(`select id from content_rows where task_id='${t}'`)
          await page.dragAndDrop(`[data-cell="k:${t}|rowNo"]`, `[data-row="p:${plB}"]`)
          await page.waitForTimeout(2500)
          ok(psql(`select project_id || '|' || pillar_id from content_rows where id='${lr}'`) === `${b}|${plB}`, 'the row moved to B › PB')
          ok(psql(`select project_id || '|' || pillar_id from tasks where id='${t}'`) === `${b}|${plB}`, "its task's theme and pillar match")
          // Drag a row onto another row (its middle): a child.
          await page.dragAndDrop(`[data-cell="l:${other}|rowNo"]`, `[data-row="k:${made}"]`)
          await page.waitForTimeout(2500)
          ok(psql(`select parent_id from content_rows where id='${other}'`) === plain, 'dropped on a row: its child')
          // Reorder themes by dragging (the sheet only).
          await page.dragAndDrop(`[data-cell="t:${b}|rowNo"]`, `[data-row="t:${a}"]`, { targetPosition: { x: 20, y: 2 } })
          await page.waitForTimeout(2500)
          ok(Number(psql(`select position from content_themes where project_id='${b}'`)) < Number(psql(`select position from content_themes where project_id='${a}'`)), 'B now above A')
        } finally { cleanup([a, b]) }
      },
    },
    {
      id: '2b-delete-row-pillar-theme', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), a = theme(`Lab del A ${n}`, 0.1), b = theme(`Lab del B ${n}`, 0.2)
        const plA = pillar(a, `Gone ${n}`)
        const t = task(a, `Keep task ${n}`, { pillar: plA })
        const parent = row(a, `Parent ${n}`, { pillar: plA, pos: 5 })
        const kid = row(a, `Kid ${n}`, { pillar: plA, parent, pos: 1 })
        const loose = row(a, `Loose ${n}`, { pos: 9 })
        try {
          await open(page, go)
          // Deleting a linked row asks; unlink keeps the task in its Space.
          await menu(page, `k:${t}|rowNo`, 'Delete row')
          await page.waitForSelector('[data-delete-row]')
          ok(await page.isVisible('[data-delete-task="unlink"]'), 'asks to unlink or delete both')
          await page.click('[data-delete-row-confirm]')
          await page.waitForTimeout(2000)
          ok(psql(`select count(*) from content_rows where task_id='${t}'`) === '0', 'the row is gone')
          ok(psql(`select coalesce(project_id::text, 'none') from tasks where id='${t}'`) === 'none', 'the task stays, out of the theme')
          // A parent row: its children move up a level.
          await menu(page, `l:${parent}|rowNo`, 'Delete row')
          await page.waitForSelector('[data-delete-children="up"]')
          await page.click('[data-delete-row-confirm]')
          await page.waitForTimeout(2000)
          ok(psql(`select coalesce(parent_id::text, 'top') from content_rows where id='${kid}'`) === 'top', 'children move up a level')
          // Removing a pillar asks where its rows go: No pillar under the same theme.
          await menu(page, `p:${plA}|title`, 'Remove pillar')
          await page.waitForSelector('[data-destination]')
          await page.selectOption('[data-destination-pick]', `${a}:`)
          await page.click('[data-destination-confirm]')
          await page.waitForTimeout(2000)
          ok(psql(`select count(*) from content_pillars where id='${plA}'`) === '0', 'the pillar is removed')
          ok(psql(`select coalesce(pillar_id::text, 'none') || '|' || project_id from content_rows where id='${kid}'`) === `none|${a}`, 'its rows: No pillar, same theme')
          // Removing a theme: rows go to B, the project stays.
          await menu(page, `t:${a}|title`, 'Remove theme')
          await page.waitForSelector('[data-destination]')
          await page.selectOption('[data-destination-pick]', `${b}:`)
          await page.click('[data-destination-confirm]')
          await page.waitForTimeout(2000)
          ok(psql(`select count(*) from content_themes where project_id='${a}'`) === '0', 'off the sheet')
          ok(psql(`select count(*) from projects where id='${a}'`) === '1', 'the project stays')
          ok(psql(`select count(*) from content_rows where id in ('${kid}', '${loose}') and project_id='${b}'`) === '2', 'its rows are in B')
        } finally { psql(`delete from tasks where id='${t}'`); cleanup([a, b]) }
      },
    },
    {
      id: '2b-paste-on-pillar-and-user-rows', as: 'dms',
      async run({ page, go }) {
        const n = rnd(), th = theme(`Lab paste ${n}`, 0.1), pl = pillar(th, `PP ${n}`)
        psql(`update members set access='user' where email='${EMAIL.dms}'`)
        try {
          await open(page, go)
          await page.waitForTimeout(1500)
          if (await page.$('[data-hours-later]')) await page.click('[data-hours-later]')
          ok(!(await page.$('[data-add-theme]')), 'a user has no "+ Theme"')
          // Anyone with access may add a row.
          await page.click(`[data-row="a:${th}:${pl}"] [data-col="title"]`)
          await typeDraft(page, `By a user ${n}`)
          await page.keyboard.press('Escape')
          ok(psql(`select count(*) from content_rows where title='By a user ${n}' and pillar_id='${pl}'`) === '1', 'a user adds a plain row')
          // Paste plan on the pillar: plain rows there.
          await page.click(`[data-cell="p:${pl}|title"]`)
          await page.keyboard.press('Escape')
          await page.evaluate(text => {
            const dt = new DataTransfer(); dt.setData('text/plain', text)
            document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
          }, `Pasted one ${n}\nPasted two ${n}`)
          await page.waitForSelector('[data-plan-preview]', { timeout: 10000 })
          await page.click('[data-plan-add]')
          await page.waitForTimeout(3000)
          ok(psql(`select count(*) from content_rows where pillar_id='${pl}' and task_id is null and title like 'Pasted % ${n}'`) === '2', 'two plain rows in the pillar')
          ok(psql(`select count(*) from tasks where name like 'Pasted % ${n}'`) === '0', 'no tasks made')
        } finally { psql(`update members set access='superuser' where email='${EMAIL.dms}'`); cleanup([th]) }
      },
    },
  ]
}
