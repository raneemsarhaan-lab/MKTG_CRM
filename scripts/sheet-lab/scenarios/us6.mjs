// US6, redesigned (design/video-sheet-v2.html): one column set for everyone,
// the toolbar's extras behind ⋯, + New clip, lettered columns, and videos as bands.
// `plain=1` shows the redesign's own default columns.
const heads = t => t.page.$$eval('[role="columnheader"]:not([data-tail-head])', hs => hs.slice(1).map(h => h.textContent || h.getAttribute('aria-label')))
/** Scroll a cell to the middle of the sheet, clear of the frozen Clip column. */
const reveal = (t, row, col) => t.cell(row, col).evaluate(el => {
  const sc = el.closest('.fx-sheet-scroll'), r = el.getBoundingClientRect(), s = sc.getBoundingClientRect()
  sc.scrollLeft += r.left - s.left - s.width / 2
})
const DEFAULT = ['Clip', 'Type', 'Stage', 'Link task', 'Owner', 'Reviewer', 'Due', 'In stage', 'File', 'Working Doc', 'Design Link', 'Task Link', 'LinkedIn Link', 'Published Link', 'Drop or restore']

export const us6 = [
  {
    id: 'us6-1', hash: 'me=lina&plain=1',
    async run(t) {
      t.eq(await t.page.locator('[data-sets]').count(), 0, 'no Editing / Copy / Full switch')
      t.eq(await heads(t), DEFAULT, 'a Video Editor sees the redesign columns')
      const letters = await t.page.$$eval('[data-col-head]', hs => hs.map(h => h.dataset.letter))
      t.eq(letters.slice(0, 8), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], 'lettered like a spreadsheet')
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
    id: 'us6-links',
    async run(t) {
      // The Content sheet's link columns, as pills.
      t.eq((await t.text('c:c01', 'task')).trim(), 'Open task', 'Task Link is a pill')
      await reveal(t, 'c:c01', 'task')
      await t.cell('c:c01', 'task').click()
      t.eq((await t.lab()).opened.at(-1)?.id, 'c01', 'and opens the task')
      await reveal(t, 'c:c02', 'doc')
      await t.cell('c:c02', 'doc').click()
      const input = t.page.locator('[data-sheet-pop] input')
      await input.waitFor({ timeout: 3000 })
      await input.fill('https://docs.google.com/document/d/abc')
      await t.page.keyboard.press('Enter')
      await t.idle(250)
      t.eq((await t.task('c02')).attachments.filter(a => a.link_role === 'working_doc').map(a => a.url), ['https://docs.google.com/document/d/abc'], 'Working Doc saved')
      t.eq(await t.page.locator('[data-cell="c:c02|doc"] .fx-pill.is-drive').count(), 1, 'shown as a Drive pill')
      await reveal(t, 'c:c03', 'post')
      await t.focusCell('c:c03', 'post')
      if (await t.page.locator('[data-sheet-pop]').count()) { await t.page.keyboard.press('Escape'); await t.idle(80) }
      await t.paste({ text: 'https://www.linkedin.com/posts/xyz' })
      await t.idle(250)
      t.eq((await t.task('c03')).post_url, 'https://www.linkedin.com/posts/xyz', 'a pasted link fills LinkedIn Link')
      t.eq((await t.text('c:c03', 'post')).trim(), 'linkedin.com', 'as a pill')
      t.eq(await t.page.locator('[data-cell="c:c01|files"] .fx-pill').count() >= 1, true, 'files are pills too')
    },
  },
  {
    id: 'us6-add-video', hash: 'video=all',
    async run(t) {
      // design/video-sheet-v5.html: "+ Video", one level of grouping.
      t.assert((await t.rows()).includes('v:v3'), 'a video with no clips yet (not published) has its band')
      await t.page.locator('[data-add-video]').click()
      const input = t.page.locator('[data-sheet-pop] input')
      await input.waitFor({ timeout: 3000 })
      await input.fill('Customer Stories')
      await t.page.keyboard.press('Enter')
      await t.idle(300)
      const made = (await t.tasks()).find(x => x.name === 'Customer Stories')
      t.assert(made && made.content_type_label === 'Video' && !made.parent_task_id, 'a new video task')
      const rows = await t.rows()
      t.assert(rows.includes(`v:${made.id}`) && rows.includes(`a:${made.id}`), 'its band shows at once, with + Clip under it')
      t.eq(await t.page.locator('[data-video-band] .fx-sheet-th, .fx-content-theme-row').count(), 0, 'no separate theme rows')
    },
  },
  {
    id: 'us6-bulk', hash: 'me=raneem',
    async run(t) {
      // design/video-sheet-bulk-bar.html: the board's bar for several clips.
      await t.cell('c:c01', 'title').click()
      t.eq(await t.page.locator('[data-bulk-bar]').count(), 0, 'one clip: no bar')
      await t.cell('c:c03', 'title').click({ modifiers: ['Shift'] })
      await t.idle(150)
      t.eq((await t.page.locator('[data-bulk-count]').innerText()).trim(), '3 clips selected', 'three clips: the bar, with the count')
      t.eq(await t.page.$$eval('[data-bulk-bar] [data-bulk]', bs => bs.map(b => b.dataset.bulk)), ['stage', 'assignee', 'owner', 'type', 'priority', 'due'], 'Stage, Owner, Reviewer, Type, Priority, Due')
      const pr = async () => Promise.all(['c01', 'c02', 'c03'].map(async id => (await t.task(id)).priority))
      const was = await pr()
      await t.page.locator('[data-bulk="stage"]').click()
      const stageText = async id => (await t.page.locator(`[data-bulk-stage="${id}"]`).innerText()).replace(/\s+/g, ' ').trim()
      t.eq([await stageText('d-prog'), await stageText('d-check')], ['Editing D-In Progress', 'Edit Review D-Check'], "Stage list: the sheet's names, the board's name beside each")
      await t.page.mouse.click(4, 4) // the menu's click-away layer closes it
      await t.page.locator('[data-bulk="priority"]').click()
      await t.page.locator('[data-bulk-bar] [role="menuitem"]', { hasText: 'High' }).click()
      await t.idle(250)
      t.eq(await pr(), ['High', 'High', 'High'], 'Priority → High for all three')
      t.assert((await t.toast()).includes('3 clips changed'), await t.toast())
      await t.page.locator('[data-sheet-toast] button').click()
      await t.idle(300)
      t.eq(await pr(), was, 'Undo puts each one back as it was')
      await t.page.locator('[data-bulk-remove]').click()
      t.assert((await t.page.locator('[data-bulk-confirm]').innerText()).includes('Drop 3 clips'), 'Drop asks first')
      await t.page.locator('[data-bulk-confirm]').click()
      await t.idle(300)
      t.eq(await Promise.all(['c01', 'c02', 'c03'].map(async id => !!(await t.task(id)).dropped_at)), [true, true, true], 'then drops them')
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
