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
    return id
  }
  return [
    {
      id: 'us1-sidebar-admin', as: 'admin',
      async run({ page, go }) {
        await go('/board')
        const nodes = await page.$$eval('[data-nav-tree] [data-node^="space:"]', els => els.map(e => e.getAttribute('data-node')))
        ok(['space:content', 'space:design', 'space:video', 'space:planning'].every(k => nodes.includes(k)), `admin sees all Spaces, got ${nodes}`)
        ok(await page.$('[data-nav-tree] [data-node="me"]'), 'Me › My tasks link')
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
        await go('/spaces/video')
        const want = psql(`select count(*) from task_spaces ts join tasks t on t.id=ts.task_id where ts.space_id='${spaceId('video')}' and t.dropped_at is null`)
        const rows = await page.$$eval('[data-list-view] [data-row]', els => els.length)
        ok(String(rows) === want, `Video lists its Shows in tasks: ${rows} vs ${want}`)
        ok(await page.$('[data-group="brand"][aria-pressed="true"]'), 'grouped by brand by default')
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
        await go(`/brands/${b}`)
        const want = psql(`select count(*) from tasks where brand_id='${b}' and dropped_at is null`)
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
        await page.getByRole('button', { name: /→ Ready For Design/ }).click()
        await page.waitForSelector('[data-handoff]')
        ok(await page.isChecked('[data-handoff-space="video"] input'), 'Video pre-ticked for a Video task')
        ok(!(await page.isChecked('[data-handoff-space="design"] input')), 'Design not ticked')
        ok(psql(`select status from tasks where id='${t}'`) === 'c-final', 'nothing moves before confirming')
        await page.click('[data-handoff-confirm]')
        await page.waitForSelector('[data-handoff]', { state: 'detached' })
        await page.waitForTimeout(800)
        ok(psql(`select status from tasks where id='${t}'`) === 'r-design', 'moved to Ready For Design')
        ok(psql(`select m.role from tasks t join members m on m.id=t.assignee_id where t.id='${t}'`) === 'Video Editor', 'assigned to the video editor')
        const spaces = psql(`select string_agg(s.key||':'||ts.added_via, ',' order by s.key) from task_spaces ts join team_spaces s on s.id=ts.space_id where ts.task_id='${t}'`)
        ok(spaces === 'content:manual,video:handoff', `stays in Content, adds Video: ${spaces}`)
        ok(Number(psql(`select count(*) from notifications n join members m on m.id=n.recipient_id where n.task_id='${t}' and n.kind='assigned' and m.role='Video Editor'`)) > 0, 'the editor is notified')
        ok(Number(psql(`select count(*) from task_followers f join members m on m.id=f.member_id where f.task_id='${t}' and m.role='Video Editor'`)) > 0, 'the editor follows')
      },
    },
    {
      id: 'us6-cancel-changes-nothing', as: 'admin',
      async run({ page, go }) {
        const t = seedTask('Handoff lab cancel', 'Post', 'c-final', false, 'Content Creator')
        await go(`/spaces/content?task=${t}`)
        await page.getByRole('button', { name: /→ Ready For Design/ }).click()
        await page.waitForSelector('[data-handoff]')
        ok(await page.isChecked('[data-handoff-space="design"] input'), 'Design pre-ticked for a Post')
        await page.click('[data-handoff-cancel]')
        await page.waitForSelector('[data-handoff]', { state: 'detached' })
        ok(psql(`select status from tasks where id='${t}'`) === 'c-final', 'still at C-Review')
        ok(psql(`select count(*) from task_spaces where task_id='${t}'`) === '1', 'no Space added')
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
      id: 'us6-already-in-video-no-box', as: 'admin',
      async run({ page, go }) {
        const t = seedTask('Handoff lab assigned editor', 'Video', 'c-final', false, 'Video Editor')
        psql(`insert into task_spaces (task_id, space_id, added_via) values ('${t}', '${spaceId('video')}', 'assignee') on conflict do nothing`)
        await go(`/spaces/content?task=${t}`)
        await page.getByRole('button', { name: /→ Ready For Design/ }).click()
        await page.waitForTimeout(1500)
        ok(!(await page.$('[data-handoff]')), 'no box when it already shows in Video')
        ok(psql(`select status from tasks where id='${t}'`) === 'r-design', 'moved straight on')
      },
    },
    {
      id: 'us6-user-creates-own-task-in-space', as: 'content',
      async run({ page, go }) {
        const name = `Lab user task ${Date.now()}`
        await go('/spaces/content?view=board')
        await page.getByRole('button', { name: 'Add task' }).first().click()
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
