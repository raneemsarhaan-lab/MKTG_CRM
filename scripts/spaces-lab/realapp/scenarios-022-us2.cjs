// Spec 022 US2 (T021): Ready For Design links content to media; the content task waits for every media task.
module.exports = (EMAIL, psql, ok) => {
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const seed = (name, type, status = 'c-check') => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at)
      select gen_random_uuid(), '${name} ' || floor(random()*1e6)::text, (select id from brands order by name limit 1), '${type}',
        m.id, m.id, m.role, true, '${status}', now(), 'Medium', now() from members m where m.email='${EMAIL.admin}' returning id`).split(/\n/)[0]
    // Planning's Sheet is a task sheet (Content and Video open their linked sheets).
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('planning')}', 'manual') on conflict do nothing`)
    return id
  }
  const typeStatus = async (page, go, where, id, text) => {
    // Spec 026: the task sheet is a view of the brand's page.
    void where
    await go('/me?view=sheet')
    const cell = `[data-task-sheet] [data-cell$="${id}|status"]`
    await page.waitForSelector(cell, { timeout: 60000 })
    await page.locator(cell).click()
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1800)
  }
  /** Moves a task from its panel's stage menu (works for any task, wherever it shows). */
  const panelStage = async (page, go, id, label) => {
    await go(`/spaces/planning?view=board&task=${id}`)
    await page.locator('button[aria-label^="Stage:"]').first().click()
    await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]', { hasText: label }).first().click()
    await page.waitForTimeout(2000)
  }
  // Owner, 25 Nov 2026: a hand-off puts the task itself on the boards. The boards it's on, and its people's roles.
  const boards = id => psql(`select coalesce(string_agg(s.key, ',' order by s.key), '') from task_spaces ts join team_spaces s on s.id=ts.space_id where ts.task_id='${id}' and s.media_board is not null`)
  const roles = id => psql(`select coalesce(string_agg(r.role, ',' order by r.role), '') from task_assignees a join members r on r.id=a.member_id where a.task_id='${id}'`).split(',')
  const copies = id => psql(`select count(*) from tasks where content_task_id='${id}'`)
  const media = id => psql(`select coalesce(string_agg(m.media_board||':'||m.status||':'||coalesce(a.role,'-'), ',' order by m.media_board), '') from tasks m left join members a on a.id=m.assignee_id where m.content_task_id='${id}'`)
  const stage = id => psql(`select status from tasks where id='${id}'`)
  const drop = ids => psql(`update tasks set dropped_at=now() where id in (${ids.map(i => `'${i}'`).join(',')}) or content_task_id in (${ids.map(i => `'${i}'`).join(',')})`)

  return [
    {
      id: '022-us2-reel-links-to-video-with-default-editor', as: 'admin',
      async run({ page, go }) {
        const t = seed('Lab 022 reel', 'Reel')
        try {
          await typeStatus(page, go, 'planning', t, 'Ready For Design')
          await page.waitForSelector('[data-handoff]', { timeout: 15000 })
          ok(await page.isChecked('[data-handoff-space="video"] input'), 'Video is ticked for a Reel')
          ok(!(await page.isChecked('[data-handoff-space="design"] input')), 'Design is not')
          await page.click('[data-handoff-confirm]')
          await page.waitForTimeout(2500)
          ok(copies(t) === '0' && media(t) === '', 'no linked copy')
          ok(boards(t) === 'video', `the task itself is on the Video board: ${boards(t)}`)
          ok(roles(t).includes('Video Editor'), `the default editor joins its assignees: ${roles(t)}`)
          ok(stage(t) === 'r-design' && psql(`select auto_linked_at is not null from tasks where id='${t}'`) === 't', 'the task is at Ready For Design, handed off')
        } finally { drop([t]) }
      },
    },
    {
      id: '022-us2-both-boards-one-task', as: 'admin',
      async run({ page, go }) {
        const before = psql(`select media_boards::text from content_types where label='Story'`)
        psql(`update content_types set media_boards='{design,video}' where label='Story'`)
        const t = seed('Lab 022 both', 'Story')
        try {
          await typeStatus(page, go, 'planning', t, 'Ready For Design')
          await page.waitForSelector('[data-handoff]', { timeout: 15000 })
          await page.click('[data-handoff-skip]')
          await page.waitForTimeout(2500)
          ok(copies(t) === '0', 'no copies')
          ok(boards(t) === 'design,video', `the one task is on both boards: ${boards(t)}`)
          ok(roles(t).includes('Graphic Designer') && roles(t).includes('Video Editor'), `each board's default joins its assignees: ${roles(t)}`)
          for (const key of ['design', 'video']) {
            await go(`/spaces/${key}?view=board`)
            await page.waitForSelector(`[data-task-card="${t}"]`, { timeout: 30000 })
          }
          // One task: it moves on like any other, through D-Check to F-Check, and leaves the boards' range.
          psql(`update tasks set status='d-check' where id='${t}'`)
          await panelStage(page, go, t, 'F-Check')
          ok(stage(t) === 'final-check', `it moves to F-Check: ${stage(t)}`)
          await go('/spaces/design?view=board')
          await page.waitForTimeout(1500)
          ok(!(await page.$(`[data-task-card="${t}"]`)), 'past D-Check it is off the Design board')
        } finally { drop([t]); psql(`update content_types set media_boards='${before}' where label='Story'`) }
      },
    },
    {
      id: '022-us2-links-only-once', as: 'admin',
      async run({ page, go }) {
        const t = seed('Lab 022 once', 'Post')
        try {
          await typeStatus(page, go, 'planning', t, 'Ready For Design')
          await page.waitForSelector('[data-handoff]', { timeout: 15000 })
          await page.click('[data-handoff-confirm]')
          await page.waitForTimeout(2500)
          ok(boards(t) === 'design', `on the Design board: ${boards(t)}`)
          psql(`update tasks set status='c-check' where id='${t}'`)       // back to C-Check
          await typeStatus(page, go, 'planning', t, 'Ready For Design')
          ok(!(await page.$('[data-handoff]')), 'no box the second time')
          ok(stage(t) === 'r-design' && copies(t) === '0' && boards(t) === 'design', 'it moves on its own, still on the Design board, no copies')
        } finally { drop([t]) }
      },
    },
  ]
}
