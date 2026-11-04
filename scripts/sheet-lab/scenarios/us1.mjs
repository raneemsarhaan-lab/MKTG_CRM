// US1: see every clip of a video in one dense sheet (FR-001–FR-005, SC-004, SC-007).
export const us1 = [
  {
    id: 'us1-1',
    async run(t) {
      const rows = await t.rows()
      t.eq(rows[0], 'v:v1', 'the video is the first row')
      const nos = await t.page.$$eval('[data-row^="c:"] [data-col="clipNo"]', els => els.map(e => e.textContent))
      t.eq(nos, ['04', '05', '08', '09', '11', '12', '13', '13', '14', '18', '22', '23', '28', ''], 'clips in clip order')
      const heads = await t.page.$$eval('[role="columnheader"]', hs => hs.map(h => h.textContent || h.getAttribute('aria-label')))
      t.eq(heads, ['#', 'Title', '#', 'Type', 'Status', 'Editor', 'Source', 'File name', 'In', 'Out', 'Length', 'Files', 'Published', 'Drop or restore'], 'Full columns')
      t.eq((await t.text('c:c01', 'length')).trim(), '1:28.8', 'length from in and out')
      const h = await t.cell('c:c01', 'title').evaluate(e => e.getBoundingClientRect().height)
      t.assert(h >= 24 && h <= 28, `rows are 24–28 px, got ${h}`)
    },
  },
  {
    id: 'us1-2',
    async run(t) {
      const sc = t.page.locator('.fx-sheet-scroll')
      const before = await t.page.evaluate(() => ({
        head: document.querySelector('[role="columnheader"].is-title').getBoundingClientRect().top,
        title: document.querySelector('[data-cell="c:c05|title"]').getBoundingClientRect().left,
        no: document.querySelector('[data-cell="c:c05|rowNo"]').getBoundingClientRect().left,
      }))
      await sc.evaluate(e => { e.scrollTop = 120; e.scrollLeft = 600 })
      await t.idle(100)
      const after = await t.page.evaluate(() => ({
        head: document.querySelector('[role="columnheader"].is-title').getBoundingClientRect().top,
        title: document.querySelector('[data-cell="c:c05|title"]').getBoundingClientRect().left,
        no: document.querySelector('[data-cell="c:c05|rowNo"]').getBoundingClientRect().left,
      }))
      t.eq(after.head, before.head, 'the header row stays in place')
      t.eq([after.title, after.no], [before.title, before.no], 'row numbers and titles stay in place')
      t.eq((await t.text('c:c05', 'rowNo')).trim(), '6', 'row numbers run down the edge')
    },
  },
  {
    id: 'us1-3',
    async run(t) {
      const s = (await t.page.locator('[data-summary]').innerText()).replace(/\s+/g, ' ')
      t.assert(s.includes('13 clips'), `clip count: ${s}`)
      t.assert(/\d+m \d{2}s/.test(s), `total length: ${s}`)
      t.assert(s.includes('5 editing'), `editing: ${s}`)
      t.assert(s.includes('3 published (1 no link)'), `published: ${s}`)
      t.assert(s.includes('1 dropped'), `dropped: ${s}`)
    },
  },
  {
    id: 'us1-4',
    async run(t) {
      await t.page.locator('[data-cell="v:v1|title"] .fx-sheet-caret').click()
      t.eq(await t.rows(), ['v:v1'], 'collapsed: only the video row')
      t.assert((await t.text('v:v1', 'title')).includes('13 clips'), 'says how many clips')
      t.eq(await t.page.getAttribute('[data-row="v:v1"]', 'aria-expanded'), 'false', 'aria-expanded')
      await t.focusCell('v:v1', 'title')
      await t.page.keyboard.press('Space')
      t.assert((await t.rows()).length > 10, 'Space expands it again')
    },
  },
  {
    id: 'us1-5',
    hash: 'video=all',
    async run(t) {
      const videos = (await t.rows()).filter(r => r.startsWith('v:'))
      t.eq(videos, ['v:v1', 'v:v2'], 'every video that has clips, as groups')
      await t.cell('v:v2', 'rowNo').click()
      t.assert((await t.menuItems()).includes('own'), 'row menu offers "open on its own"')
      await t.page.locator('[data-menu-item="own"]').click()
      await t.idle()
      t.eq((await t.rows())[0], 'v:v2', 'one video on its own')
      t.assert((await t.rows()).every(r => !r.startsWith('v:') || r === 'v:v2'), 'only that video')
    },
  },
  {
    id: 'us1-highlight',
    hash: 'row=c05',
    async run(t) {
      await t.idle(200)
      t.assert(await t.page.locator('[data-row="c:c05"].is-hl').count() === 1, 'the clip row is highlighted')
      t.eq(await t.page.getAttribute('[data-cell="c:c05|title"]', 'tabindex'), '0', 'and is the active row')
    },
  },
  {
    id: 'sc-007-rows',
    async run(t) {
      await t.page.evaluate(() => window.__sheet.setTasks(ts => {
        const base = ts.find(x => x.id === 'c02')
        const more = Array.from({ length: 30 }, (_, i) => ({ ...base, id: `x${i}`, name: `Extra clip ${i}`, clip: { ...base.clip, clip_no: 40 + i, file_name: null } }))
        return [...ts, ...more]
      }))
      await t.idle()
      const n = await t.page.evaluate(() => {
        const box = document.querySelector('.fx-sheet-scroll').getBoundingClientRect()
        const head = document.querySelector('.fx-sheet-tr.is-head').getBoundingClientRect()
        return [...document.querySelectorAll('[data-row^="c:"], [data-row^="v:"]')].filter(r => {
          const b = r.getBoundingClientRect()
          return b.top >= head.bottom - 1 && b.bottom <= box.bottom + 1
        }).length
      })
      t.assert(n >= 20, `at least 20 rows visible at 1366×657, got ${n}`)
    },
  },
]
