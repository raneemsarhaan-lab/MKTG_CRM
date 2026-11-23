// Spec 022 US1 (T010): every task is a pipeline task, with its Space's default assignee; simple tasks migrated.
module.exports = (EMAIL, psql, ok) => {
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const roleOf = key => psql(`select coalesce(default_assignee_role,'') from team_spaces where key='${key}'`)
  const setRole = (key, role) => psql(`update team_spaces set default_assignee_role=${role ? `'${role}'` : 'null'} where key='${key}'`)
  const memberWithRole = role => psql(`select name from members where role='${role}' order by name limit 1`)
  const create = async (page, go, where, name) => {
    await go(`/spaces/${where}?view=board`)
    await page.getByRole('button', { name: 'Add task' }).first().click()
    await page.fill('input[placeholder="Task name — or paste a list"]', name)
    await page.locator('button', { hasText: /^Create Task$/i }).first().click()
    await page.waitForTimeout(2200)
  }
  const info = name => psql(`select t.kind||'|'||t.status||'|'||coalesce(m.name,'') from tasks t left join members m on m.id=t.assignee_id where t.name='${name}'`)

  return [
    {
      id: '022-us1-new-task-is-pipeline-with-default-assignee', as: 'admin',
      async run({ page, go }) {
        const before = roleOf('content')
        try {
          setRole('content', 'Content Creator')
          const name = `Lab 022 content ${Date.now()}`
          await create(page, go, 'content', name)
          ok(info(name) === `pipeline|todo|${memberWithRole('Content Creator')}`, `made in Content: pipeline, To Do, the Content Creator: ${info(name)}`)
          ok(!(await page.$('[data-gets-stages]')), 'the form no longer talks about simple tasks')
          psql(`update tasks set dropped_at=now() where name='${name}'`)
        } finally { setRole('content', before || null) }
      },
    },
    {
      id: '022-us1-default-role-in-settings-new-tasks-only', as: 'admin',
      async run({ page, go }) {
        const before = roleOf('content')
        try {
          setRole('content', 'Content Creator')
          const first = `Lab 022 first ${Date.now()}`
          await create(page, go, 'content', first)
          await go('/settings')
          await page.click('[data-settings-tab="spaces"]')
          await page.waitForSelector('[data-space-default-role="content"]')
          await page.selectOption('[data-space-default-role="content"]', 'Digital Marketing Specialist')
          await page.waitForTimeout(1500)
          ok(roleOf('content') === 'Digital Marketing Specialist', 'the role is saved')
          const second = `Lab 022 second ${Date.now()}`
          await create(page, go, 'content', second)
          ok(info(first).endsWith(memberWithRole('Content Creator')), 'the earlier task keeps its assignee')
          ok(info(second).endsWith(memberWithRole('Digital Marketing Specialist')), `the next task follows the new role: ${info(second)}`)
          psql(`update tasks set dropped_at=now() where name in ('${first}', '${second}')`)
        } finally { setRole('content', before || null) }
      },
    },
    {
      id: '022-us1-no-simple-tasks-and-migrated-not-a-new-post', as: 'admin',
      async run({ page, go }) {
        const brand = psql(`select id from brands order by name limit 1`)
        const id = psql(`insert into tasks (id,name,brand_id,task_owner_id,assignee_id,initiator_role,status,stage_date,publish_date,updated_at,migrated_simple)
          select gen_random_uuid(), 'Lab migrated done ' || floor(random()*1e6)::text, '${brand}', m.id, m.id, m.role, 'publish', current_date, current_date, now(), true
          from members m where m.role='Marketing Manager' limit 1 returning id`).split(/\n/)[0]
        try {
          ok(psql(`select count(*) from tasks where kind='simple'`) === '0', 'no simple tasks remain')
          await go('/spaces/planning?view=board')
          ok(!(await page.$('[data-simple-column], [data-kind-filter], [data-simple-steps]')), 'no simple columns or Kind filter on a Board')
          await go(`/brands/${brand}/library`)
          ok(!(await page.locator(`text=${psql(`select name from tasks where id='${id}'`)}`).count()), 'a migrated Done task is not a new post in the Library')
          await go(`/brands/${brand}/calendar`)
          ok(!(await page.$(`[data-cal-task="${id}"]`)), '…nor on the brand Calendar')
        } finally { psql(`delete from tasks where id='${id}'`) }
      },
    },
  ]
}
