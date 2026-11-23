// Spaces lab real-app scenarios for the Task link field (spec 021 T074–T076, T078).
module.exports = (EMAIL, psql, ok) => {
  const spaceId = key => psql(`select id from team_spaces where key='${key}'`)
  const taskIn = (space, name) => psql(`select t.id from tasks t join task_spaces ts on ts.task_id=t.id where ts.space_id='${spaceId(space)}' and t.name='${name}' limit 1`)
  const cleanup = () => {
    psql(`delete from sheet_values where column_id in (select id from sheet_columns where name like 'Lab link%')`)
    psql(`delete from sheet_columns where name like 'Lab link%'`)
  }
  const addField = async (page, name) => {
    await page.waitForSelector('[data-add-field]', { timeout: 60000 })
    await page.click('[data-add-field]')
    await page.click('[data-add-task-link]')
    await page.keyboard.type(name)
    await page.locator('button', { hasText: /^(Add column|Save)$/ }).first().click()
    await page.waitForTimeout(1500)
    return psql(`select id from sheet_columns where name='${name}' and deleted_at is null order by updated_at desc limit 1`)
  }
  const valueOf = (col, task) => psql(`select coalesce((select value from sheet_values where column_id='${col}' and task_id='${task}'), '')`)
  const nameOfValue = (col, task) => psql(`select coalesce((select t.name from sheet_values v join tasks t on t.id::text=v.value where v.column_id='${col}' and v.task_id='${task}'), '')`)

  return [
    {
      id: 'tasklink-link-change-unlink-undo', as: 'admin',
      async run({ page, go }) {
        cleanup()
        try {
          await go('/spaces/design?view=sheet')
          const name = `Lab link ${Date.now() % 100000}`
          const col = await addField(page, name)
          ok(psql(`select kind from sheet_columns where id='${col}'`) === 'task', 'the ＋ Field menu adds a Task link field')
          const row = taskIn('design', 'Meetup poster')
          const target = psql(`select id from tasks where name='Ramadan hero key visual'`)
          const cell = `[data-task-sheet] [data-cell$="${row}|c:${col}"]`
          await page.locator(cell).click()
          await page.keyboard.type('Ramad')
          await page.waitForSelector('[data-link-picker]')
          ok((await page.inputValue('[data-link-search]')) === 'Ramad', 'Link task opens already searching for what was typed')
          ok(!(await page.$(`[data-link-picker] [data-pick-task="${row}"]`)), "a task isn't offered to link to itself")
          await page.click(`[data-link-picker] [data-pick-task="${target}"]`)
          await page.waitForTimeout(1500)
          ok(valueOf(col, row) === target, 'picking links the task')
          ok(await page.$(`${cell} [data-task-link="${target}"]`), 'the cell shows the linked task')

          await page.locator(`${cell} [data-tasklink-unlink]`).click({ force: true })
          await page.waitForTimeout(1200)
          ok(valueOf(col, row) === '', '× unlinks at once')
          ok(psql(`select count(*) from tasks where id='${target}' and dropped_at is null`) === '1', 'the linked task itself is untouched')
          await page.click('[data-sheet-undo]')
          await page.waitForTimeout(1200)
          ok(valueOf(col, row) === target, 'Undo brings the link back')

          await page.locator(`${cell} [data-tasklink-change]`).click({ force: true })
          await page.waitForSelector('[data-link-picker]')
          await page.fill('[data-link-search]', 'Iftar')
          await page.keyboard.press('Enter')
          await page.waitForTimeout(1500)
          ok(nameOfValue(col, row) === 'Iftar invite cards', '⇄ Change replaces the link (one task per field)')
          ok(psql(`select count(*) from sheet_values where column_id='${col}' and task_id='${row}'`) === '1', 'still one value')
        } finally { cleanup() }
      },
    },
    {
      id: 'tasklink-linking-makes-pipeline', as: 'admin',
      async run({ page, go }) {
        cleanup()
        const plan = `Lab linked plan ${Date.now() % 100000}`, piece = `Lab linked piece ${Date.now() % 100000}`
        const simple = psql(`insert into tasks (id,name,brand_id,task_owner_id,assignee_id,initiator_role,status,kind,simple_status,stage_date,updated_at)
          select gen_random_uuid(), 'Lab simple to link ' || floor(random()*1e6)::text, (select id from brands order by name limit 1), m.id, m.id, m.role, 'todo', 'simple', 's-doing', now(), now()
          from members m where m.role='Marketing Manager' limit 1 returning id`).split(/\n/)[0]
        const simpleName = psql(`select name from tasks where id='${simple}'`)
        try {
          await go('/spaces/design?view=sheet')
          const col = await addField(page, `Lab link create ${Date.now() % 100000}`)
          const row = taskIn('design', 'Meetup poster'), row2 = taskIn('design', 'Newsletter issue 22'), row3 = taskIn('design', 'Year in review carousel')
          // Created from Link task, in Planning or in Content: linked at once, so a pipeline task either way.
          for (const [r, name, space] of [[row, plan, 'planning'], [row2, piece, 'content']]) {
            const cell = `[data-task-sheet] [data-cell$="${r}|c:${col}"]`
            await page.locator(cell).click()
            await page.keyboard.type(name)
            await page.waitForSelector('[data-link-picker]')
            await page.click('[data-link-create]')
            await page.click(`[data-link-space="${space}"]`)
            ok((await page.getAttribute('[data-link-gets]', 'data-link-gets')) === 'pipeline', `the picker says it becomes a pipeline task (${space})`)
            await page.click('[data-link-make]')
            await page.waitForTimeout(2500)
          }
          ok(psql(`select kind||':'||status from tasks where name='${plan}'`) === 'pipeline:todo', 'created and linked in Planning → pipeline, at To Do')
          ok(psql(`select kind||':'||status from tasks where name='${piece}'`) === 'pipeline:todo', 'created and linked in Content → pipeline, at To Do')
          ok(nameOfValue(col, row) === plan && nameOfValue(col, row2) === piece, 'each new task is linked')
          ok(psql(`select count(*) from task_spaces ts join tasks t on t.id=ts.task_id where t.name='${plan}' and ts.space_id='${spaceId('planning')}'`) === '1', 'it shows in the Space it was made in')
          // An existing simple task becomes a pipeline task when it is linked.
          const cell3 = `[data-task-sheet] [data-cell$="${row3}|c:${col}"]`
          await page.locator(cell3).click()
          await page.keyboard.type(simpleName.slice(0, 18))
          await page.waitForSelector(`[data-link-picker] [data-pick-task="${simple}"]`)
          await page.click(`[data-link-picker] [data-pick-task="${simple}"]`)
          await page.waitForTimeout(1800)
          ok(psql(`select kind||':'||status||':'||coalesce(simple_status,'') from tasks where id='${simple}'`) === 'pipeline:todo:', 'linking a simple task makes it a pipeline task at To Do')
          await page.locator(`${cell3} [data-tasklink-unlink]`).click({ force: true })
          await page.waitForTimeout(1500)
          ok(psql(`select kind from tasks where id='${simple}'`) === 'pipeline', 'unlinking keeps it on the pipeline')
        } finally {
          cleanup()
          psql(`update tasks set dropped_at=now() where name in ('${plan}', '${piece}') or id='${simple}'`)
        }
      },
    },
    {
      id: 'tasklink-new-tasks-start-simple', as: 'admin',
      async run({ page, go }) {
        const name = `Lab content form ${Date.now()}`
        await go('/spaces/content?view=board')
        await page.getByRole('button', { name: 'Add task' }).first().click()
        await page.fill('input[placeholder="Task name — or paste a list"]', name)
        ok(/simple task/i.test(await page.textContent('[data-gets-stages]') ?? ''), 'the form says it starts simple')
        await page.locator('button', { hasText: /^Create Task$/i }).first().click()
        await page.waitForTimeout(2000)
        ok(psql(`select kind||':'||coalesce(simple_status,'') from tasks where name='${name}'`) === 'simple:s-todo', 'made in Content with the form → simple')
        psql(`update tasks set dropped_at=now() where name='${name}'`)
      },
    },
    {
      id: 'tasklink-panel-and-card', as: 'admin',
      async run({ page, go }) {
        cleanup()
        try {
          const row = taskIn('design', 'Meetup poster')
          const target = psql(`select id from tasks where name='Ramadan hero key visual'`)
          const col = psql('select gen_random_uuid()')
          psql(`insert into sheet_columns (id, sheet, key, name, position, kind, options, shown_default, shown_in, updated_at)
            values ('${col}', 'tasks:space:${spaceId('design')}', 'c:${col}', 'Lab link Part of', 99, 'task', '[]', true, '{}', now())`)
          psql(`insert into sheet_values (column_id, task_id, value, updated_at) values ('${col}', '${row}', '${target}', now())`)
          await go('/spaces/design?view=board')
          await page.waitForSelector(`[data-task-card="${row}"]`, { timeout: 60000 })
          ok((await page.locator(`[data-task-card="${row}"] [data-card-task-link]`).allInnerTexts()).some(x => /Ramadan hero key visual/.test(x)), 'the card shows the link')
          await go(`/spaces/design?view=list&task=${row}`)
          await page.waitForSelector(`[data-task-link-field="${col}"]`, { timeout: 60000 })
          ok(/Lab link Part of/.test(await page.locator(`[data-task-link-field="${col}"]`).innerText()), 'the panel shows the field by its name')
          await page.click(`[data-task-link-field="${col}"] [data-tasklink-unlink]`)
          await page.waitForTimeout(1500)
          ok(valueOf(col, row) === '', '× in the panel unlinks')
          await page.click('[data-task-links-undo]')
          await page.waitForTimeout(1500)
          ok(valueOf(col, row) === target, 'Undo in the panel brings it back')
        } finally { cleanup() }
      },
    },
  ]
}
