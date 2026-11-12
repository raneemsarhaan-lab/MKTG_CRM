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

  // ── spec 015: formatting ─────────────────────────────────────────────────
  await check('fmt-validate', () => {
    const v = h.validateStyle({ b: true, i: false, size: 99, font: 'arial', fill: '#ff0000', color: 'red', junk: 1, ha: 'general', va: 'middle',
      bt: { w: 'thick', c: '#000000' }, bb: { w: 'wavy', c: '#000000' }, indent: 40, rot: 200, num: { kind: 'currency', cur: 'XYZ', dp: 20, pattern: '<script>' } })
    eq(v, { font: 'Arial', size: 72, b: true, i: false, fill: '#FF0000', bt: { w: 'thick', c: '#000000' }, va: 'middle', indent: 15, rot: 90, num: { kind: 'currency', dp: 10 } }, 'unknown and out-of-range fields dropped or clamped')
    eq(h.validateStyle({ junk: true, num: { kind: 'general' } }), null, 'nothing left is null (the record is deleted)')
    eq(h.validateStyle({ b: false }), { b: false }, 'an explicit off is kept (it turns a row or column layer off)')
    eq(h.validateStyle('bold'), null, 'not an object')
    eq(h.knownFont('"Times New Roman"'), 'Times New Roman', 'quoted font names')
    eq(h.knownFont('Wingdings'), null, 'a font outside the list falls back')
  })
  await check('fmt-layers', () => {
    const idx = h.indexFormats([
      { rowKey: '', colKey: '', style: { font: 'Arial', size: 11 } },
      { rowKey: '', colKey: 'B', style: { num: { kind: 'currency', cur: 'EGP', dp: 2 }, ha: 'right' } },
      { rowKey: 'r1', colKey: '', style: { b: true, fill: '#7030A0', ha: 'center' } },
      { rowKey: 'r1', colKey: 'B', style: { fill: '#FFC000' } },
    ])
    eq(h.resolveStyle(idx, 'r1', 'B'), { font: 'Arial', size: 11, num: { kind: 'currency', cur: 'EGP', dp: 2 }, ha: 'center', b: true, fill: '#FFC000' }, 'sheet → column → row → cell')
    eq(h.resolveStyle(idx, 'r2', 'A'), { font: 'Arial', size: 11 }, 'only the sheet layer')
    eq(h.resolveStyle(h.indexFormats([]), 'r', 'c'), null, 'no formatting')
    eq(h.mergeStyle({ b: true, fill: '#FF0000' }, { b: null, i: true, fill: undefined }), { fill: '#FF0000', i: true }, 'null removes, undefined keeps')
    eq(h.diffStyle({ b: true, fill: '#FF0000' }, { fill: '#00FF00', i: true }), { b: null, fill: '#00FF00', i: true }, 'diff as a patch')
    eq(h.styleKey({ i: true, b: true }), h.styleKey({ b: true, i: true }), 'key ignores field order')
  })
  await check('fmt-css', () => {
    const a = h.toCss({ b: true, fill: '#7030A0', ha: 'right', bl: { w: 'double', c: '#000000' }, bb: { w: 'dashed', c: '#FF0000' }, rot: 45, indent: 2, u: 'double', s: true })
    eq(a.cell.color, '#FFFFFF', 'automatic white text on a dark fill')
    eq(h.toCss({ fill: '#FFF2CC' }).cell.color, '#14131A', 'automatic ink on a light fill')
    eq([a.cell.textAlign, a.cell.justifyContent], ['end', 'flex-end'], 'right is the logical end, so it mirrors in Arabic')
    eq([a.border.borderInlineStart, a.border.borderBottom], ['3px double #000000', '1px dashed #FF0000'], 'borders keep their line styles, left is inline-start')
    eq([a.cell.textDecorationLine, a.cell.textDecorationStyle, a.cell.paddingInlineStart], ['underline line-through', 'double', '32px'], 'double underline, strike, indent')
    eq(a.text, { display: 'inline-block', transform: 'rotate(-45deg)' }, 'rotated text')
    ok(h.toCss({ b: true, fill: '#7030A0', ha: 'right', bl: { w: 'double', c: '#000000' }, bb: { w: 'dashed', c: '#FF0000' }, rot: 45, indent: 2, u: 'double', s: true }) === a, 'the same look is cached')
    eq(h.toCss(null), { cell: {}, text: null, border: null }, 'no style')
  })
  await check('fmt-display', () => {
    const sp = x => x.replace(/[\u00A0\u202F]/g, ' ')
    const en = (t, n) => sp(h.display(t, n, 'en')), ar = (t, n) => h.display(t, n, 'ar')
    eq(en('12500', { kind: 'currency', cur: 'EGP', dp: 2 }), 'EGP 12,500.00', 'currency')
    eq(en('-1234.1', { kind: 'number', dp: 2, neg: 'paren-red' }), '(1,234.10)', 'negative in brackets')
    ok(h.showsRed('-1234.1', { kind: 'number', neg: 'paren-red' }) && !h.showsRed('5', { kind: 'number', neg: 'red' }), 'red negatives')
    eq(en('1234.5', { kind: 'number', dp: 0, sep: false }), '1235', 'no separator, rounded')
    eq(en('0.125', { kind: 'percent', dp: 1 }), '12.5%', 'percent of a fraction')
    eq(en('12.5%', { kind: 'percent', dp: 1 }), '12.5%', 'typed percent')
    eq(en('12500', { kind: 'scientific', dp: 2 }), '1.25E+04', 'scientific')
    eq(en('2026-11-16', { kind: 'date', long: true }), 'Mon, 16 Nov 2026', 'long date')
    eq(en('16/11/2026', { kind: 'date' }), '16/11/2026', 'short date, day first')
    eq(en('16 Nov 2026', { kind: 'date', pattern: 'ddd d mmm' }), 'Mon 16 Nov', 'custom pattern')
    eq(en('2026-11-16', { kind: 'date', pattern: 'dd/mm/yyyy' }), '16/11/2026', 'dd/mm/yyyy')
    eq(en('14:30', { kind: 'time' }), '14:30', 'time')
    eq(en('hello', { kind: 'currency', cur: 'EGP' }), 'hello', 'text in a Currency cell shows as typed')
    eq(en('31/02/2026', { kind: 'date' }), '31/02/2026', 'an impossible date shows as typed')
    eq(en('12500', { kind: 'text' }), '12500', 'Text format')
    eq(en('١٢٥٠٠', { kind: 'number', dp: 0 }), '12,500', 'Arabic digits are read')
    eq(ar('12500', { kind: 'number', dp: 0 }), '١٢٬٥٠٠', 'Arabic display follows the language')
    ok(ar('2026-11-16', { kind: 'date', long: true }).includes('نوفمبر'), 'Arabic month names')
    eq(h.parseNumber('(1,234)'), -1234, 'accounting negatives read back')
    eq(h.parseNumber('1,23'), null, 'a bad grouping is text')
    eq(h.bumpDecimals({ kind: 'currency', cur: 'EGP', dp: 2 }, 1), { kind: 'currency', cur: 'EGP', dp: 3 }, 'increase decimal')
    eq(h.bumpDecimals(null, -1, '12.345'), { kind: 'number', dp: 2, sep: false }, 'General becomes Number with the typed decimals')
    eq(h.bumpDecimals({ kind: 'number', dp: 0 }, -1), { kind: 'number', dp: 0 }, 'never below 0')
    eq(h.numFromExcel('"EGP"\\ #,##0.00'), { kind: 'currency', cur: 'EGP', dp: 2 }, 'Excel currency code')
    eq(h.numFromExcel('0.0%'), { kind: 'percent', dp: 1 }, 'Excel percent code')
  })
  await check('fmt-plan', () => {
    const idx = h.indexFormats([{ rowKey: 'r1', colKey: '', style: { fill: '#FF0000', b: true } }, { rowKey: 'r2', colKey: 'B', style: { i: true } }])
    const rk = r => ['r0', 'r1', 'r2', 'r3'][r] ?? null, ck = c => ['A', 'B', 'C'][c] ?? null
    const size = { rows: 4, cols: 3 }
    const cells = h.planRect(idx, { r0: 0, c0: 0, r1: 1, c1: 1 }, size, rk, ck, { b: true })
    eq(cells.map(x => `${x.rowKey}:${x.colKey}`), ['r0:A', 'r0:B', 'r1:A', 'r1:B'], 'a block writes cell records')
    const col = h.planRect(idx, { r0: 0, c0: 1, r1: 3, c1: 1 }, size, rk, ck, { fill: '#00FF00' })
    eq(col.map(x => `${x.rowKey}:${x.colKey}`), [':B', 'r1:B'], 'a whole column is one record, plus a cell where a row fill would cover it')
    const all = h.planRect(idx, { r0: 0, c0: 0, r1: 3, c1: 2 }, size, rk, ck, { i: false })
    eq(all.map(x => `${x.rowKey}:${x.colKey}:${JSON.stringify(x.after)}`), ['r2:B:null'], 'Ctrl+A: italic off clears the cell that set it; nothing to record for the sheet')
    const off = h.planRect(idx, { r0: 1, c0: 0, r1: 1, c1: 0 }, size, rk, ck, { b: false })
    eq(off[0].after, { b: false }, 'Bold off over a bold row keeps an explicit off on the cell')
    const bd = h.planBorders(h.indexFormats([]), { r0: 0, c0: 0, r1: 1, c1: 1 }, size, rk, ck, 'outside', { w: 'thin', c: '#000000' })
    eq(bd.map(x => Object.keys(x.after).sort().join('')), ['blbt', 'brbt', 'bbbl', 'bbbr'], 'outside borders on a 2×2 block')
    eq(h.bordersFor('all', { r0: 0, c0: 0, r1: 1, c1: 1 }, { w: 'thin', c: '#000000' }, 1, 1), { bb: { w: 'thin', c: '#000000' }, br: { w: 'thin', c: '#000000' } }, 'all borders: inner cells draw only bottom and end')
  })
  await check('fmt-clip-css', () => {
    const c = h.parseCssClasses('<!--td {color:black} .xl65 {color:white; font-weight:700; background:#7030A0; border-bottom:2.0pt solid #3B0F5C;} .xl67 {mso-number-format:"\\0022EGP\\0022\\\\ \\#\\,\\#\\#0\\.00";}-->')
    eq(h.styleFromCss(c.xl65), { b: true, color: '#FFFFFF', fill: '#7030A0', bb: { w: 'thick', c: '#3B0F5C' } }, 'an Excel class rule')
    eq(h.styleFromCss({ 'font-family': 'Calibri, sans-serif', 'font-size': '11.0pt' }), null, "Excel's default Calibri 11 is no choice")
    eq(h.styleFromCss({ background: 'url("cid:image001.png")', 'font-family': 'Wingdings' }), null, 'pictures and unknown fonts dropped')
    eq(h.cssColor('rgb(103, 78, 167)'), '#674EA7', 'rgb colours')
    ok(h.cssForClipboard({ b: true, fill: '#FFC000', bb: { w: 'double', c: '#000000' }, ha: 'center' }).includes('border-bottom:3px double #000000'), 'copy-out inline CSS')
    eq(h.excelSerialDate(46342), '2026-11-16', "Excel's date serial")
    eq(h.numFromExcel('Short Date'), { kind: 'date' }, "Excel's named Short Date")
  })
  // ── spec 015 stage 2: editing tools ───────────────────────────────────────
  await check('tools-find', () => {
    const o = (matchCase, whole) => ({ matchCase, whole })
    ok(h.matches('Q4 plan', 'q4', o(false, false)) && !h.matches('Q4 plan', 'q4', o(true, false)), 'match case')
    ok(h.matches(' Q4 ', 'q4', o(false, true)) && !h.matches('Q4 plan', 'Q4', o(false, true)), 'whole cell')
    eq(h.replaceIn('q4 and Q4', 'Q4', 'Q1', o(false, false)), 'Q1 and Q1', 'replace every match, any case')
    eq(h.replaceIn('q4 and Q4', 'Q4', 'Q1', o(true, false)), 'q4 and Q1', 'replace with match case')
    eq(h.replaceIn('Q4', 'q4', 'Q1 plan', o(false, true)), 'Q1 plan', 'whole cell replaces the cell')
    eq(h.replaceIn('a.b', '.', '-', o(false, false)), 'a-b', 'the query is text, not a pattern')
    const cells = [{ r: 0, c: 0, text: 'Q4' }, { r: 0, c: 2, text: 'x' }, { r: 2, c: 1, text: 'q4' }, { r: 1, c: 3, text: 'Q4 too' }]
    eq(h.nextMatch(cells, null, 'q4', o(false, false)), 0, 'first match in reading order')
    eq(cells[h.nextMatch(cells, { r: 0, c: 0 }, 'q4', o(false, false))], cells[3], 'next match after the cell')
    eq(cells[h.nextMatch(cells, { r: 2, c: 1 }, 'q4', o(false, false))], cells[0], 'wraps round')
    eq(cells[h.nextMatch(cells, { r: 1, c: 3 }, 'q4', o(false, false), -1)], cells[0], 'previous')
    eq(h.nextMatch(cells, null, 'zzz', o(false, false)), -1, 'no match')
  })
  await check('tools-paste', () => {
    eq(h.transpose([['a', 'b', 'c'], ['d']], ''), [['a', 'd'], ['b', ''], ['c', '']], 'transpose, ragged rows padded')
    const p = h.paintPatch({ b: true, fill: '#FFC000' })
    ok(p.b === true && p.fill === '#FFC000' && p.i === null && p.num === null && p.bt === null, 'Format Painter: the source’s fields, nulls for the rest')
    eq(h.mergeStyle({ i: true, color: '#FF0000', bb: { w: 'thin', c: '#000000' } }, p), { b: true, fill: '#FFC000' }, 'painting replaces the look')
    ok(Object.values(h.clearPatch()).every(v => v === null), 'Clear formats removes every field')
  })
  // ── spec 015 stage 3: rules, sort, filter, styles, tables ─────────────────
  await check('rules-highlight', () => {
    const rule = (kind, args = {}, extra = {}) => ({ id: kind, range: { rows: 'all', cols: ['c'] }, kind, args, style: { fill: '#FFC7CE' }, priority: 0, ...extra })
    const run = (rules, vals, now = new Date(2026, 10, 16)) => { const rows = vals.map((_, i) => `r${i}`); const m = h.evalRules(rules, rows, ['c'], r => vals[+r.slice(1)], now); return rows.map(r => m.get(`${r}|c`) ?? null) }
    const hit = (rules, vals, now) => run(rules, vals, now).map(x => !!x?.style)
    eq(hit([rule('gt', { a: '100' })], ['50', '150', 'x', '']), [false, true, false, false], 'greater than: numbers only, blanks never')
    eq(hit([rule('lt', { a: '1,000' })], ['999', '1000', '12.5%']), [true, false, true], 'less than reads 1,000 and 12.5%')
    eq(hit([rule('between', { a: '20', b: '10' })], ['9', '10', '15', '20', '21']), [false, true, true, true, false], 'between, ends in any order, inclusive')
    eq(hit([rule('eq', { a: 'late' })], ['Late', 'late ', 'On time']), [true, true, false], 'equal to text ignores case and spaces')
    eq(hit([rule('contains', { a: 'Q4' })], ['q4 plan', 'Q1']), [true, false], 'text contains')
    eq(hit([rule('date', { when: 'past' })], ['2026-11-15', '2026-11-16', '17/11/2026', 'soon']), [true, false, false, false], 'date before today')
    eq(hit([rule('date', { when: 'next7' })], ['2026-11-16', '2026-11-22', '2026-11-23']), [true, true, false], 'next 7 days')
    eq(hit([rule('dup')], ['a', 'A', 'b', '']), [true, true, false, false], 'duplicates, ignoring case; blanks never')
    eq(hit([rule('unique')], ['a', 'A', 'b']), [false, false, true], 'unique values')
    eq(hit([rule('top', { n: 2 })], ['5', '9', '1', '9']), [false, true, false, true], 'top 2 (ties kept)')
    eq(hit([rule('bottom', { n: 25, percent: true })], ['5', '9', '1', '7']), [false, false, true, false], 'bottom 25%')
    const bars = run([{ ...rule('bar', { colors: ['#5B9BD5'] }), style: null }], ['0', '50', '100', 'x'])
    eq(bars.map(x => x?.bar?.pct ?? null), [0.02, 0.5, 1, null], 'data bars from 0 to the largest')
    const sc = run([{ ...rule('scale', { colors: ['#F8696B', '#FFEB84', '#63BE7B'] }), style: null }], ['0', '50', '100'])
    eq(sc.map(x => x.scale), ['#F8696B', '#FFEB84', '#63BE7B'], 'colour scale: low, middle, high')
    const two = run([rule('gt', { a: '0' }, { id: 'a', priority: 1, style: { fill: '#C6EFCE', b: true } }), rule('gt', { a: '5' }, { id: 'b', priority: 0, style: { fill: '#FFC7CE' } })], ['9'])
    eq(two[0].style, { fill: '#FFC7CE', b: true }, 'priority order: the first rule wins a property, later ones add the rest')
    const onScreen = h.evalRules([rule('dup')], ['r0', 'r2'], ['c'], r => ({ r0: 'a', r1: 'a', r2: 'b' })[r])
    ok(!onScreen.get('r0|c'), 'rules count only the rows on screen (a filtered duplicate is not a duplicate)')
  })
  await check('rules-sort-filter', () => {
    const rows = [{ id: 1, v: 'banana' }, { id: 2, v: '10' }, { id: 3, v: '' }, { id: 4, v: 'Apple' }, { id: 5, v: '9' }, { id: 6, v: '2026-01-05' }, { id: 7, v: 'apple' }]
    const cell = (r, col) => ({ text: r.v, style: r.id === 4 ? { fill: '#FFC7CE' } : null })
    eq(h.sortRows(rows, [{ col: 'v', dir: 'asc' }], cell).map(r => r.id), [5, 2, 6, 4, 7, 1, 3], 'A to Z: numbers, dates, text; blanks last; stable for equal text')
    eq(h.sortRows(rows, [{ col: 'v', dir: 'desc' }], cell).map(r => r.id), [1, 4, 7, 6, 2, 5, 3], 'Z to A: blanks still last')
    eq(h.sortRows(rows, [{ col: 'v', dir: 'asc', on: 'fill', color: '#ffc7ce' }], cell).map(r => r.id)[0], 4, 'by colour: that fill first')
    const two = [{ a: 'x', b: '2' }, { a: 'y', b: '1' }, { a: 'x', b: '1' }]
    eq(h.sortRows(two, [{ col: 'a', dir: 'asc' }, { col: 'b', dir: 'asc' }], (r, c) => ({ text: r[c], style: null })), [two[2], two[0], two[1]], 'then by a second column')
    ok(h.looksLikeHeader([{ text: 'Budget', style: null }], [{ text: '12500', style: null }]), 'a text heading over numbers is a header')
    ok(!h.looksLikeHeader([{ text: 'a', style: null }], [{ text: 'b', style: null }]), 'text over text is not')
    const f = (filter) => h.filterRows(rows, filter, cell).map(r => r.id)
    eq(f({ v: { values: ['apple', 'Apple'] } }), [4, 7], 'ticked values')
    eq(f({ v: { values: [''] } }), [3], 'blanks')
    eq(f({ v: { color: '#FFC7CE', on: 'fill' } }), [4], 'by fill colour')
    eq(f({ v: { cond: { op: 'gt', a: '9' } } }), [2], 'number condition')
    eq(f({ v: { cond: { op: 'before', a: '2026-02-01' } } }), [6], 'date condition')
    eq(f({ v: { cond: { op: 'begins', a: 'AP' } } }), [4, 7], 'begins with, any case')
    eq(f({ v: { cond: { op: 'notBlank' } } }).length, 6, 'not empty')
    eq(f({}), rows.map(r => r.id), 'no filter keeps every row')
    const cv = h.columnValues(rows, 'v', cell)
    eq(cv.values.map(x => x.value), ['9', '10', '2026-01-05', 'Apple', 'apple', 'banana', ''], 'the filter list in order, blanks last')
    eq(cv.fills, ['#FFC7CE'], 'fills offered for colour filter')
  })
  await check('rules-groups', () => {
    const R = (k, kind, v) => ({ k, kind, v })
    const rows = [R('t1', 'fixed', ''), R('p1', 'item', 'b'), R('c1', 'child', 'z'), R('p2', 'item', 'a'), R('add', 'fixed', ''), R('t2', 'fixed', ''), R('p3', 'item', 'c'), R('p4', 'item', 'a')]
    const cell = (r) => ({ text: r.v, style: null })
    eq(h.arrangeGroups(rows, r => r.kind, [{ col: 'v', dir: 'asc' }], undefined, cell).map(r => r.k), ['t1', 'p2', 'p1', 'c1', 'add', 't2', 'p4', 'p3'], 'sorted inside each group; a clip stays under its piece')
    eq(h.arrangeGroups(rows, r => r.kind, undefined, { v: { values: ['a'] } }, cell).map(r => r.k), ['t1', 'p2', 'add', 't2', 'p4'], 'filtered inside groups; headings stay')
    eq(h.arrangeGroups(rows, r => r.kind, [], {}, cell), rows, 'nothing set: the same rows')
  })
  await check('styles-tables', () => {
    const p = h.cellStylePatch('good')
    ok(p.fill === '#C6EFCE' && p.color === '#006100' && p.b === null && p.num === undefined, 'a cell style sets its look and clears the rest, never the number format')
    ok(Object.values(h.cellStylePatch('normal')).every(v => v === null), 'Normal clears the look')
    eq(h.TABLE_STYLES.length, 18, '18 table styles')
    const t = { style: 'medium-0', header: true, banded: true }
    eq(h.tableLook(t, 0, 0, 5), { b: true, fill: '#4472C4', color: '#FFFFFF' }, 'header row')
    ok(h.tableLook(t, 1, 0, 5).fill && !h.tableLook(t, 2, 0, 5).fill, 'banded rows alternate')
    ok(!h.tableLook({ ...t, banded: false }, 1, 0, 5)?.fill, 'banding off')
    eq(h.listWrite([{ id: 'a', x: 1 }, { id: 'b', x: 1 }], [{ id: 'a', x: 2 }, { id: 'c', x: 1 }]), { put: [{ id: 'a', x: 2 }, { id: 'c', x: 1 }], remove: ['b'] }, 'rules and tables saved as puts and removes')
    eq(h.mergeLists({ put: [{ id: 'a' }] }, { remove: ['a'] }), { put: [], remove: ['a'] }, 'a later remove wins')
    const doc = { id: 's', rows: [{ id: 'r1', position: 1, height: null }, { id: 'r2', position: 2, height: null }], cols: [], cells: {} }
    eq(h.applyChange(doc, { kind: 'rowOrder', rows: [{ id: 'r1', before: 1, after: 2 }, { id: 'r2', before: 2, after: 1 }] }).rows.map(r => r.id), ['r2', 'r1'], 'sort moves rows by position')
    eq(h.toServer([{ kind: 'rowOrder', rows: [{ id: 'r1', before: 1, after: 2 }] }]).rowPositions, [{ id: 'r1', position: 2 }], 'and saves the positions')
    eq(h.viewWrite({ filter: {} }, { filter: { c: { values: ['a'] } } }), { filter: { c: { values: ['a'] } } }, 'the filter is saved whole')
  })
  // ── spec 016: links to board tasks ─────────────────────────────────────────
  await check('links-match', () => {
    const id = '7f3a2b1c-1111-4222-8333-944455556666'
    eq(h.taskIdFrom(`https://app.example/board?task=${id}`), id, 'a board link')
    eq(h.taskIdFrom(`/board?task=${id.toUpperCase()}&x=1`), id, 'a relative link, any case')
    eq(h.taskIdFrom(` ${id} `), id, 'a bare id')
    eq(h.taskIdFrom('Ramadan teaser'), null, 'a title is not an id')
    eq(h.normTitle('  Ramadan   Teaser '), 'ramadan teaser', 'titles ignore case and spaces')
    const byTitle = new Map([['ramadan teaser', ['a']], ['carousel', ['b', 'c']]])
    const r = h.matchCells([
      { rowId: 'r1', text: `/board?task=${id}` }, { rowId: 'r2', text: 'Ramadan  teaser' }, { rowId: 'r3', text: 'Carousel' },
      { rowId: 'r4', text: 'Nope' }, { rowId: 'r5', text: '' }, { rowId: 'r6', text: '/board?task=00000000-0000-4000-8000-000000000000' },
    ], new Set([id]), byTitle)
    eq(r.linked, [{ rowId: 'r1', taskId: id }, { rowId: 'r2', taskId: 'a' }], 'links and unique titles link')
    eq(r.ambiguous, [{ rowId: 'r3', text: 'Carousel', choices: ['b', 'c'] }], 'a shared title asks')
    eq(r.unmatched.map(x => x.rowId), ['r4', 'r6'], 'unknown titles and links are not found')
    eq(r.empty, ['r5'], 'empty cells are left alone')
  })
  await check('links-map', () => {
    const cols = new Set(['A', 'B', 'C', 'D']), team = new Set(['t1'])
    eq(h.cleanMap({ taskCol: 'A', fields: { A: 'title', B: 'title', C: 'title', D: 'col:t1', E: 'stage' } }, cols, team), { taskCol: 'A', fields: { B: 'title', D: 'col:t1' } }, 'the Task column, a repeated field and unknown columns are dropped')
    eq(h.cleanMap({ taskCol: 'Z', fields: {} }, cols, team), null, 'an unknown Task column unlinks')
    eq(h.cleanMap({ taskCol: 'A', fields: { B: 'col:nope', C: 'bogus' } }, cols, team), { taskCol: 'A', fields: {} }, 'unknown fields are dropped')
    const piece = { piece: true, video: false, clip: false }, video = { piece: false, video: true, clip: false }, plain = { piece: false, video: false, clip: false }
    ok(h.fieldApplies(piece, 'theme') && !h.fieldApplies(video, 'theme') && !h.fieldApplies(plain, 'pillar'), 'theme and pillar are for content pieces')
    ok(h.fieldApplies(video, 'link:design') && !h.fieldApplies(plain, 'link:design'), 'links are for pieces and videos')
    ok(h.fieldApplies(plain, 'stage') && h.fieldApplies(plain, 'due'), 'every task has a stage and a due date')
    const people = [{ id: '1', name: 'Samaa Ali' }, { id: '2', name: 'Ahmed Omar' }, { id: '3', name: 'Ahmed Saleh' }]
    eq(h.matchMember('samaa ali', people), { id: '1' }, 'a full name, any case')
    eq(h.matchMember('Samaa', people), { id: '1' }, 'a first name only one member has')
    eq(h.matchMember('Ahmed', people), 'ambiguous', 'a first name two members share')
    eq(h.matchMember('Mona', people), 'none', 'nobody')
    eq(h.matchStage('ready to publish', [{ id: 'ready-publish', names: ['Ready to Publish', 'جاهز للنشر'] }]), 'ready-publish', 'a stage by its name')
    eq(h.matchStage('جاهز للنشر', [{ id: 'ready-publish', names: ['Ready to Publish', 'جاهز للنشر'] }]), 'ready-publish', 'or its Arabic name')
    eq(h.matchPriority('HIGH'), 'High', 'priorities')
    eq(h.readDay('16/11/2026'), '2026-11-16', 'dates as typed')
  })
  await check('links-undo', () => {
    const map = { taskCol: 'A', fields: { B: 'title' } }
    eq(h.invert({ kind: 'taskMap', before: null, after: map }), { kind: 'taskMap', before: map, after: null }, 'mapping undo')
    eq(h.invert({ kind: 'rowTasks', rows: [{ rowId: 'r', before: null, after: 't' }] }).rows, [{ rowId: 'r', before: 't', after: null }], 'row link undo')
    eq(h.invert({ kind: 'taskFields', cells: [{ rowId: 'r', field: 'title', before: 'a', after: 'b' }] }).cells[0].after, 'a', 'field undo')
    const s = h.toServer([{ kind: 'taskMap', before: null, after: map }, { kind: 'rowTasks', rows: [{ rowId: 'r', before: null, after: 't' }, { rowId: 'r', before: 't', after: null }] }, { kind: 'taskFields', cells: [] }])
    eq(s.taskMap, map, 'the mapping is saved')
    eq(s.rowTasks, [{ rowId: 'r', taskId: null }], 'the last link per row is saved')
    ok(!('taskFields' in s), 'task fields are not sent through the outbox')
    const doc = { id: 's', rows: [], cols: [], cells: {}, extras: { formats: [], merges: [], view: { frozenRows: 0, frozenCols: 0 }, threads: [], taskMap: map, rowTasks: { r: 't' }, tasks: { t: { id: 't', name: 'n', values: { title: 'a' }, stage: 'todo', dropped: false, editable: true, applies: ['title'] } } } }
    const d2 = h.applyChange(doc, { kind: 'taskFields', cells: [{ rowId: 'r', field: 'title', before: 'a', after: 'b' }] })
    eq([d2.cells.r.B, d2.extras.tasks.t.values.title], ['b', 'b'], 'on screen: the snapshot cell and the task value')
  })
  await check('view-batch', () => {
    eq(h.viewWrite({ frozenRows: 0, hiddenRows: ['a'] }, { frozenRows: 1, hiddenRows: ['a', 'b'] }), { frozenRows: 1, hideRows: ['b'] }, 'a change as hide and freeze writes')
    eq(h.viewWrite({ hiddenCols: ['x', 'y'] }, { hiddenCols: ['y'] }), { showCols: ['x'] }, 'unhide as a show')
    eq(h.mergeView({ hideRows: ['a'], frozenRows: 1 }, { showRows: ['a'], frozenCols: 2 }), { frozenRows: 1, frozenCols: 2, showRows: ['a'] }, 'hidden then shown in one batch: shown; later frozen counts win')
    const doc = { id: 's', updatedAt: '', rows: [], cols: [], cells: {} }
    const ch = { kind: 'view', before: { frozenRows: 0, hiddenRows: [] }, after: { frozenRows: 2, hiddenRows: ['r1'] } }
    eq(h.applyChange(doc, ch).extras.view.hiddenRows, ['r1'], 'applied to the document')
    eq(h.applyChange(h.applyChange(doc, ch), h.invert(ch)).extras.view, { frozenRows: 0, frozenCols: 0, hiddenRows: [] }, 'undone')
    eq(h.toServer([ch]).view, { frozenRows: 2, hideRows: ['r1'] }, 'saved as a view write')
  })

  await check('fmt-undo', () => {
    const doc = { id: 's', updatedAt: '', rows: [], cols: [], cells: {} }
    const ch = { kind: 'formats', items: [{ rowKey: 'r1', colKey: '', before: null, after: { b: true } }, { rowKey: '', colKey: 'c1', before: { i: true }, after: null }] }
    const d1 = h.applyChange({ ...doc, extras: { ...h.emptyExtras(), formats: [{ rowKey: '', colKey: 'c1', style: { i: true } }] } }, ch)
    eq(d1.extras.formats, [{ rowKey: 'r1', colKey: '', style: { b: true } }], 'apply: a row format added, a column format removed')
    const d2 = h.applyChange(d1, h.invert(ch))
    eq(d2.extras.formats, [{ rowKey: '', colKey: 'c1', style: { i: true } }], 'undo restores both')
    eq(h.toServer([ch]).formats, [{ rowKey: 'r1', colKey: '', style: { b: true }, mode: 'set' }, { rowKey: '', colKey: 'c1', style: null, mode: 'set' }], 'saved as set records')
    const step = h.makeStep('Bold', [ch])
    eq(step.backward.length, 1, 'one undo step for a whole column')
    const M = { id: 'm1', top: 'r1', left: 'c1', bottom: 'r1', right: 'c4' }
    const mg = { kind: 'merges', add: [M], remove: [] }
    eq(h.applyChange(doc, mg).extras.merges, [M], 'merge applied')
    eq(h.applyChange(h.applyChange(doc, mg), h.invert(mg)).extras.merges, [], 'unmerge on undo')
    eq(h.toServer([mg, h.invert(mg)]).merges, { add: [], remove: ['m1'] }, 'merged then undone: the server just removes it')
    eq(h.toServer([h.invert(mg), mg]).merges, { add: [M], remove: ['m1'] }, 'unmerged then redone: a replace')
    const q = h.mergeServer({ formats: [{ rowKey: 'r', colKey: 'c', style: { b: true }, mode: 'set' }] }, { formats: [{ rowKey: 'r', colKey: 'c', style: { i: true }, mode: 'merge' }] })
    eq(q.formats, [{ rowKey: 'r', colKey: 'c', style: { b: true, i: true }, mode: 'set' }], 'queued set then merge collapse into one set')
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
      // Spec 015: styles from real Excel and Google Sheets clips (SC-003: at least 95% of styled cells keep their look).
      const styled = name => page.evaluate(html => SheetPure.parseHtmlTable(html, new DOMParser()).map(r => r.map(c => ({ text: c.text, style: c.style }))), fs.readFileSync(path.join(lab, 'fixtures', name), 'utf8'))
      const xl2 = await styled('excel-styled.html')
      eq(xl2[0][0].style, { b: true, color: '#FFFFFF', fill: '#7030A0', bb: { w: 'thick', c: '#3B0F5C' }, ha: 'center', va: 'middle' }, 'Excel header: class rule')
      eq([xl2[1][1].text, xl2[1][1].style.num], ['12500', { kind: 'currency', dp: 2, cur: 'EGP' }], 'Excel currency keeps the value and the format')
      eq([xl2[2][1].text, xl2[2][1].style.num], ['2026-11-16', { kind: 'date' }], "Excel date: the serial becomes the date")
      eq(xl2[2][0].style, { font: 'Times New Roman', size: 14, s: true, wrap: true }, 'font, size, strikethrough, wrap')
      eq(xl2[2][3].style, null, 'gradients, pictures and unknown fonts are dropped silently')
      const gs2 = await styled('gsheets-styled.html')
      eq(gs2[0][0].style, { font: 'Montserrat', b: true, color: '#FFFFFF', fill: '#674EA7', ha: 'center', va: 'bottom' }, 'Google Sheets inline styles')
      eq([gs2[1][1].text, gs2[1][1].style.num?.kind], ['40', 'percent'], 'Google Sheets number value and format')
      const expected = [[xl2, 11], [gs2, 6]]
      for (const [g, n] of expected) { const kept = g.flat().filter(c => c.style).length; ok(kept / n >= 0.95, `styled cells kept: ${kept}/${n}`) }
    } finally { await browser.close() }
  })
  return results
}
