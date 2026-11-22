// Spaces lab real-app scenarios (spec 021). One entry per acceptance scenario.
module.exports = (EMAIL, psql, ok) => {
  const spaceId = key => psql(`select id from team_spaces where key='${key}'`)
  const firstBrand = () => psql('select id from brands order by name limit 1')
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
  ]
}
