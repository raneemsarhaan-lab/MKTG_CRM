// US6, blocks that do what they say: FR-060–069, SC-012.
const insert = async (t, label) => {
  await t.page.locator('button[title="Insert"]').click()
  await t.page.locator('[role=menuitem]', { hasText: label }).first().click()
  await t.page.waitForTimeout(120)
}
const tableBar = t => t.page.locator('[data-table-menu]')

export const blocks = [
  {
    id: 'task-insert-below',
    async run(t) {
      await t.editor().locator('p', { hasText: 'Questions to' }).click()
      await insert(t, 'Task')
      await t.page.keyboard.type('new item')
      const md = await t.md()
      t.assert(md.includes('Questions to [the team page](https://forefront.consulting/team).'), 'the current line is unchanged')
      t.assert(/- \[ \] new item/.test(md), `a new checklist item below: ${md.slice(-80)}`)
    },
  },
  {
    id: 'youtube-block',
    async run(t) {
      await t.focusEnd()
      await insert(t, 'YouTube video')
      const input = t.page.locator('#brief-prompt-youtube')
      await input.fill('https://vimeo.com/123')
      t.assert(await t.page.locator('#brief-prompt-youtube-err').isVisible(), 'non-YouTube refused')
      await input.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      await input.press('Enter')
      await t.page.waitForTimeout(150)
      t.eq(await t.editor().locator('.fx-yt').count(), 1, 'a video block, not text')
      const md = await t.md()
      t.assert(md.includes('\n\n<https://www.youtube.com/watch?v=dQw4w9WgXcQ>'), 'stored as a link on its own line')
    },
  },
  {
    id: 'youtube-legacy',
    hash: 'initial=youtube',
    async run(t) {
      t.eq(await t.editor().locator('.fx-yt').count(), 2, 'bare and linked YouTube lines open as video blocks')
    },
  },
  {
    id: 'table-menu',
    async run(t) {
      await t.editor().locator('td', { hasText: 'Hook' }).click()
      await t.page.waitForTimeout(200)
      t.assert(await tableBar(t).isVisible(), 'table bar shown')
      const cols = () => t.editor().locator('table tr').first().locator('th, td').count()
      const rows = () => t.editor().locator('table tr').count()
      const r0 = await rows(), c0 = await cols()
      await tableBar(t).locator('[data-action=rowBelow]').click()
      t.eq(await rows(), r0 + 1, 'row added')
      await tableBar(t).locator('[data-action=colRight]').click()
      t.eq(await cols(), c0 + 1, 'column added')
      await tableBar(t).locator('[data-action=deleteColumn]').click()
      t.eq(await cols(), c0, 'column deleted')
      await tableBar(t).locator('[data-action=deleteRow]').click()
      t.eq(await rows(), r0, 'row deleted')
      await tableBar(t).locator('[data-action=deleteTable]').click()
      t.eq(await t.editor().locator('table').count(), 0, 'table deleted')
      // A new table: full width, header row, 3 × 3.
      await t.focusEnd()
      await insert(t, 'Table')
      const tw = await t.editor().locator('table').boundingBox()
      const ew = await t.page.evaluate(() => { const e = document.querySelector('.ProseMirror'); const cs = getComputedStyle(e); return e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) })
      t.assert(Math.abs(tw.width - ew) < 3, `new table fills the width (${tw.width} vs ${ew})`)
      t.eq(await t.editor().locator('table th').count(), 3, 'header row of 3')
    },
  },
  {
    id: 'toggle-placeholders',
    async run(t) {
      await t.focusEnd()
      await insert(t, 'Toggle list')
      const summary = t.editor().locator('details summary').last()
      t.eq((await summary.innerText()).trim(), '', 'no filler title')
      t.eq(await summary.getAttribute('data-placeholder'), 'Toggle title', 'grey title hint')
      const hint = await t.editor().locator('details p.is-empty').last().evaluate(el => getComputedStyle(el, '::before').content)
      t.eq(hint, '"Hidden content"', 'grey body hint')
      await t.page.keyboard.type('Brand notes')
      const md = await t.md()
      t.assert(md.includes('<summary>Details</summary>\n\nBrand notes'), `untitled toggle saved with a neutral title: ${md.slice(-90)}`)
    },
  },
  {
    id: 'toc-block',
    hash: 'initial=toc',
    async run(t) {
      const toc = t.editor().locator('.fx-toc')
      t.eq(await toc.count(), 1, 'labelled block, not raw text')
      t.assert((await toc.innerText()).includes('First') && (await toc.innerText()).includes('Second'), 'lists the headings')
      t.assert(!(await t.editor().innerText()).includes('[[toc]]'), 'no raw [[toc]]')
    },
  },
  {
    id: 'table-resize',
    async run(t) {
      const cell = t.editor().locator('th', { hasText: 'Shot' })
      const box = await cell.boundingBox()
      const before = await t.editor().locator('table tr').first().locator('th').evaluateAll(els => els.map(e => e.getBoundingClientRect().width))
      await t.page.mouse.move(box.x + box.width - 2, box.y + 8)
      await t.page.waitForTimeout(80)
      t.assert(await t.page.locator('.fx-col-handle').isVisible(), 'handle on the border')
      const h = await t.page.locator('.fx-col-handle').boundingBox()
      await t.page.mouse.move(h.x + 3, h.y + 10)
      await t.page.mouse.down()
      await t.page.mouse.move(h.x + 3 + 120, h.y + 10, { steps: 6 })
      await t.page.mouse.up()
      await t.page.waitForTimeout(150)
      const after = await t.editor().locator('table tr').first().locator('th').evaluateAll(els => els.map(e => e.getBoundingClientRect().width))
      t.assert(after[0] > before[0] + 100 && after[1] < before[1] - 100, `two columns traded width (${before} → ${after})`)
      t.assert(Math.abs(after[2] - before[2]) < 2, 'third column unchanged')
      // Drag far: stops at the minimum. Hover the border again first, as a
      // person would; the table redraws after each drag.
      const box2 = await cell.boundingBox()
      await t.page.mouse.move(box2.x + box2.width - 2, box2.y + 8)
      await t.page.waitForTimeout(80)
      const h2 = await t.page.locator('.fx-col-handle').boundingBox()
      await t.page.mouse.move(h2.x + 3, h2.y + 10); await t.page.mouse.down()
      await t.page.mouse.move(h2.x + 900, h2.y + 10, { steps: 6 }); await t.page.mouse.up()
      const min = await t.editor().locator('table tr').first().locator('th').evaluateAll(els => els.map(e => e.getBoundingClientRect().width))
      t.assert(min[1] >= 63, `minimum column width kept (${min[1]})`)
      t.assert(/<table data-widths="/.test(await t.md()), 'saved with its widths')
    },
  },
  {
    id: 'table-edges',
    async run(t) {
      for (const locale of ['en', 'ar']) {
        await t.open(`locale=${locale}`)
        const table = t.editor().locator('table')
        const tb0 = await table.boundingBox()
        const endX = locale === 'ar' ? tb0.x + 1 : tb0.x + tb0.width - 1
        const startX = locale === 'ar' ? tb0.x + tb0.width - 1 : tb0.x + 1
        const inward = locale === 'ar' ? 1 : -1
        // End edge inwards: the table narrows.
        await t.page.mouse.move(endX, tb0.y + 10); await t.page.waitForTimeout(80)
        let h = await t.page.locator('.fx-col-handle').boundingBox()
        await t.page.mouse.move(h.x + 3, h.y + 10); await t.page.mouse.down()
        await t.page.mouse.move(h.x + 3 + inward * 150, h.y + 10, { steps: 6 }); await t.page.mouse.up()
        const tb1 = await table.boundingBox()
        t.assert(tb1.width < tb0.width - 140, `${locale}: end edge narrowed the table (${tb0.width} → ${tb1.width})`)
        // Start edge inwards: the start moves.
        const sx = locale === 'ar' ? tb1.x + tb1.width - 1 : tb1.x + 1
        await t.page.mouse.move(sx, tb1.y + 10); await t.page.waitForTimeout(80)
        h = await t.page.locator('.fx-col-handle').boundingBox()
        await t.page.mouse.move(h.x + 3, h.y + 10); await t.page.mouse.down()
        await t.page.mouse.move(h.x + 3 - inward * 80, h.y + 10, { steps: 6 }); await t.page.mouse.up()
        const tb2 = await table.boundingBox()
        if (locale === 'ar') t.assert(tb2.x + tb2.width < tb1.x + tb1.width - 70, `${locale}: start edge moved`)
        else t.assert(tb2.x > tb1.x + 70, `${locale}: start edge moved`)
        // Outwards stops at the brief's edge.
        const ox = locale === 'ar' ? tb2.x + 1 : tb2.x + tb2.width - 1
        await t.page.mouse.move(ox, tb2.y + 10); await t.page.waitForTimeout(80)
        h = await t.page.locator('.fx-col-handle').boundingBox()
        await t.page.mouse.move(h.x + 3, h.y + 10); await t.page.mouse.down()
        await t.page.mouse.move(h.x + 3 - inward * 2000, h.y + 10, { steps: 6 }); await t.page.mouse.up()
        const box = await t.page.evaluate(() => { const e = document.querySelector('.ProseMirror'); const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { l: r.left + parseFloat(cs.paddingLeft), r: r.right - parseFloat(cs.paddingRight) } })
        const tb3 = await table.boundingBox()
        t.assert(tb3.x >= box.l - 1 && tb3.x + tb3.width <= box.r + 1, `${locale}: never wider than the brief`)
        void startX
      }
    },
  },
  {
    id: 'table-widths-roundtrip',
    hash: 'initial=table-widths',
    async run(t) {
      const measure = async sel => t.page.evaluate(sel => {
        const tb = document.querySelector(sel)
        const cells = [...tb.rows[0].cells].map(c => c.getBoundingClientRect().width)
        const sum = cells.reduce((a, b) => a + b, 0)
        return cells.map(c => Math.round(c / sum * 100))
      }, sel)
      const inEditor = await measure('.ProseMirror table')
      t.eq(inEditor.join(','), '30,20,50', 'widths applied in the editor')
      t.assert((await t.editor().locator('td ul li').count()) === 2, 'a list inside a cell is kept')
      await t.focusEnd(); await t.page.keyboard.type('!')
      const md = await t.md()
      t.assert(md.includes('data-widths="30,20,50"') && md.includes('data-width="80"') && md.includes('data-offset="10"'), `sizes saved: ${md.slice(0, 200)}`)
      t.assert(md.includes('<ul><li><p>Face to camera</p></li><li><p>Smile</p></li></ul>'), 'cell list saved in full')
      await t.page.goto('about:blank')
      await t.page.goto(t.page.url().replace('about:blank', '') || 'about:blank')
      const lab = await t.lab().catch(() => null)
      void lab
      await t.open('initial=table-widths&view=read')
      const inRead = await measure('.fx-brief-read table')
      t.eq(inRead.join(','), '30,20,50', 'same widths in the read view')
    },
  },
  {
    id: 'table-equal-widths',
    hash: 'initial=table-widths',
    async run(t) {
      await t.editor().locator('td', { hasText: 'Hook' }).click()
      await t.page.waitForTimeout(200)
      await tableBar(t).locator('[data-action=equalWidths]').click()
      await tableBar(t).locator('[data-action=fullWidth]').click()
      const md = await t.md()
      t.assert(!md.includes('data-width'), 'no sizes left')
    },
  },
]
