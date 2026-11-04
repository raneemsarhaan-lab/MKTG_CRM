// US6: each role opens on the columns it needs (FR-050–FR-054, SC-006).
const heads = t => t.page.$$eval('[role="columnheader"]', hs => hs.slice(1).map(h => h.textContent || h.getAttribute('aria-label')))
const pressed = t => t.page.$eval('[data-sets] [aria-pressed="true"]', b => b.dataset.set)

export const us6 = [
  {
    id: 'us6-1', hash: 'me=lina',
    async run(t) {
      t.eq(await pressed(t), 'editing', 'a Video Editor opens on Editing')
      t.eq(await heads(t), ['Title', '#', 'Status', 'Editor', 'Source', 'File name', 'In', 'Out', 'Length', 'Files'], 'Editing columns')
    },
  },
  {
    id: 'us6-2', hash: 'me=sara',
    async run(t) {
      t.eq(await pressed(t), 'copy', 'a Content Creator opens on Copy')
      t.eq(await heads(t), ['Title', '#', 'Type', 'Status', 'Editor', 'Published'], 'Copy columns')
    },
  },
  {
    id: 'us6-3', hash: 'me=raneem',
    async run(t) { t.eq(await pressed(t), 'full', 'the Marketing Manager opens on Full') },
  },
  {
    id: 'us6-4', hash: 'me=lina',
    async run(t) {
      await t.page.locator('[data-set="full"]').click()
      t.eq(await pressed(t), 'full', 'switched')
      await t.open('me=lina')
      t.eq(await pressed(t), 'full', 'kept after a reload')
      await t.open('me=omar')
      t.eq(await pressed(t), 'editing', 'per member')
      t.assert((await t.rows())[0] === 'v:v1' && (await t.page.locator('[data-summary]').count()) === 1, 'video row and summary in every set')
    },
  },
  {
    id: 'us6-5', hash: 'me=lina',
    async run(t) {
      t.eq((await t.rows()).filter(r => r.startsWith('c:')).length, 14, 'the whole video by default')
      await t.page.locator('[data-mine]').click()
      t.eq((await t.rows()).filter(r => r.startsWith('c:')), ['c:c01', 'c:c02', 'c:c05', 'c:c07'], 'Mine: assigned to or owned by Lina')
      t.eq((await t.rows())[0], 'v:v1', 'the video row stays')
    },
  },
  {
    id: 'us6-no-storage',
    async run(t) {
      await t.page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked') } })
      })
      await t.open('me=sara')
      t.eq(await pressed(t), 'copy', 'renders with storage refused')
      await t.page.locator('[data-set="full"]').click()
      t.eq(await pressed(t), 'full', 'and can still switch')
    },
  },
]
