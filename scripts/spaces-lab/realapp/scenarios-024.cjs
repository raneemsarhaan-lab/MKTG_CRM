// Spec 024: Space settings — flow, new tasks, task panel fields, and clip creation.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

module.exports = (EMAIL, psql, ok) => {
  const rnd = () => Math.floor(Math.random() * 1e6)
  const first = sql => psql(sql).split(/\n/)[0]
  const space = key => psql(`select id from team_spaces where key='${key}'`)
  const brand = () => psql(`select id from brands order by name limit 1`)
  const who = k => psql(`select id from members where email='${EMAIL[k]}'`)
  const f = name => psql(`select id from task_fields where name_en='${name}' and retired_at is null`)
  const settings = key => psql(`select settings::text from team_spaces where key='${key}'`)
  const restore = (key, json) => psql(`update team_spaces set settings='${json.replace(/'/g, "''")}'::jsonb where key='${key}'`)
  const task = (name, type, status, o = {}) => {
    const id = first(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,entry_stage,stage_date,priority,updated_at,media_board)
      select gen_random_uuid(), '${name}', '${brand()}', '${type}', m.id, m.id, m.role, true, '${status}', '${o.entry ?? 'todo'}', now(), 'Normal', now(), ${o.board ? `'${o.board}'` : 'null'}
      from members m where m.email='${EMAIL.admin}' returning id`)
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${space(o.space ?? 'content')}', 'created') on conflict do nothing`)
    return id
  }
  const drop = ids => psql(`delete from tasks where id in ('${ids.join("','")}') or parent_task_id in ('${ids.join("','")}')`)
  const openSettings = async (page, tab) => {
    await page.click('[data-space-settings-open]')
    await page.waitForSelector('[data-space-settings]')
    if (tab) await page.click(`[data-space-settings-tab="${tab}"]`)
  }
  const saved = async page => { await page.waitForFunction(() => document.querySelector('[data-space-settings-msg]')?.textContent?.includes('Saved'), null, { timeout: 15000 }) }

  return [
    {
      id: '024-clip-starts-at-ready-for-design', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        // A video is a content task; it is a linked row on the Video Space's sheet (spec 026), and a
        // child row under it makes a clip on the Video board.
        const video = task(`Lab video ${n}`, 'Video', 'c-prog')
        const th = first(`insert into projects (id, name, standing, is_theme, brand_id) values (gen_random_uuid(), 'Lab video theme ${n}', true, true, '${brand()}') returning id`)
        psql(`insert into content_themes (id, project_id, space_id, position) values (gen_random_uuid(), '${th}', '${space('video')}', -5)`)
        const vrow = first(`insert into content_rows (id, project_id, space_id, position, title, task_id, updated_at) values (gen_random_uuid(), '${th}', '${space('video')}', 1, 'Lab video ${n}', '${video}', now()) returning id`)
        const crow = first(`insert into content_rows (id, project_id, space_id, parent_id, position, title, updated_at) values (gen_random_uuid(), '${th}', '${space('video')}', '${vrow}', 1, 'Lab clip ${n}', now()) returning id`)
        try {
          await go('/spaces/video?view=sheet')
          await page.waitForSelector(`[data-row="t:${th}"]`, { timeout: 90000 })
          // The sheet's add row uses the Space's "New task label".
          ok((await page.locator('[data-add-row="theme"]').first().textContent()).includes('New clip'), 'the add row says + New clip')
          await page.click(`[data-make-task="${crow}"]`)
          // Owner, 25 Nov 2026: a clip is a task like any other — the child row makes one in the Video Space.
          await page.waitForSelector('[data-make-task-dialog] [data-make-task-go]')
          await page.click('[data-make-task-go]')
          await page.waitForFunction(() => !document.querySelector('[data-make-task-dialog]'), null, { timeout: 30000 })
          await page.waitForTimeout(1500)
          const clip = psql(`select task_id from content_rows where id='${crow}'`)
          ok(!!clip && psql(`select coalesce(parent_task_id::text, 'none') from tasks where id='${clip}'`) === 'none', 'the clip is a task of its own (no parent)')
          ok(psql(`select project_id from tasks where id='${clip}'`) === th, 'under the theme its row sits in')
          ok(psql(`select status || '|' || entry_stage || '|' || coalesce(media_board,'') from tasks where id='${clip}'`) === 'r-design|r-design|video', 'it starts at Ready For Design on the Video board')
          ok(psql(`select count(*) from task_spaces where task_id='${clip}' and space_id='${space('video')}'`) === '1', 'it shows in the Video Space')
          await go('/spaces/video?view=board')
          await page.waitForSelector('.fx-board-cols')
          ok(await page.isVisible(`[data-task-card="${clip}"]`), 'and is a card on the Video board')
          // Its panel never asks for Caption or TOV, and uses the Video Space's stage names.
          await go(`/spaces/video?view=board&task=${clip}`)
          await page.waitForSelector('[data-field-section="Caption"]')
          ok(!(await page.$('[data-field-missing]')), 'no "… not added" for Caption or TOV')
          ok(!(await page.$('[data-field-required-badge]')), 'no Required badge')
          await page.locator('button[aria-label^="Stage:"]').first().click()
          const opts = await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]').allTextContents()
          ok(opts.some(x => x.includes('Editing')) && opts.some(x => x.includes('Edit Review')), `the Video Space's names: ${opts.join(', ')}`)
          await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]', { hasText: 'Edit Review' }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select status from tasks where id='${clip}'`) === 'd-check', 'it moves on without Caption or TOV')
        } finally { drop([video]); psql(`delete from content_rows where project_id='${th}'`); psql(`delete from content_themes where project_id='${th}'`); psql(`delete from projects where id='${th}'`) }
      },
    },
    {
      id: '024-content-asks-caption-video-does-not', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const post = task(`Lab post ${n}`, 'Post', 'c-prog')
        const reel = task(`Lab reel ${n}`, 'Reel', 'r-design', { board: 'video', entry: 'r-design', space: 'video' })
        try {
          await go(`/spaces/content?view=board&task=${post}`)
          await page.waitForSelector('[data-field-section="Caption"]')
          ok(await page.isVisible('[data-field-missing="Caption"]'), 'Content: Caption not added, in red')
          await page.locator('button', { hasText: '→ C-Review' }).first().click()
          await page.waitForTimeout(2000)
          ok(psql(`select status from tasks where id='${post}'`) === 'c-prog', 'Content: refused without Caption')
          await go(`/spaces/video?view=board&task=${reel}`)
          await page.waitForSelector('[data-field-section="Caption"]')
          ok(!(await page.$('[data-field-missing]')), 'Video: not asked again')
          await page.locator('button[aria-label^="Stage:"]').first().click()
          await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]', { hasText: 'Editing' }).first().click()
          await page.waitForTimeout(2500)
          ok(psql(`select status from tasks where id='${reel}'`) === 'd-prog', 'Video: the move goes through')
        } finally { drop([post, reel]) }
      },
    },
    {
      id: '024-hide-tov-in-design-only', as: 'admin',
      async run({ page, go }) {
        const n = rnd()
        const before = settings('design')
        const design = task(`Lab design ${n}`, 'Post', 'r-design', { board: 'design', entry: 'r-design', space: 'design' })
        const post = task(`Lab post ${n}`, 'Post', 'c-prog')
        try {
          await go(`/spaces/design?view=board&task=${design}`)
          await page.waitForSelector('[data-field-section="TOV"]')
          await page.keyboard.press('Escape')
          await go('/spaces/design?view=board')
          await openSettings(page, 'panel')
          await page.locator('[data-space-field="TOV"] [data-field-shown]').uncheck()
          await saved(page)
          await page.click('[data-space-settings-close]')
          await go(`/spaces/design?view=board&task=${design}`)
          await page.waitForSelector('[data-field-section="Caption"]')
          ok(!(await page.$('[data-field-section="TOV"]')), 'Design: TOV is hidden')
          await go(`/spaces/content?view=board&task=${post}`)
          await page.waitForSelector('[data-field-section="Caption"]')
          ok(await page.isVisible('[data-field-section="TOV"]'), 'Content: TOV still shows')
        } finally { restore('design', before); drop([design, post]) }
      },
    },
    {
      id: '024-new-task-label-and-flow', as: 'admin',
      async run({ page, go }) {
        const before = settings('content')
        const theme = first(`insert into projects (id, name, standing, is_theme, owner_id) values (gen_random_uuid(), 'Lab theme ${rnd()}', true, true, '${who('admin')}') returning id`)
        psql(`insert into content_themes (id, project_id, space_id, position) values (gen_random_uuid(), '${theme}', '${space('content')}', -5)`)
        try {
          await go('/spaces/content?view=board')
          await page.waitForSelector('[data-space-add]')
          ok((await page.textContent('[data-space-add]')).includes('New post'), 'the add button says New post')
          await openSettings(page, 'newTasks')
          await page.fill('[data-new-label]', 'New article')
          await page.locator('[data-new-label]').blur()
          await saved(page)
          // Flow: a hand-off after the return is refused, with the reason.
          await page.click('[data-space-settings-tab="flow"]')
          ok((await page.textContent('[data-flow-range]')).includes('→'), 'the flow lists its stages')
          await page.selectOption('[data-flow-return]', 'c-prog')
          ok((await page.textContent('[data-space-settings-msg]')).includes('Returns at must come after'), 'a return before the hand-off is refused')
          await page.click('[data-space-settings-close]')
          await go('/spaces/content?view=board')
          await page.waitForSelector('[data-space-add]')
          ok((await page.textContent('[data-space-add]')).includes('New article'), 'the add button changed')
          ok((await page.textContent('.fx-board-cols')).includes('New article'), 'the column add button changed')
          await go('/spaces/content?view=sheet')
          await page.waitForSelector('[data-add-row]', { timeout: 60000 })
          ok((await page.locator('[data-add-row]').first().textContent()).includes('New article'), 'the sheet add row changed')
          ok(JSON.parse(settings('content')).flow.return === 'final-check', 'the refused flow was not saved')
        } finally { restore('content', before); psql(`delete from content_themes where project_id='${theme}'`); psql(`delete from projects where id='${theme}'`) }
      },
    },
    {
      id: '024-video-board-shows-its-range-only', as: 'admin',
      async run({ page, go }) {
        await go('/spaces/video?view=board')
        await page.waitForSelector('.fx-board-cols')
        const text = await page.textContent('.fx-board-cols')
        ok(text.includes('Editing') && text.includes('Edit Review'), 'Video stage names on its board')
        ok(!text.includes('F-Check') && !text.includes('Final Cut') && !text.includes('Published') && !text.includes('C-Review'), 'only Ready For Design to D-Check')
        // Only admins and superusers see Space settings.
        ok(await page.isVisible('[data-space-settings-open]'), 'an admin sees Settings')
      },
    },
    {
      id: '024-existing-todo-clips-move', as: 'admin',
      async run() {
        const n = rnd()
        const video = task(`Lab video ${n}`, 'Video', 'r-design', { board: 'video', entry: 'r-design', space: 'video' })
        const mk = status => {
          const id = first(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,initiator_role,nine_stage,status,stage_date,priority,updated_at,parent_task_id)
            values (gen_random_uuid(), 'Lab old clip ${n} ${status}', '${brand()}', 'Reel', '${who('admin')}', 'Marketing Manager', true, '${status}', now(), 'Normal', now(), '${video}') returning id`)
          psql(`insert into task_clips (task_id, video_id) values ('${id}', '${video}')`)
          return id
        }
        const todo = mk('todo'), later = mk('c-prog')
        try {
          const root = path.join(__dirname, '..', '..', '..')
          execFileSync('npx', ['tsx', '--tsconfig', 'tsconfig.json', 'scripts/spaces-lab/move-todo-clips.ts'], { cwd: root, env: process.env, encoding: 'utf8' })
          ok(psql(`select status || '|' || coalesce(media_board,'') from tasks where id='${todo}'`) === 'r-design|video', 'a clip at To Do is now at Ready For Design on the Video board')
          ok(psql(`select count(*) from task_spaces where task_id='${todo}' and space_id='${space('video')}'`) === '1', 'and shows in the Video Space')
          ok(psql(`select status || '|' || coalesce(media_board,'') from tasks where id='${later}'`) === 'c-prog|', 'a clip already past To Do stays where it is')
        } finally { drop([video]) }
      },
    },
    {
      id: '024-user-cannot-change-settings', as: 'content',
      async run({ page, go }) {
        await go('/spaces/content?view=board')
        await page.waitForSelector('.fx-board-cols')
        ok(!(await page.$('[data-space-settings-open]')), 'a member without admin rights sees no Settings button')
      },
    },
  ]
}
