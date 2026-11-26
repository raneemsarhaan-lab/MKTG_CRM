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
    await go('/me?view=sheet')
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
          await go('/spaces/design?view=board')
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
          // QA 26 Nov 2026 (F03, F21): a Design task on its own is just a task, with no "Unlinked" tag.
          await go('/spaces/design?view=board')
          await page.waitForSelector(`[data-task-card="${id}"]`, { timeout: 20000 })
          ok(!(await page.$(`[data-task-card="${id}"] [data-media-unlinked-card]`)), 'no "Unlinked" tag')
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
          // QA 26 Nov 2026 (F21, owner): no linked copies — the list of separate Design/Video tasks is gone.
          await openLink(page, go, c, `art ${n}`)
          await page.waitForTimeout(800)
          ok(!(await page.$('[data-media-option]')), 'no separate Design or Video task is offered')
          ok(!!(await page.$('[data-media-create]')), 'only putting the task itself on the boards')
          await page.keyboard.press('Escape')
          ok(psql(`select coalesce(content_task_id::text, '-') from tasks where id='${m}'`) === '-', 'the separate Design task stays on its own')

          await openLink(page, go, c2, `new ${n}`)
          await page.click('[data-media-board-choice="both"]')
          await page.click('[data-media-create] button')
          await page.waitForTimeout(3000)
          // Owner, 25 Nov 2026: nothing is copied — the task itself goes on both boards.
          ok(psql(`select count(*) from tasks where content_task_id='${c2}'`) === '0', 'no linked copies')
          const on = psql(`select string_agg(s.key, ',' order by s.key) from task_spaces ts join team_spaces s on s.id=ts.space_id where ts.task_id='${c2}' and s.media_board is not null`)
          ok(on === 'design,video', `"Both" puts the task itself on both boards: ${on}`)
        } finally { drop([c, c2, m]) }
      },
    },
    {
      id: '022-us3-no-link-past-d-check', as: 'admin',
      async run({ page, go }) {
        const c = content(`Lab 022 late ${rnd()}`, 'final-check')
        try {
          await go('/me?view=sheet')
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
      // QA 26 Nov 2026 (F21, owner): a calendar day makes one task that shows on the Design board too.
      id: '022-us3-calendar-day-link', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const day = psql(`select to_char((now() at time zone 'Africa/Cairo')::date, 'YYYY-MM-DD')`)
        let c
        try {
          await go('/spaces/content?view=calendar')
          await page.waitForSelector(`[data-cal-link="${day}"]`, { timeout: 60000 })
          await page.click(`[data-cal-link="${day}"]`)
          await page.waitForSelector('[data-media-pick]', { timeout: 10000 })
          await page.fill('[data-media-search]', `cal art ${n}`)
          ok(!(await page.$('[data-media-option]')), 'no separate Design or Video task is offered')
          await page.click('[data-media-board-choice="design"]')
          await page.click('[data-media-create] button')
          await page.waitForTimeout(3000)
          c = psql(`select id from tasks where name='cal art ${n}' and dropped_at is null`)
          ok(!!c, 'the task is made')
          const row = psql(`select to_char(publish_date,'YYYY-MM-DD')||'|'||coalesce(media_board,'-') from tasks where id='${c}'`)
          ok(row === `${day}|-`, `that day is its publishing date: ${row}`)
          ok(psql(`select count(*) from tasks where content_task_id='${c}'`) === '0', 'no linked copy')
          const on = psql(`select string_agg(s.key, ',' order by s.key) from task_spaces ts join team_spaces s on s.id=ts.space_id where ts.task_id='${c}'`)
          ok(on.split(',').includes('content') && on.split(',').includes('design'), `the one task shows in Content and Design: ${on}`)
        } finally { drop([c]) }
      },
    },
    {
      id: '022-us3-unlink-as-designer', as: 'design',
      async run({ page, go, signInAs, BASE }) {
        const n = rnd()
        const c = content(`Lab 022 pair ${n}`, 'd-prog')
        const m = media(`Lab 022 pair art ${n}`)
        psql(`update tasks set content_task_id='${c}', status='d-prog' where id='${m}'`)
        try {
          await go(`/spaces/design?view=board&task=${m}`)
          await page.waitForSelector('[data-media-section] [data-media-unlink]', { timeout: 30000 })
          // Spec 024 (§6): a designer isn't among the roles that link and unlink; a content creator is.
          await page.click('[data-media-section] [data-media-unlink]')
          await page.waitForTimeout(2500)
          ok(psql(`select coalesce(content_task_id::text,'-') from tasks where id='${m}'`) === c, 'a designer is refused')
          ok((await page.textContent('[data-media-section]')).includes("can't link or unlink here"), 'with the reason')
          const writer = await signInAs('content')
          await writer.page.goto(`${BASE}/spaces/content?view=board&task=${c}`, { waitUntil: 'networkidle', timeout: 120000 })
          await writer.page.waitForSelector('[data-media-section] [data-media-unlink]', { timeout: 30000 })
          await writer.page.click('[data-media-section] [data-media-unlink]')
          await writer.page.waitForTimeout(2500)
          await writer.ctx.close()
          ok(psql(`select coalesce(content_task_id::text,'-') from tasks where id='${m}'`) === '-', 'a content creator unlinks it')
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
          await go('/me?view=sheet')
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
