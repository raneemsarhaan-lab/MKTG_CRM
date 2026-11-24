import type { PrismaClient } from '@prisma/client'

/**
 * Release safety (user, 25 Nov 2026). The seed's one-time steps rewrite some existing values in
 * place. This copies those values, as they are before the steps run, into kept exports
 * (`data_exports`, downloaded from Settings › Diagnostics): one CSV per table, with only columns that
 * existed before the release. Nothing is changed or removed here.
 */
const csvCell = (v: unknown) => {
  const s = v == null ? '' : v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join('|') : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (rows: Record<string, unknown>[], cols: string[]) => [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\r\n') + '\r\n'

export async function snapshotBeforeRelease(db: PrismaClient): Promise<{ tasks: number; columns: number; projects: number; types: number }> {
  const keep = async (name: string, title: string, rows: Record<string, unknown>[], cols: string[]) => {
    const content = toCsv(rows, cols)
    // Never overwritten: the first copy is the one taken before the release.
    await db.dataExport.upsert({ where: { name }, create: { name, title, content, rows: rows.length }, update: {} })
    return rows.length
  }
  const tasks = await db.$queryRawUnsafe<Record<string, unknown>[]>(
    `select id, name, status, stage_date, due_date, priority, project_id, pillar_id, task_owner_id, assignee_id, parent_task_id, dropped_at, updated_at from tasks order by created_at, id`)
  const columns = await db.$queryRawUnsafe<Record<string, unknown>[]>(
    `select id, sheet, key, name, position, width, shown_default, shown_in, kind, deleted_at from sheet_columns order by sheet, position, id`)
  const projects = await db.$queryRawUnsafe<Record<string, unknown>[]>(
    `select id, name, brand_id, is_theme, standing, owner_id from projects order by name, id`)
  const types = await db.$queryRawUnsafe<Record<string, unknown>[]>(`select id, label from content_types order by label`)
  return {
    tasks: await keep('before-release-tasks.csv', 'Tasks before the release of 25 Nov 2026: stage, dates, priority, project, pillar, people', tasks,
      ['id', 'name', 'status', 'stage_date', 'due_date', 'priority', 'project_id', 'pillar_id', 'task_owner_id', 'assignee_id', 'parent_task_id', 'dropped_at', 'updated_at']),
    columns: await keep('before-release-sheet-columns.csv', 'Sheet columns before the release of 25 Nov 2026: which sheet, order, where shown', columns,
      ['id', 'sheet', 'key', 'name', 'position', 'width', 'shown_default', 'shown_in', 'kind', 'deleted_at']),
    projects: await keep('before-release-projects.csv', 'Projects before the release of 25 Nov 2026: which were themes', projects,
      ['id', 'name', 'brand_id', 'is_theme', 'standing', 'owner_id']),
    types: await keep('before-release-task-types.csv', 'Task types before the release of 25 Nov 2026', types, ['id', 'label']),
  }
}
