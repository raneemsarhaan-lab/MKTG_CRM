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
        ok(!(await page.content()).includes('call the client first'), "the note never shows on the team's sheets (nor in the page's data)")
      },
    },
  ]
}

// Saved views (spec 021 FR-012a, T039/T040).
module.exports.views = (EMAIL, psql, ok) => [
  {
    id: 'views-personal-saved-and-reloaded', as: 'admin',
    async run({ page, go }) {
      const design = psql(`select id from team_spaces where key='design'`)
      psql(`delete from saved_views where node='space:${design}'`)
      await go('/spaces/design')
      await page.click('[data-add-view]')
      await page.fill('[data-new-view-name]', 'Lab sheet')
      await page.click('[data-new-view-type="sheet"]')
      await page.click('[data-new-view-create]')
      await page.waitForSelector('[data-view-config]')
      ok(psql(`select count(*) from saved_views where node='space:${design}' and name='Lab sheet' and owner_id is not null and type='sheet'`) === '1', 'a personal view is saved')
      await page.click('[data-view-fields] summary')
      await page.uncheck('[data-view-field="platform"]')
      await page.click('[data-view-save]')
      await page.waitForTimeout(1200)
      ok(/"platform"/.test(psql(`select config::text from saved_views where name='Lab sheet'`)) === false, 'fields saved without Platform')
      const id = psql(`select id from saved_views where name='Lab sheet'`)
      await go(`/spaces/design?view=v:${id}`)
      await page.waitForSelector(`[data-saved-view="${id}"] [data-task-sheet]`)
      ok(!(await page.$('[data-task-sheet] [data-cell$="|platform"]')), 'reloading opens the view with its fields')
      ok(await page.$('[data-new-view-type]') === null, 'the + View form is closed')
    },
  },
  {
    id: 'views-shared-filter-and-readonly', as: 'admin',
    async run({ page, go, browser }) {
      const b = psql('select id from brands order by name limit 1')
      psql(`delete from saved_views where node='brand:${b}'`)
      await go(`/brands/${b}`)
      await page.click('[data-add-view]')
      await page.fill('[data-new-view-name]', 'Lab shared list')
      await page.click('[data-new-view-personal="false"]')
      await page.click('[data-new-view-create]')
      await page.waitForSelector('[data-view-config]')
      await page.click('[data-view-filter="type"] summary')
      const want = psql(`select content_type_label from tasks where brand_id='${b}' and dropped_at is null and content_type_label is not null group by 1 order by count(*) desc limit 1`)
      await page.check(`[data-view-filter="type"] [data-view-option="${want}"]`)
      await page.click('[data-view-save]')
      await page.waitForTimeout(1200)
      ok(psql(`select owner_id is null from saved_views where name='Lab shared list'`) === 't', 'shared view has no owner')
      const rows = await page.$$eval('[data-saved-view] [data-row]', els => els.length)
      const n = psql(`select count(*) from tasks where brand_id='${b}' and dropped_at is null and content_type_label='${want}'`)
      ok(String(rows) === n, `the filter narrows the list: ${rows} vs ${n}`)
    },
  },
  {
    id: 'views-shared-readonly-for-users', as: 'content',
    async run({ page, go }) {
      const b = psql('select id from brands order by name limit 1')
      const id = psql(`select id from saved_views where name='Lab shared list'`)
      ok(!!id, 'the shared view from the previous scenario exists')
      await go(`/brands/${b}?view=v:${id}`)
      await page.waitForSelector('[data-view-readonly]')
      ok(!(await page.$('[data-view-save]')), "a user can't change someone else's shared view")
    },
  },
  {
    id: 'views-home-pin-hide', as: 'design',
    async run({ page, go }) {
      const me = psql(`select id from members where role='Graphic Designer' limit 1`)
      psql(`update members set view_prefs='{}' where id='${me}'`)
      await go('/spaces/design')
      await page.click('[data-tab-menu="calendar"]')
      await page.click('[data-tab-option="home"]')
      await page.waitForTimeout(800)
      await go('/spaces/design')
      ok((await page.getAttribute('[data-view-tab="calendar"]', 'aria-selected')) === 'true', 'the page opens on the home view')
      await page.click('[data-tab-menu="workload"]')
      await page.click('[data-tab-option="pin"]')
      const first = await page.$eval('[role="tablist"] [data-view-tab]', el => el.getAttribute('data-view-tab'))
      ok(first === 'workload', `a pinned view comes first: ${first}`)
      await page.click('[data-tab-menu="board"]')
      await page.click('[data-tab-option="hide"]')
      ok(!(await page.$('[data-view-tab="board"]')), 'a hidden view leaves the tabs')
      await page.waitForTimeout(800)
      const saved = psql(`select view_prefs::text from members where id='${me}'`)
      ok(/"home": "calendar"/.test(saved) && /"pinned": \["workload"\]/.test(saved) && /"hidden": \["board"\]/.test(saved), `saved for this member: ${saved}`)
      await page.click('[data-hidden-views]')
      await page.click('[data-tab-option="board"]')
      ok(await page.$('[data-view-tab="board"]'), 'Show brings it back')
    },
  },
]
