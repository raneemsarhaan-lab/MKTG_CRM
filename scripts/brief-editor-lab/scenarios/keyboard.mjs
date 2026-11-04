// US5, keyboard-first and findable: FR-040–047, SC-006, SC-007.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const AXE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'out', 'axe.min.js'), 'utf8')
const slashList = t => t.page.locator('#brief-slash-menu')

async function newLine(t) { await t.focusEnd(); await t.page.keyboard.press('Enter') }

export const keyboard = [
  {
    id: 'slash-menu',
    async run(t) {
      await newLine(t)
      const started = Date.now()
      await t.page.keyboard.type('/tab')
      await slashList(t).locator('[role=option]').first().waitFor({ timeout: 5000 })
      await t.page.waitForTimeout(100)
      t.assert(await slashList(t).isVisible(), '"/" opened the menu')
      t.eq((await slashList(t).locator('[role=option]').allInnerTexts()).join(' | '), 'Table | Table of contents', '"tab" narrows the list')
      await t.page.keyboard.press('Enter')
      await t.page.waitForTimeout(150)
      t.assert(Date.now() - started < 5000, 'inserted in under 5 s (SC-006)')
      t.eq(await t.editor().locator('table').count(), 2, 'a second table was inserted')
      t.assert(!(await t.editor().innerText()).includes('/tab'), 'the "/tab" text is gone')
      // A "/" inside a word opens nothing.
      await t.page.keyboard.press('Control+End')
      await t.page.keyboard.press('Enter')
      await t.page.keyboard.type('and/or')
      await t.page.waitForTimeout(150)
      t.eq(await slashList(t).count(), 0, '"and/or" opened nothing')
      // Esc closes the menu and leaves the "/".
      await t.page.keyboard.type(' /hea')
      await slashList(t).locator('[role=option]').first().waitFor({ timeout: 5000 })
      t.assert(await slashList(t).isVisible(), 'menu open again')
      await t.page.keyboard.press('ArrowDown')
      t.eq(await slashList(t).locator('[aria-selected=true]').innerText(), 'Heading 2\n##', 'ArrowDown moves the highlight')
      await t.page.keyboard.press('Escape')
      await t.page.waitForTimeout(150)
      t.eq(await slashList(t).count(), 0, 'Esc closed the menu')
      t.assert((await t.editor().innerText()).includes('/hea'), 'and left the typed text')
      t.assert(await t.editor().isVisible(), 'and did not leave editing')
      // Arabic keyword
      await t.page.keyboard.type(' /جدول')
      await slashList(t).locator('[role=option]').first().waitFor({ timeout: 5000 })
      t.eq(await slashList(t).locator('[role=option]').first().innerText(), 'Table', 'Arabic keyword finds Table')
    },
  },
  {
    id: 'menu-keyboard',
    async run(t) {
      await t.focusEnd()
      await t.page.locator('button[title="Insert"]').focus()
      await t.page.keyboard.press('Enter')
      await t.page.waitForTimeout(100)
      t.eq(await t.page.evaluate(() => document.activeElement?.getAttribute('role')), 'menuitem', 'focus moved into the menu')
      await t.page.keyboard.press('End')
      const last = await t.page.evaluate(() => document.activeElement?.textContent)
      t.assert(last.includes('Table of contents'), `End goes to the last item (${last})`)
      await t.page.keyboard.press('Home')
      await t.page.keyboard.press('ArrowDown')
      t.assert((await t.page.evaluate(() => document.activeElement?.textContent)).includes('Numbered list'), 'arrows move')
      await t.page.keyboard.press('Enter')
      await t.page.waitForTimeout(100)
      t.eq(await t.editor().locator('ol').count(), 1, 'Enter chose the item')
      // Toolbar roving focus.
      await t.page.locator('button[title="Text style"]').focus()
      await t.page.keyboard.press('ArrowRight')
      t.assert((await t.page.evaluate(() => document.activeElement?.getAttribute('title'))).startsWith('Bold'), 'ArrowRight moves along the toolbar')
      const stops = await t.page.evaluate(() => [...document.querySelectorAll('[role=toolbar] button[data-tool]')].filter(b => b.tabIndex === 0).length)
      t.eq(stops, 1, 'one Tab stop in the toolbar')
    },
  },
  {
    id: 'style-checkmark',
    async run(t) {
      await t.editor().locator('h2', { hasText: 'Goal' }).click()
      await t.page.locator('button[title="Text style"]').click()
      const checked = t.page.locator('[role=menuitemradio][aria-checked=true]')
      t.eq(await checked.innerText(), 'Heading 2\n✓', 'current style ticked')
      await checked.click()
      await t.page.waitForTimeout(100)
      t.eq(await t.editor().locator('h2', { hasText: 'Goal' }).count(), 1, 'choosing it again keeps Heading 2')
    },
  },
  {
    id: 'a11y-roles',
    async run(t) {
      t.eq(await t.page.locator('[role=toolbar]').getAttribute('aria-label'), 'Formatting', 'toolbar announced')
      t.eq(await t.editor().getAttribute('aria-label'), 'Brief', 'writing area named')
      await t.editor().locator('strong, p').first().click()
      t.assert(await t.page.locator('button[title^="Bold"][aria-pressed]').count() === 1, 'Bold exposes on/off')
      await t.page.addScriptTag({ content: AXE })
      const scan = async label => {
        const res = await t.page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
          .filter(v => v.impact === 'critical').map(v => `${v.id}: ${v.nodes.length}`))
        t.eq(res.join('; '), '', `critical accessibility issues ${label}`)
      }
      await scan('at rest')
      for (const title of ['Text style', 'Insert', 'More actions']) {
        await t.page.locator(`button[title="${title}"]`).click()
        await scan(`with ${title} open`)
        await t.page.keyboard.press('Escape')
      }
    },
  },
]
