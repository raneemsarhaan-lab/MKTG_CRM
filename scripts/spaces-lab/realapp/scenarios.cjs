// Spaces lab real-app scenarios (spec 021). One entry per acceptance scenario.
module.exports = (EMAIL, psql, ok) => {
  const spaceId = key => psql(`select id from team_spaces where key='${key}'`)
  const firstBrand = () => psql('select id from brands order by name limit 1')
  /** A pipeline task owned by the Content Creator, in Content only, assigned to the given role. */
  const seedTask = (name, type, status, nine, assigneeRole) => {
    const id = psql(`insert into tasks (id,name,brand_id,content_type_label,task_owner_id,assignee_id,initiator_role,nine_stage,status,stage_date,priority,hours_estimate,updated_at)
      select gen_random_uuid(), '${name} ' || floor(random()*1e6)::text, (select id from brands order by name limit 1), '${type}',
        (select id from members where role='Content Creator' limit 1), (select id from members where role='${assigneeRole}' limit 1),
        'Content Creator', ${nine}, '${status}', now(), 'Medium', 2, now() returning id`).split(/\n/)[0]
    psql(`insert into task_spaces (task_id, space_id, added_via) values ('${id}', '${spaceId('content')}', 'manual')`)
    // Spec 023: these scenarios are about moves, not fields — the type's required fields are filled.
    psql(`insert into task_field_values (task_id, field_id, value) select '${id}', l.field_id, '"lab"' from task_type_fields l join task_fields f on f.id=l.field_id
      where l.type_label='${type}' and l.required_from is not null and f.kind='text' on conflict do nothing`)
    return id
  }
  return [
    {
      id: 'us1-sidebar-admin', as: 'admin',
      async run({ page, go }) {
        await go('/board')
        const nodes = await page.$$eval('[data-nav-tree] [data-node^="space:"]', els => els.map(e => e.getAttribute('data-node')))
        ok(['space:content', 'space:design', 'space:video', 'space:planning'].every(k => nodes.includes(k)), `admin sees all Spaces, got ${nodes}`)
        ok(await page.$('nav a[href="/my-tasks"]'), 'My tasks at the top of the sidebar')
      },
    },
    {
      id: 'us1-sidebar-video-editor', as: 'video',
      async run({ page, go }) {
        await go('/board')
        const nodes = await page.$$eval('[data-nav-tree] [data-node^="space:"]', els => els.map(e => e.getAttribute('data-node')))
        ok(JSON.stringify(nodes) === JSON.stringify(['space:video']), `video editor sees only Video, got ${nodes}`)
        const r = await go('/spaces/design')
        ok(r.status() === 404, `a Space you are not in is a 404, got ${r.status()}`)
      },
    },
    {
      id: 'us1-space-lists-shows-in', as: 'admin',
      async run({ page, go }) {
        await go('/spaces/video?view=board')
        // Spec 022: the Video board lists its media tasks. Spec 024: within its range (Ready For Design to D-Check).
        const want = psql(`select count(*) from task_spaces ts join tasks t on t.id=ts.task_id where ts.space_id='${spaceId('video')}' and t.dropped_at is null and (t.media_board='video' or t.media_board is null) and t.status in ('r-design','d-prog','d-check')`)
        await page.waitForSelector('.fx-board-cols')
        const rows = await page.$$eval('.fx-board-cols [data-task-card]', els => els.length)
        ok(String(rows) === want, `Video lists its Shows in tasks: ${rows} vs ${want}`)
        // Spec 025: Board, Sheet and Calendar only. No brand filter or "Group by brand" (user, 24 Nov 2026).
        const tabs = await page.$$eval('[role="toolbar"] [data-view-tab]', els => els.map(e => e.getAttribute('data-view-tab')))
        ok(tabs.join(',') === 'board,sheet,calendar', `the Space's views: ${tabs}`)
        ok(!(await page.$('[data-group-brand]')) && !(await page.$('[data-brand-chip]')), 'no brand filter or Group by brand on the Space page')
      },
    },
    {
      id: 'us1-space-board-original-columns', as: 'admin',
      async run({ page, go }) {
        await go('/spaces/content?view=board')
        const cols = await page.$$eval('[role="region"][aria-label$=" column"]', els => els.map(e => e.getAttribute('aria-label')))
        ok(cols.length >= 10 && cols[0] === 'To Do column', `the Board's own columns: ${cols.slice(0, 3)}`)
      },
    },
    {
      id: 'us1-shows-in-add-remove', as: 'admin',
      async run({ page, go }) {
        const task = psql(`select t.id from tasks t where not exists (select 1 from task_spaces ts where ts.task_id=t.id and ts.space_id='${spaceId('planning')}') and t.dropped_at is null limit 1`)
        await go(`/spaces/content?task=${task}`)
        await page.waitForSelector('[data-shows-in]')
        await page.selectOption('[data-shows-in] select', spaceId('planning'))
        await page.waitForTimeout(1500)
        ok(psql(`select added_via from task_spaces where task_id='${task}' and space_id='${spaceId('planning')}'`) === 'manual', 'added by hand')
        await page.click('[data-space-chip="planning"] button')
        await page.waitForTimeout(1500)
        ok(psql(`select count(*) from task_spaces where task_id='${task}' and space_id='${spaceId('planning')}'`) === '0', 'removed')
      },
    },
    {
      id: 'us1-brand-page', as: 'content',
      async run({ page, go }) {
        const b = firstBrand()
        await go(`/brands/${b}?view=list`)
        // Spec 022: linked media tasks show through their content task.
        const want = psql(`select count(*) from tasks where brand_id='${b}' and dropped_at is null and content_task_id is null`)
        const rows = await page.$$eval('[data-list-view] [data-row]', els => els.length)
        ok(String(rows) === want, `brand lists its tasks: ${rows} vs ${want}`)
        ok((await go('/brands/not-a-brand')).status() === 404, 'unknown brand is 404')
      },
    },
    {
      id: 'us1-settings-spaces', as: 'admin',
      async run({ page, go }) {
        await go('/settings')
        await page.click('[data-settings-tab="spaces"]')
        await page.waitForSelector('[data-spaces-settings] [data-space-row]')
        const rows = await page.$$eval('[data-space-row]', els => els.map(e => e.getAttribute('data-space-row')))
        ok(['content', 'design', 'video', 'planning'].every(k => rows.includes(k)), `Spaces listed: ${rows}`)
      },
    },
    {
      id: 'us1-renames', as: 'admin',
      async run({ page, go }) {
        await go('/board')
        ok(await page.getByRole('link', { name: 'Plan' }).count() > 0, 'nav says Plan')
        ok(await page.getByText('Everyone', { exact: true }).count() > 0, 'toolbar says Everyone')
        ok((await go('/team')).status() === 200, '/team still loads')
      },
    },
    // ── US6: the hand-off ───────────────────────────────────────────────
    {
      id: 'us6-advance-opens-box-and-confirms', as: 'admin',
      async run({ page, go }) {
        const t = seedTask('Handoff lab video', 'Video', 'c-final', false, 'Content Creator')
        await go(`/spaces/content?task=${t}`)
        await page.getByRole('button', { name: /^Move to Ready For Design/ }).click()
        await page.waitForSelector('[data-handoff]')
        ok(await page.isChecked('[data-handoff-space="video"] input'), 'Video pre-ticked for a Video task')
        ok(!(await page.isChecked('[data-handoff-space="design"] input')), 'Design not ticked')
        ok(psql(`select status from tasks where id='${t}'`) === 'c-final', 'nothing moves before confirming')
        await page.click('[data-handoff-confirm]')
        await page.waitForSelector('[data-handoff]', { state: 'detached' })
        await page.waitForTimeout(800)
        ok(psql(`select status from tasks where id='${t}'`) === 'r-design', 'moved to Ready For Design')
        // Owner, 25 Nov 2026: nothing is copied. The task itself goes on the Video board, stays in Content,
        // and the video editor joins its assignees (the lead stays).
        ok(psql(`select count(*) from tasks where content_task_id='${t}'`) === '0', 'no linked copy is made')
        const spaces = psql(`select string_agg(s.key||':'||ts.added_via, ',' order by s.key) from task_spaces ts join team_spaces s on s.id=ts.space_id where ts.task_id='${t}' and s.key in ('content','video')`)
        ok(spaces.split(',').includes('video:handoff') && spaces.split(',').some(x => x.startsWith('content:')), `the task is on the Video board and still in Content: ${spaces}`)
        ok(psql(`select string_agg(r.role, ',') from task_assignees a join members r on r.id=a.member_id where a.task_id='${t}'`).split(',').includes('Video Editor'), 'the video editor is one of its assignees')
        ok(psql(`select r.role from tasks x join members r on r.id=x.assignee_id where x.id='${t}'`) === 'Content Creator', 'the lead stays')
        ok(Number(psql(`select count(*) from notifications n join members r on r.id=n.recipient_id where n.task_id='${t}' and n.kind='assigned' and r.role='Video Editor'`)) > 0, 'the editor is notified')
        ok(Number(psql(`select count(*) from task_followers f join members r on r.id=f.member_id where f.task_id='${t}' and r.role='Video Editor'`)) > 0, 'the editor follows')
        await go('/spaces/video?view=board')
        await page.waitForSelector(`[data-task-card="${t}"]`, { timeout: 30000 })
      },
    },
    {
      id: 'us6-cancel-changes-nothing', as: 'admin',
      async run({ page, go }) {
        const t = seedTask('Handoff lab cancel', 'Post', 'c-final', false, 'Content Creator')
        await go(`/spaces/content?task=${t}`)
        await page.getByRole('button', { name: /^Move to Ready For Design/ }).click()
        await page.waitForSelector('[data-handoff]')
        ok(await page.isChecked('[data-handoff-space="design"] input'), 'Design pre-ticked for a Post')
        await page.click('[data-handoff-cancel]')
        await page.waitForSelector('[data-handoff]', { state: 'detached' })
        ok(psql(`select status from tasks where id='${t}'`) === 'c-final', 'still at C-Review')
        ok(psql(`select count(*) from tasks where content_task_id='${t}'`) === '0', 'no media task made')
      },
    },
    {
      id: 'us6-stage-menu-opens-box', as: 'admin',
      async run({ page, go }) {
        const t = seedTask('Handoff lab menu', 'Post', 'c-prog', false, 'Content Creator')
        await go(`/spaces/content?task=${t}`)
        await page.getByRole('button', { name: 'Stage: C-In Progress. Change it' }).click()
        await page.locator('[role="listbox"][aria-label="Move to a stage"] [role="option"]', { hasText: 'D-In Progress' }).click()
        await page.waitForSelector('[data-handoff]')
        await page.click('[data-handoff-cancel]')
        ok(psql(`select status from tasks where id='${t}'`) === 'c-prog', 'jumping into the design half needs the box too')
      },
    },
    {
      id: 'us6-already-linked-no-box', as: 'admin',
      async run({ page, go }) {
        // Spec 022 (R5): the automatic link happens once; after that, no box.
        const t = seedTask('Handoff lab linked once', 'Video', 'c-final', false, 'Content Creator')
        psql(`update tasks set auto_linked_at=now() where id='${t}'`)
        await go(`/spaces/content?task=${t}`)
        await page.getByRole('button', { name: /^Move to Ready For Design/ }).click()
        await page.waitForTimeout(1500)
        ok(!(await page.$('[data-handoff]')), 'no box when it was linked before')
        ok(psql(`select status from tasks where id='${t}'`) === 'r-design', 'moved straight on')
      },
    },
    {
      id: 'us6-user-creates-own-task-in-space', as: 'content',
      async run({ page, go }) {
        const name = `Lab user task ${Date.now()}`
        await go('/spaces/content?view=board')
        await page.getByRole('button', { name: /^(Add task|New post|New design|New clip)$/ }).first().click()
        await page.fill('input[placeholder="Task name — or paste a list"]', name)
        await page.locator('button', { hasText: /^Create Task$/i }).first().click()
        await page.waitForTimeout(2000)
        const row = psql(`select t.task_owner_id = m.id, t.assignee_id = m.id from tasks t, members m where t.name='${name}' and m.role='Content Creator'`)
        ok(row === 't|t', `a user creates a task they own and are assigned: ${row}`)
        const sp = psql(`select string_agg(s.key||':'||ts.added_via, ',' order by s.key) from task_spaces ts join team_spaces s on s.id=ts.space_id join tasks t on t.id=ts.task_id where t.name='${name}'`)
        ok(sp === 'content:created', `created from Content, shows in Content: ${sp}`)
      },
    },
  ]
}
