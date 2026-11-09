/**
 * Smoke test of src/actions/sheets.ts against local PostgreSQL (spec 013 T009).
 * Run: DATABASE_URL=… npx tsx --tsconfig scripts/spreadsheet-lab/smoke/tsconfig.json scripts/spreadsheet-lab/smoke/run.ts
 */
import { randomUUID } from 'node:crypto'
import * as A from '@/actions/sheets'
import { prisma } from '@/lib/prisma'

let failed = 0
const ok = (cond: unknown, msg: string) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failed++ }

async function main() {
  await prisma.sheetFolder.deleteMany({ where: { kind: 'team', name: { startsWith: '[smoke]' } } })
  const home = await A.listFolders()
  ok(home.success && home.folders[0]?.kind === 'content' && home.folders[1]?.kind === 'video', 'linked folders first')
  ok(home.success && home.pins.length === 2, 'default pins: Content and Video')

  const f = await A.createFolder('[smoke] Campaign planning')
  ok(f.success, 'create folder')
  if (!f.success) return
  ok(!(await A.createFolder('[SMOKE] campaign planning ')).success, 'duplicate folder name refused')
  const tabs = await A.listSheets(f.folderId)
  ok(tabs.success && tabs.sheets.length === 1 && tabs.sheets[0].name === 'Sheet 1' && tabs.sheets[0].rowCount === 100 && tabs.sheets[0].colCount === 26, 'one sheet, "Sheet 1", 100 × 26')

  const s2 = await A.createSheet(f.folderId, { after: f.sheetId })
  const s0 = await A.createSheet(f.folderId, { before: f.sheetId, pattern: 'ورقة {n}' })
  const after = await A.listSheets(f.folderId)
  ok(s2.success && s2.sheet.name === 'Sheet 2', '+ makes "Sheet 2"')
  ok(after.success && after.sheets.map(s => s.position).join() === '0,1,2' && after.sheets[0].name === 'ورقة 1', 'Insert before, in Arabic, positions 0…2')

  const doc = await A.loadSheet(f.sheetId)
  ok(doc.success && doc.doc.rows.length === 100 && doc.doc.cols.length === 26, 'load: 100 rows, 26 columns')
  if (!doc.success) return
  const [r1, r2] = doc.doc.rows, [c1, c2] = doc.doc.cols
  const w1 = await A.applySheetChanges(f.sheetId, { cells: [{ rowId: r1.id, colId: c1.id, value: 'Channel' }, { rowId: r1.id, colId: c2.id, value: 'two\nlines' }, { rowId: r2.id, colId: c1.id, value: 'LinkedIn' }] })
  ok(w1.success, 'write three cells')
  let d = await A.loadSheet(f.sheetId)
  ok(d.success && d.doc.cells[r1.id]?.[c2.id] === 'two\nlines', 'line breaks kept')
  await A.applySheetChanges(f.sheetId, { cells: [{ rowId: r1.id, colId: c1.id, value: '' }] })
  d = await A.loadSheet(f.sheetId)
  ok(d.success && d.doc.cells[r1.id]?.[c1.id] === undefined, 'an empty value deletes the cell')

  // Insert a row between r1 and r2; a stale edit to a deleted row is skipped.
  const nr = randomUUID()
  const ins = await A.applySheetChanges(f.sheetId, { insertRows: [{ id: nr, position: (r1.position + r2.position) / 2 }], cells: [{ rowId: nr, colId: c1.id, value: 'inserted' }] })
  ok(ins.success && ins.skipped.length === 0, 'insert a row and fill it in one call')
  await A.applySheetChanges(f.sheetId, { deleteRows: [r2.id] })
  const stale = await A.applySheetChanges(f.sheetId, { cells: [{ rowId: r2.id, colId: c1.id, value: 'late' }] })
  ok(stale.success && stale.skipped.length === 1 && stale.skipped[0].reason === 'gone', 'an edit to a deleted row is skipped as gone')
  d = await A.loadSheet(f.sheetId)
  ok(d.success && d.doc.rows.length === 100 && d.doc.rows[1].id === nr, 'the inserted row sits second; 100 rows again')

  // Many inserts at one spot renumber positions.
  let lo = r1.position, hi = d.success ? d.doc.rows[1].position : 2, renumbered = false
  for (let i = 0; i < 55 && !renumbered; i++) {
    const id = randomUUID(), pos = (lo + hi) / 2
    const r = await A.applySheetChanges(f.sheetId, { insertRows: [{ id, position: pos }] })
    if (r.success && r.positions?.rows) renumbered = true
    hi = pos
  }
  ok(renumbered, 'positions are renumbered when they run out of room')

  // Sizes, limits and protection.
  ok((await A.applySheetChanges(f.sheetId, { rowHeights: [{ id: r1.id, height: 9999 }], colWidths: [{ id: c1.id, width: 10 }] })).success, 'sizes saved (clamped)')
  const sized = await prisma.sheetRow.findUnique({ where: { id: r1.id } })
  ok(sized?.height === 400, 'row height clamped to 400')
  ok(!(await A.applySheetChanges(f.sheetId, { cells: [{ rowId: r1.id, colId: c1.id, value: 'x'.repeat(50_001) }] })).success, 'a cell over 50,000 characters is refused')
  const tooMany = Array.from({ length: 4950 }, (_, i) => ({ id: randomUUID(), position: 1000 + i }))
  ok(!(await A.applySheetChanges(f.sheetId, { insertRows: tooMany })).success, 'more than 5,000 rows is refused')
  await prisma.sheet.update({ where: { id: f.sheetId }, data: { protected_by: (await prisma.member.findFirst({ where: { email: 'content@forefront.consulting' } }))!.id } })
  const blocked = await A.applySheetChanges(f.sheetId, { cells: [{ rowId: r1.id, colId: c1.id, value: 'no' }] })
  ok(blocked.success, 'an admin may still edit a protected sheet')
  process.env.SMOKE_MEMBER = 'design@forefront.consulting'
  const blocked2 = await A.applySheetChanges(f.sheetId, { cells: [{ rowId: r1.id, colId: c1.id, value: 'no' }] })
  ok(!blocked2.success && blocked2.error === 'protected', 'another member is refused on a protected sheet')
  process.env.SMOKE_MEMBER = 'raneem.sarhaan@forefront.consulting'

  // Linked guards and pins.
  const linked = await prisma.sheet.findUnique({ where: { linked_key: 'linked_content' } })
  ok(!(await A.applySheetChanges(linked!.id, { cells: [] })).success, 'blank-sheet writes refused on a linked sheet')
  const content = await prisma.sheetFolder.findUnique({ where: { linked_key: 'content' } })
  ok(!(await A.renameFolder(content!.id, 'X')).success && !(await A.deleteFolder(content!.id)).success, 'linked folders keep their name and can\'t be deleted')
  const pins = await A.setPins([f.folderId, content!.id, randomUUID()])
  ok(pins.success && pins.pins.length === 2, 'pins: unknown ids dropped')
  const home2 = await A.listFolders()
  ok(home2.success && home2.pins[0] === f.folderId, 'pins kept in order')
  await A.setPins([])
  const home3 = await A.listFolders()
  ok(home3.success && home3.pins.length === 0, 'unpinning everything stays empty (not back to the default)')
  await prisma.member.updateMany({ data: { sheet_pins: [], sheet_pins_set: false } })

  ok((await A.deleteFolder(f.folderId)).success && !(await prisma.sheet.findUnique({ where: { id: f.sheetId } })), 'deleting a folder removes its sheets')
  console.log(failed ? `\n${failed} failed` : '\nall passed')
}
main().catch(e => { console.error(e); failed++ }).finally(async () => { await prisma.$disconnect(); process.exit(failed ? 1 : 0) })
