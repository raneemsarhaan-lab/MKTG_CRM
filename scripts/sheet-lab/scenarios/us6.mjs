// US6, redesigned (design/video-sheet-v2.html): one column set for everyone,
// the toolbar's extras behind ⋯, + New clip, lettered columns, and videos as bands.
// `plain=1` shows the redesign's own default columns.
const heads = t => t.page.$$eval('[role="columnheader"]:not([data-tail-head])', hs => hs.slice(1).map(h => h.textContent || h.getAttribute('aria-label')))
const DEFAULT = ['Clip', 'Stage', 'Owner', 'Reviewer', 'Due', 'In stage', 'File']

export const us6 = [
  {
    id: 'us6-1', hash: 'me=lina&plain=1',
    async run(t) {
      t.eq(await t.page.locator('[data-sets]').count(), 0, 'no Editing / Copy / Full switch')
      t.eq(await heads(t), DEFAULT, 'a Video Editor sees the redesign columns')
      const letters = await t.page.$$eval('[data-col-head]', hs => hs.map(h => h.dataset.letter))
      t.eq(letters, ['A', 'B', 'C', 'D', 'E', 'F', 'G'], 'lettered like a spreadsheet')
    },
  },
  {
    id: 'us6-2', hash: 'me=sara&plain=1',
    async run(t) { t.eq(await heads(t), DEFAULT, 'a Content Creator sees the same columns') },
  },
  {
    id: 'us6-3', hash: 'me=raneem',
    async run(t) {
      t.eq(await t.page.locator('[data-more-panel]').count(), 0, 'the extras start tucked away')
      await t.page.locator('[data-sheet-more]').click()
      for (const sel of ['[data-columns-button]', '[data-add-column]', '[data-mine]', '[data-show-dropped]', '[data-paste-clips]'])
        t.eq(await t.page.locator(`[data-more-panel] ${sel}`).count(), 1, `⋯ holds ${sel}`)
      await t.page.keyboard.press('Escape')
      t.eq(await t.page.locator('[data-more-panel]').count(), 0, 'Esc closes it')
      t.eq(await t.page.locator('[data-toolbar] [aria-pressed]').filter({ hasText: 'Sheet' }).count() >= 1, true, 'Board | Sheet stays')
    },
  },
  {
    id: 'us6-4', hash: 'me=lina',
    async run(t) {
      const before = (await t.rows()).length
      await t.focusCell('c:c05', 'title')
      await t.page.locator('[data-new-clip]').click()
      await t.idle(150)
      t.eq((await t.rows()).length, before + 1, '+ New clip adds a row to the video you are in')
      t.assert((await t.rows()).some(r => r.startsWith('d:')), 'a draft clip to type into')
    },
  },
  {
    id: 'us6-5', hash: 'me=lina',
    async run(t) {
      t.eq((await t.rows()).filter(r => r.startsWith('c:')).length, 14, 'the whole video by default')
      await t.tool('[data-mine]', 'click')
      t.eq((await t.rows()).filter(r => r.startsWith('c:')), ['c:c01', 'c:c02', 'c:c05', 'c:c07'], 'Mine: assigned to or owned by Lina')
      t.eq((await t.rows())[0], 'v:v1', 'the video row stays')
    },
  },
  {
    id: 'us6-band',
    async run(t) {
      const band = (await t.text('v:v1', 'title')).replace(/\s+/g, ' ')
      t.assert(band.includes('13 clips'), `the band counts live clips: ${band}`)
      t.assert(/\d+ to do/.test(band) && band.includes('3 published'), `and their stages: ${band}`)
      t.eq(await t.page.getAttribute('[data-video-band="v1"] .fx-vs-prog', 'aria-label'), '3 of 13 published', 'a progress bar with words')
      t.eq(await t.page.locator('[data-cell="v:v1|status"]').count(), 0, 'the band spans the sheet')
    },
  },
  {
    id: 'us6-no-storage',
    async run(t) {
      await t.page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked') } })
      })
      await t.open('me=sara&plain=1')
      t.eq(await heads(t), DEFAULT, 'renders with storage refused')
      await t.page.locator('[data-sheet-more]').click()
      t.eq(await t.page.locator('[data-more-panel]').count(), 1, 'and ⋯ still opens')
    },
  },
]
