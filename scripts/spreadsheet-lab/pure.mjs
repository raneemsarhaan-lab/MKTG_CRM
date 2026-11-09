// Node checks of the pure Sheets modules (spec 013 T008), plus the HTML
// clipboard reader in Chromium, where a real DOMParser exists.
// `lab` is this folder; `root` is the repo.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

export async function runPure(lab, root) {
  const h = await import(path.join(lab, 'out/pure.mjs'))
  const require = createRequire(path.join(root, 'package.json'))
  const { IntlMessageFormat } = require('intl-messageformat')
  const results = []
  const check = async (id, fn) => { try { await fn(); results.push({ id, ok: true }) } catch (e) { results.push({ id, ok: false, error: e.message }) } }
  const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
  const ok = (c, msg) => { if (!c) throw new Error(msg) }
  const grid = cells => cells.map(r => r.map(c => c.text))

  // ── clipboard ─────────────────────────────────────────────────────────────
  await check('clip-tsv', () => {
    eq(grid(h.parseTsv('a\tb\nc\td')), [['a', 'b'], ['c', 'd']], 'plain rows and tabs')
    eq(grid(h.parseTsv('a\tb\r\nc\td\r\n')), [['a', 'b'], ['c', 'd']], 'Windows line ends, trailing newline')
    eq(grid(h.parseTsv('"line 1\nline 2"\tx')), [['line 1\nline 2', 'x']], 'a quoted line break stays in the cell')
    eq(grid(h.parseTsv('"has\ttab"\t"say ""hi"""')), [['has\ttab', 'say "hi"']], 'quoted tab, doubled quotes')
    eq(grid(h.parseTsv('5" screen\tx')), [['5" screen', 'x']], 'a quote inside plain text is text')
    eq(grid(h.parseTsv('"unclosed\tx')), [['"unclosed', 'x']], 'a broken quote is read as text')
    eq(grid(h.parseTsv('a\t\tc')), [['a', '', 'c']], 'empty cells kept')
    eq(h.parseTsv('https://x.co/a')[0][0].href, 'https://x.co/a', 'a bare link is a link')
  })
  await check('clip-serialise', () => {
    const g = [['Name', 'Notes'], ['A "quote"', 'two\nlines'], ['tab\there', '<b>&</b>']]
    const { text, html } = h.serialise(g)
    eq(grid(h.parseTsv(text)), g, 'text round trip is exact')
    ok(html.includes('<table>') && html.includes('two<br>lines') && html.includes('&lt;b&gt;&amp;&lt;/b&gt;'), 'HTML table, line breaks as <br>, escaped')
    eq(h.serialise([['x']]).text, 'x', 'one plain cell, no quotes')
  })
  await check('clip-paste-plan', () => {
    const one = h.pastePlan([['7']], { r0: 2, c0: 1, r1: 4, c1: 2 })
    eq([one.rows, one.cols, one.value(2, 1)], [3, 2, '7'], 'a single value fills the selected block')
    const blk = h.pastePlan([['a', 'b'], ['c']], { r0: 0, c0: 0, r1: 9, c1: 9 })
    eq([blk.rows, blk.cols, blk.value(1, 1)], [2, 2, ''], 'a block pastes once, ragged rows padded')
    eq(h.toGrid(h.parseTsv('a\n\n\n')), [['a']], 'trailing empty rows dropped')
  })

  // ── selection ─────────────────────────────────────────────────────────────
  await check('sel-basics', () => {
    const s = h.extend(h.at(2, 2), { r: 0, c: 4 }, 10, 5)
    eq(h.rect(s), { r0: 0, c0: 2, r1: 2, c1: 4 }, 'rect normalises')
    eq(h.size(s), 9, 'size')
    eq(h.rect(h.rowRange(3, 1, 6)), { r0: 1, c0: 0, r1: 3, c1: 5 }, 'rows by number')
    eq(h.rect(h.colRange(2, 2, 8)), { r0: 0, c0: 2, r1: 7, c1: 2 }, 'a column')
    eq(h.size(h.all(100, 26)), 2600, 'select all')
    eq(h.extend(h.at(0, 0), { r: 50, c: -3 }, 10, 5).focus, { r: 9, c: 0 }, 'extend clamps')
    eq(h.step({ r: 0, c: 0 }, 'up', 10, 5), { r: 0, c: 0 }, 'step clamps')
    eq([h.colLetters(0), h.colLetters(25), h.colLetters(26), h.colLetters(27), h.colLetters(701), h.colLetters(702)], ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA'], 'Excel letters')
    eq(h.cellName(2, 1), 'B3', 'cell name')
  })
  await check('sel-edge', () => {
    // Row 0: x x x . . x .   (filled at 0,1,2 and 5)
    const filled = (r, c) => r === 0 && [0, 1, 2, 5].includes(c)
    eq(h.edge({ r: 0, c: 0 }, 'right', 1, 7, filled), { r: 0, c: 2 }, 'inside a run: to its end')
    eq(h.edge({ r: 0, c: 2 }, 'right', 1, 7, filled), { r: 0, c: 5 }, 'at a run end: to the next filled')
    eq(h.edge({ r: 0, c: 5 }, 'right', 1, 7, filled), { r: 0, c: 6 }, 'nothing after: the sheet edge')
    eq(h.edge({ r: 0, c: 5 }, 'left', 1, 7, filled), { r: 0, c: 2 }, 'and back')
    eq(h.edge({ r: 0, c: 6 }, 'right', 1, 7, filled), { r: 0, c: 6 }, 'already at the edge')
  })

  // ── undo ──────────────────────────────────────────────────────────────────
  await check('undo-inverses', () => {
    const cells = { kind: 'cells', cells: [{ rowId: 'r1', colId: 'c1', before: 'a', after: 'b' }] }
    eq(h.invert(h.invert(cells)), cells, 'cells invert twice to themselves')
    const ins = { kind: 'insertRows', rows: [{ id: 'r9', position: 1.5, height: null }] }
    eq(h.invert(ins).kind, 'deleteRows', 'insert ↔ delete')
    const del = { kind: 'deleteRows', rows: [{ id: 'r2', position: 2, height: 40 }], cells: [{ rowId: 'r2', colId: 'c1', value: 'kept' }] }
    const back = h.inverseSteps(del)
    eq(back.map(x => x.kind), ['insertRows', 'cells'], 'undo of a delete brings the row and its cells back')
    eq(back[0].rows[0], { id: 'r2', position: 2, height: 40 }, 'same id, place and height')
    eq(back[1].cells[0].after, 'kept', 'cell text restored')
    eq(h.invert({ kind: 'rowHeights', rows: [{ id: 'r', before: null, after: 60 }] }).rows[0], { id: 'r', before: 60, after: null }, 'resize')
    eq(h.invert({ kind: 'dropRows', taskIds: ['t'] }).kind, 'restoreRows', 'a linked drop undoes as a restore')
    eq(h.invert({ kind: 'taskCells', cells: [{ taskId: 't', field: 'title', before: 'A', after: 'B' }] }).cells[0].after, 'A', 'a linked title')
  })
  await check('undo-stack', () => {
    let s = h.emptyStack()
    for (let i = 0; i < 130; i++) s = h.push(s, h.makeStep(`e${i}`, [{ kind: 'cells', cells: [] }]))
    eq(s.done.length, 100, 'at most 100 steps')
    const u = h.undo(s); s = u.stack
    eq([u.step.label, h.canRedo(s)], ['e129', true], 'undo the last')
    const r = h.redo(s); s = r.stack
    eq(r.step.label, 'e129', 'redo it')
    s = h.undo(s).stack
    s = h.push(s, h.makeStep('new', [{ kind: 'cells', cells: [] }]))
    eq(h.canRedo(s), false, 'a new edit clears redo')
    const step = h.makeStep('paste', [{ kind: 'insertRows', rows: [{ id: 'x', position: 1, height: null }] }, { kind: 'cells', cells: [{ rowId: 'x', colId: 'c', before: '', after: 'v' }] }])
    eq(step.backward.map(c => c.kind), ['cells', 'deleteRows'], 'backward runs in reverse order')
    eq(h.undo(h.emptyStack()), null, 'nothing to undo')
  })

  // ── positions ─────────────────────────────────────────────────────────────
  await check('positions', () => {
    eq([h.between(1, 2), h.between(null, 1), h.between(5, null), h.between(null, null)], [1.5, 0, 6, 1], 'midpoints and ends')
    eq(h.betweenMany(1, 2, 3), [1.25, 1.5, 1.75], 'several between')
    eq(h.betweenMany(null, 1, 2), [-1, 0], 'several before the first')
    let a = 1, b = 2
    for (let i = 0; i < 60; i++) b = h.between(a, b)
    ok(h.needsRenumber([a, b]), 'runs out of room after many inserts in one place')
    eq(h.renumber([{ id: 'x', position: 3 }, { id: 'y', position: 1 }]), [{ id: 'y', position: 1 }, { id: 'x', position: 2 }], 'renumber keeps order')
    eq(h.initial(3), [1, 2, 3], 'a new sheet')
  })

  // ── names ─────────────────────────────────────────────────────────────────
  await check('names', () => {
    eq(h.nextSheetName(['Sheet 1', 'Budget']), 'Sheet 2', 'next free')
    eq(h.nextSheetName(['sheet 1', 'Sheet 3']), 'Sheet 2', 'lowest free, any case')
    eq(h.nextSheetName(['ورقة 1'], 'ورقة {n}'), 'ورقة 2', 'Arabic pattern')
    eq(h.uniqueName('Budget', ['Plan']), 'Budget', 'free name kept')
    eq(h.uniqueName('Budget', ['budget', 'Budget (2)']), 'Budget (3)', '(2) taken, so (3)')
    eq(h.uniqueName('x'.repeat(50), ['x'.repeat(50)]).length, 50, 'stays within 50')
    eq(h.validateSheetName('  Q1  ', ['Q2']), { ok: true, name: 'Q1' }, 'trimmed')
    eq(h.validateSheetName('', []).error, 'name_empty', 'empty')
    eq(h.validateSheetName('a/b', []).error, 'name_chars', 'slash')
    eq(h.validateSheetName('[x]', []).error, 'name_chars', 'brackets')
    eq(h.validateSheetName('x'.repeat(51), []).error, 'name_long', 'too long')
    eq(h.validateSheetName('BUDGET ', ['Budget']).error, 'name_taken', 'taken, ignoring case and spaces')
    eq(h.validateFolderName('Campaign: Q1', []).ok, true, 'folders may use a colon')
  })

  // ── strings ───────────────────────────────────────────────────────────────
  await check('strings', () => {
    const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]))
    const read = l => JSON.parse(fs.readFileSync(path.join(root, 'messages', `${l}.json`), 'utf8')).sheets
    const en = flat(read('en')), ar = flat(read('ar'))
    eq(ar.map(x => x[0]).sort(), en.map(x => x[0]).sort(), 'sheets.* in both languages')
    for (const [k, v] of [...en.map(x => [...x, 'en']), ...ar.map(x => [...x, 'ar'])]) {
      try { new IntlMessageFormat(v, k.length && ar.some(a => a[0] === k && a[1] === v) ? 'ar' : 'en') } catch (e) { throw new Error(`${k}: ${e.message}`) }
    }
    const t = new IntlMessageFormat(read('ar').toolbar.selected, 'ar')
    eq([1, 2, 3, 11, 100].map(n => t.format({ n })), ['خلية واحدة محددة', 'خليتان محددتان', '3 خلايا محددة', '11 خلية محددة', '100 خلية محددة'], 'Arabic plurals')
  })

  // ── the HTML clipboard, in Chromium ───────────────────────────────────────
  await check('clip-html', async () => {
    const { chromium } = require('playwright')
    const exe = process.env.LAB_CHROMIUM ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
    const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--headless', '--no-sandbox'] } : {})
    try {
      const page = await browser.newPage()
      await page.setContent('<html><body></body></html>')
      await page.addScriptTag({ path: path.join(lab, 'out/pure-browser.js') })
      const read = html => page.evaluate(x => SheetPure.parseHtmlTable(x, new DOMParser()).map(r => r.map(c => [c.text, c.href])), html)
      // Google Sheets: a google-sheets-html-origin wrapper, styles, a link, a <br> inside a cell.
      const gs = `<google-sheets-html-origin><style>td{border:1px}</style><table xmlns="http://www.w3.org/1999/xhtml" data-sheets-root="1"><tbody>
        <tr style="height:21px;"><td>Title</td><td>Notes</td></tr>
        <tr><td><a href="https://docs.google.com/d/1">Hook draft</a></td><td>line one<br>line two</td></tr></tbody></table>`
      eq(await read(gs), [[['Title', null], ['Notes', null]], [['Hook draft', 'https://docs.google.com/d/1'], ['line one\nline two', null]]], 'Google Sheets HTML')
      // Excel: an Office HTML document, &nbsp;, a colspan, a formula's shown value.
      const xl = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><table border=0 cellpadding=0 cellspacing=0>
        <tr height=20><td height=20 class=xl65>Q1</td><td class=xl66 x:num>1200</td></tr>
        <tr height=20><td colspan=2 class=xl67>Total&nbsp;row</td><td x:fmla="=SUM(B1:B1)">1200</td></tr></table></body></html>`
      eq(await read(xl), [[['Q1', null], ['1200', null]], [['Total row', null], ['', null], ['1200', null]]], 'Excel HTML, colspan, formula value')
      // Momentum's own copy comes back exactly.
      const mine = await page.evaluate(() => { const g = [['A', 'two\nlines'], ['<x>', '']]; return SheetPure.parseHtmlTable(SheetPure.serialise(g).html, new DOMParser()).map(r => r.map(c => c.text)) })
      eq(mine, [['A', 'two\nlines'], ['<x>', '']], 'round trip through our own HTML')
      eq(await page.evaluate(() => SheetPure.parseClipboard({ html: '<p>no table</p>', text: 'a\tb' }, new DOMParser()).map(r => r.map(c => c.text))), [['a', 'b']], 'HTML without a table falls back to text')
    } finally { await browser.close() }
  })
  return results
}
