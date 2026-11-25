// Spec 027, US3 (Stage B): added tabs of a Space's Sheet view. "+" adds an unlinked tab; Link to board
// makes every titled row a task (untitled rows stay plain) and says so first; unlinking keeps the tasks
// and the rows remember them, so linking again reconnects — never a duplicate. Make task works one row
// at a time; a linked tab's new row is a task; a task can sit in several tabs; a row comes off one tab
// or its task is archived; a Space › Brand folder's tab makes tasks of that brand; only the tab's
// creator, admins and superusers link it.
module.exports = (EMAIL, psql, ok) => {
  const rnd = () => Math.floor(Math.random() * 1e6)
  const who = k => psql(`select id from members where email='${EMAIL[k]}'`)
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const brandId = name => psql(`select id from brands where name ilike '${name}%' order by name limit 1`)
  /** A tab of rows in the Content Space's workbook (the Content folder), made by `by`. */
  const newTab = (name, { by = 'admin', linked = false, brand = null } = {}) => psql(`insert into sheets (id, folder_id, kind, name, position, linked, space_id, brand_id, created_by, updated_by)
    select gen_random_uuid(), (select id from sheet_folders where kind='content' limit 1), 'rows', '${name}', 90, ${linked}, '${space('content')}', ${brand ? `'${brand}'` : 'null'}, '${who(by)}', '${who(by)}' returning id`).split(/\n/)[0]
  const row = (tab, title, pos) => psql(`insert into content_rows (id, sheet_id, title, position, created_by) values (gen_random_uuid(), '${tab}', '${title}', ${pos}, '${who('admin')}') returning id`).split(/\n/)[0]
  const task = name => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at)
      select gen_random_uuid(), '${name}', '${brandId('Forefront')}', 'Post', '${who('admin')}', '${who('admin')}', 'Marketing Manager', true, 'c-prog', now(), 'Normal', now() returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('content')}', 'created') on conflict do nothing`)
    return id
  }
  const cleanup = (tabs, names) => {
    for (const n of names) psql(`delete from tasks where name like '${n}%'`)
    psql(`update content_rows set parent_id=null where sheet_id in (${tabs.map(t => `'${t}'`).join(',')})`)
    psql(`delete from content_rows where sheet_id in (${tabs.map(t => `'${t}'`).join(',')})`)
    psql(`delete from sheets where id in (${tabs.map(t => `'${t}'`).join(',')})`)
  }
  const openTab = async (page, go, tab, where = '/spaces/content') => {
    await go(`${where}?view=sheet&tab=${tab}`)
    await page.waitForSelector(`[data-rows-tab="${tab}"]`, { timeout: 60000 })
  }
  const tabMenu = async (page, tab, item) => {
    await page.click(`[data-sheet-tab="${tab}"]`, { button: 'right' })
    await page.waitForSelector('[role="menu"][data-tab-menu]', { timeout: 5000 })
    await page.locator('[role="menu"][data-tab-menu] [role="menuitem"]', { hasText: item }).first().click()
  }
  const linkVia = async (page, tab) => {
    await tabMenu(page, tab, 'Link to board')
    await page.waitForSelector('[data-link-tab-dialog] [data-link-create]', { timeout: 30000 })
  }
  const linkedOf = (tab, title) => psql(`select coalesce(task_id::text, '-') from content_rows where sheet_id='${tab}' and title='${title}'`)

  return [
    {
      id: '027-us3-plus-adds-unlinked-tab', as: 'admin',
      async run({ page, go }) {
        const before = psql(`select coalesce(string_agg(id::text, ','), '') from sheets where kind='rows'`).split(',').filter(Boolean)
        let made = []
        try {
          await go('/spaces/content?view=sheet')
          await page.waitForSelector('[data-new-sheet]', { timeout: 60000 })
          await page.click('[data-new-sheet]')
          await page.waitForSelector('[data-rows-tab][data-rows-linked="false"]', { timeout: 30000 })
          made = psql(`select coalesce(string_agg(id::text, ','), '') from sheets where kind='rows'`).split(',').filter(x => x && !before.includes(x))
          ok(made.length === 1, `one new tab: ${made.length}`)
          ok(psql(`select linked::text || '|' || (space_id = '${space('content')}')::text from sheets where id='${made[0]}'`) === 'false|true', 'unlinked, for the Content Space')
          ok((await page.locator('[data-sheet-tab]').first().textContent()).includes('Board'), 'the Board tab stays first')
          ok(await page.locator(`[data-sheet-tab="${made[0]}"] [data-tab-linked]`).count() === 0, 'no link icon on an unlinked tab')
        } finally { if (made.length) cleanup(made, []) }
      },
    },
    {
      id: '027-us3-link-unlink-relink-no-duplicates', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), tab = newTab(`Lab tab ${n}`)
        const names = [`Lab row A ${n}`, `Lab row B ${n}`, `Lab row C ${n}`]
        names.forEach((x, i) => row(tab, x, i + 1))
        const blank = row(tab, '', 4)
        try {
          await openTab(page, go, tab)
          await linkVia(page, tab)
          ok(await page.getAttribute('[data-link-create]', 'data-link-create') === '3', 'the dialog says 3 tasks will be created')
          ok(await page.getAttribute('[data-link-untitled]', 'data-link-untitled') === '1', 'and that 1 untitled row stays plain')
          ok(/This will create 3 tasks on the Content board/.test(await page.textContent('[data-link-tab-dialog]')), 'in words')
          await page.click('[data-link-tab-go]')
          await page.waitForTimeout(3000)
          const ids = names.map(x => linkedOf(tab, x))
          ok(ids.every(x => x !== '-'), `3 rows linked: ${ids.join(',')}`)
          ok(psql(`select count(*) from task_spaces where space_id='${space('content')}' and task_id in (${ids.map(x => `'${x}'`).join(',')})`) === '3', 'on the Content board')
          ok(psql(`select count(distinct status) from tasks where id in (${ids.map(x => `'${x}'`).join(',')})`) === '1', 'all in the first stage')
          ok(psql(`select coalesce(task_id::text, '-') from content_rows where id='${blank}'`) === '-', 'the untitled row stays plain')
          ok(psql(`select linked::text from sheets where id='${tab}'`) === 'true', 'the tab is linked')
          await page.waitForSelector(`[data-sheet-tab="${tab}"] [data-tab-linked]`, { timeout: 10000 })
          // Unlink: the tasks stay; the rows keep their values and remember their tasks.
          await tabMenu(page, tab, 'Unlink from board')
          await page.click('[data-unlink-tab] [data-ok]')
          await page.waitForTimeout(3000)
          ok(names.every(x => linkedOf(tab, x) === '-'), 'rows unlinked')
          ok(psql(`select count(*) from content_rows where sheet_id='${tab}' and last_task_id in (${ids.map(x => `'${x}'`).join(',')})`) === '3', 'each row remembers its task')
          ok(psql(`select count(*) from tasks where dropped_at is null and id in (${ids.map(x => `'${x}'`).join(',')})`) === '3', 'the tasks stay on the board')
          // Link again: reconnects, creates nothing.
          await page.reload()
          await page.waitForSelector(`[data-rows-tab="${tab}"]`, { timeout: 60000 })
          await linkVia(page, tab)
          ok(await page.getAttribute('[data-link-create]', 'data-link-create') === '0', 'creates 0')
          ok(await page.getAttribute('[data-link-reconnect]', 'data-link-reconnect') === '3', 'reconnects 3')
          await page.click('[data-link-tab-go]')
          await page.waitForTimeout(3000)
          ok(names.map(x => linkedOf(tab, x)).join() === ids.join(), 'each row has its own task back')
          ok(psql(`select count(*) from tasks where name like 'Lab row _ ${n}'`) === '3', 'no duplicates')
        } finally { cleanup([tab], [`Lab row A ${n}`, `Lab row B ${n}`, `Lab row C ${n}`]) }
      },
    },
    {
      id: '027-us3-make-task-then-link-no-duplicate', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), tab = newTab(`Lab make ${n}`)
        const x = row(tab, `Lab make X ${n}`, 1)
        row(tab, `Lab make Y ${n}`, 2)
        try {
          await openTab(page, go, tab)
          await page.waitForSelector(`[data-make-task="${x}"]`, { timeout: 30000 })
          await page.click(`[data-make-task="${x}"]`)
          await page.waitForSelector('[data-make-task-dialog] [data-make-task-go]', { timeout: 10000 })
          await page.click('[data-make-task-go]')
          await page.waitForTimeout(3000)
          ok(linkedOf(tab, `Lab make X ${n}`) !== '-', 'Make task links that one row')
          ok(linkedOf(tab, `Lab make Y ${n}`) === '-', 'the other stays plain')
          ok(psql(`select linked::text from sheets where id='${tab}'`) === 'false', 'the tab stays unlinked')
          await page.reload()
          await page.waitForSelector(`[data-rows-tab="${tab}"]`, { timeout: 60000 })
          await linkVia(page, tab)
          ok(await page.getAttribute('[data-link-create]', 'data-link-create') === '1', 'linking later creates only the other one')
          await page.click('[data-link-tab-go]')
          await page.waitForTimeout(3000)
          ok(psql(`select count(*) from tasks where name='Lab make X ${n}'`) === '1', 'X is one task')
          ok(psql(`select count(*) from tasks where name='Lab make Y ${n}'`) === '1', 'Y is one task')
        } finally { cleanup([tab], [`Lab make X ${n}`, `Lab make Y ${n}`]) }
      },
    },
    {
      id: '027-us3-new-row-in-linked-tab-is-a-task', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), tab = newTab(`Lab linked ${n}`, { linked: true })
        try {
          await openTab(page, go, tab)
          await page.waitForSelector(`[data-sheet-tab="${tab}"] [data-tab-linked]`, { timeout: 10000 })
          await page.click('[data-row="a:__rows"] [data-col="title"]')
          await page.waitForSelector('.fx-sheet-tr.is-draft input, .fx-sheet-tr.is-draft textarea', { timeout: 10000 })
          await page.keyboard.type(`Lab new row ${n}`)
          await page.keyboard.press('Enter')
          await page.waitForTimeout(3000)
          const id = linkedOf(tab, `Lab new row ${n}`)
          ok(id !== '-' && id !== '', `the new row is a task: ${id}`)
          ok(psql(`select count(*) from task_spaces where task_id='${id}' and space_id='${space('content')}'`) === '1', 'on the Content board')
        } finally { cleanup([tab], [`Lab new row ${n}`]) }
      },
    },
    {
      id: '027-us3-existing-task-in-two-tabs-remove-and-archive', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), one = newTab(`Lab one ${n}`, { linked: true }), two = newTab(`Lab two ${n}`, { linked: true })
        const t = task(`Lab shared ${n}`)
        try {
          for (const tab of [one, two]) {
            await openTab(page, go, tab)
            await page.click('[data-add-existing-task]')
            await page.fill('[data-link-row-search]', `Lab shared ${n}`)
            await page.click(`[data-link-row-option="Lab shared ${n}"]`)
            await page.waitForTimeout(2500)
          }
          ok(psql(`select count(*) from content_rows where task_id='${t}' and sheet_id in ('${one}','${two}')`) === '2', 'the same task is a row in both tabs')
          // Off one tab only: the task stays.
          await openTab(page, go, one)
          await page.waitForSelector(`[data-cell="k:${t}|rowNo"]`, { timeout: 30000 })
          await page.click(`[data-cell="k:${t}|rowNo"]`)
          await page.locator('[role="menuitem"]', { hasText: 'Remove from this tab only' }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select count(*) from content_rows where task_id='${t}' and sheet_id='${one}'`) === '0', 'off the first tab')
          ok(psql(`select (dropped_at is null)::text from tasks where id='${t}'`) === 'true', 'the task stays')
          // Archive the task from the other tab: the row stays, the task is archived.
          await openTab(page, go, two)
          await page.waitForSelector(`[data-cell="k:${t}|rowNo"]`, { timeout: 30000 })
          await page.click(`[data-cell="k:${t}|rowNo"]`)
          await page.locator('[role="menuitem"]', { hasText: 'Archive the task' }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select (dropped_at is not null)::text from tasks where id='${t}'`) === 'true', 'the task is archived')
          ok(psql(`select count(*) from content_rows where task_id='${t}' and sheet_id='${two}'`) === '1', 'its row stays in the tab')
        } finally { cleanup([one, two], [`Lab shared ${n}`]) }
      },
    },
    {
      id: '027-us3-folder-tab-makes-its-brand-tasks', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), ff = brandId('Forefront')
        const before = psql(`select coalesce(string_agg(id::text, ','), '') from sheets where kind='rows'`).split(',').filter(Boolean)
        let made = []
        try {
          await go(`/spaces/content/${ff}?view=sheet`)
          await page.waitForSelector('[data-new-sheet]', { timeout: 60000 })
          await page.click('[data-new-sheet]')
          await page.waitForSelector('[data-rows-tab]', { timeout: 30000 })
          made = psql(`select coalesce(string_agg(id::text, ','), '') from sheets where kind='rows'`).split(',').filter(x => x && !before.includes(x))
          ok(made.length === 1 && psql(`select brand_id from sheets where id='${made[0]}'`) === ff, 'the tab is the folder brand\'s')
          row(made[0], `Lab ff ${n}`, 1)
          await openTab(page, go, made[0], `/spaces/content/${ff}`)
          await linkVia(page, made[0])
          await page.click('[data-link-tab-go]')
          await page.waitForTimeout(3000)
          ok(psql(`select brand_id from tasks where name='Lab ff ${n}'`) === ff, 'its task has Brand = Forefront')
        } finally { if (made.length) cleanup(made, [`Lab ff ${n}`]) }
      },
    },
    {
      id: '027-us3-only-creator-or-admin-links-a-tab', as: 'content',
      async run({ page, go }) {
        const n = rnd(), tab = newTab(`Lab admin tab ${n}`, { by: 'admin' })
        try {
          await openTab(page, go, tab)
          await page.click(`[data-sheet-tab="${tab}"]`, { button: 'right' })
          await page.waitForSelector('[role="menu"][data-tab-menu]', { timeout: 5000 })
          const item = page.locator('[role="menu"][data-tab-menu] [role="menuitem"]', { hasText: 'Link to board' }).first()
          ok(await item.getAttribute('aria-disabled') === 'true', "someone else's tab can't be linked by a member")
          const del = page.locator('[role="menu"][data-tab-menu] [role="menuitem"]', { hasText: 'Delete' }).first()
          ok(await del.getAttribute('aria-disabled') === 'true', 'nor deleted')
          await page.keyboard.press('Escape')
        } finally { cleanup([tab], []) }
      },
    },
  ]
}
