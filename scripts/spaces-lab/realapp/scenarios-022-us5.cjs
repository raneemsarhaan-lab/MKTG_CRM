// Spec 022 US5 (T050): changing the assignee drops the Spaces only the old assignee brought.
module.exports = (EMAIL, psql, ok) => {
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const seed = (via) => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at)
      select gen_random_uuid(), 'Lab 022 us5 ' || floor(random()*1e6)::text, (select id from brands order by name limit 1), 'Post',
        a.id, c.id, a.role, true, 'c-prog', now(), 'Medium', now() from members a, members c where a.email='${EMAIL.admin}' and c.email='${EMAIL.content}' returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('content')}', '${via}'), ('${id}', '${space('planning')}', 'manual') on conflict do nothing`)
    return id
  }
  const reassign = async (page, go, id) => {
    await go('/spaces/planning?view=sheet')
    const cell = `[data-task-sheet] [data-cell$="${id}|assignee"]`
    await page.waitForSelector(cell, { timeout: 60000 })
    await page.locator(cell).click()
    await page.keyboard.type(psql(`select name from members where email='${EMAIL.dms}'`))
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2500)
  }
  const inContent = id => psql(`select count(*) from task_spaces where task_id='${id}' and space_id='${space('content')}'`)
  return [
    {
      id: '022-us5-old-assignee-space-goes', as: 'admin',
      async run({ page, go }) {
        // The Content member is the only one who brought Content; the new assignee isn't in Content.
        const dmsInContent = psql(`select count(*) from team_space_members sm join members m on m.id=sm.member_id where m.email='${EMAIL.dms}' and sm.space_id='${space('content')}'`)
        if (dmsInContent !== '0') psql(`delete from team_space_members where space_id='${space('content')}' and member_id=(select id from members where email='${EMAIL.dms}')`)
        const a = seed('assignee'), b = seed('created')
        try {
          await reassign(page, go, a)
          ok(psql(`select m.email from tasks t join members m on m.id=t.assignee_id where t.id='${a}'`) === EMAIL.dms, 'reassigned')
          ok(inContent(a) === '0', 'Content, which only the old assignee brought, goes')
          ok(psql(`select count(*) from task_spaces where task_id='${a}' and space_id='${space('planning')}'`) === '1', 'a Space added by hand stays')
          await reassign(page, go, b)
          ok(inContent(b) === '1', 'Content stays when the task was created there')
        } finally {
          psql(`update tasks set dropped_at=now() where id in ('${a}','${b}')`)
          if (dmsInContent !== '0') psql(`insert into team_space_members (space_id, member_id) select '${space('content')}', id from members where email='${EMAIL.dms}' on conflict do nothing`)
        }
      },
    },
  ]
}
