/**
 * Smoke test of src/actions/sheets.ts against local PostgreSQL (spec 013 T009).
 * Run: DATABASE_URL=… npx tsx --tsconfig scripts/spreadsheet-lab/smoke/tsconfig.json scripts/spreadsheet-lab/smoke/run.ts
 */
import { randomUUID } from 'node:crypto'
import * as A from '@/actions/sheets'
import * as C from '@/actions/sheet-comments'
import * as L from '@/actions/sheet-links'
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

  // Spec 015 stage 2: hidden rows and columns, frozen panes, Clear › Comments.
  const v1 = await A.applySheetChanges(f.sheetId, { view: { hideRows: [rb.id], hideCols: [cb.id], frozenRows: 2, frozenCols: 1 } })
  ok(v1.success, 'hide a row and a column, freeze 2 rows and 1 column')
  let vv = await A.loadSheet(f.sheetId)
  ok(vv.success && vv.doc.extras?.view.hiddenRows?.includes(rb.id) && vv.doc.extras?.view.hiddenCols?.includes(cb.id) && vv.doc.extras.view.frozenRows === 2 && vv.doc.extras.view.frozenCols === 1, 'the view comes back on load')
  await A.applySheetChanges(f.sheetId, { view: { showRows: [rb.id], showCols: [cb.id], frozenRows: 9999, frozenCols: -3 } })
  vv = await A.loadSheet(f.sheetId)
  ok(vv.success && !vv.doc.extras?.view.hiddenRows?.length && vv.doc.extras?.view.frozenRows === 100 && vv.doc.extras.view.frozenCols === 0, 'unhide; frozen counts are kept in range')
  process.env.SMOKE_MEMBER = 'design@forefront.consulting'
  const vBlocked = await A.applySheetChanges(f.sheetId, { view: { hideRows: [rb.id] } })
  ok(!vBlocked.success && vBlocked.error === 'protected', 'hiding on a protected sheet is refused for another member')
  const theirs = await C.addComment(f.sheetId, { rowKey: rc.id, colKey: cc.id, body: 'Mine, not yours' })
  process.env.SMOKE_MEMBER = 'content@forefront.consulting'
  const mineToo = await C.addComment(f.sheetId, { rowKey: rc.id, colKey: cc.id, body: 'And this one is mine' })
  const cl = await C.clearCellComments(f.sheetId, [`${rc.id}|${cc.id}`])
  ok(theirs.success && mineToo.success && cl.success && cl.cleared === 1 && cl.skipped === 1, 'Clear › Comments: a member clears their own and leaves others')
  process.env.SMOKE_MEMBER = 'raneem.sarhaan@forefront.consulting'
  const cl2 = await C.clearCellComments(f.sheetId, [`${rc.id}|${cc.id}`])
  ok(cl2.success && cl2.cleared === 1 && cl2.skipped === 0, 'an admin clears the rest')

  // Spec 015 stage 3: rules, tables, Sort's row positions, the filter (blank sheets).
  const ruleId = randomUUID(), tableId = randomUUID()
  const s3 = await A.applySheetChanges(f.sheetId, {
    rules: { put: [
      { id: ruleId, range: { rows: [rb.id, rc.id], cols: [cb.id] }, kind: 'gt', args: { a: '100', junk: 'x' } as never, style: { fill: '#FFC7CE', bogus: 1 } as never, priority: 0 },
      { id: 'not-a-uuid', range: { rows: 'all', cols: [cb.id] }, kind: 'gt', args: {}, style: null, priority: 1 },
      { id: randomUUID(), range: { rows: 'all', cols: [cb.id] }, kind: 'nonsense' as never, args: {}, style: null, priority: 2 },
    ] },
    tables: { put: [{ id: tableId, top: rb.id, bottom: rc.id, left: cb.id, right: cc.id, style: 'dark-3', header: true, banded: false }] },
    view: { filterArea: { header: rb.id, cols: [cb.id, cc.id], last: rc.id }, filter: { [cb.id]: { values: ['a', 'b'], cond: { op: 'gt', a: '5' } }, [cc.id]: { cond: { op: 'nope' as never } } } },
  })
  ok(s3.success, 'rules, a table and a filter save together')
  let x3 = await A.loadSheet(f.sheetId)
  const ex3 = x3.success ? x3.doc.extras : undefined
  ok(ex3?.rules?.length === 1 && ex3.rules[0].id === ruleId && ex3.rules[0].args.a === '100' && !('junk' in ex3.rules[0].args) && JSON.stringify(ex3.rules[0].style) === JSON.stringify({ fill: '#FFC7CE' }), 'a rule comes back cleaned; bad ids and kinds are dropped')
  ok(ex3?.tables?.length === 1 && ex3.tables[0].style === 'dark-3' && ex3.tables[0].banded === false, 'the table comes back with its style and banding')
  ok(!!ex3?.view.filterArea && ex3.view.filterArea.header === rb.id && ex3.view.filter?.[cb.id]?.values?.length === 2 && !ex3.view.filter?.[cc.id], 'the filter comes back; an unknown condition is dropped')
  const before3 = await prisma.sheetRow.findMany({ where: { sheet_id: f.sheetId, id: { in: [rb.id, rc.id] } }, select: { id: true, position: true } })
  const pb = before3.find(r => r.id === rb.id)!.position, pc = before3.find(r => r.id === rc.id)!.position
  ok((await A.applySheetChanges(f.sheetId, { rowPositions: [{ id: rb.id, position: pc }, { id: rc.id, position: pb }] })).success, 'Sort saves new row positions')
  const after3 = await prisma.sheetRow.findMany({ where: { sheet_id: f.sheetId, id: { in: [rb.id, rc.id] } }, select: { id: true, position: true } })
  ok(after3.find(r => r.id === rb.id)!.position === pc && after3.find(r => r.id === rc.id)!.position === pb, 'the rows swapped places')
  await A.applySheetChanges(f.sheetId, { rowPositions: [{ id: rb.id, position: pb }, { id: rc.id, position: pc }] })
  process.env.SMOKE_MEMBER = 'design@forefront.consulting'
  const r3blocked = await A.applySheetChanges(f.sheetId, { rules: { remove: [ruleId] } })
  ok(!r3blocked.success && r3blocked.error === 'protected', 'rules on a protected sheet are refused for another member')
  process.env.SMOKE_MEMBER = 'raneem.sarhaan@forefront.consulting'
  ok((await A.applySheetChanges(f.sheetId, { rules: { remove: [ruleId] }, tables: { remove: [tableId] }, view: { filterArea: null, filter: null } })).success, 'remove the rule, the table and the filter')
  x3 = await A.loadSheet(f.sheetId)
  ok(x3.success && !x3.doc.extras?.rules?.length && !x3.doc.extras?.tables?.length && !x3.doc.extras?.view.filterArea && !x3.doc.extras?.view.filter, 'all gone after reload')
  const manyRules = Array.from({ length: 101 }, (_, i) => ({ id: randomUUID(), range: { rows: 'all' as const, cols: [cb.id] }, kind: 'dup' as const, args: {}, style: { b: true }, priority: i }))
  const tooManyRules = await A.applySheetChanges(f.sheetId, { rules: { put: manyRules } })
  ok(!tooManyRules.success, 'more than 100 rules are refused')
  ok((await prisma.sheetRule.count({ where: { sheet_id: f.sheetId } })) === 0, 'and nothing of the refused call is kept')

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
  // Stage 3 on the Content sheet: rules over whole columns, a sort and filter kept in the sheet; no tables.
  process.env.SMOKE_MEMBER = 'design@forefront.consulting'

  const lr = randomUUID()
  ok((await A.applyLinkedFormats(lc!.id, { rules: { put: [{ id: lr, range: { rows: [task?.id ?? 'x'], cols: ['title'] }, kind: 'contains', args: { a: 'Q4' }, style: { fill: '#FFEB9C' }, priority: 0 }] }, view: { sort: [{ col: 'title', dir: 'desc' }], filter: { status: { values: ['todo'] } }, filterArea: { header: null, cols: [] } } })).success, 'any member may add a rule, a sort and a filter on the Content sheet')
  const lx3 = await A.loadLinkedSheetExtras(lc!.id)
  ok(lx3.success && lx3.extras.rules?.[0]?.range.rows === 'all' && lx3.extras.view.sort?.[0]?.dir === 'desc' && !!lx3.extras.view.filterArea && lx3.extras.view.filter?.status?.values?.[0] === 'todo', 'they come back; a linked rule covers whole columns')
  ok(!(await A.applyLinkedFormats(lc!.id, { tables: { put: [] } } as never)).success, 'tables refused on the Content sheet (linked)')
  if (task) {
    const after = await prisma.task.findUnique({ where: { id: task.id }, select: { updated_at: true, name: true } })
    ok(after?.updated_at.getTime() === task.updated_at.getTime(), 'sorting and filtering the sheet never touches a task')
  }
  ok((await A.applyLinkedFormats(lc!.id, { rules: { remove: [lr] }, view: { sort: null, filter: null, filterArea: null } })).success, 'and they can be removed')
  process.env.SMOKE_MEMBER = 'raneem.sarhaan@forefront.consulting'

  // Spec 016: a blank sheet's columns linked to board tasks.
  {
    process.env.SMOKE_MEMBER = 'raneem.sarhaan@forefront.consulting'
    const admin = await prisma.member.findFirst({ where: { email: 'raneem.sarhaan@forefront.consulting' } })
    const member = await prisma.member.findFirst({ where: { email: 'content@forefront.consulting' } })
    const fld = await prisma.sheetFolder.create({ data: { name: `Links smoke ${Date.now()}`, kind: 'team' } })
    const sh = await prisma.sheet.create({ data: { folder_id: fld.id, kind: 'blank', name: 'Links', position: 0, row_count: 6, col_count: 4 } })
    const rows = await Promise.all([1, 2, 3, 4, 5, 6].map(i => prisma.sheetRow.create({ data: { id: randomUUID(), sheet_id: sh.id, position: i } })))
    const cols = await Promise.all([1, 2, 3, 4].map(i => prisma.sheetCol.create({ data: { id: randomUUID(), sheet_id: sh.id, position: i } })))
    const mk = (name: string, owner: string, status = 'todo') => prisma.task.create({ data: { name, task_owner_id: owner, initiator_role: 'admin', status, due_date: new Date('2027-01-10') } })
    const tA = await mk(`Smoke link A ${Date.now()}`, admin!.id), tB = await mk(`Smoke link B ${Date.now()}`, member!.id)
    const twin = `Smoke twin ${Date.now()}`
    const tw1 = await mk(twin, admin!.id), tw2 = await mk(twin, admin!.id)
    const tasksBefore = async () => (await prisma.$queryRaw<{ s: string }[]>`select md5(string_agg(id::text || name || status || coalesce(due_date::text,''), '|' order by id)) s from tasks`)[0].s
    const r = await L.resolveTaskCells(sh.id, [
      { rowId: rows[0].id, text: `https://x/board?task=${tA.id}` }, { rowId: rows[1].id, text: tB.name.toUpperCase() },
      { rowId: rows[2].id, text: twin }, { rowId: rows[3].id, text: 'Nothing called this' }, { rowId: 'not-a-row', text: tA.name },
    ])
    ok(r.success && r.linked.length === 2 && r.ambiguous.length === 1 && r.ambiguous[0].choices.length === 2 && r.unmatched.length === 1, 'resolveTaskCells: link, title (any case), a shared title, a miss; other sheets\' rows ignored')
    ok((await prisma.sheetRow.count({ where: { sheet_id: sh.id, task_id: { not: null } } })) === 2, 'linked rows are saved')
    const map = { taskCol: cols[0].id, fields: { [cols[1].id]: 'title' as const, [cols[2].id]: 'stage' as const, [cols[3].id]: 'theme' as const } }
    ok((await A.applySheetChanges(sh.id, { taskMap: { ...map, fields: { ...map.fields, [cols[0].id]: 'due' as never, 'nope': 'title' as never } } })).success, 'save a mapping')
    const saved = (await prisma.sheet.findUnique({ where: { id: sh.id }, select: { task_map: true } }))?.task_map as { fields: Record<string, string> }
    ok(Object.keys(saved.fields).length === 3 && !saved.fields[cols[0].id], 'the mapping is cleaned (Task column and unknown columns dropped)')
    const ld = await A.loadSheet(sh.id)
    ok(ld.success && ld.doc.extras?.rowTasks?.[rows[0].id] === tA.id && ld.doc.extras?.tasks?.[tA.id]?.values.title === tA.name && !ld.doc.extras?.tasks?.[tA.id]?.applies.includes('theme'), 'loadSheet carries links and values; a plain task has no theme')
    const w = await L.writeTaskFields(sh.id, [
      { rowId: rows[0].id, field: 'title', value: `${tA.name} (renamed)` },
      { rowId: rows[0].id, field: 'theme', value: 'Anything' },
      { rowId: rows[3].id, field: 'title', value: 'x' },
    ])
    ok(w.success && w.results[0].ok && w.results[1].reason === 'not_applicable' && w.results[2].reason === 'not_linked', 'writeTaskFields: saves, not applicable, not linked')
    ok((await prisma.task.findUnique({ where: { id: tA.id } }))?.name === `${tA.name} (renamed)`, 'the task is renamed')
    const snapCell = await prisma.sheetCell.findFirst({ where: { sheet_id: sh.id, row_id: rows[0].id, col_id: cols[1].id } })
    ok(snapCell?.value === `${tA.name} (renamed)`, 'the cell keeps a snapshot')
    const st = await L.writeTaskFields(sh.id, [{ rowId: rows[0].id, field: 'stage', value: 'Published' }, { rowId: rows[0].id, field: 'stage', value: 'Nowhere' }])
    ok(st.success && st.results[1].reason === 'bad_stage', 'an unknown stage name is refused')
    process.env.SMOKE_MEMBER = 'content@forefront.consulting'
    const mw = await L.writeTaskFields(sh.id, [{ rowId: rows[0].id, field: 'title', value: 'member was here' }, { rowId: rows[1].id, field: 'title', value: `${tB.name} (mine)` }])
    ok(mw.success && mw.results[0].reason === 'not_authorized' && mw.results[1].ok, 'a member can change their own task, not another\'s')
    const mv = await L.writeTaskFields(sh.id, [{ rowId: rows[0].id, field: 'stage', value: 'To Do' }])
    ok(mv.success && !mv.results[0].ok, 'a stage move the rules don\'t allow is refused')
    const mc = await L.createTasksForRows(sh.id, [{ rowId: rows[3].id, values: { title: 'Smoke new task' } }], { due: '2027-02-01' })
    ok(!mc.success && mc.error === 'not_authorized', 'a member with view access can\'t create tasks')
    process.env.SMOKE_MEMBER = 'raneem.sarhaan@forefront.consulting'
    const cr = await L.createTasksForRows(sh.id, [{ rowId: rows[3].id, values: { title: 'Smoke new task', assignee: 'Nobody Here' } }, { rowId: rows[4].id, values: { title: 'Smoke new task' } }, { rowId: rows[5].id, values: {} }], { due: '2027-02-01' })
    const made = cr.success ? cr.created : []
    const newTask = made[0] ? await prisma.task.findUnique({ where: { id: made[0].taskId } }) : null
    ok(cr.success && made.length === 1 && cr.problems.length === 2 && newTask?.status === 'todo' && newTask.project_id === null && newTask.task_owner_id === admin!.id, 'createTasksForRows: To do, no project, owned by the creator; problems counted')
    ok((await prisma.sheetRow.findUnique({ where: { id: rows[4].id } }))?.task_id === made[0]?.taskId, 'and the row is linked')
    const sig = await tasksBefore()
    ok((await A.applySheetChanges(sh.id, { rowTasks: [{ rowId: rows[0].id, taskId: null }], deleteRows: [rows[1].id] })).success, 'unlink a row and delete a linked row')
    ok(await tasksBefore() === sig, 'no task changed')
    const rf = await L.refreshTaskFields(sh.id)
    ok(rf.success && !rf.rowTasks[rows[0].id] && !!rf.rowTasks[rows[4].id], 'refreshTaskFields reads the links as saved')
    process.env.SMOKE_MEMBER = 'design@forefront.consulting'
    await prisma.sheet.update({ where: { id: sh.id }, data: { protected_by: admin!.id } })
    const pw = await L.writeTaskFields(sh.id, [{ rowId: rows[4].id, field: 'title', value: 'x' }])
    ok(!pw.success && pw.error === 'protected', 'a protected sheet refuses another member\'s mapped edits')
    process.env.SMOKE_MEMBER = 'raneem.sarhaan@forefront.consulting'
    const lc2 = await prisma.sheet.findUnique({ where: { linked_key: 'linked_content' } })
    ok(!(await L.resolveTaskCells(lc2!.id, [])).success, 'the Content sheet can\'t be linked this way')
    const sr = await L.searchTasks(twin, {})
    ok(sr.success && sr.tasks.filter(x => x.name === twin).length === 2, 'searchTasks finds both twins')
    await prisma.sheetFolder.delete({ where: { id: fld.id } })
    await prisma.task.deleteMany({ where: { id: { in: [tA.id, tB.id, tw1.id, tw2.id, ...made.map(m => m.taskId)] } } })
  }

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
