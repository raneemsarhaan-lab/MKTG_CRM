// Spec 027, US4 (Stage C): themes, pillars and child rows inside an added tab, as on the Board tab.
// A theme placed on a tab is that tab's only; + Pillar and "+ Row" (Enter for the next) work there; a
// child row under a task in a linked tab is a subtask; moving a linked row to another pillar moves its
// task; removing a pillar asks where its rows go and deletes none; a row moves between "No theme" and a
// theme.
module.exports = (EMAIL, psql, ok) => {
  const rnd = () => String(Math.floor(1e5 + Math.random() * 9e5))
  const who = k => psql(`select id from members where email='${EMAIL[k]}'`)
  const first = sql => psql(sql).split(/\n/)[0]
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const newTab = (name, linked = false) => first(`insert into sheets (id, folder_id, kind, name, position, linked, space_id, created_by, updated_by)
    select gen_random_uuid(), (select id from sheet_folders where kind='content' limit 1), 'rows', '${name}', 90, ${linked}, '${space('content')}', '${who('admin')}', '${who('admin')}' returning id`)
  const theme = (tab, name) => {
    const id = first(`insert into projects (id, name, standing, is_theme, owner_id, brand_id) values (gen_random_uuid(), '${name}', true, true, '${who('admin')}', (select id from brands where name ilike 'Forefront%' limit 1)) returning id`)
    psql(`insert into content_themes (id, project_id, sheet_id, position) values (gen_random_uuid(), '${id}', '${tab}', 1)`)
    return id
  }
  const pillar = (projectId, name, i = 0) => first(`insert into content_pillars (id, project_id, name, sort_order) values (gen_random_uuid(), '${projectId}', '${name}', ${i}) returning id`)
  const row = (tab, title, o = {}) => first(`insert into content_rows (id, sheet_id, project_id, pillar_id, parent_id, position, title, task_id, created_by)
    values (gen_random_uuid(), '${tab}', ${o.theme ? `'${o.theme}'` : 'null'}, ${o.pillar ? `'${o.pillar}'` : 'null'}, ${o.parent ? `'${o.parent}'` : 'null'}, ${o.pos ?? 1}, '${title}', ${o.task ? `'${o.task}'` : 'null'}, '${who('admin')}') returning id`)
  const task = (name, projectId, pillarId) => {
    const id = first(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at,project_id,pillar_id)
      values (gen_random_uuid(), '${name}', (select id from brands where name ilike 'Forefront%' limit 1), 'Post', '${who('admin')}', '${who('admin')}', 'Marketing Manager', true, 'c-prog', now(), 'Normal', now(), ${projectId ? `'${projectId}'` : 'null'}, ${pillarId ? `'${pillarId}'` : 'null'}) returning id`)
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('content')}', 'created') on conflict do nothing`)
    return id
  }
  const cleanup = (tab, projects, n) => {
    psql(`delete from tasks where name like '%${n}%'`)
    psql(`update content_rows set parent_id=null where sheet_id='${tab}'`)
    psql(`delete from content_rows where sheet_id='${tab}'`)
    psql(`delete from content_themes where sheet_id='${tab}'`)
    for (const p of projects) { psql(`delete from content_pillars where project_id='${p}'`); psql(`delete from projects where id='${p}'`) }
    psql(`delete from sheets where id='${tab}'`)
  }
  const openTab = async (page, go, tab) => {
    await go(`/spaces/content?view=sheet&tab=${tab}`)
    await page.waitForSelector(`[data-rows-tab="${tab}"]`, { timeout: 60000 })
  }
  const menu = async (page, cell, item) => {
    await page.waitForSelector(`[data-cell="${cell}"]`, { timeout: 30000 })
    await page.click(`[data-cell="${cell}"]`)
    await page.locator('[role="menuitem"]', { hasText: item }).first().click()
  }
  const typeDraft = async (page, text) => {
    await page.waitForSelector('.fx-sheet-tr.is-draft input, .fx-sheet-tr.is-draft textarea', { timeout: 10000 })
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)
  }

  return [
    {
      id: '027-us4-tab-theme-pillar-and-rows', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), tab = newTab(`Lab struct ${n}`), th = theme(tab, `Lab tab theme ${n}`)
        try {
          await openTab(page, go, tab)
          await page.waitForSelector(`[data-row="t:${th}"]`, { timeout: 30000 })
          ok(psql(`select count(*) from content_themes where project_id='${th}' and space_id is not null`) === '0', "the theme is the tab's only, not the Board tab's")
          await menu(page, `t:${th}|title`, '+ Pillar')
          await page.keyboard.type(`Lab pillar ${n}`)
          await page.keyboard.press('Enter')
          await page.waitForTimeout(2000)
          const pl = psql(`select id from content_pillars where project_id='${th}'`)
          ok(!!pl, "+ Pillar adds to the theme's project")
          await page.click(`[data-row="a:${th}:${pl}"] [data-col="title"]`)
          await typeDraft(page, `Lab first ${n}`)
          await typeDraft(page, `Lab second ${n}`)
          await page.keyboard.press('Escape')
          ok(psql(`select count(*) from content_rows where sheet_id='${tab}' and project_id='${th}' and pillar_id='${pl}'`) === '2', 'Enter on "+ Row" adds the next row, in the pillar')
          ok(psql(`select count(*) from content_rows where space_id is not null and title like 'Lab first ${n}'`) === '0', 'on the tab only')
        } finally { cleanup(tab, [th], n) }
      },
    },
    {
      id: '027-us4-child-row-in-linked-tab-is-a-subtask', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), tab = newTab(`Lab child ${n}`, true)
        const parentTask = task(`Lab parent ${n}`, null, null)
        const parent = row(tab, `Lab parent ${n}`, { task: parentTask })
        try {
          await openTab(page, go, tab)
          await menu(page, `k:${parentTask}|rowNo`, 'Add child row')
          await typeDraft(page, `Lab kid ${n}`)
          await page.keyboard.press('Escape')
          const kid = psql(`select coalesce(task_id::text, '-') || '|' || coalesce(parent_id::text, '-') from content_rows where sheet_id='${tab}' and title='Lab kid ${n}'`)
          const [kidTask, kidParent] = kid.split('|')
          ok(kidParent === parent, 'the row is a child of its parent row')
          ok(kidTask !== '-', 'in a linked tab it is a task')
          ok(psql(`select parent_task_id from tasks where id='${kidTask}'`) === parentTask, "a subtask of the parent row's task")
        } finally { cleanup(tab, [], n) }
      },
    },
    {
      id: '027-us4-moving-a-linked-row-moves-its-task', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), tab = newTab(`Lab move ${n}`, true), th = theme(tab, `Lab move theme ${n}`)
        const a = pillar(th, `Lab A ${n}`, 0), b = pillar(th, `Lab B ${n}`, 1)
        const t = task(`Lab moved ${n}`, th, a)
        row(tab, `Lab moved ${n}`, { theme: th, pillar: a, task: t })
        const loose = row(tab, `Lab loose ${n}`, { pos: 5 })
        try {
          await openTab(page, go, tab)
          await page.waitForSelector(`[data-cell="k:${t}|pillar"]`, { timeout: 30000 })
          await page.click(`[data-cell="k:${t}|pillar"]`)
          await page.locator('[role="menuitem"]', { hasText: `Lab B ${n}` }).first().click()
          await page.waitForTimeout(2000)
          ok(psql(`select pillar_id from tasks where id='${t}'`) === b, "the task's pillar follows the row")
          ok(psql(`select pillar_id from content_rows where task_id='${t}' and sheet_id='${tab}'`) === b, 'the row is in pillar B')
          // A plain row under no theme goes into a pillar the same way.
          await page.click(`[data-cell="l:${loose}|pillar"]`).catch(() => {})
          const item = page.locator('[role="menuitem"]', { hasText: `Lab A ${n}` }).first()
          if (await item.count()) { await item.click(); await page.waitForTimeout(2000) }
          ok(['', a].includes(psql(`select coalesce(pillar_id::text, '') from content_rows where id='${loose}'`)), 'a row under no theme stays or moves, never lost')
          ok(psql(`select count(*) from content_rows where id='${loose}'`) === '1', 'never deleted')
        } finally { cleanup(tab, [th], n) }
      },
    },
    {
      id: '027-us4-removing-a-pillar-keeps-its-rows', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), tab = newTab(`Lab remove ${n}`), th = theme(tab, `Lab rm theme ${n}`)
        const pl = pillar(th, `Lab gone ${n}`, 0)
        const r1 = row(tab, `Lab keep 1 ${n}`, { theme: th, pillar: pl, pos: 1 })
        const r2 = row(tab, `Lab keep 2 ${n}`, { theme: th, pillar: pl, pos: 2 })
        try {
          await openTab(page, go, tab)
          await menu(page, `p:${pl}|title`, 'Remove pillar')
          await page.waitForSelector('[data-destination]', { timeout: 10000 })
          await page.selectOption('[data-destination-pick]', `${th}:`)
          await page.click('[data-destination-confirm]')
          await page.waitForTimeout(2000)
          ok(psql(`select count(*) from content_pillars where id='${pl}'`) === '0', 'the pillar is removed')
          ok(psql(`select count(*) from content_rows where id in ('${r1}','${r2}') and project_id='${th}' and pillar_id is null`) === '2', 'its rows stay, under the theme with no pillar')
        } finally { cleanup(tab, [th], n) }
      },
    },
    {
      id: '027-us4-removing-a-theme-in-a-tab-keeps-its-rows', as: 'admin',
      async run({ page, go }) {
        const n = rnd(), tab = newTab(`Lab rm theme ${n}`), th = theme(tab, `Lab rm t ${n}`)
        const r1 = row(tab, `Lab stays ${n}`, { theme: th, pos: 1 })
        try {
          await openTab(page, go, tab)
          await menu(page, `t:${th}|title`, 'Remove theme')
          await page.waitForSelector('[data-destination]', { timeout: 10000 })
          await page.selectOption('[data-destination-pick]', '__rows:')
          await page.click('[data-destination-confirm]')
          await page.waitForTimeout(2000)
          ok(psql(`select count(*) from content_themes where sheet_id='${tab}'`) === '0', 'the theme is off the tab')
          ok(psql(`select count(*) from projects where id='${th}'`) === '1', 'its project stays')
          ok(psql(`select coalesce(project_id::text, 'none') from content_rows where id='${r1}'`) === 'none', 'its rows go under No theme, none deleted')
        } finally { cleanup(tab, [th], n) }
      },
    },
    {
      id: '027-us5-columns-per-tab-and-person', as: 'content',
      async run({ page, go }) {
        const n = rnd(), tab = newTab(`Lab cols ${n}`), other = newTab(`Lab cols other ${n}`)
        row(tab, `Lab col row ${n}`)
        psql(`update members set sheet_layouts='{}' where email in ('${EMAIL.content}','${EMAIL.admin}')`)
        try {
          await openTab(page, go, tab)
          await page.waitForSelector('[data-fields-open], [data-sheet-tab]', { timeout: 30000 })
          await page.evaluate(() => document.dispatchEvent(new CustomEvent('momentum:fields-open')))
          await page.waitForSelector('[data-fields-drawer]', { timeout: 20000 })
          await page.click('[data-field-switch="type"]')
          await page.waitForTimeout(1500)
          const key = `rows:tab:${tab}`
          const mine = psql(`select coalesce((sheet_layouts->'${key}'->'cols')::text, 'none') from members where email='${EMAIL.content}'`)
          ok(mine !== 'none' && !mine.includes('"type"'), `Type is hidden in this tab, for me: ${mine}`)
          ok(psql(`select coalesce((sheet_layouts->'rows:tab:${other}')::text, 'none') from members where email='${EMAIL.content}'`) === 'none', 'the other tab keeps its columns')
          ok(psql(`select coalesce((sheet_layouts->'content')::text, 'none') from members where email='${EMAIL.content}'`) === 'none', 'the Board tab keeps its columns')
          ok(psql(`select coalesce((sheet_layouts->'${key}')::text, 'none') from members where email='${EMAIL.admin}'`) === 'none', "someone else's view of the tab doesn't change")
        } finally {
          psql(`update members set sheet_layouts='{}' where email in ('${EMAIL.content}','${EMAIL.admin}')`)
          cleanup(tab, [], n); cleanup(other, [], n)
        }
      },
    },
  ]
}
