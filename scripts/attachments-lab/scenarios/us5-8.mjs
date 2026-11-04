// US5 rename (FR-040–FR-042), US6 header and comments (FR-072–FR-074),
// US7 lists and loading (FR-070, FR-071), US8 phones and keyboard (FR-060–FR-063).
const V1 = 'The Structural Gap - Post v1.png'

async function startRename(t, name) {
  await t.tile(name).locator('button.fx-att-name').click()
  return t.page.locator('.fx-att-rename input')
}

export const us5 = [
  {
    id: 'us5-1',
    async run(t) {
      const input = await startRename(t, V1)
      t.eq(await input.inputValue(), 'The Structural Gap - Post v1', 'the base name, without the extension')
      const sel = await input.evaluate(i => [i.selectionStart, i.selectionEnd, i.value.length])
      t.assert(sel[0] === 0 && sel[1] === sel[2], 'fully selected')
      t.eq((await t.page.textContent('.fx-att-rename span')).trim(), '.png', 'the extension shown beside it')
    },
  },
  {
    id: 'us5-2',
    async run(t) {
      let input = await startRename(t, V1)
      await input.fill('Post v1 approved')
      await t.page.keyboard.press('Enter')
      await t.page.waitForFunction(() => window.__lab.renames.length === 1)
      t.assert((await t.names()).some(n => n.trim() === 'Post v1 approved.png'), 'saved with the extension')
      t.eq(await t.page.evaluate(() => document.activeElement?.hasAttribute('data-att-name')), true, 'focus back on the name')
      input = await startRename(t, 'Post v2')
      await input.fill('nope')
      await t.page.keyboard.press('Escape')
      t.assert((await t.names()).some(n => n.includes('AI Adoption Gap - Post v2.png')), 'Esc keeps the old name')
      t.eq((await t.lab()).renames.length, 1, 'and sends nothing')
    },
  },
  {
    id: 'us5-3',
    async run(t) {
      const input = await startRename(t, V1)
      await input.fill('Approved.png')
      await t.page.mouse.click(5, 5)   // anywhere else
      await t.page.waitForFunction(() => window.__lab.renames.length === 1)
      t.eq((await t.lab()).renames[0].name, 'Approved.png', 'clicking away saves, and the extension is not doubled')
    },
  },
  {
    id: 'us5-4',
    async run(t) {
      const input = await startRename(t, V1)
      await input.fill('   ')
      await t.page.keyboard.press('Enter')
      await t.page.waitForTimeout(200)
      t.eq((await t.lab()).renames.length, 0, 'an empty name keeps the old one')
      t.assert((await t.names()).some(n => n.includes('Post v1.png')), 'unchanged')
    },
  },
  {
    id: 'us5-5',
    hash: 'readonly=1',
    async run(t) {
      t.eq(await t.page.locator('button.fx-att-name').count(), 0, 'names are plain text')
      t.eq(await t.page.locator('[data-att-add], [data-att-add-tile]').count(), 0, 'no Add files')
      t.eq(await t.page.locator('button[aria-label^="Delete "]').count(), 0, 'no Delete')
      await t.page.evaluate(() => {
        const dt = new DataTransfer(); dt.items.add(window.__lab.dataUrlToFile(window.__lab.poster(1), 'x.png'))
        document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      })
      t.assert((await t.page.textContent('[data-att-section] [role="alert"]')).includes('You can only attach files'), 'paste explains why')
      t.eq((await t.lab()).uploads.length, 0, 'and adds nothing')
    },
  },
]

export const us6 = [
  {
    id: 'us6-1',
    async run(t) {
      await t.page.click('[data-att-section] button[aria-expanded]')
      t.eq(await t.page.getAttribute('[data-att-section] button[aria-expanded]', 'aria-expanded'), 'false', 'collapsed')
      await t.page.evaluate(() => document.getElementById('scroller').scrollTo(0, 0))
      await t.page.click('[data-att-count]')
      await t.page.waitForTimeout(700)
      t.eq(await t.page.getAttribute('[data-att-section] button[aria-expanded]', 'aria-expanded'), 'true', 'opened')
      const top = await t.page.$eval('[data-att-section]', s => s.getBoundingClientRect().top)
      t.assert(top >= -2 && top < 120, `scrolled into view (${Math.round(top)})`)
      t.eq(await t.page.locator('[data-att-section].fx-att-flash').count(), 1, 'highlighted')
    },
  },
  {
    id: 'us6-2',
    async run(t) {
      const [chooser] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.click('#clip')])
      await chooser.setFiles({ name: 'Cover - square crop.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') })
      await t.waitUploads(5)
      const draft = t.page.locator('[data-draft] [data-file-chip]')
      t.eq(await draft.count(), 1, 'a chip on the comment being written')
      t.assert((await t.names())[0].includes('Cover - square crop'), 'and the file on the task')
      await t.page.locator('[data-draft] button[aria-label^="Take "]').click()
      t.eq(await draft.count(), 0, 'the chip can be taken off')
      const [again] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.click('#clip')])
      await again.setFiles({ name: 'Cover 2.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') })
      await t.waitUploads(6)
      await t.page.fill('#ctext', 'Here is the square crop')
      await t.page.click('#send')
      const body = (await t.lab()).comments[0]
      t.assert(body.startsWith('Here is the square crop\n[📎 Cover 2.png](attachment:'), body)
      t.eq(await t.page.locator('[data-comment] [data-file-chip]').count(), 1, 'the posted comment shows the chip')
    },
  },
  {
    id: 'us6-3',
    async run(t) {
      const [chooser] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.click('#clip')])
      await chooser.setFiles({ name: 'Chip file.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') })
      await t.waitUploads(5)
      await t.page.click('#send')
      await t.page.locator('[data-comment] [data-file-chip] button').click()
      t.assert((await t.page.textContent('.fx-att-pv-title b')).includes('Chip file.png'), 'the chip opens the preview on its file')
      await t.page.keyboard.press('Escape')
      const tile = t.tile('Chip file')
      await tile.hover()
      await tile.locator('button[aria-label^="Delete "]').click()
      await t.page.waitForTimeout(5600)
      t.assert((await t.page.textContent('[data-comment]')).includes('Chip file.png · deleted'), 'a deleted file says so')
      t.eq(await t.page.locator('[data-comment] [data-file-chip] button').count(), 0, 'and does nothing')
    },
  },
]

export const us7 = [
  {
    id: 'us7-1',
    hash: 'load=900',
    raw: true,   // measured while the placeholders are still showing
    async run(t) {
      await t.page.waitForSelector('[data-att-loading]')
      t.assert((await t.page.textContent('[data-att-section]')).includes('Loading 4 files…'), 'announced')
      const rect = sel => t.page.$eval(sel, el => { const r = el.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height), Math.round(r.width)] })
      const before = await rect('[data-att-loading] .fx-att-tile')
      const below = await rect('#comments')
      await t.loaded()
      t.eq(await rect('[data-att-tile]'), before, 'tiles land exactly where the placeholders were (SC-010)')
      t.eq(await rect('#comments'), below, 'nothing below moves')
    },
  },
  {
    id: 'us7-2',
    hash: 'files=many',
    async run(t) {
      t.eq(await t.page.locator('[data-att-tile]').count(), 7, 'the seven newest')
      t.eq((await t.page.textContent('[data-att-show-all]')).trim(), 'Show all 15 files', 'then Show all')
      await t.page.click('[data-att-show-all]')
      t.eq(await t.page.locator('[data-att-tile]').count(), 15, 'all')
      t.eq((await t.page.textContent('[data-att-show-all]')).trim(), 'Show fewer', 'and back')
    },
  },
]

export const us8 = [
  {
    id: 'us8-1',
    touch: true,
    viewport: { width: 390, height: 844 },
    async run(t) {
      const visible = await t.page.$eval('[data-att-tile] .fx-att-acts', a => [...a.querySelectorAll('.fx-att-act')].filter(x => getComputedStyle(x).display !== 'none').map(x => x.getAttribute('aria-label')))
      t.eq(visible.length, 1, `one ⋯ button on touch screens (${visible})`)
      await t.page.locator('[data-att-tile] [data-att-more]').first().click()
      const items = await t.page.$$eval('[data-att-menu] > *', xs => xs.map(x => x.textContent.trim()))
      t.eq(items, ['Download', 'Rename', 'Delete'], 'its menu')
      t.eq(await t.page.evaluate(() => document.activeElement?.closest('[data-att-menu]') !== null), true, 'focus in the menu')
      await t.page.keyboard.press('Escape')
      t.eq(await t.page.locator('[data-att-menu]').count(), 0, 'Esc closes it')
      t.eq(await t.page.evaluate(() => document.activeElement?.hasAttribute('data-att-more')), true, 'focus back on ⋯')
    },
  },
  {
    id: 'us8-2',
    async run(t) {
      const tile = t.tile(V1)
      await tile.hover()
      await t.page.waitForTimeout(250)   // the fade-in
      const shown = await tile.locator('.fx-att-acts').evaluate(a => ({
        opacity: getComputedStyle(a).opacity,
        labels: [...a.querySelectorAll('.fx-att-act')].filter(x => getComputedStyle(x).display !== 'none').map(x => x.getAttribute('aria-label')),
      }))
      t.eq(shown.opacity, '1', 'appear on hover')
      t.eq(shown.labels, [`Download ${V1}`, `Delete ${V1}`], 'Download and Delete, no ⋯')
    },
  },
  {
    id: 'us8-3',
    async run(t) {
      const pic = t.page.locator('[data-att-open]').first()
      await pic.focus()
      await t.page.keyboard.press('Enter')
      t.eq(await t.page.locator('[data-att-preview]').count(), 1, 'Enter previews')
      await t.page.keyboard.press('Escape')
      await t.page.waitForFunction(() => document.activeElement?.hasAttribute('data-att-open'), null, { timeout: 2000 })
        .catch(() => { throw new Error('focus returns') })
      await t.page.keyboard.press('F2')
      t.eq(await t.page.locator('.fx-att-rename input').count(), 1, 'F2 renames')
      await t.page.keyboard.press('Escape')
      await t.page.locator('[data-att-open]').first().focus()
      await t.page.keyboard.press('Delete')
      await t.page.waitForFunction(() => document.activeElement?.hasAttribute('data-undo'), null, { timeout: 2000 })
        .catch(() => { throw new Error('Delete starts a delete; focus on Undo') })
      await t.page.keyboard.press('Enter')
      await t.page.waitForFunction(() => document.activeElement?.hasAttribute('data-att-open'), null, { timeout: 2000 })
        .catch(() => { throw new Error('Undo returns focus to the picture') })
      t.eq((await t.lab()).removes.length, 0, 'nothing deleted')
    },
  },
  {
    id: 'us8-4',
    viewport: { width: 390, height: 844 },
    async run(t) {
      const cols = await t.page.$eval('[data-att-grid]', g => getComputedStyle(g).gridTemplateColumns.split(' ').length)
      t.eq(cols, 2, 'two tiles per row')
      const sw = await t.page.evaluate(() => document.documentElement.scrollWidth)
      t.assert(sw <= 390, `no sideways scroll (${sw})`)
    },
  },
]
