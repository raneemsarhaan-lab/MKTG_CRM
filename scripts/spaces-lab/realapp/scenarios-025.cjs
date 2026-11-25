// Spec 025: the sidebar (My work / Spaces with brand folders / Brands), Space › Brand folders, and the brand page's three sections.
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

module.exports = (EMAIL, psql, ok) => {
  const rnd = () => Math.floor(Math.random() * 1e6)
  const first = sql => psql(sql).split(/\n/)[0]
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const brands = () => psql(`select id || '|' || coalesce(short_name, name) from brands order by name`).split(/\n/).map(r => r.split('|'))
  const task = (name, brand, o = {}) => {
    const id = first(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,updated_at,due_date)
      select gen_random_uuid(), '${name}', '${brand}', 'Post', m.id, m.id, m.role, true, '${o.status ?? 'c-prog'}', now(), 'Normal', now(), ${o.due ? `'${o.due}'` : 'null'}
      from members m where m.email='${EMAIL.admin}' returning id`)
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space('content')}', 'created') on conflict do nothing`)
    return id
  }
  const drop = ids => psql(`delete from tasks where id in ('${ids.join("','")}')`)
  const counts = async (page, node) => (await page.getAttribute(`[data-node="${node}"] [data-count]`, 'data-count').catch(() => null)) ?? '0:0'

  return [
    {
      id: '025-sidebar-structure-and-counts', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const [b1] = brands()
        const late = task(`Lab late ${n}`, b1[0], { due: '2001-01-01' })
        try {
          await go('/my-tasks')
          const heads = await page.$$eval('[data-nav-tree] [data-section]', els => els.map(e => e.getAttribute('data-section')))
          ok(heads.join(',') === 'mywork,spaces,brands', `sections: ${heads}`)
          ok((await page.textContent('[data-section="spaces"]')).trim() === 'Spaces', '"Teams" is renamed "Spaces"')
          ok(await page.isVisible('[data-node="my-tasks"]') && await page.isVisible('[data-node="inbox"]'), 'My work: My tasks and Inbox')
          // No Calendar / Assets / Sheet / Library rows under a brand.
          ok(!(await page.$(`[data-node^="brand:${b1[0]}:"]`)), 'no rows under a brand')
          // The arrow only opens or closes the folder list; it doesn't navigate.
          const closed = !(await page.$(`[data-node="space:content:${b1[0]}"]`))
          if (!closed) await page.click('[data-space-toggle="content"]')
          await page.click('[data-space-toggle="content"]')
          ok(page.url().endsWith('/my-tasks'), 'the arrow does not open the Space')
          const folders = await page.$$eval('[data-space="content"] [data-node^="space:content:"]', els => els.map(e => e.textContent.replace(/[\d·\s]+$/, '').trim()))
          ok(folders.join('|') === brands().map(b => b[1]).join('|'), `one folder per brand, short names: ${folders.join(', ')}`)
          // Numbers: only My tasks and Inbox carry one (user, 24 Nov 2026); Spaces, folders and brands show names alone.
          ok(await page.isVisible('[data-node="my-tasks"] [data-count]'), 'My tasks keeps its number')
          for (const node of ['space:content', `space:content:${b1[0]}`, `brand:${b1[0]}`]) ok(!(await page.$(`[data-node="${node}"] [data-count]`)), `no number on ${node}`)
          // Brands show their icon, not a colour dot (user, 25 Nov 2026); a brand without one shows its initial.
          const marks = await page.$$eval('[data-node^="brand:"] [data-brand-mark]', els => els.map(e => e.getAttribute('data-brand-mark')))
          ok(marks.length >= brands().length && !(await page.$('[data-node^="brand:"] [data-dot]')), `each brand has a mark, no colour dots: ${marks}`)
          ok(marks.filter(m => m === 'icon').length === Number(psql(`select count(*) from brands where logo_url is not null`)), 'a brand with an icon shows it')
          // It fits without scrolling.
          const fits = await page.$eval('[data-nav-tree]', el => { const box = el.parentElement; return box.scrollHeight <= box.clientHeight + 1 })
          ok(fits, 'the sidebar fits on screen without scrolling')
        } finally { drop([late]) }
      },
    },
    {
      id: '025-space-and-brand-folder-show-the-same-task', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const [b1, b2] = brands()
        const mine = task(`Lab folder one ${n}`, b1[0])
        const other = task(`Lab folder two ${n}`, b2[0])
        try {
          // The Space: every brand.
          await go('/spaces/content?view=board')
          await page.waitForSelector(`[data-task-card="${mine}"]`, { timeout: 60000 })
          ok(await page.isVisible(`[data-task-card="${other}"]`), 'Content shows tasks from every brand')
          // No brand filter on the Space page (user, 24 Nov 2026): its brand folders are the filter.
          ok(!(await page.$('[data-brand-chip]')), 'the Space page has no brand filter chips')
          // The folder: that brand only, with the Space's views.
          await page.click('[data-space-toggle="content"]').catch(() => {})
          await go(`/spaces/content/${b1[0]}?view=board`)
          await page.waitForSelector(`[data-task-card="${mine}"]`, { timeout: 60000 })
          ok(!(await page.$(`[data-task-card="${other}"]`)), `Content › ${b1[1]} shows only that brand`)
          ok(!(await page.$('[data-brand-chip]')) && !(await page.$('[data-group-brand]')), 'a folder has no brand controls')
          const tabs = await page.$$eval('[role="toolbar"] [data-view-tab]', els => els.map(e => e.getAttribute('data-view-tab')))
          ok(tabs.join(',') === 'board,sheet,calendar', `Board, Sheet, Calendar: ${tabs}`)
          // An edit in the folder shows in the Space and on the brand page.
          await page.click(`[data-task-card="${mine}"]`)
          await page.waitForSelector('button[aria-label^="Stage:"]')
          await page.locator('button[aria-label^="Stage:"]').first().click()
          await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]', { hasText: 'To Do' }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select status from tasks where id='${mine}'`) === 'todo', 'edited in the folder')
          await go(`/brands/${b1[0]}?view=board`)
          await page.waitForSelector(`[data-task-card="${mine}"]`, { timeout: 60000 })
          const col = await page.$eval(`[data-task-card="${mine}"]`, el => el.closest('[role="region"]')?.getAttribute('aria-label'))
          ok(col === 'To Do column', `the brand page shows the change, with the original stage names: ${col}`)
          // The folder remembers the view used last.
          await go(`/spaces/content/${b1[0]}?view=calendar`)
          await page.click('[data-view-tab="calendar"]').catch(() => {})
          await page.click('[data-view-tab="board"]')
          await page.click('[data-view-tab="calendar"]')
          await page.waitForTimeout(1200)
          await go(`/spaces/content/${b1[0]}`)
          ok((await page.getAttribute('[data-view-tab="calendar"]', 'aria-pressed')) === 'true', 'the folder opens on the view used last')
        } finally {
          drop([mine, other])
          psql(`update members set view_prefs = view_prefs - 'space:${space('content')}:brand:${b1[0]}' where email='${EMAIL.admin}'`)
        }
      },
    },
    {
      // User, 24 Nov 2026: on a brand's page, tasks grouped by project, with each project's tasks from every Space under it.
      id: '025-brand-list-groups-by-project-across-spaces', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const [b1] = brands()
        const project = psql(`insert into projects (id, name, brand_id, standing, is_theme) values (gen_random_uuid(), 'Lab stream ${n}', '${b1[0]}', true, true) returning id`).split(/\n/)[0]
        const inContent = task(`Lab stream post ${n}`, b1[0])
        const inDesign = task(`Lab stream design ${n}`, b1[0])
        const loose = task(`Lab stream loose ${n}`, b1[0])
        psql(`update tasks set project_id='${project}' where id in ('${inContent}', '${inDesign}')`)
        psql(`update tasks set project_id=null where id='${loose}'`)
        psql(`delete from task_spaces where task_id='${inDesign}'`)
        psql(`insert into task_spaces (task_id, space_id, added_via) values ('${inDesign}', '${space('design')}', 'created')`)
        try {
          await go(`/brands/${b1[0]}?view=list`)
          await page.waitForSelector('[data-list-view]', { timeout: 60000 })
          ok(await page.getAttribute('[data-group="project"]', 'aria-pressed') === 'true', "a brand's List opens grouped by project")
          const group = `[data-group-key="p:lab stream ${n}"]`
          await page.waitForSelector(group, { timeout: 30000 })
          ok(await page.isVisible(`${group} [data-row="${inContent}"]`) && await page.isVisible(`${group} [data-row="${inDesign}"]`), "the project's tasks from different Spaces are listed under it")
          ok(await page.isVisible(`${group} [data-row="${inContent}"] [data-task-space="Content"]`) && await page.isVisible(`${group} [data-row="${inDesign}"] [data-task-space="Design"]`), 'each shows the Space it is in')
          ok(await page.isVisible(`[data-group-key="p:"] [data-row="${loose}"]`), 'tasks with no project sit under No project')
          await page.click('[data-group="stage"]')
          ok(!(await page.$(group)), 'the other groupings are still there')
        } finally { drop([inContent, inDesign, loose]); psql(`delete from projects where id='${project}'`) }
      },
    },
    {
      id: '025-brand-page-sections', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const [b1] = brands()
        const t1 = task(`Lab brand sheet ${n}`, b1[0])
        const before = psql(`select coalesce(default_priority,'') from brands where id='${b1[0]}'`)
        try {
          await go(`/brands/${b1[0]}`)
          const secs = await page.$$eval('[data-brand-section]', els => els.map(e => e.getAttribute('data-brand-section')))
          ok(secs.join(',') === 'brand,assets,settings', `three sections: ${secs}`)
          // Brand: the Sheet is the new sheet (spec 027): the brand's tasks from every Space, by theme.
          await go(`/brands/${b1[0]}?view=sheet`)
          await page.waitForSelector('[data-content-sheet]', { timeout: 60000 })
          ok(await page.$('[data-board-tab-filters]'), "the brand's Sheet has the Board's own filters")
          // Assets: upload, search, filter, sort, rename, delete.
          await page.click('[data-brand-section="assets"]')
          await page.waitForSelector('[data-brand-assets]')
          const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-assets-'))
          const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
          const f1 = path.join(dir, `lab-logo-${n}.png`), f2 = path.join(dir, `lab-notes-${n}.txt`)
          fs.writeFileSync(f1, png); fs.writeFileSync(f2, 'notes')
          await page.setInputFiles('[data-assets-input]', [f1, f2])
          await page.waitForSelector(`[data-asset-row="lab-logo-${n}.png"]`, { timeout: 30000 })
          ok(await page.isVisible(`[data-asset-row="lab-notes-${n}.txt"]`), 'two files uploaded')
          ok(await page.isVisible(`[data-asset-row="lab-logo-${n}.png"] [data-asset-preview]`), 'the picture has a preview')
          ok(psql(`select kind from brand_assets where filename='lab-logo-${n}.png'`) === 'logo', 'its type is guessed (Logo)')
          ok(psql(`select (added_by is not null)::text from brand_assets where filename='lab-logo-${n}.png'`) === 'true', 'Added by is recorded')
          await page.fill('[data-assets-search]', `lab-notes-${n}`)
          ok(!(await page.$(`[data-asset-row="lab-logo-${n}.png"]`)) && await page.isVisible(`[data-asset-row="lab-notes-${n}.txt"]`), 'search')
          await page.fill('[data-assets-search]', `${n}`)
          await page.click('[data-assets-kind="logo"]')
          ok(await page.isVisible(`[data-asset-row="lab-logo-${n}.png"]`) && !(await page.$(`[data-asset-row="lab-notes-${n}.txt"]`)), 'type filter')
          await page.click('[data-assets-kind="all"]')
          await page.click('[data-assets-sort="name"]')
          const names = await page.$$eval('[data-asset-row]', els => els.map(e => e.getAttribute('data-asset-row')))
          ok(names[0] === `lab-logo-${n}.png` && names[1] === `lab-notes-${n}.txt`, `sorted by name: ${names}`)
          ok((await page.getAttribute('th[aria-sort]', 'aria-sort')) === 'ascending', 'the heading says how it is sorted')
          // Link to a task, then open it.
          await page.selectOption(`[data-asset-row="lab-notes-${n}.txt"] [data-asset-link-task]`, t1)
          await page.waitForSelector(`[data-asset-row="lab-notes-${n}.txt"] [data-asset-task="${t1}"]`, { timeout: 15000 })
          ok(psql(`select task_id from brand_assets where filename='lab-notes-${n}.txt'`) === t1, 'linked to a task')
          // Drag files onto the table.
          const f3 = path.join(dir, `lab-photo-${n}.png`); fs.writeFileSync(f3, png)
          const data = await page.evaluateHandle(async ({ name, b64 }) => {
            const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
            const dt = new DataTransfer(); dt.items.add(new File([bytes], name, { type: 'image/png' })); return dt
          }, { name: `lab-photo-${n}.png`, b64: png.toString('base64') })
          await page.dispatchEvent('[data-assets-drop]', 'dragover', { dataTransfer: data })
          await page.dispatchEvent('[data-assets-drop]', 'drop', { dataTransfer: data })
          await page.waitForSelector(`[data-asset-row="lab-photo-${n}.png"]`, { timeout: 30000 })
          ok(true, 'a file dropped on the table is uploaded')
          page.once('dialog', d => d.accept())
          await page.click(`[data-asset-row="lab-photo-${n}.png"] [data-asset-delete]`)
          await page.waitForTimeout(1500)
          ok(psql(`select count(*) from brand_assets where filename='lab-photo-${n}.png'`) === '0', 'deleted')
          // Settings (admins): default priority for new tasks.
          await page.click('[data-brand-section="settings"]')
          await page.waitForSelector('[data-brand-settings]')
          ok(await page.isVisible('[data-feature-switch="cCheck"]'), 'C-Check switch')
          await page.selectOption('[data-brand-priority]', 'High')
          await page.waitForFunction(() => document.querySelector('[data-brand-settings-msg]')?.textContent?.includes('Saved'), null, { timeout: 15000 })
          ok(psql(`select default_priority from brands where id='${b1[0]}'`) === 'High', 'default priority saved')
        } finally {
          drop([t1])
          psql(`delete from brand_assets where filename like 'lab-%-${n}.%'`)
          psql(`update brands set default_priority=${before ? `'${before}'` : 'null'} where id='${b1[0]}'`)
        }
      },
    },
    {
      id: '025-brand-settings-admins-only', as: 'content',
      async run({ page, go }) {
        const [b1] = brands()
        await go(`/brands/${b1[0]}`)
        const secs = await page.$$eval('[data-brand-section]', els => els.map(e => e.getAttribute('data-brand-section')))
        ok(secs.join(',') === 'brand,assets', `a non-admin sees no Settings: ${secs}`)
        ok((await go(`/brands/${b1[0]}/settings`)).status() === 404, 'and its address is a 404')
      },
    },
    {
      // Owner's request, 25 Nov 2026: a Space has an owner, and the app opens on that Space for them.
      id: '025-space-owner-lands-on-the-space', as: 'admin',
      async run({ page, go }) {
        const sp = space('planning')
        const me = psql(`select id from members where email='${EMAIL.admin}'`)
        const before = psql(`select settings::text from team_spaces where id='${sp}'`)
        const wasMember = psql(`select count(*) from team_space_members where space_id='${sp}' and member_id='${me}'`) === '1'
        try {
          psql(`update team_spaces set settings = settings - 'owner_id' where id='${sp}'`)
          await go('/')
          ok(new URL(page.url()).pathname === '/overview', `with no Space of their own, the app opens on the Overview: ${page.url()}`)
          // The owner is chosen in the Space's settings.
          await go('/spaces/planning')
          ok(!(await page.$('[data-space-rule]')) && !(await page.locator('text=/^Members:/').count()), 'no rule line and no members line under the title')
          await page.click('[data-space-settings-open]')
          await page.waitForSelector('[data-space-owner]')
          await page.selectOption('[data-space-owner]', me)
          await page.waitForFunction(() => document.querySelector('[data-space-settings-msg]')?.textContent?.includes('Saved'), null, { timeout: 15000 })
          ok(psql(`select settings->>'owner_id' from team_spaces where id='${sp}'`) === me, 'the owner is saved')
          ok(psql(`select count(*) from team_space_members where space_id='${sp}' and member_id='${me}'`) === '1', 'the owner is a member')
          await go('/')
          ok(new URL(page.url()).pathname === '/spaces/planning', `the app opens on their Space: ${page.url()}`)
        } finally {
          psql(`update team_spaces set settings='${before.replace(/'/g, "''")}'::jsonb where id='${sp}'`)
          if (!wasMember) psql(`delete from team_space_members where space_id='${sp}' and member_id='${me}'`)
        }
      },
    },
    {
      // Release 2026-11-25: a tab tagged with a brand shows on its Space and in that brand's folder, not in the others.
      id: '025-tab-tagged-with-a-brand', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const [b1, b2] = brands()
        const sp = space('planning')
        // The Space's own workbook (made on first open).
        await go('/spaces/planning?view=sheet')
        await page.waitForSelector('[data-node-workbook] [data-sheet-tabs]', { timeout: 60000 })
        const folder = psql(`select id from sheet_folders where linked_key='node:space:${sp}'`)
        ok(!!folder, 'the Space has a workbook')
        const tagged = first(`insert into sheets (id, folder_id, kind, name, position, brand_id) values (gen_random_uuid(), '${folder}', 'blank', 'Lab tagged ${n}', 90, '${b1[0]}') returning id`)
        const open = first(`insert into sheets (id, folder_id, kind, name, position) values (gen_random_uuid(), '${folder}', 'blank', 'Lab open ${n}', 91) returning id`)
        try {
          const tabs = async path => {
            await go(path)
            await page.waitForSelector(`[data-sheet-tab="${open}"]`, { timeout: 60000 })
            return !!(await page.$(`[data-sheet-tab="${tagged}"]`))
          }
          ok(await tabs('/spaces/planning?view=sheet'), 'the Space shows the tagged tab')
          ok(await tabs(`/spaces/planning/${b1[0]}?view=sheet`), "its brand's folder shows it")
          ok(!(await tabs(`/spaces/planning/${b2[0]}?view=sheet`)), "another brand's folder leaves it out, and still shows the untagged tab")
        } finally {
          psql(`delete from sheets where id in ('${tagged}','${open}')`)
        }
      },
    },
  ]
}
