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
    await go(`/spaces/${where}?view=sheet`)
    const cell = `[data-task-sheet] [data-cell$="${id}|status"]`
    await page.waitForSelector(cell, { timeout: 60000 })
    await page.locator(cell).click()
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1800)
  }
  /** Moves a task from its panel's stage menu (works for any task, wherever it shows). */
  const panelStage = async (page, go, id, label) => {
    await go(`/spaces/planning?view=list&task=${id}`)
    await page.locator('button[aria-label^="Stage:"]').first().click()
    await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]', { hasText: label }).first().click()
    await page.waitForTimeout(2000)
  }
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
          ok(media(t) === 'video:r-design:Video Editor', `one linked Video task with the default editor: ${media(t)}`)
          ok(stage(t) === 'r-design' && psql(`select auto_linked_at is not null from tasks where id='${t}'`) === 't', 'the content task waits at Ready For Design, linked')
          ok(psql(`select count(*) from task_spaces ts join tasks m on m.id=ts.task_id where m.content_task_id='${t}' and ts.space_id='${space('video')}'`) === '1', 'the media task is on the Video board')
        } finally { drop([t]) }
      },
    },
    {
      id: '022-us2-both-boards-gate-f-check', as: 'admin',
      async run({ page, go }) {
        const before = psql(`select media_boards::text from content_types where label='Story'`)
        psql(`update content_types set media_boards='{design,video}' where label='Story'`)
        const t = seed('Lab 022 both', 'Story')
        try {
          await typeStatus(page, go, 'planning', t, 'Ready For Design')
          await page.waitForSelector('[data-handoff]', { timeout: 15000 })
          await page.click('[data-handoff-skip]')
          await page.waitForTimeout(2500)
          ok(media(t) === 'design:r-design:Graphic Designer,video:r-design:Video Editor', `two media tasks with each board's default: ${media(t)}`)
          const d = psql(`select id from tasks where content_task_id='${t}' and media_board='design'`)
          const v = psql(`select id from tasks where content_task_id='${t}' and media_board='video'`)
          psql(`update tasks set status='d-check' where id in ('${d}','${v}')`)
          await panelStage(page, go, d, 'F-Check')
          ok(stage(d) === 'final-check', 'Design passes D-Check')
          ok(stage(t) === 'd-check', `the content task still waits on Video: ${stage(t)}`)
          // User, 2026-11-23: moving the linked row moves the task it waits on (with that task's permissions).
          await typeStatus(page, go, 'planning', t, 'F-Check')
          ok(stage(v) === 'final-check', `the Video task moved with it: ${stage(v)}`)
          ok(stage(t) === 'final-check', `both passed: the content task is at F-Check: ${stage(t)}`)
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
          const m = psql(`select id from tasks where content_task_id='${t}'`)
          psql(`update tasks set content_task_id=null where id='${m}'`)   // unlinked by hand
          psql(`update tasks set status='c-check' where id='${t}'`)       // and back to C-Check
          await typeStatus(page, go, 'planning', t, 'Ready For Design')
          ok(!(await page.$('[data-handoff]')), 'no box the second time')
          ok(stage(t) === 'r-design' && psql(`select count(*) from tasks where content_task_id='${t}'`) === '0', 'it moves on its own, with no new media task')
          psql(`update tasks set dropped_at=now() where id='${m}'`)
        } finally { drop([t]) }
      },
    },
  ]
}
