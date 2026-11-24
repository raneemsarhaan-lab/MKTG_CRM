/**
 * Spec 026 (§8): the one-time move from the two special sheets to one sheet
 * per Space. Server-only; run once by the seed, and by the lab on its own.
 *
 *   1. Rows and themes made before Spaces had sheets belong to the Content Space.
 *   2. The clip details (#, Source, File name, In, Out) are exported to a CSV
 *      that is kept (`data_exports`), before their columns and fields go.
 *   3. Each video becomes a linked row on the Video Space's sheet, under its
 *      theme; its clips become linked child rows. A video with no project sits
 *      under a catch-all theme for its brand ("Videos · <brand>").
 * Nothing is deleted: tasks, clip records, custom columns, values, formatting
 * and comments stay as they are.
 */
import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const time = (ms: number | null) => {
  if (ms == null) return ''
  const t = Math.round(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s).padStart(2, '0')}`
}

/** The clip details as a CSV: one line per clip that had any. */
export async function clipDetailsCsv(db: Db): Promise<{ csv: string; rows: number }> {
  const clips = await db.taskClip.findMany({
    orderBy: [{ video_id: 'asc' }, { clip_no: 'asc' }, { created_at: 'asc' }],
    include: { task: { select: { id: true, name: true, status: true, dropped_at: true, attachments: { select: { filename: true, url: true } } } }, video: { select: { id: true, name: true, brand: { select: { name: true } } } } },
  })
  const head = ['Brand', 'Video', 'Clip', '#', 'Source', 'File name', 'In', 'Out', 'Length', 'File', 'Stage', 'Archived', 'Clip task id', 'Video task id']
  const lines = clips.map(c => [
    c.video?.brand?.name ?? '', c.video?.name ?? '', c.task.name, c.clip_no ?? '', c.source ?? '', c.file_name ?? '', time(c.in_ms), time(c.out_ms),
    c.in_ms != null && c.out_ms != null && c.out_ms >= c.in_ms ? time(c.out_ms - c.in_ms) : '',
    c.task.attachments.map(a => a.url || a.filename).join(' | '), c.task.status, c.task.dropped_at ? 'yes' : '', c.task.id, c.video?.id ?? '',
  ].map(csvCell).join(','))
  return { csv: [head.join(','), ...lines].join('\r\n') + '\r\n', rows: lines.length }
}

export async function convertSheets(db: Db): Promise<{ backfilled: number; exported: number; videos: number; clips: number; themes: number }> {
  const [content, video] = await Promise.all([
    db.teamSpace.findUnique({ where: { key: 'content' }, select: { id: true } }),
    db.teamSpace.findFirst({ where: { OR: [{ media_board: 'video' }, { key: 'video' }] }, select: { id: true } }),
  ])
  let backfilled = 0
  if (content) {
    backfilled += (await db.contentSheetTheme.updateMany({ where: { space_id: null }, data: { space_id: content.id } })).count
    backfilled += (await db.contentRow.updateMany({ where: { space_id: null }, data: { space_id: content.id } })).count
  }

  // The clip details, kept as a CSV before their columns and fields are removed.
  const { csv, rows } = await clipDetailsCsv(db)
  await db.dataExport.upsert({
    where: { name: 'clip-details.csv' },
    create: { name: 'clip-details.csv', title: 'Clip details (#, Source, File name, In, Out, Length, File) before spec 026', content: csv, rows },
    update: {},
  })

  // Custom columns (and so their values) move to each Space's own sheet: the Video sheet's to the Video
  // Space, a Space's task sheet's to that Space. Shown everywhere there: the old sheet's column sets are gone.
  for (const sp of await db.teamSpace.findMany({ where: { key: { not: 'content' } }, select: { id: true, key: true, media_board: true } })) {
    const from = sp.id === video?.id ? ['video', `tasks:space:${sp.id}`] : [`tasks:space:${sp.id}`]
    const to = `rows:${sp.id}`
    const taken = new Set((await db.sheetColumn.findMany({ where: { sheet: to }, select: { key: true } })).map(c => c.key))
    for (const col of await db.sheetColumn.findMany({ where: { sheet: { in: from }, key: { startsWith: 'c:' } }, orderBy: { position: 'asc' }, select: { id: true, key: true } })) {
      if (taken.has(col.key)) continue
      taken.add(col.key)
      await db.sheetColumn.update({ where: { id: col.id }, data: { sheet: to, shown_default: true, shown_in: [] } })
    }
  }

  let videos = 0, clips = 0, themes = 0
  if (!video) return { backfilled, exported: rows, videos, clips, themes }
  const all = await db.task.findMany({
    where: { content_type_label: 'Video', parent_task_id: null, media_board: null },
    orderBy: [{ updated_at: 'desc' }],
    select: { id: true, name: true, project_id: true, pillar_id: true, brand_id: true, publish_date: true, dropped_at: true, status: true,
      brand: { select: { name: true, short_name: true } }, subtasks: { select: { id: true, name: true, publish_date: true, clip: { select: { clip_no: true, created_at: true } }, created_at: true } } },
  })
  // The videos the Video sheet listed: every video with clips, and live ones not yet published.
  const listed = all.filter(v => v.subtasks.length || (!v.dropped_at && v.status !== 'publish'))
  const have = new Set((await db.contentRow.findMany({ where: { space_id: video.id, task_id: { not: null } }, select: { task_id: true } })).map(r => r.task_id!))
  const themeOf = new Map((await db.contentSheetTheme.findMany({ where: { space_id: video.id }, select: { project_id: true } })).map(t => [t.project_id, true]))
  let themePos = (await db.contentSheetTheme.aggregate({ where: { space_id: video.id }, _max: { position: true } }))._max.position ?? 0
  const catchAll = new Map<string, string>()
  const ends = new Map<string, number>()
  const pillarOk = new Map<string, Set<string>>()

  for (const v of listed) {
    if (have.has(v.id)) continue
    // Its theme: its project, else a catch-all theme for its brand.
    let projectId = v.project_id
    if (!projectId) {
      const key = v.brand_id ?? ''
      if (!catchAll.has(key)) {
        const name = `Videos · ${v.brand?.short_name?.trim() || v.brand?.name || 'No brand'}`
        const found = await db.project.findFirst({ where: { name } })
        catchAll.set(key, (found ?? await db.project.create({ data: { name, standing: true, is_theme: true, brand_id: v.brand_id } })).id)
      }
      projectId = catchAll.get(key)!
    }
    if (!themeOf.has(projectId)) {
      await db.contentSheetTheme.create({ data: { project_id: projectId, space_id: video.id, position: ++themePos } })
      await db.project.update({ where: { id: projectId }, data: { is_theme: true } })
      themeOf.set(projectId, true)
      themes++
    }
    if (!pillarOk.has(projectId)) pillarOk.set(projectId, new Set((await db.contentPillar.findMany({ where: { project_id: projectId }, select: { id: true } })).map(p => p.id)))
    const pillar = v.pillar_id && pillarOk.get(projectId)!.has(v.pillar_id) ? v.pillar_id : null
    const pos = (ends.get(projectId) ?? 0) + 1
    ends.set(projectId, pos)
    const row = await db.contentRow.create({ data: { space_id: video.id, project_id: projectId, pillar_id: pillar, position: pos, title: v.name, date: v.publish_date, task_id: v.id } })
    videos++
    // Its clips, in clip order, as linked child rows.
    const kids = [...v.subtasks].sort((a, b) => (a.clip?.clip_no ?? 1e9) - (b.clip?.clip_no ?? 1e9) || (a.clip?.created_at ?? a.created_at).getTime() - (b.clip?.created_at ?? b.created_at).getTime())
    let k = 0
    for (const c of kids) {
      if (have.has(c.id)) continue
      await db.contentRow.create({ data: { space_id: video.id, project_id: projectId, pillar_id: pillar, parent_id: row.id, position: ++k, title: c.name, date: c.publish_date, task_id: c.id } })
      clips++
    }
  }
  return { backfilled, exported: rows, videos, clips, themes }
}

/**
 * User, 24 Nov 2026: the Sheets section is gone, and the folders of blank sheets people made there
 * (kind 'team') go with it. Each sheet that holds anything is first kept as a CSV among the kept
 * exports (Settings › Diagnostics). Blank tabs beside a Space's, a brand's or My tasks' sheet stay.
 */
export async function removeTeamSheets(db: Db, only?: string[]): Promise<{ folders: number; sheets: number; exported: number }> {
  const folders = await db.sheetFolder.findMany({ where: { kind: 'team', ...(only ? { id: { in: only } } : {}) }, select: { id: true, name: true, sheets: { orderBy: { position: 'asc' }, select: { id: true, name: true } } } })
  let sheets = 0, exported = 0
  for (const f of folders) {
    for (const sh of f.sheets) {
      sheets++
      const [rows, cols, cells] = await Promise.all([
        db.sheetRow.findMany({ where: { sheet_id: sh.id }, orderBy: { position: 'asc' }, select: { id: true } }),
        db.sheetCol.findMany({ where: { sheet_id: sh.id }, orderBy: { position: 'asc' }, select: { id: true } }),
        db.sheetCell.findMany({ where: { sheet_id: sh.id }, select: { row_id: true, col_id: true, value: true } }),
      ])
      const filled = cells.filter(c => c.value !== '')
      if (!filled.length) continue
      const at = new Map(filled.map(c => [`${c.row_id}|${c.col_id}`, c.value]))
      // Up to the last row and column that hold something.
      const lastRow = rows.reduce((m, r, i) => (cols.some(c => at.has(`${r.id}|${c.id}`)) ? i : m), -1)
      const lastCol = cols.reduce((m, c, i) => (rows.some(r => at.has(`${r.id}|${c.id}`)) ? i : m), -1)
      const lines = rows.slice(0, lastRow + 1).map(r => cols.slice(0, lastCol + 1).map(c => csvCell(at.get(`${r.id}|${c.id}`) ?? '')).join(','))
      const name = `sheet-${sh.id}.csv`
      const title = `${f.name ?? 'Folder'} › ${sh.name ?? 'Sheet'} (a blank sheet from the old Sheets section)`
      const content = lines.join('\r\n') + '\r\n'
      await db.dataExport.upsert({ where: { name }, create: { name, title, content, rows: lines.length }, update: { title, content, rows: lines.length } })
      exported++
    }
  }
  if (folders.length) await db.sheetFolder.deleteMany({ where: { id: { in: folders.map(f => f.id) } } })
  return { folders: folders.length, sheets, exported }
}

/**
 * Release 2026-11-25 (owner's decision, 24 Nov 2026): the two folders of the old Sheets section, which has
 * no page any more.
 *   - "TSC Calendar" becomes the workbook of a new team Space, "Digital Media", open to everyone as the
 *     folder was. Its sheets are tagged with the brand The Strategy Community, so they show on the Space
 *     and in that brand's folder of it. Nothing inside the sheets changes: the same sheet ids, cells,
 *     formats and comments.
 *   - "Marketing Projects" is deleted. Each of its sheets that holds anything is first kept as a CSV among
 *     the kept exports (Settings › Diagnostics).
 * A folder with neither name is left as it is. Found by name, so it does nothing where they don't exist.
 */
export async function placeOldSheetFolders(db: Db): Promise<{ moved: number; tagged: number; deleted: number; exported: number }> {
  const norm = (x: string | null) => (x ?? '').trim().toLowerCase()
  const folders = await db.sheetFolder.findMany({ where: { kind: 'team' }, select: { id: true, name: true } })
  const calendar = folders.find(f => norm(f.name) === 'tsc calendar')
  const projects = folders.find(f => norm(f.name) === 'marketing projects')
  let moved = 0, tagged = 0
  if (calendar) {
    const space = await db.teamSpace.findUnique({ where: { key: 'digital-media' } }) ?? await db.teamSpace.create({
      data: {
        key: 'digital-media', name: 'Digital Media', color: '#DB2777', is_production: false, default_kind: 'pipeline',
        sort_order: ((await db.teamSpace.aggregate({ _max: { sort_order: true } }))._max.sort_order ?? -1) + 1,
        settings: { visibility: 'everyone' },
      },
    })
    const key = `node:space:${space.id}`
    const own = await db.sheetFolder.findUnique({ where: { linked_key: key }, select: { id: true } })
    if (own) {
      // The Space already has a workbook: the sheets join it, after its tabs.
      const last = (await db.sheet.aggregate({ where: { folder_id: own.id }, _max: { position: true } }))._max.position ?? -1
      const sheets = await db.sheet.findMany({ where: { folder_id: calendar.id }, orderBy: { position: 'asc' }, select: { id: true } })
      for (const [i, sh] of sheets.entries()) await db.sheet.update({ where: { id: sh.id }, data: { folder_id: own.id, position: last + 1 + i } })
      await db.sheetFolder.delete({ where: { id: calendar.id } })
      moved = sheets.length
    } else {
      await db.sheetFolder.update({ where: { id: calendar.id }, data: { kind: 'node', linked_key: key } })
      moved = await db.sheet.count({ where: { folder_id: calendar.id } })
    }
    const brand = await db.brand.findFirst({ where: { name: { equals: 'The Strategy Community', mode: 'insensitive' } }, select: { id: true } })
    if (brand) tagged = (await db.sheet.updateMany({ where: { folder_id: own?.id ?? calendar.id, kind: 'blank', brand_id: null }, data: { brand_id: brand.id } })).count
  }
  const gone = projects ? await removeTeamSheets(db, [projects.id]) : { folders: 0, sheets: 0, exported: 0 }
  return { moved, tagged, deleted: gone.sheets, exported: gone.exported }
}
