// My tasks (user, 2026-11-23, design/my-tasks.html): sidebar, sections, tiles, private to-dos, make it a task, quick move.
module.exports = (EMAIL, psql, ok) => {
  const rnd = () => String(Math.floor(1e5 + Math.random() * 9e5))
  const today = () => psql(`select to_char((now() at time zone 'Africa/Cairo')::date, 'YYYY-MM-DD')`)
  const plus = n => psql(`select to_char((now() at time zone 'Africa/Cairo')::date + ${n}, 'YYYY-MM-DD')`)
  const brand = () => psql(`select id from brands order by name limit 1`)
  const me = who => psql(`select id from members where email='${EMAIL[who]}'`)
  const task = (name, due, who = 'admin', status = 'c-prog') => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at,due_date,due_manual)
      select gen_random_uuid(), '${name}', '${brand()}', 'Post', m.id, m.id, m.role, true, '${status}', now(), 'Medium', now(), ${due ? `'${due}'` : 'null'}, true
      from members m where m.email='${EMAIL[who]}' returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', (select id from team_spaces where key='planning'), 'manual') on conflict do nothing`)
    // Moves here are about My tasks, not fields: the type's required text fields are filled.
    psql(`insert into task_field_values (task_id, field_id, value) select '${id}', l.field_id, '"lab"' from task_type_fields l join task_fields f on f.id=l.field_id
      where l.type_label='Post' and l.required_from is not null and f.kind='text' on conflict do nothing`)
    return id
  }
  const drop = ids => psql(`delete from tasks where id in ('${ids.join("','")}')`)
  const section = (page, key) => page.$$eval(`[data-mt-section="${key}"] [data-mt-task], [data-mt-section="${key}"] [data-mt-todo]`, els => els.map(e => e.getAttribute('data-mt-task') ?? e.getAttribute('data-mt-todo')))

  return [
    {
      id: 'mytasks-sidebar-sections-tiles', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const late = task(`Lab late ${n}`, plus(-2)), now = task(`Lab today ${n}`, today()), next = task(`Lab tomorrow ${n}`, plus(1)), far = task(`Lab later ${n}`, plus(20)), none = task(`Lab undated ${n}`, null)
        try {
          await go('/my-tasks')
          ok(await page.isVisible('nav a[href="/my-tasks"] [data-nav-count]'), 'My tasks in the sidebar with its count')
          ok(/\d+\s*·\s*\d+/.test(await page.textContent('nav a[href="/my-tasks"] [data-nav-count]')), 'open · overdue')
          ok((await section(page, 'overdue')).includes(late), 'overdue section')
          ok((await section(page, 'today')).includes(now), 'today section')
          ok((await section(page, 'tomorrow')).includes(next), 'tomorrow section')
          ok((await section(page, 'later')).includes(far), 'later section')
          ok((await section(page, 'none')).includes(none), 'no date section')
          ok((await page.$eval(`[data-mt-task="${late}"]`, e => getComputedStyle(e.lastElementChild).color)).includes('210, 32, 64'), 'an overdue date is red')
          await page.click('[data-mt-tile="overdue"]')
          const shown = await page.$$eval('[data-mt-task]', els => els.map(e => e.getAttribute('data-mt-task')))
          ok(shown.includes(late) && !shown.includes(now) && !shown.includes(far), 'the Overdue tile filters the list')
          await page.click('[data-mt-tile="all"]')
          await page.click('[data-mt-group="brand"]')
          ok(await page.isVisible(`[data-mt-section="${brand()}"] [data-mt-task="${now}"]`), 'group by brand')
          await page.click('[data-mt-group="date"]')
          await page.click(`[data-mt-task="${now}"]`)
          await page.waitForSelector('[data-type-picker-open], button[aria-label^="Stage:"]', { timeout: 20000 })
          ok(true, 'a task opens its panel')
        } finally { drop([late, now, next, far, none]) }
      },
    },
    {
      id: 'mytasks-todo-add-complete-private', as: 'admin',
      async run({ page, go, BASE, signInAs }) {
        const n = rnd(), name = `Lab todo ${n}`
        try {
          await go('/my-tasks')
          await page.fill('[data-mt-new="today"] input', name)
          await page.keyboard.press('Enter')
          await page.waitForTimeout(1500)
          ok(psql(`select to_char(day, 'YYYY-MM-DD') from todos where name='${name}'`) === today(), 'added with Today\'s date')
          const id = psql(`select id from todos where name='${name}'`)
          ok((await section(page, 'today')).includes(id), 'shows in Today')
          // Private: nobody else sees it, on the page or in search.
          const { ctx, page: other } = await signInAs('content')
          await other.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' })
          ok(!(await other.$(`[data-mt-todo="${id}"]`)), 'another member doesn\'t see it')
          await other.click('[data-sidebar-search]'); await other.fill('[data-search-input]', name); await other.waitForTimeout(1500)
          ok(!(await other.$(`[data-search-todo="${id}"]`)), '…nor find it in search')
          await ctx.close()
          await page.click('[data-sidebar-search]'); await page.fill('[data-search-input]', name); await page.waitForTimeout(1500)
          ok(await page.isVisible(`[data-search-todo="${id}"]`), 'I find it in search, under To-dos')
          await page.keyboard.press('Escape')
          // Complete: struck through, then gone after 2 seconds.
          await page.click(`[data-mt-check="${id}"]`)
          await page.waitForTimeout(400)
          ok((await page.$eval(`[data-mt-todo="${id}"]`, e => getComputedStyle(e.querySelector('[data-mt-edit] span')).textDecorationLine)).includes('line-through'), 'struck through')
          await page.waitForTimeout(2600)
          ok(!(await page.$(`[data-mt-todo="${id}"]`)), 'gone after 2 seconds')
          ok(psql(`select done_at is not null from todos where id='${id}'`) === 't', 'saved as done')
          await page.click('[data-mt-show-done]')
          await page.waitForSelector(`[data-mt-done] [data-mt-todo="${id}"]`)
          ok(true, 'Show completed lists it')
        } finally { psql(`delete from todos where name='${name}'`) }
      },
    },
    {
      id: 'mytasks-edit-and-make-task', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), day = plus(3)
        const id = psql(`insert into todos (id, owner_id, name, note, day) values (gen_random_uuid(), '${me('admin')}', 'Lab idea ${n}', 'Collect references', '${day}') returning id`).split(/\n/)[0]
        let made = ''
        try {
          await go('/my-tasks')
          await page.click(`[data-mt-edit="${id}"]`)
          await page.fill('[data-mt-edit-name]', `Lab brief ${n}`)
          await page.click('[data-mt-flag]')
          await page.click('[data-mt-done-edit]')
          await page.waitForTimeout(1500)
          ok(psql(`select name || '|' || flagged from todos where id='${id}'`) === `Lab brief ${n}|true`, 'edited in place')
          await page.click(`[data-mt-edit="${id}"]`)
          await page.click('[data-mt-convert]')
          await page.selectOption('[data-mt-make-space]', { label: 'Planning' })
          await page.click('[data-mt-make-go]')
          await page.waitForTimeout(3000)
          made = psql(`select id from tasks where name='Lab brief ${n}'`)
          ok(!!made, 'a pipeline task was made')
          ok(psql(`select status || '|' || to_char(publish_date, 'YYYY-MM-DD') || '|' || coalesce(description,'') from tasks where id='${made}'`) === `todo|${day}|Collect references`, 'at To Do, with the date as publishing date and the note as description')
          ok(psql(`select count(*) from todos where id='${id}'`) === '0', 'the to-do is gone')
        } finally { psql(`delete from todos where id='${id}'`); if (made) drop([made]) }
      },
    },
    {
      id: 'mytasks-quick-advance', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), id = task(`Lab advance ${n}`, today())
        try {
          await go('/my-tasks')
          await page.hover(`[data-mt-task="${id}"]`)
          await page.click(`[data-mt-advance="${id}"]`)
          await page.waitForTimeout(2500)
          ok(psql(`select status from tasks where id='${id}'`) === 'c-final', 'the quick action moves it to the next stage')
        } finally { drop([id]) }
      },
    },
  ]
}
