// US2, links that behave: FR-020–025, SC-004, SC-005.
const card = t => t.page.locator('[data-link-card]')
const linkInEditor = (t, text) => t.page.locator('.ProseMirror a', { hasText: text }).first()
async function selectWordBefore(t, n) {
  await t.page.keyboard.down('Shift')
  for (let i = 0; i < n; i++) await t.page.keyboard.press('ArrowLeft')
  await t.page.keyboard.up('Shift')
  // The browser reports a selection change a moment after the key; a person
  // never presses the next key that fast, Playwright does.
  await t.page.waitForTimeout(120)
}

export const links = [
  {
    id: 'link-click-no-open',
    async run(t) {
      const popup = t.context.waitForEvent('page', { timeout: 1200 }).catch(() => null)
      await linkInEditor(t, 'Canva draft').click()
      t.assert(!(await popup), 'clicking a link while editing opened a page')
      await t.page.waitForTimeout(250)
      t.assert(await card(t).isVisible(), 'link card shown')
      t.assert((await card(t).innerText()).includes('canva.link'), 'card names the host')
    },
  },
  {
    id: 'link-open-edit-remove',
    async run(t) {
      await linkInEditor(t, 'Canva draft').click()
      await t.page.waitForTimeout(250)
      const open = card(t).locator('a', { hasText: 'Open' })
      t.eq(await open.getAttribute('target'), '_blank', 'Open uses a new tab')
      t.eq(await open.getAttribute('href'), 'https://canva.link/enoti2krrw77ztp', 'Open goes to the link')
      await card(t).locator('button', { hasText: 'Edit' }).click()
      const input = t.page.locator('#brief-prompt-link')
      t.eq(await input.inputValue(), 'https://canva.link/enoti2krrw77ztp', 'Edit is pre-filled')
      await input.fill('canva.com/design/new')
      await input.press('Enter')
      let md = await t.md()
      t.assert(md.includes('[Canva draft](https://canva.com/design/new)'), `edited link saved: ${md.slice(0, 200)}`)
      await linkInEditor(t, 'Canva draft').click()
      await t.page.waitForTimeout(250)
      await card(t).locator('button', { hasText: 'Remove' }).click()
      md = await t.md()
      t.assert(md.includes('approved Canva draft.') && !md.includes('canva.com/design/new'), 'Remove keeps the text, drops the link')
    },
  },
  {
    id: 'link-mod-k',
    async run(t) {
      await t.focusEnd()
      await t.page.keyboard.type(' deck')
      await selectWordBefore(t, 4)
      await t.page.keyboard.press('Control+k')
      await t.page.waitForTimeout(150)
      t.assert(await t.page.locator('#brief-prompt-link').isVisible(), 'Ctrl+K opened the link box')
      await linkInEditor(t, 'Canva draft').click()
      await t.page.waitForTimeout(150)
      await t.page.keyboard.press('Control+k')
      t.eq(await t.page.locator('#brief-prompt-link').inputValue(), 'https://canva.link/enoti2krrw77ztp', 'pre-filled inside a link')
    },
  },
  {
    id: 'link-normalise',
    async run(t) {
      await t.focusEnd()
      await t.page.keyboard.type(' our site')
      await selectWordBefore(t, 4)
      await t.page.keyboard.press('Control+k')
      const input = t.page.locator('#brief-prompt-link')
      await input.fill('see the deck')
      t.assert(await t.page.locator('#brief-prompt-link-err').isVisible(), 'invalid address explained')
      t.assert(await t.page.locator('button', { hasText: 'Add link' }).isDisabled(), 'cannot add an invalid link')
      await input.fill('forefront.consulting')
      await input.press('Enter')
      const md = await t.md()
      t.assert(md.includes("[site](https://forefront.consulting)"), `saved with https: ${JSON.stringify(md)}`)
    },
  },
]
