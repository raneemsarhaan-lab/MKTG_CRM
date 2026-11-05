// US1: see which file is newest, and who added it (FR-001–FR-006).
const lastLineOk = page => page.$$eval('[data-att-tile] .fx-att-name', names => names.map(n => {
  const l2 = n.querySelector('.fx-att-l2')
  const text = n.textContent ?? ''
  return { text, tail: l2?.textContent ?? null, cut: l2 ? l2.scrollWidth > l2.clientWidth + 1 : false }
}))

export const us1 = [
  {
    id: 'us1-1',
    async run(t) {
      const names = await t.names()
      t.assert(names[0].includes('v3 FINAL'), `newest first: ${names[0]}`)
      t.assert(names[1].includes('Post v2') && names[2].includes('Post v1') && names[3].includes('Brief'), `order: ${names.join(' | ')}`)
      t.assert((await t.page.textContent('[data-att-section]')).includes('Newest first'), 'says "Newest first"')
    },
  },
  {
    id: 'us1-2',
    async run(t) {
      const pills = await t.page.$$eval('.fx-att-pill.is-latest', ps => ps.map(p => ({
        tile: p.closest('[data-att-tile]')?.textContent ?? '', bg: getComputedStyle(p).backgroundColor, color: getComputedStyle(p).color })))
      t.eq(pills.length, 1, 'one Latest pill')
      t.assert(pills[0].tile.includes('v3 FINAL'), 'on the newest image')
      t.eq(pills[0].bg, 'rgb(200, 242, 78)', 'neon green (COLORS.lime)')
      t.eq(pills[0].color, 'rgb(24, 35, 63)', 'dark text (BRIEF_UI.ink)')
    },
  },
  {
    id: 'us1-3',
    async run(t) {
      const metaOf = name => t.tile(name).locator('.fx-att-meta > span:last-child').textContent()
      t.eq((await metaOf('v3 FINAL')).trim(), 'yosra · 2h ago', 'uploader and age')
      t.eq((await metaOf('Post v2')).trim(), 'yosra · yesterday', 'yesterday')
      t.eq((await metaOf('Brief')).trim(), 'Raneem · 4d ago', 'days')
    },
  },
  {
    id: 'us1-4',
    async run(t) {
      const rows = await lastLineOk(t.page)
      const v3 = rows.find(r => r.text.includes('v3 FINAL'))
      t.eq(v3.tail, 'Post v3 FINAL.png', 'the ending is on line two, whole')
      t.assert(!v3.cut, 'line two is not cut')
      const lines = await t.tile('v3 FINAL').locator('.fx-att-name').evaluate(n => Math.round(n.getBoundingClientRect().height / parseFloat(getComputedStyle(n).lineHeight)))
      t.assert(lines <= 2, `at most two lines (${lines})`)
    },
  },
  {
    id: 'us1-5',
    async run(t) {
      const box = await t.tile('Post v1').locator('.fx-att-thumb').evaluate(th => {
        const r = th.getBoundingClientRect(), img = th.querySelector('img').getBoundingClientRect()
        return { ratio: r.width / r.height, fill: Math.abs(img.width - r.width) < 1 && Math.abs(img.height - r.height) < 1, fit: getComputedStyle(th.querySelector('img')).objectFit }
      })
      t.assert(Math.abs(box.ratio - 0.8) < 0.02, `tall 4:5 tile (${box.ratio.toFixed(2)})`)
      t.assert(box.fill && box.fit === 'cover', 'the picture fills the tile, no side bands')
    },
  },
  {
    id: 'latest-is-image',
    async run(t) {
      await t.add(lab => [lab.dataUrlToFile('data:application/pdf;base64,JVBERi0=', 'Newer brief.pdf')])
      await t.waitUploads(5)
      const owner = await t.page.$eval('.fx-att-pill.is-latest', p => p.closest('[data-att-tile]').textContent)
      t.assert(owner.includes('v3 FINAL'), 'a newer PDF never takes the Latest pill')
      t.assert((await t.names())[0].includes('Newer brief'), 'but it is listed first')
    },
  },
  {
    id: 'names-at-widths',
    async run(t) {
      for (const width of [1360, 1000, 390]) {
        await t.page.setViewportSize({ width, height: 900 })
        await t.page.waitForTimeout(120)
        for (const r of await lastLineOk(t.page)) {
          if (r.tail === null) continue
          t.assert(!r.cut, `at ${width}px "${r.tail}" is not cut`)
          t.assert(/\.[a-z0-9]+$/i.test(r.tail), `at ${width}px the extension shows: "${r.tail}"`)
        }
      }
    },
  },
  {
    id: 'us1-1-arabic',
    hash: 'locale=ar',
    async run(t) {
      t.eq(await t.page.getAttribute('html', 'dir'), 'rtl', 'right to left')
      t.assert((await t.page.textContent('[data-att-section]')).includes('الأحدث أولًا'), 'Arabic header')
      t.assert((await t.names())[0].includes('v3 FINAL'), 'still newest first')
      t.assert((await t.page.textContent('.fx-att-pill.is-latest')) === 'الأحدث', 'Arabic Latest pill')
    },
  },
]
