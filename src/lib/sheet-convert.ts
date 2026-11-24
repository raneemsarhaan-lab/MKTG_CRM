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
