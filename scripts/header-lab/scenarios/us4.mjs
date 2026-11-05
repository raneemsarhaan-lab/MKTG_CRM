// US4: page tabs and the Board | Sheet pair.
const sel = t => t.page.evaluate(() => ({
  tab: document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-tab'),
  view: document.querySelector('[data-view-pair] [aria-pressed="true"]')?.getAttribute('data-view') ?? null,
}))
export const us4 = [
  {
    id: 'h4-board-sheet',
    async run(t) {
      t.eq(await sel(t), { tab: 'pipeline', view: 'board' }, 'Pipeline · Board')
      await t.page.locator('[data-view-pair] [data-view="sheet"]').click()
      t.eq((await t.host()).view, 'sheet', 'Sheet')
      t.eq(await sel(t), { tab: 'pipeline', view: 'sheet' }, 'the Pipeline tab stays selected')
      t.assert(await t.page.locator('[data-sheet-bar] [data-view-pair]').count() === 1, 'the pair sits in the sheet bar')
      t.eq(await t.text('[data-page-title]'), 'Pipeline', 'title')
    },
  },
  {
    id: 'h4-content',
    async run(t) {
      await t.page.locator('[data-tab="content"]').click()
      t.eq((await t.host()).view, 'content', 'Content')
      t.eq(await t.text('[data-page-title]'), 'Content', 'the title follows the tab')
      t.assert(await t.page.locator('[data-content-bar]').count() === 1, 'the Content bar is the third row')
      t.eq(await t.page.locator('[data-view-pair]').count(), 0, 'no Board | Sheet there')
      t.eq(await t.page.locator('[data-brand-menu], [data-scope]').count(), 0, 'no pipeline controls there')
    },
  },
  {
    id: 'h4-back-to-pipeline', hash: 'view=sheet',
    async run(t) {
      await t.page.locator('[data-tab="content"]').click()
      await t.page.locator('[data-tab="pipeline"]').click()
      t.eq((await t.host()).view, 'sheet', 'Pipeline returns to the last pipeline view')
    },
  },
]
