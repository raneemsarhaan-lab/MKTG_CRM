// US8, Arabic: FR-090, FR-091, SC-009.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'messages', f), 'utf8')).briefEditor

/** Latin words of 3+ letters in the editor's own UI (not the brief's text),
 *  ignoring product names, URLs, file names and Markdown hints. */
async function latinInChrome(t) {
  return t.page.evaluate(() => {
    const allowed = /^(YouTube|Markdown|Ctrl|Shift|Alt|Enter|Esc|https?|www|png|jpg)$/i  // key names stay as printed on keyboards
    const parts = []
    const chrome = [...document.querySelectorAll('[role=toolbar], [role=menu], #brief-slash-menu, [data-link-card], [data-table-menu], [data-confirm-leave], [role=status]')]
    for (const el of chrome) {
      // Addresses (the link card's host and path) are not UI text.
      const copy = el.cloneNode(true)
      copy.querySelectorAll('[data-url]').forEach(n => n.remove())
      // Text node by text node, so the B / I / S glyphs stay separate letters.
      const w = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) parts.push(n.textContent)
      copy.querySelectorAll('[title], [aria-label]').forEach(n => parts.push(n.getAttribute('title') ?? '', n.getAttribute('aria-label') ?? ''))
    }
    const ed = document.querySelector('.ProseMirror')
    parts.push(ed.getAttribute('aria-label') ?? '')
    const words = parts.join(' ').replace(/https?:\/\/\S+/g, ' ').match(/[A-Za-z]{3,}/g) ?? []
    return [...new Set(words.filter(w => !allowed.test(w)))]
  })
}

export const arabic = [
  {
    id: 'messages-parity',
    async run(t) {
      const en = Object.keys(read('en.json')).sort(), ar = Object.keys(read('ar.json')).sort()
      t.eq(en.join(','), ar.join(','), 'English and Arabic have the same briefEditor keys')
      const same = en.filter(k => read('en.json')[k] === read('ar.json')[k] && /[A-Za-z]{3,}/.test(read('en.json')[k]) && !/^https?:/.test(read('en.json')[k]))
      t.eq(same.join(','), '', 'no English left untranslated in ar.json')
    },
  },
  {
    id: 'arabic',
    hash: 'locale=ar',
    async run(t) {
      t.eq(await t.page.evaluate(() => getComputedStyle(document.querySelector('[role=toolbar]')).direction), 'rtl', 'toolbar is right-to-left')
      let leaks = await latinInChrome(t)
      t.eq(leaks.join(' '), '', 'no English in the toolbar')
      for (const title of ['نمط النص', 'إدراج', 'المزيد']) {
        await t.page.locator(`button[title="${title}"]`).click()
        leaks = await latinInChrome(t)
        t.eq(leaks.join(' '), '', `no English with "${title}" open`)
        await t.page.keyboard.press('Escape')
      }
      // Link card and table bar.
      await t.editor().locator('a').first().click()
      await t.page.waitForTimeout(200)
      leaks = await latinInChrome(t)
      t.eq(leaks.join(' '), '', 'no English in the link card')
      await t.editor().locator('td').first().click()
      await t.page.waitForTimeout(200)
      leaks = await latinInChrome(t)
      t.eq(leaks.join(' '), '', 'no English in the table bar')
      // The first toolbar group sits at the right edge.
      const bar = await t.page.locator('[data-brief-toolbar]').boundingBox()
      const undo = await t.page.locator('button[title^="تراجع"]').boundingBox()
      t.assert(undo.x > bar.x + bar.width / 2, 'Undo is on the right, toolbar mirrored')
      await t.page.screenshot({ path: path.join(ROOT, 'scripts/brief-editor-lab/out/arabic.png') })
    },
  },
]
