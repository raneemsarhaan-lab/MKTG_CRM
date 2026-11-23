// Spec 022 US3 (T031): Link task, Create task on a board, unlink, and the media boards' Shows in.
module.exports = (EMAIL, psql, ok) => {
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const rnd = () => Math.floor(Math.random() * 1e6)
  const content = (name, status = 'c-check') => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at)
      select gen_random_uuid(), '${name}', (select id from brands order by name limit 1), 'Post',
        m.id, m.id, m.role, true, '${status}', now(), 'Medium', now() from members m where m.email='${EMAIL.admin}' returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('planning')}', 'manual') on conflict do nothing`)
    return id
  }
  const media = (name, board = 'design', who = EMAIL.design) => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,entry_stage,media_board,priority,updated_at)
      select gen_random_uuid(), '${name}', (select id from brands order by name limit 1), 'Post',
        m.id, m.id, m.role, true, 'r-design', now(), 'r-design', '${board}', 'Medium', now() from members m where m.email='${who}' returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space(board)}', 'created') on conflict do nothing`)
    return id
  }
  const drop = ids => {
    const list = ids.filter(Boolean).map(i => `'${i}'`).join(',')
    if (list) psql(`update tasks set dropped_at=now() where id in (${list}) or content_task_id in (${list})`)
  }
  const openLink = async (page, go, id, typed) => {
    await go('/spaces/planning?view=sheet')
    const cell = `[data-task-sheet] [data-cell$="${id}|media"]`
    await page.waitForSelector(cell, { timeout: 60000 })
    await page.locator(cell).click()
    await page.keyboard.type(typed)
    await page.waitForSelector('[data-media-pick]', { timeout: 10000 })
  }

  return [
    {
      id: '022-us3-create-on-design', as: 'design',
      async run({ page, go }) {
        const name = `Lab 022 board ${rnd()}`
        let id
        try {
          await go('/spaces/design?view=list')
          await page.click('[data-media-create-open]')
          await page.fill('[data-media-create-name]', name)
          await page.click('[data-media-create-go]')
          await page.waitForTimeout(2500)
          id = psql(`select id from tasks where name='${name}'`)
          ok(!!id, 'the task is made')
          const row = psql(`select media_board||':'||status||':'||entry_stage||':'||coalesce(content_task_id::text,'-') from tasks where id='${id}'`)
          ok(row === 'design:r-design:r-design:-', `an unlinked Design task at Ready For Design: ${row}`)
          ok(psql(`select count(*) from task_spaces where task_id='${id}' and space_id='${space('design')}'`) === '1', 'on the Design board')
          ok(psql(`select count(*) from task_spaces where task_id='${id}' and space_id<>'${space('design')}'`) === '0', 'and nowhere else')
          await go('/spaces/design?view=board')
          await page.waitForSelector(`[data-task-id="${id}"] [data-media-unlinked-card], [data-card="${id}"] [data-media-unlinked-card]`, { timeout: 20000 }).catch(() => null)
        } finally { drop([id]) }
      },
    },
    {
      id: '022-us3-sheet-link-and-create-both', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const c = content(`Lab 022 piece ${n}`)
        const c2 = content(`Lab 022 other ${n}`)
        const m = media(`Lab 022 art ${n}`)
        try {
          await openLink(page, go, c, `art ${n}`)
          await page.waitForSelector(`[data-media-option="${m}"]`, { timeout: 10000 })
          await page.click(`[data-media-option="${m}"]`)
          await page.waitForTimeout(2500)
          ok(psql(`select content_task_id from tasks where id='${m}'`) === c, 'picking the unlinked Design task links it')
          ok(psql(`select status from tasks where id='${c}'`) === 'c-check', 'linked before Ready For Design: the content task stays where it is')
          await page.waitForSelector(`[data-task-sheet] [data-cell$="${c}|media"] [data-media-chip="design"]`, { timeout: 15000 })

          await openLink(page, go, c2, `new ${n}`)
          await page.click('[data-media-board-choice="both"]')
          await page.click('[data-media-create] button')
          await page.waitForTimeout(3000)
          const made = psql(`select string_agg(media_board||':'||status, ',' order by media_board) from tasks where content_task_id='${c2}' and dropped_at is null`)
          ok(made === 'design:r-design,video:r-design', `Create task with Both makes two linked media tasks: ${made}`)
        } finally { drop([c, c2, m]) }
      },
    },
    {
      id: '022-us3-no-link-past-d-check', as: 'admin',
      async run({ page, go }) {
        const c = content(`Lab 022 late ${rnd()}`, 'final-check')
        try {
          await go('/spaces/planning?view=sheet')
          const cell = `[data-task-sheet] [data-cell$="${c}|media"]`
          await page.waitForSelector(cell, { timeout: 60000 })
          await page.locator(cell).click()
          await page.keyboard.type('x')
          await page.waitForTimeout(800)
          ok(!(await page.$('[data-media-pick]')), 'no Link task list at F-Check')
          ok(/past D-Check/.test(await page.textContent('[data-sheet-say]').catch(() => '') ?? ''), 'and it says why')
        } finally { drop([c]) }
      },
    },
    {
      id: '022-us3-calendar-day-link', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const m = media(`Lab 022 cal art ${n}`)
        const day = psql(`select to_char((now() at time zone 'Africa/Cairo')::date, 'YYYY-MM-DD')`)
        let c
        try {
          await go('/spaces/content?view=calendar')
          await page.waitForSelector(`[data-cal-link="${day}"]`, { timeout: 60000 })
          await page.click(`[data-cal-link="${day}"]`)
          await page.waitForSelector('[data-media-pick]', { timeout: 10000 })
          await page.fill('[data-media-search]', `cal art ${n}`)
          await page.waitForSelector(`[data-media-option="${m}"]`, { timeout: 10000 })
          await page.click(`[data-media-option="${m}"]`)
          await page.waitForTimeout(3000)
          c = psql(`select content_task_id from tasks where id='${m}'`)
          ok(!!c, 'the Design task is linked to a new content task')
          const row = psql(`select name||'|'||to_char(publish_date,'YYYY-MM-DD')||'|'||coalesce(media_board,'-') from tasks where id='${c}'`)
          ok(row === `cal art ${n}|${day}|-`, `the content task has that day as its publishing date: ${row}`)
          ok(psql(`select count(*) from task_spaces where task_id='${c}' and space_id='${space('content')}'`) === '1', 'in the Content Space')
        } finally { drop([m, c]) }
      },
    },
    {
      id: '022-us3-unlink-as-designer', as: 'design',
      async run({ page, go }) {
        const n = rnd()
        const c = content(`Lab 022 pair ${n}`, 'd-prog')
        const m = media(`Lab 022 pair art ${n}`)
        psql(`update tasks set content_task_id='${c}', status='d-prog' where id='${m}'`)
        try {
          await go(`/spaces/design?view=list&task=${m}`)
          await page.waitForSelector('[data-media-section] [data-media-unlink]', { timeout: 30000 })
          await page.click('[data-media-section] [data-media-unlink]')
          await page.waitForTimeout(2500)
          ok(psql(`select coalesce(content_task_id::text,'-') from tasks where id='${m}'`) === '-', 'the media task is unlinked')
          ok(psql(`select count(*) from tasks where id in ('${c}','${m}') and dropped_at is null`) === '2', 'both stay')
          psql(`update tasks set status='d-check' where id='${m}'`)
          ok(psql(`select status from tasks where id='${c}'`) === 'd-prog', 'and they move separately')
        } finally { drop([c, m]) }
      },
    },
    {
      id: '022-us3-designer-assignee-not-on-board', as: 'admin',
      async run({ page, go }) {
        const c = content(`Lab 022 writer ${rnd()}`)
        try {
          await go('/spaces/planning?view=sheet')
          const designer = psql(`select name from members where email='${EMAIL.design}'`)
          const cell = `[data-task-sheet] [data-cell$="${c}|assignee"]`
          await page.waitForSelector(cell, { timeout: 60000 })
          await page.locator(cell).click()
          await page.keyboard.type(designer)
          await page.keyboard.press('Enter')
          await page.waitForTimeout(2500)
          ok(psql(`select a.email from tasks t join members a on a.id=t.assignee_id where t.id='${c}'`) === EMAIL.design, 'the designer is the assignee')
          ok(psql(`select count(*) from task_spaces where task_id='${c}' and space_id='${space('design')}'`) === '0', 'the content task is not on the Design board')
        } finally { drop([c]) }
      },
    },
  ]
}
