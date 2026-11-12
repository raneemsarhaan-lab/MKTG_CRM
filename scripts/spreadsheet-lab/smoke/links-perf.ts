// Spec 016 SC-004: link a 2,000-row sheet (task links and titles) and time it.
//   DATABASE_URL=… npx tsx --tsconfig scripts/spreadsheet-lab/smoke/tsconfig.json scripts/spreadsheet-lab/smoke/links-perf.ts
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import * as L from '@/actions/sheet-links'

;(async () => {
  process.env.SMOKE_MEMBER = 'raneem.sarhaan@forefront.consulting'
  const tasks = await prisma.task.findMany({ select: { id: true, name: true }, take: 400 })
  const fld = await prisma.sheetFolder.create({ data: { name: `Links perf ${Date.now()}`, kind: 'team' } })
  const sh = await prisma.sheet.create({ data: { folder_id: fld.id, kind: 'blank', name: 'Perf', position: 0, row_count: 2000, col_count: 1 } })
  const rows = Array.from({ length: 2000 }, (_, i) => ({ id: randomUUID(), sheet_id: sh.id, position: i + 1 }))
  await prisma.sheetRow.createMany({ data: rows })
  const cells = rows.map((r, i) => { const t = tasks[i % tasks.length]; return { rowId: r.id, text: i % 2 ? `/board?task=${t.id}` : t.name } })
  const t0 = performance.now()
  const res = await L.resolveTaskCells(sh.id, cells)
  const ms = performance.now() - t0
  console.log(res.success ? `2,000 rows: ${res.linked.length} linked, ${res.ambiguous.length} to choose, ${res.unmatched.length} not found in ${Math.round(ms)} ms` : res.error)
  await prisma.sheetFolder.delete({ where: { id: fld.id } })
  process.exit(res.success && ms < 5000 ? 0 : 1)
})()
