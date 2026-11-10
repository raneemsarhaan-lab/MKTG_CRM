/**
 * Smoke test of src/actions/sheets.ts against local PostgreSQL (spec 013 T009).
 * Run: DATABASE_URL=… npx tsx --tsconfig scripts/spreadsheet-lab/smoke/tsconfig.json scripts/spreadsheet-lab/smoke/run.ts
 */
import { randomUUID } from 'node:crypto'
import * as A from '@/actions/sheets'
import * as C from '@/actions/sheet-comments'
import { openNotification } from '@/actions/notifications'
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

  // Spec 015: formatting and merges (contracts/server.md).
  const fr = await A.applySheetChanges(f.sheetId, { formats: [
    { rowKey: r1.id, colKey: '', style: { b: true, fill: '#7030a0', junk: 1 } as never, mode: 'set' },
    { rowKey: r1.id, colKey: c1.id, style: { i: true }, mode: 'set' },
    { rowKey: '', colKey: c2.id, style: { num: { kind: 'currency', cur: 'EGP', dp: 2 } }, mode: 'set' },
  ] })
  ok(fr.success, 'formats saved: a row, a cell, a column')
  await A.applySheetChanges(f.sheetId, { formats: [{ rowKey: r1.id, colKey: c1.id, style: { fill: '#FFC000' }, mode: 'merge' }] })
  let fx = await A.loadSheet(f.sheetId)
  const fmt = (r: string, c: string) => fx.success ? fx.doc.extras?.formats.find(x => x.rowKey === r && x.colKey === c)?.style : undefined
  ok(JSON.stringify(fmt(r1.id, '')) === JSON.stringify({ b: true, fill: '#7030A0' }), 'unknown fields dropped, colours upper-cased')
  ok(JSON.stringify(fmt(r1.id, c1.id)) === JSON.stringify({ i: true, fill: '#FFC000' }), 'merge lays a fill over the stored italic')
  await A.applySheetChanges(f.sheetId, { formats: [{ rowKey: r1.id, colKey: c1.id, style: null, mode: 'set' }, { rowKey: '', colKey: c2.id, style: { junk: true } as never, mode: 'set' }] })
  fx = await A.loadSheet(f.sheetId)
  ok(fmt(r1.id, c1.id) === undefined && fmt('', c2.id) === undefined, 'null or an empty style deletes the record')
  const many = Array.from({ length: 10_000 }, (_, i) => ({ rowKey: `r${i}`, colKey: c1.id, style: { b: true }, mode: 'set' as const }))
  const t0 = Date.now()
  const bulk = await A.applySheetChanges(f.sheetId, { formats: many })
  const ms = Date.now() - t0
  ok(bulk.success && ms < 1000, `10,000 cell formats in one call under a second (${ms} ms)`)
  ok(!(await A.applySheetChanges(f.sheetId, { formats: [...many, ...many, { rowKey: 'x', colKey: 'y', style: { b: true }, mode: 'set' }] })).success, 'more than 20,000 formats in one call is refused')
  await prisma.sheetFormat.deleteMany({ where: { sheet_id: f.sheetId, row_key: { startsWith: 'r' }, NOT: { row_key: r1.id } } })
  const rowsNow = (await A.loadSheet(f.sheetId)) as { success: true; doc: { rows: { id: string }[]; cols: { id: string }[] } }
  const [ra, rb, rc] = rowsNow.doc.rows, [ca, cb, cc] = rowsNow.doc.cols
  const mid = randomUUID()
  ok((await A.applySheetChanges(f.sheetId, { merges: { add: [{ id: mid, top: ra.id, left: ca.id, bottom: ra.id, right: cc.id }] } })).success, 'merge A1:C1')
  const over = await A.applySheetChanges(f.sheetId, { merges: { add: [{ id: randomUUID(), top: ra.id, left: cb.id, bottom: rb.id, right: cb.id }] } })
  ok(!over.success && over.error === 'merge_overlap', 'an overlapping merge is refused')
  ok((await A.applySheetChanges(f.sheetId, { merges: { add: [{ id: randomUUID(), top: rb.id, left: ca.id, bottom: rc.id, right: ca.id }] } })).success, 'a merge next to it is fine')
  await A.applySheetChanges(f.sheetId, { merges: { remove: [mid] } })
  fx = await A.loadSheet(f.sheetId)
  ok(fx.success && fx.doc.extras?.merges.length === 1 && !fx.doc.extras.merges.some(m => m.id === mid), 'unmerge removes it')
  process.env.SMOKE_MEMBER = 'design@forefront.consulting'
  const fBlocked = await A.applySheetChanges(f.sheetId, { formats: [{ rowKey: '', colKey: '', style: { b: true }, mode: 'set' }] })
  ok(!fBlocked.success && fBlocked.error === 'protected', 'formatting a protected sheet is refused for another member')
  process.env.SMOKE_MEMBER = 'raneem.sarhaan@forefront.consulting'

  // Spec 015 comments (contracts/server.md "Comments"), on the protected sheet.
  const contentM = await prisma.member.findFirst({ where: { email: 'content@forefront.consulting' } })
  const adminM = await prisma.member.findFirst({ where: { email: 'raneem.sarhaan@forefront.consulting' } })
  const started = new Date()
  const c1r = await C.addComment(f.sheetId, { rowKey: r1.id, colKey: c1.id, body: `@${contentM!.name} is this the final budget?`, cell: 'A1' })
  ok(c1r.success && c1r.thread.comments[0].mentions.includes(contentM!.id), 'add a comment; the @mention is read from the text')
  if (!c1r.success) return
  const tid = c1r.thread.id
  await new Promise(r => setTimeout(r, 300))
  const nMention = await prisma.notification.findFirst({ where: { recipient_id: contentM!.id, kind: 'sheet_mention', created_at: { gte: started } } })
  const nm = nMention?.meta as { folder_id?: string; sheet_id?: string; row_key?: string; cell?: string } | undefined
  ok(!!nMention && nMention.task_id === null && nm?.folder_id === f.folderId && nm?.sheet_id === f.sheetId && nm?.row_key === r1.id && nm?.cell === 'A1', 'the mentioned member gets sheet_mention with the cell in meta')
  ok(!(await C.addComment(f.sheetId, { rowKey: r1.id, colKey: c1.id, body: '   ' })).success, 'an empty comment is refused')
  const long = await C.addComment(f.sheetId, { rowKey: r1.id, colKey: c1.id, body: 'x'.repeat(5001) })
  ok(!long.success && long.error === 'too_long', 'over 5,000 characters is refused')
  process.env.SMOKE_MEMBER = 'design@forefront.consulting'
  const onProtected = await C.addComment(f.sheetId, { rowKey: r2.id, colKey: c1.id, body: 'Commenting on a protected sheet' })
  ok(onProtected.success, 'another member may comment on a protected sheet')
  process.env.SMOKE_MEMBER = 'content@forefront.consulting'
  const rep = await C.replyComment(tid, { body: 'Yes, signed off.', cell: 'A1' })
  ok(rep.success && rep.thread.comments.length === 2, 'reply')
  const edOther = await C.editComment(tid, 'changed')
  ok(!edOther.success && edOther.error === 'not_author', 'only the author edits a comment')
  const delOther = await C.deleteComment(tid)
  ok(!delOther.success && delOther.error === 'not_author', 'a member can\'t delete someone else\'s comment')
  if (nMention) {
    const op = await openNotification(nMention.id)
    ok(op.success && !!op.href && op.href.includes(`/sheets/${f.folderId}?sheet=${f.sheetId}`) && op.href.includes(encodeURIComponent(`${r1.id}:${c1.id}`)), 'opening the notification leads to the sheet at the cell')
  }
  process.env.SMOKE_MEMBER = 'raneem.sarhaan@forefront.consulting'
  await new Promise(r => setTimeout(r, 300))
  const nReply = await prisma.notification.findFirst({ where: { recipient_id: adminM!.id, kind: 'sheet_reply', created_at: { gte: started } } })
  ok(!!nReply, 'the thread\'s earlier author gets sheet_reply')
  const repId = rep.success ? rep.thread.comments[1].id : ''
  const adminDel = await C.deleteComment(repId)
  ok(adminDel.success && adminDel.thread?.comments[1].deleted === true, 'an admin may delete any comment (soft delete)')
  const res = await C.resolveThread(tid)
  ok(res.success && !!res.thread.resolved, 'resolve')
  const re = await C.reopenThread(tid)
  ok(re.success && !re.thread.resolved, 'reopen')
  const list = await C.listThreads(f.sheetId)
  ok(list.success && list.threads.length === 2, 'list threads on the sheet')
  const sum = await A.loadSheet(f.sheetId)
  ok(sum.success && sum.doc.extras?.threads.some(x => x.id === tid && x.count === 1), 'loadSheet carries thread summaries (deleted comments not counted)')
  await prisma.notification.deleteMany({ where: { kind: { in: ['sheet_mention', 'sheet_reply'] }, created_at: { gte: started } } })

  // Spec 015 on the Content sheet: any member, never a task change.
  const lc = await prisma.sheet.findUnique({ where: { linked_key: 'linked_content' } })
  const task = await prisma.task.findFirst({ select: { id: true, updated_at: true, name: true } })
  process.env.SMOKE_MEMBER = 'design@forefront.consulting'
  const lf = await A.applyLinkedFormats(lc!.id, { formats: [{ rowKey: task?.id ?? 'smoke-task', colKey: 'title', style: { fill: '#FFEB9C' }, mode: 'set' }] })
  ok(lf.success, 'any member may format the Content sheet')
  ok(!(await A.applyLinkedFormats(lc!.id, { merges: { add: [] } })).success, 'merges refused on the Content sheet (linked)')
  ok(!(await A.applyLinkedFormats(f.sheetId, { formats: [] })).success, 'applyLinkedFormats refuses a blank sheet')
  process.env.SMOKE_MEMBER = 'raneem.sarhaan@forefront.consulting'
  const lx = await A.loadLinkedSheetExtras(lc!.id)
  ok(lx.success && lx.extras.formats.some(x => x.rowKey === (task?.id ?? 'smoke-task') && x.style.fill === '#FFEB9C'), 'the Content sheet loads its formatting by task id')
  if (task) {
    const after = await prisma.task.findUnique({ where: { id: task.id }, select: { updated_at: true, name: true } })
    ok(after?.updated_at.getTime() === task.updated_at.getTime() && after?.name === task.name, 'formatting never touches the task')
  }
  await prisma.sheetFormat.deleteMany({ where: { sheet_id: lc!.id, row_key: task?.id ?? 'smoke-task', col_key: 'title' } })

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
