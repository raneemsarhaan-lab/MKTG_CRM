/**
 * Lab for src/lib/tab-link.ts (spec 027, T005). Run: npx tsx scripts/spaces-lab/tab-link.lab.ts
 * Prints PASS/FAIL per check; exits non-zero on any failure.
 */
import { linkPreview, matchColumns, rowToTask, type TabRow } from '../../src/lib/tab-link'

let failed = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`)
  if (!ok) failed++
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Column matching
const cols = [{ id: 'c1', name: 'Title' }, { id: 'c2', name: ' brand ' }, { id: 'c3', name: 'Notes' }, { id: 'c4', name: 'Status' }, { id: 'c5', name: 'Title' }, { id: 'c6', name: 'المسؤول' }]
const m = matchColumns(cols)
check('Title, Brand, Status match by name', same(m.slice(0, 4).map(x => x.field), ['title', 'brand', 'sheet', 'status']), m)
check('an unknown column is Sheet only', m[2].field === 'sheet', m[2])
check('a field is matched once: the second Title is Sheet only', m[4].field === 'sheet', m[4])
check('Arabic names match', m[5].field === 'assignee', m[5])

// Link preview
const row = (id: string, title: string, taskId: string | null = null, lastTaskId: string | null = null): TabRow => ({ id, title, taskId, lastTaskId, values: {} })
const exists = (id: string) => id !== 'gone'
const rows = [row('r1', 'A'), row('r2', 'B'), row('r3', 'C'), row('r4', '  ')]
const p1 = linkPreview(rows, exists)
check('3 titled rows → create 3; untitled stays plain', same(p1.create, ['r1', 'r2', 'r3']) && same(p1.untitled, ['r4']), p1)

// After linking: rows hold their tasks → a second link creates nothing (idempotent).
const linked = rows.map((r, i) => (r.title.trim() ? { ...r, taskId: `t${i + 1}` } : r))
const p2 = linkPreview(linked, exists)
check('linking again creates 0 (idempotent)', p2.create.length === 0 && p2.linked.length === 3, p2)

// Unlink: tasks remembered → relink reconnects, creates none.
const unlinked = linked.map(r => (r.taskId ? { ...r, lastTaskId: r.taskId, taskId: null } : r))
const p3 = linkPreview(unlinked, exists)
check('relink: "Reconnects 3", creates 0', p3.reconnect.length === 3 && p3.create.length === 0, p3)

// Make task on one row of an unlinked tab, then link the tab: only the others are created.
const oneMade = [row('a', 'One', 'tA'), row('b', 'Two'), row('c', 'Three')]
const p4 = linkPreview(oneMade, exists)
check('a row made a task one by one is not duplicated', same(p4.linked, ['a']) && same(p4.create, ['b', 'c']), p4)

// A remembered task that is gone: the row gets a new task.
const p5 = linkPreview([row('x', 'X', null, 'gone')], exists)
check('a remembered task that no longer exists → create', same(p5.create, ['x']), p5)

// Two rows remembering the same task (e.g. a duplicated tab row): one reconnects, the other is a conflict.
const p6 = linkPreview([row('d1', 'D', null, 'tD'), row('d2', 'D copy', null, 'tD')], exists)
check('two rows remembering one task: one reconnects, one is a conflict', same(p6.reconnect, ['d1']) && same(p6.conflicts, ['d2']), p6)

// A row remembering a task another row already holds: conflict, not a second link.
const p7 = linkPreview([row('e1', 'E', 'tE'), row('e2', 'E again', null, 'tE')], exists)
check('a remembered task already held by another row → conflict', same(p7.conflicts, ['e2']), p7)

// Row values to task fields
const t = rowToTask({ id: 'r', title: 'Hook post', taskId: null, lastTaskId: null, values: { c1: 'ignored title', c2: 'Forefront', c3: 'a note', c4: 'To Do' } }, m)
check('row → task: title from the row, Brand and Status from matched columns, notes stay', same(t, { title: 'Hook post', brand: 'Forefront', status: 'To Do' }), t)

console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
