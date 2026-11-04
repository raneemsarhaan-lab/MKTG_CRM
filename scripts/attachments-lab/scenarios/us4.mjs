// US4: add files every way, with honest feedback (FR-050–FR-059).
const status = t => t.page.$$eval('[data-att-job]', js => js.map(j => j.getAttribute('data-att-job-status')))

/** Paste one picture called "image.png", as a screenshot from the clipboard arrives. */
async function pasteScreenshot(t, target = 'body') {
  return t.page.evaluate(sel => {
    const f = window.__lab.dataUrlToFile(window.__lab.poster(2), 'image.png')
    window.__lab.added.push(f)
    const dt = new DataTransfer(); dt.items.add(f)
    const t0 = performance.now()
    document.querySelector(sel).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    return t0
  }, target)
}

export const us4 = [
  {
    id: 'us4-1',
    async run(t) {
      const t0 = await pasteScreenshot(t)
      const ms = await t.page.evaluate(async t0 => {
        while (!document.querySelector('[data-att-job]')) await new Promise(r => requestAnimationFrame(r))
        return performance.now() - t0
      }, t0)
      t.assert(ms < 1000, `the tile shows within 1 s of the paste (${Math.round(ms)} ms, SC-003)`)
      await t.waitUploads(5)
      t.assert(/^Screenshot \d\d\.\d\d\.png$/.test((await t.lab()).uploads[0].name), `named from the time: ${(await t.lab()).uploads[0].name}`)
      t.assert((await t.names())[0].startsWith('Screenshot'), 'first in the list')
    },
  },
  {
    id: 'us4-2',
    async run(t) {
      await t.page.evaluate(() => { window.__lab.uploadStepMs = 120 })
      await t.page.evaluate(() => {
        const dt = new DataTransfer()
        for (const n of ['a.png', 'b.png', 'c.png']) dt.items.add(window.__lab.dataUrlToFile(window.__lab.poster(1), n))
        window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
      })
      await t.page.waitForSelector('[data-att-job]')
      t.eq((await status(t)).length, 3, 'three tiles, one per file')
      t.eq(await t.page.locator('[data-att-job] [role="progressbar"]').count(), 3, 'each with its own progress')
      const first = await t.page.$eval('[data-att-grid] > :first-child', el => el.hasAttribute('data-att-job'))
      t.assert(first, 'at the front of the list')
      await t.waitUploads(7)
      t.eq((await t.lab()).uploads.map(u => u.name), ['a.png', 'b.png', 'c.png'], 'one at a time, in order')
    },
  },
  {
    id: 'us4-2-arabic',
    hash: 'locale=ar',
    async run(t) {
      await t.add(lab => [lab.dataUrlToFile(lab.poster(1), 'a.png')])
      await t.page.waitForSelector('[data-att-job]')
      t.assert((await t.page.textContent('[data-att-job] .fx-att-pill')) === 'جارٍ الرفع', 'Arabic "Uploading"')
    },
  },
  {
    id: 'us4-3',
    async run(t) {
      const tile = await t.page.textContent('[data-att-add-tile]')
      t.assert(tile.includes('Paste, drop or browse') && tile.includes('Up to 200 MB each'), tile)
      await t.open('storage=0')
      t.assert((await t.page.textContent('[data-att-add-tile]')).includes('Up to about 5 MB each'), 'the inline limit')
    },
  },
  {
    id: 'us4-4',
    async run(t) {
      await t.add(lab => [lab.sizedFile('Campaign video - rough cut.mp4', 210 * 1024 * 1024, 'video/mp4')])
      const job = t.page.locator('[data-att-job-status="too-large"]')
      await job.waitFor()
      const text = await job.textContent()
      t.assert(text.includes('Too large') && text.includes('210.0 MB') && text.includes('200 MB limit'), text)
      t.eq((await t.lab()).uploads.length, 0, 'nothing uploaded')
      await job.getByRole('button', { name: 'Remove' }).click()
      t.eq(await t.page.locator('[data-att-job]').count(), 0, 'Remove clears it')
      await t.open('storage=0')
      await t.add(lab => [lab.sizedFile('Hero.png', 7 * 1024 * 1024, 'image/png')])
      const inline = await t.page.locator('[data-att-job-status="too-large"]').textContent()
      t.assert(inline.includes('7.0 MB') && inline.includes('about 5 MB'), `pictures are refused, not shrunk: ${inline}`)
    },
  },
  {
    id: 'us4-5',
    async run(t) {
      await t.page.evaluate(() => { window.__lab.failAt = 60 })
      await t.add(lab => [lab.dataUrlToFile(lab.poster(3), 'Carousel slide 2.png')])
      const job = t.page.locator('[data-att-job-status="failed"]')
      await job.waitFor()
      const text = await job.textContent()
      t.assert(text.includes('Not uploaded') && text.includes('the connection dropped'), text)
      await job.getByRole('button', { name: 'Retry' }).click()
      await t.waitUploads(5)
      t.assert((await t.names())[0].includes('Carousel slide 2'), 'Retry stores it')
      t.eq((await t.lab()).uploads.length, 2, 'the same file sent again')
    },
  },
  {
    id: 'us4-6',
    async run(t) {
      const add = () => t.add(lab => [lab.dataUrlToFile(lab.poster(2), 'AI Adoption Gap - Post v2.png')])
      await add()
      const bar = t.page.locator('[data-att-dupe]')
      await bar.waitFor()
      t.assert((await bar.textContent()).includes('AI Adoption Gap - Post v2.png is already attached.'), 'asks')
      await bar.getByRole('button', { name: 'Keep both' }).click()
      await t.waitUploads(5)
      t.assert((await t.names()).some(n => n.includes('Post v2 (2).png')), 'Keep both saves "(2)"')

      await add()
      await bar.waitFor()
      await bar.getByRole('button', { name: 'Replace it' }).click()
      await t.page.waitForSelector('[data-att-ghost]')
      const newId = (await t.lab()).server.at(-1).id
      t.assert((await t.page.textContent('[data-att-ghost]')).includes('Post v2'), 'the old file waits out its Undo')
      await t.page.click('[data-undo]')
      await t.page.waitForTimeout(300)
      const lab = await t.lab()
      t.assert(lab.removes.some(r => r.id === newId), 'Undo deletes the new file')
      t.eq((await t.names()).filter(n => n.trim() === 'AI Adoption Gap - Post v2.png').length, 1, 'and the old one is back')
    },
  },
  {
    id: 'us4-7',
    async run(t) {
      await t.add(lab => [lab.dataUrlToFile(lab.poster(1), 'The Structural Gap - Post v1.png'), lab.dataUrlToFile(lab.poster(2), 'ai adoption gap - post v2.png')])
      const bar = t.page.locator('[data-att-dupe]')
      t.assert((await bar.textContent()).includes('Post v1'), 'first clash first')
      await bar.getByRole('button', { name: 'Cancel' }).click()
      t.assert((await bar.textContent()).includes('post v2'), 'then the second (ignoring capitals)')
      await bar.getByRole('button', { name: 'Cancel' }).click()
      t.eq(await bar.count(), 0, 'done')
      t.eq((await t.lab()).uploads.length, 0, 'Cancel adds nothing')
    },
  },
  {
    id: 'no-image-shrink',
    async run(t) {
      await t.add(lab => [lab.dataUrlToFile(lab.poster(3), 'Original.png')])
      await t.waitUploads(5)
      const same = await t.page.evaluate(() => window.__lab.uploads[0].file === window.__lab.added[0] && window.__lab.uploads[0].size === window.__lab.added[0].size)
      t.assert(same, 'the file that reaches upload is the one added, unchanged')
    },
  },
  {
    id: 'limit-before-read',
    async run(t) {
      await t.page.evaluate(() => {
        window.__reads = 0
        const orig = FileReader.prototype.readAsDataURL
        FileReader.prototype.readAsDataURL = function (...a) { window.__reads++; return orig.apply(this, a) }
      })
      await t.add(lab => [lab.sizedFile('Huge.mov', 250 * 1024 * 1024, 'video/quicktime')])
      await t.page.waitForSelector('[data-att-job-status="too-large"]')
      t.eq((await t.lab()).uploads.length, 0, 'never reaches upload')
      t.eq(await t.page.evaluate(() => window.__reads), 0, 'never read')
    },
  },
  {
    id: 'twelve-at-a-time',
    async run(t) {
      await t.page.evaluate(() => { window.__lab.uploadStepMs = 400 })
      await t.add(lab => Array.from({ length: 14 }, (_, i) => lab.dataUrlToFile(lab.poster(1), `f${i}.png`)))
      await t.page.waitForSelector('[data-att-job]')
      t.eq(await t.page.locator('[data-att-job]').count(), 12, '12 taken')
      t.assert((await t.page.textContent('[data-att-section] [role="alert"]')).includes('2 files skipped'), 'the rest are reported')
    },
  },
]
