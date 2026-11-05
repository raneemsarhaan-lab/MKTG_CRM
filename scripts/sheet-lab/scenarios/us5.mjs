// US5: attach the cut, a Drive link, an upload, or both (FR-040–FR-046).
async function pick(t, row, file) {
  await t.cell(row, 'files').click()
  const [chooser] = await Promise.all([
    t.page.waitForEvent('filechooser'),
    t.page.locator('[data-menu-item="upload"]').click(),
  ])
  await chooser.setFiles(file)
}
const mp4 = (name, size) => ({ name, mimeType: 'video/mp4', buffer: Buffer.alloc(size, 7) })

export const us5 = [
  {
    id: 'us5-1',
    async run(t) {
      await t.page.evaluate(() => window.__sheet.setTasks(ts => ts.map(x => (x.id === 'c03' ? { ...x, attachments: [] } : x))))
      await t.focusCell('c:c03', 'files')
      await t.page.keyboard.press('Escape')
      await t.paste({ text: 'https://drive.google.com/file/d/CUT/view' })
      await t.idle(200)
      t.eq((await t.lab()).calls.filter(c => c.fn === 'addLink').map(c => c.args), [['c03', 'https://drive.google.com/file/d/CUT/view']], 'attached as a link')
      t.eq((await t.text('c:c03', 'files')).trim(), 'Drive', 'the cell says Drive')
    },
  },
  {
    id: 'us5-2',
    async run(t) {
      await pick(t, 'c:c03', mp4('13_final.mp4', 300_000))
      await t.page.waitForSelector('[data-cell="c:c03|files"] [role="progressbar"]')
      const during = await t.text('c:c03', 'files')
      t.assert(during.includes('13_final.mp4'), `progress in the cell: ${JSON.stringify(during)}`)
      await t.page.waitForFunction(() => !document.querySelector('[data-cell="c:c03|files"] [role="progressbar"]'), null, { timeout: 5000 })
      t.eq((await t.text('c:c03', 'files')).replace(/\s+/g, ' ').trim(), 'Drive 1 file', 'then the file count')
      t.eq((await t.lab()).uploads, [{ name: '13_final.mp4', size: 300_000 }], 'the file as picked')
      const menuLimit = await (async () => { await t.cell('c:c03', 'files').click(); return t.page.locator('[data-menu-item="upload"]').innerText() })()
      t.assert(menuLimit.includes('Up to 200 MB'), `the limit shown up front: ${menuLimit}`)
    },
  },
  {
    id: 'us5-3',
    hash: 'storage=0',
    async run(t) {
      await pick(t, 'c:c03', mp4('master.mp4', 7 * 1024 * 1024))
      await t.idle(150)
      const cell = await t.text('c:c03', 'files')
      t.assert(cell.includes('Too large · 7.0 MB'), `refused: ${cell}`)
      t.eq((await t.lab()).uploads.length, 0, 'nothing uploaded, nothing read')
      await t.page.locator('[data-cell="c:c03|files"] [data-link-instead]').click()
      const pop = t.page.locator('[data-sheet-pop] input')
      await pop.waitFor()
      await pop.fill('https://drive.google.com/file/d/MASTER/view')
      await t.page.keyboard.press('Enter')
      await t.idle(200)
      t.eq((await t.lab()).calls.filter(c => c.fn === 'addLink').length, 1, 'a link instead')
      t.assert(!(await t.text('c:c03', 'files')).includes('Too large'), 'the refusal clears')
    },
  },
  {
    id: 'us5-4',
    async run(t) {
      await t.page.evaluate(() => { window.__sheet.uploadFailAt = 60 })
      await pick(t, 'c:c04', mp4('11_final.mp4', 100_000))
      await t.page.waitForSelector('[data-cell="c:c04|files"] [data-retry]', { timeout: 5000 })
      const cell = await t.text('c:c04', 'files')
      t.assert(cell.includes('Connection lost') && cell.includes('Retry'), `reason and Retry: ${cell}`)
      await t.page.locator('[data-cell="c:c04|files"] [data-retry]').click()
      await t.page.waitForFunction(() => /1 file/.test(document.querySelector('[data-cell="c:c04|files"]').textContent), null, { timeout: 5000 })
      t.eq((await t.lab()).uploads.length, 2, 'retried with the same file')
    },
  },
  {
    id: 'us5-5',
    async run(t) {
      await t.cell('c:c01', 'files').click()
      const items = await t.menuItems()
      t.eq(items, ['latt-c01-l', 'fatt-c01-f', 'upload', 'link', 'task'], 'open link, preview, upload, paste a link, open task')
      await t.page.locator('[data-menu-item="fatt-c01-f"]').click()
      t.eq((await t.lab()).opened, [{ id: 'c01', opts: { previewId: 'att-c01-f' } }], "opens the file's preview in its task")
      await t.cell('v:v1', 'files').click()
      t.assert((await t.menuItems()).includes('upload'), "the video row's Files cell works the same (FR-044)")
    },
  },
  {
    id: 'us5-readonly',
    hash: 'me=mona',
    async run(t) {
      await t.cell('c:c01', 'files').click()
      t.eq(await t.menuItems(), ['latt-c01-l', 'fatt-c01-f', 'task'], 'no upload without edit rights (FR-046)')
    },
  },
]
