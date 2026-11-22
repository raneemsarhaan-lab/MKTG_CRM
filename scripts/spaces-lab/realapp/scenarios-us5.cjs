// Spaces lab real-app scenarios for US5 (spec 021): simple tasks.
module.exports = (EMAIL, psql, ok) => {
  const spaceId = key => psql(`select id from team_spaces where key='${key}'`)
  const seedSimple = (name, status, role = 'Marketing Manager') => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,kind,simple_status,stage_date,due_date,priority,hours_estimate,updated_at)
      select gen_random_uuid(), '${name} ' || floor(random()*1e6)::text, (select id from brands order by name limit 1), 'Post',
        m.id, m.id, m.role, true, 'todo', 'simple', '${status}', now() - interval '30 days', now() - interval '3 days', 'Medium', 2, now()
      from members m where m.role='${role}' limit 1 returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${spaceId('planning')}', 'manual') on conflict do nothing`)
    return id
  }

  return [
    {
      id: 'us5-create-in-planning-is-simple', as: 'admin',
      async run({ page, go }) {
        const name = `Lab plan ${Date.now()}`
        await go('/spaces/planning?view=board')
        await page.getByRole('button', { name: 'Add task' }).first().click()
        await page.fill('input[placeholder="Task name — or paste a list"]', name)
        ok(/simple task/i.test(await page.textContent('[data-gets-stages]') ?? ''), 'the form says it will be a simple task')
        await page.locator('button', { hasText: /^Create Task$/i }).first().click()
        await page.waitForTimeout(2000)
        ok(psql(`select kind||':'||coalesce(simple_status,'') from tasks where name='${name}'`) === 'simple:s-todo', 'created in Planning → simple, To Do')
      },
    },
    {
      id: 'us5-no-sla-not-in-content-sheet', as: 'admin',
      async run({ page, go }) {
        const t = seedSimple('Lab overdue plan', 's-todo')
        psql(`update tasks set project_id=(select id from projects where is_theme limit 1) where id='${t}'`)
        await go(`/spaces/planning?view=board`)
        const card = page.locator(`[data-simple-column="s-todo"]`)
        ok(await card.count() === 1, 'the Board shows the dashed To Do column')
        ok(!(await page.locator('[data-simple-column] >> text=/OVERDUE|Overdue|Stuck/').count()), 'no SLA badge on simple cards')
        await go('/board?view=content')
        await page.waitForSelector('[data-content-sheet]')
        ok(!(await page.locator('[data-content-sheet]').innerText()).includes(psql(`select name from tasks where id='${t}'`)), 'not on the Content sheet')
      },
    },
    {
      id: 'us5-done-celebrates-and-moves-only-itself', as: 'admin',
      async run({ page, go }) {
        const t = seedSimple('Lab done plan', 's-doing')
        const sub = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,hours_estimate,updated_at,parent_task_id)
          select gen_random_uuid(), 'Lab pipeline sub', brand_id, 'Post', task_owner_id, assignee_id, initiator_role, true, 'c-prog', now(), 'Medium', 1, now(), id from tasks where id='${t}' returning id`).split(/\n/)[0]
        await go(`/spaces/planning?task=${t}`)
        await page.waitForSelector('[data-simple-steps]')
        await page.click('[data-simple-step="s-done"]')
        await page.waitForTimeout(1800)
        ok(psql(`select simple_status from tasks where id='${t}'`) === 's-done', 'Done is saved')
        ok(psql(`select status from tasks where id='${sub}'`) === 'c-prog', "the pipeline subtask didn't move")
        ok(await page.locator('text=/Done/').count() > 0, 'the panel shows Done')
      },
    },
  ]
}
