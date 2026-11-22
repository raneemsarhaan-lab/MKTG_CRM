// Spaces lab real-app scenarios for status words per team (spec 021 US3, T059).
module.exports = (EMAIL, psql, ok) => {
  const spaceId = key => psql(`select id from team_spaces where key='${key}'`)
  const seed = (name, status, space) => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,hours_estimate,updated_at)
      select gen_random_uuid(), '${name} ' || floor(random()*1e6)::text, (select id from brands order by name limit 1), 'Design',
        (select id from members where role='Content Creator' limit 1), (select id from members where role='Graphic Designer' limit 1),
        'Content Creator', true, '${status}', now(), 'Medium', 2, now() returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${spaceId(space)}', 'manual') on conflict do nothing`)
    return id
  }
  const typeInto = async (page, taskId, col, text) => {
    await page.waitForSelector(`[data-task-sheet] [data-cell$="${taskId}|${col}"]`, { timeout: 60000 })
    await page.locator(`[data-task-sheet] [data-cell$="${taskId}|${col}"]`).first().click()
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)
  }
  const writeWords = async (page, words) => {
    await page.click('[data-space-words-open]')
    await page.waitForSelector('[data-space-words]')
    for (const [k, v] of Object.entries(words)) await page.fill(`[data-word-input="${k}"]`, v)
  }
  const resetDesign = () => psql(`update team_spaces set words='{}' where key='design'`)

  return [
    {
      id: 'us3-words-show-in-space-and-type-in-sheet', as: 'admin',
      async run({ page, go }) {
        resetDesign()
        seed('Words list lab', 'd-check', 'design')
        const t = seed('Words lab', 'd-prog', 'design')
        await go('/spaces/design')
        await writeWords(page, { 'd-check': 'Client review, CR' })
        await page.click('[data-space-words-save]')
        await page.waitForSelector('[data-space-words]', { state: 'detached', timeout: 15000 })
        ok(/"d-check": \["Client review", "CR"\]/.test(psql(`select words::text from team_spaces where key='design'`)), 'the words are saved on the Space')
        await go('/spaces/design?view=list')
        await page.click('[data-group="stage"]')
        const pill = page.locator('[data-group-key="d-check"] [data-stage-pill="d-check"]').first()
        ok((await pill.innerText()).trim() === 'Client review', 'the List shows the word alone')
        ok((await pill.getAttribute('title')) === 'D-Check', 'the board name is on hover')
        await go('/spaces/design?view=sheet')
        await typeInto(page, t, 'status', 'cr')
        ok(psql(`select status from tasks where id='${t}'`) === 'd-check', 'typing a word moves the task')
        ok(await page.$(`[data-cell$="${t}|status"] [data-status-word="Client review"]`), 'the Sheet shows the word')
        await go('/spaces/design?view=board')
        const board = await page.innerText('main')
        ok(/D-Check/i.test(board) && !/Client review/i.test(board), 'the Board keeps the board names')
      },
    },
    {
      id: 'us3-unknown-word-lists-valid', as: 'admin',
      async run({ page, go }) {
        psql(`update team_spaces set words='{"d-check": ["Client review"]}' where key='design'`)
        const t = seed('Words unknown lab', 'd-prog', 'design')
        await go('/spaces/design?view=sheet')
        await typeInto(page, t, 'status', 'Blorp')
        const say = await page.textContent('[data-sheet-say]') ?? ''
        ok(/Blorp/.test(say) && /Client review/.test(say), `an unknown word lists the valid ones: ${say}`)
        ok(psql(`select status from tasks where id='${t}'`) === 'd-prog', 'the task stays')
      },
    },
    {
      id: 'us3-clash-refused', as: 'admin',
      async run({ page, go }) {
        resetDesign()
        await go('/spaces/design')
        await writeWords(page, { 'd-prog': 'Review', 'c-check': 'review' })
        ok(/Review/.test(await page.textContent('[data-space-words-msg]') ?? ''), 'the clash is explained')
        ok(await page.isDisabled('[data-space-words-save]'), "the words can't be saved")
        await page.fill('[data-word-input="c-check"]', 'C-Check')
        await page.fill('[data-word-input="d-prog"]', 'D-Check')
        ok(/D-Check/.test(await page.textContent('[data-space-words-msg]') ?? ''), "another stage's board name is a clash too")
        await page.keyboard.press('Escape')
        ok(psql(`select words::text from team_spaces where key='design'`) === '{}', 'nothing was saved')
      },
    },
    {
      id: 'us3-content-space-words-are-the-sheets', as: 'admin',
      async run({ page, go }) {
        const before = psql(`select coalesce(view::text,'{}') from sheets where linked_key='linked_content'`)
        try {
          await go('/spaces/content')
          await writeWords(page, { todo: 'Idea' })
          ok(await page.$('[data-space-words] [data-word-input="todo"]') && !(await page.$('[data-word-input="s-todo"]')), 'Content has no simple words')
          await page.click('[data-space-words-save]')
          await page.waitForSelector('[data-space-words]', { state: 'detached', timeout: 15000 })
          const view = psql(`select view->'words'->'stage'->>'todo' from sheets where linked_key='linked_content'`)
          ok(view === '["Idea"]', `the Content sheet holds the word: ${view}`)
          await go('/spaces/content?view=list')
          await page.click('[data-group="stage"]')
          const todo = page.locator('[data-stage-pill="todo"]').first()
          if (await todo.count()) ok((await todo.innerText()).trim() === 'Idea', 'the Content Space shows the sheet word')
        } finally {
          psql(`update sheets set view='${before.replace(/'/g, "''")}'::jsonb where linked_key='linked_content'`)
        }
      },
    },
    {
      id: 'us3-users-see-no-button', as: 'design',
      async run({ page, go }) {
        await go('/spaces/design')
        ok(!(await page.$('[data-space-words-open]')), "a user can't change a Space's words")
      },
    },
  ]
}
