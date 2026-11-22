// Spaces lab real-app scenarios for the task Sheet and My notes (spec 021 FR-013a/b, T044, T051).
module.exports = (EMAIL, psql, ok) => {
  const spaceId = key => psql(`select id from team_spaces where key='${key}'`)
  const seed = (name, status, ownerRole, assigneeRole, space) => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,hours_estimate,updated_at)
      select gen_random_uuid(), '${name} ' || floor(random()*1e6)::text, (select id from brands order by name limit 1), 'Design',
        (select id from members where role='${ownerRole}' limit 1), (select id from members where role='${assigneeRole}' limit 1),
        '${ownerRole}', true, '${status}', now(), 'Medium', 2, now() returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${spaceId(space)}', 'manual') on conflict do nothing`)
    return id
  }
  const typeInto = async (page, taskId, col, text) => {
    const row = page.locator(`[data-task-sheet] [data-cell$="${taskId}|${col}"]`).first()
    await row.click()
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)
  }

  return [
    {
      id: 'sheet-design-space-typed-edits', as: 'admin',
      async run({ page, go }) {
        const t = seed('Sheet lab', 'd-prog', 'Content Creator', 'Graphic Designer', 'design')
        await go('/spaces/design?view=sheet')
        ok(await page.$('[data-task-sheet]'), 'the Design Space has a Sheet')
        await typeInto(page, t, 'priority', 'High')
        ok(psql(`select priority from tasks where id='${t}'`) === 'High', 'typing a priority saves it')
        await typeInto(page, t, 'due', '2027-01-15')
        ok(psql(`select due_date::text from tasks where id='${t}'`) === '2027-01-15', 'typing a date saves it')
        await typeInto(page, t, 'status', 'D-Check')
        ok(psql(`select status from tasks where id='${t}'`) === 'd-check', 'typing a stage moves the task')
        await typeInto(page, t, 'assignee', 'Nobody Atall')
        ok(/No one/.test(await page.textContent('[data-sheet-say]') ?? ''), 'an unknown name is refused with a reason')
      },
    },
    {
      id: 'sheet-stage-needs-handoff-opens-box', as: 'admin',
      async run({ page, go }) {
        const t = seed('Sheet handoff lab', 'c-check', 'Content Creator', 'Content Creator', 'content')
        psql(`delete from task_spaces where task_id='${t}' and space_id<>'${spaceId('content')}'`)
        await go(`/brands/${psql('select id from brands order by name limit 1')}?view=sheet`)
        await typeInto(page, t, 'status', 'Ready For Design')
        ok(await page.$('[data-handoff]'), 'the hand-off box opens')
        ok(psql(`select status from tasks where id='${t}'`) === 'c-check', 'the task waits for the box')
        await page.click('[data-handoff-cancel]')
      },
    },
    {
      id: 'sheet-read-only-for-others', as: 'video',
      async run({ page, go }) {
        const t = seed('Sheet readonly lab', 'd-prog', 'Content Creator', 'Graphic Designer', 'video')
        await go('/spaces/video?view=sheet')
        ok(await page.$('.fx-board-page.is-sheet'), "the Video Space keeps today's Video sheet")
        await go('/me?view=sheet')
        ok(!(await page.$(`[data-task-cell="${t}"]`)), "someone else's task is not on My tasks")
      },
    },
    {
      id: 'sheet-my-notes-private', as: 'content',
      async run({ page, go }) {
        const t = seed('Notes lab', 'c-prog', 'Content Creator', 'Content Creator', 'content')
        await go('/me?view=sheet')
        ok(await page.$('[data-notes-hint]'), 'My notes column is announced as private')
        await typeInto(page, t, 'notes', 'call the client first')
        const me = psql(`select id from members where role='Content Creator' limit 1`)
        ok(psql(`select v.value from sheet_values v join sheet_columns c on c.id=v.column_id where c.sheet='me:${me}' and v.task_id='${t}'`) === 'call the client first', 'the note is saved to my own column')
        await go('/board?view=sheet')
        ok(!(await page.content()).includes('call the client first'), "the note never shows on the team's sheets")
      },
    },
  ]
}
