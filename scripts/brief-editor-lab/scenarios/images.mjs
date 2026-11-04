// US3, screenshots straight into the brief: FR-030–036, SC-005.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAG0lEQVR42mNk+M9QzwAEjDAGAzYwYBQMKAAAm8ED/W4Hg48AAAAASUVORK5CYII='

/** Fire a paste or drop of PNG files at the editor, the way a browser would. */
async function sendFiles(t, kind, names, at) {
  await t.page.evaluate(([kind, names, b64, at]) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const dt = new DataTransfer()
    for (const n of names) dt.items.add(new File([bytes], n, { type: n.endsWith('.pdf') ? 'application/pdf' : 'image/png' }))
    const el = document.querySelector('.ProseMirror')
    if (kind === 'paste') {
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    } else {
      const r = el.getBoundingClientRect()
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + 30, clientY: at ?? r.top + 20 }))
    }
  }, [kind, names, PNG, at])
}
const imgs = t => t.page.locator('.ProseMirror img')
const placeholders = t => t.page.locator('[data-upload-placeholder]')

export const images = [
  {
    id: 'paste-image',
    hash: 'upload=ok',
    async run(t) {
      await t.focusEnd()
      await sendFiles(t, 'paste', ['shot.png'])
      await t.page.waitForTimeout(100)
      t.eq(await placeholders(t).count(), 1, 'placeholder while uploading')
      t.assert((await placeholders(t).innerText()).includes('Uploading shot.png'), 'placeholder names the file')
      await t.page.waitForTimeout(700)
      t.eq(await placeholders(t).count(), 0, 'placeholder gone')
      t.eq(await imgs(t).count(), 1, 'image inserted')
      const md = await t.md()
      t.assert(/!\[shot\.png\]\(http:\/\/127\.0\.0\.1:\d+\/sample\.png/.test(md), `Markdown has the uploaded image: ${md.slice(-120)}`)
      t.assert(!md.includes('Uploading'), 'placeholder never saved')
    },
  },
  {
    id: 'drop-images-order',
    hash: 'upload=ok',
    async run(t) {
      await t.focusEnd()
      await sendFiles(t, 'drop', ['one.png', 'two.png', 'three.png'])
      await t.page.waitForTimeout(150)
      t.eq(await placeholders(t).count(), 3, 'three placeholders')
      await t.page.waitForTimeout(1700)
      const alts = await imgs(t).evaluateAll(els => els.map(e => e.getAttribute('alt')))
      t.eq(alts.join(','), 'one.png,two.png,three.png', 'inserted in the order dropped')
    },
  },
  {
    id: 'upload-fail',
    hash: 'upload=fail',
    async run(t) {
      await t.focusEnd()
      await sendFiles(t, 'paste', ['broken.png'])
      await t.page.waitForTimeout(700)
      t.eq(await placeholders(t).count(), 0, 'placeholder removed')
      t.eq(await imgs(t).count(), 0, 'nothing inserted')
      t.assert((await t.page.locator('body').innerText()).includes("broken.png couldn't upload"), 'note names the file')
    },
  },
  {
    id: 'upload-unavailable',
    hash: 'upload=absent&reason=no-permission',
    async run(t) {
      await t.focusEnd()
      await sendFiles(t, 'paste', ['x.png'])
      await t.page.waitForTimeout(200)
      t.eq(await imgs(t).count(), 0, 'nothing inserted')
      t.assert((await t.page.locator('body').innerText()).includes("You can't add attachments"), 'explains why')
    },
  },
  {
    id: 'paste-non-image',
    hash: 'upload=ok',
    async run(t) {
      await t.focusEnd()
      await sendFiles(t, 'paste', ['brief.pdf'])
      await t.page.waitForTimeout(200)
      t.assert((await t.page.locator('body').innerText()).includes('Only images go into the brief'), 'non-image refused with a hint')
    },
  },
  {
    id: 'image-url-validate',
    async run(t) {
      await t.focusEnd()
      await t.page.locator('button[title="Insert"]').click()
      await t.page.locator('[role=menuitem]', { hasText: 'Image' }).click()
      const input = t.page.locator('#brief-prompt-image')
      await input.fill('not a url')
      t.assert(await t.page.locator('#brief-prompt-image-err').isVisible(), 'invalid address explained')
      const origin = await t.page.evaluate(() => location.origin)
      await input.fill(`${origin}/missing.png`)
      await t.page.waitForTimeout(1200)
      t.assert((await t.page.locator('#brief-prompt-image-err').innerText()).includes("didn't load"), 'unloadable image refused')
      t.assert(await t.page.locator('button', { hasText: 'Insert image' }).isDisabled(), 'Insert disabled')
      await input.fill(`${origin}/sample.png`)
      await t.page.waitForTimeout(1200)
      t.assert(await t.page.locator('img[data-preview]').isVisible(), 'preview shown')
      await t.page.locator('button', { hasText: 'Insert image' }).click()
      const md = await t.md()
      t.assert(md.includes(`![](${origin}/sample.png)`), 'image saved on its own line')
    },
  },
  {
    id: 'image-roundtrip',
    hash: 'upload=ok',
    async run(t) {
      await t.focusEnd()
      await sendFiles(t, 'paste', ['keep.png'])
      await t.page.waitForTimeout(700)
      await t.md()
      await t.page.keyboard.press('Escape')
      await t.page.waitForSelector('#reopen')
      await t.page.click('#reopen')
      await t.page.waitForSelector('.ProseMirror')
      t.eq(await imgs(t).count(), 1, 'image still there after reopening')
    },
  },
  {
    id: 'leave-during-upload',
    hash: 'upload=slow',
    async run(t) {
      await t.focusEnd()
      await sendFiles(t, 'paste', ['big.png'])
      await t.page.waitForTimeout(300)
      await t.page.keyboard.press('Escape')
      await t.page.waitForTimeout(150)
      t.assert((await t.page.locator('[data-confirm-leave]').innerText()).includes('An image is still uploading'), 'asks before leaving mid-upload')
      await t.page.locator('[data-confirm-leave] button', { hasText: 'Stay' }).click()
      await t.page.waitForTimeout(3200)
      t.eq(await imgs(t).count(), 1, 'image inserted after staying')
      t.eq((await t.lab()).done, 0, 'still editing')
    },
  },
]
