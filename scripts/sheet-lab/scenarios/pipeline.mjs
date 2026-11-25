// Spec 011: the sheets under the Board header. The video sheet's bar ends with
// Board | Sheet (ViewPair); the Content bar has no view switch; the header's
// search narrows both sheets by title, keeping each match's parent row.
export const pipeline = [
  {
    id: 'pipe-view-pair',
    async run(t) {
      t.eq(await t.page.locator('[data-video-sheet] [data-view-pair] [aria-pressed="true"]').getAttribute('data-view'), 'sheet', 'Sheet pressed')
      await t.page.locator('[data-video-sheet] [data-view-pair] [data-view="board"]').click()
      t.eq((await t.lab()).views, ['board'], 'Board asks the host to switch')
      t.eq(await t.page.locator('[data-video-sheet] [data-view="content"]').count(), 0, 'no Content in the pair')
    },
  },
  {
    id: 'pipe-content-bar', hash: 'view=content',
    async run(t) {
      t.eq(await t.page.locator('[data-content-sheet] .fx-sheet-bar [data-view-pair], [data-content-sheet] .fx-sheet-bar .fx-sheet-seg').count(), 0, 'no view switch on the Content bar')
      t.assert(await t.page.locator('[data-content-sheet] [data-paste-plan]').count() === 1, 'its own controls stay')
    },
  },
  {
    id: 'pipe-query', hash: 'q=keeping',
    async run(t) {
      const rows = await t.rows()
      t.eq(rows.filter(r => r.startsWith('c:')).length, 1, 'one matching clip')
      t.eq(rows.filter(r => r.startsWith('v:')), ['v:v1'], 'with its video')
      t.assert((await t.text(rows.find(r => r.startsWith('c:')), 'title')).includes('Keeping Strategy on Track'), 'the match')
    },
  },
  {
    id: 'pipe-query-video', hash: 'q=strategy%20execution',
    async run(t) {
      const rows = await t.rows()
      t.assert(rows.filter(r => r.startsWith('c:')).length > 3, 'a matching video keeps its clips')
    },
  },
  {
    id: 'pipe-query-content', hash: 'view=content&q=post%201',
    async run(t) {
      const rows = await t.rows()
      t.eq(rows.filter(r => r.startsWith('k:')).length, 1, 'one piece')
      t.eq(rows.filter(r => r.startsWith('t:')).length, 1, 'under its theme')
    },
  },
]
