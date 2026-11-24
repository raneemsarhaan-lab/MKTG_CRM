// Spaces lab real-app scenarios for the Task link field (spec 021 T074–T076, T078).
module.exports = (EMAIL, psql, ok) => {
  const spaceId = key => psql(`select id from team_spaces where key='${key}'`)
  // A task the brand's sheet lists: not a linked media task (those show through their content task).
  const taskIn = (space, name) => psql(`select t.id from tasks t join task_spaces ts on ts.task_id=t.id where ts.space_id='${spaceId(space)}' and t.name='${name}' and t.content_task_id is null and t.dropped_at is null limit 1`)
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
          const row = taskIn('content', 'Meetup poster')
          await go(`/brands/${psql(`select brand_id from tasks where id='${row}'`)}?view=sheet&sheet=tasks`)
          const name = `Lab link ${Date.now() % 100000}`
          const col = await addField(page, name)
          ok(psql(`select kind from sheet_columns where id='${col}'`) === 'task', 'the ＋ Field menu adds a Task link field')
          const target = psql(`select id from tasks where name='Ramadan hero key visual' and media_board is null`)
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
      id: 'tasklink-panel-and-card', as: 'admin',
      async run({ page, go }) {
        cleanup()
        try {
          // The Design board's own card (a media task).
          const row = psql(`select t.id from tasks t join task_spaces ts on ts.task_id=t.id where ts.space_id='${spaceId('design')}' and t.name='Meetup poster' and t.media_board='design' limit 1`)
          const target = psql(`select id from tasks where name='Ramadan hero key visual' and media_board is null`)
          const col = psql('select gen_random_uuid()')
          psql(`insert into sheet_columns (id, sheet, key, name, position, kind, options, shown_default, shown_in, updated_at)
            values ('${col}', 'tasks:space:${spaceId('design')}', 'c:${col}', 'Lab link Part of', 99, 'task', '[]', true, '{}', now())`)
          psql(`insert into sheet_values (column_id, task_id, value, updated_at) values ('${col}', '${row}', '${target}', now())`)
          await go('/spaces/design?view=board')
          await page.waitForSelector(`[data-task-card="${row}"]`, { timeout: 60000 })
          ok((await page.locator(`[data-task-card="${row}"] [data-card-task-link]`).allInnerTexts()).some(x => /Ramadan hero key visual/.test(x)), 'the card shows the link')
          await go(`/spaces/design?view=board&task=${row}`)
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
