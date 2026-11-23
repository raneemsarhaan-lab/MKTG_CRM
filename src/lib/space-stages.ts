/**
 * Space stages (spec 022 US4, research R7–R8). Pure: used by the server actions,
 * board data, client views and the lab.
 *
 * A Space renames or splits the 11 original stages for itself. A split adds
 * sub-stages to one original stage; moving between them changes nothing but
 * that Space's row for the task. A task's sub-stage is remembered only while
 * its original stage is still the one it was recorded in; otherwise it shows
 * in the first Space stage of its current stage. The main board and every
 * page that isn't a Space keep the original names.
 */
import type { StageId } from '@/types/index'
import { ALL_STAGES, STAGE_META } from '@/lib/stage-meta'
import { normTitle } from '@/lib/sheet-links'

export interface SpaceStageRow { id: string; space_id: string; stage_id: StageId | string; name: string | null; position: number; aliases: string[] }
export interface TaskSpaceStageRow { task_id: string; space_id: string; space_stage_id: string; stage_id: string }

/** One column of a Space: a stored row, or the original stage itself when the Space has none for it. */
export interface SpaceStageEntry {
  /** The row's id, or `orig:<stage>` for an original stage the Space hasn't named. */
  id: string
  stage_id: StageId
  /** What the Space calls it (the original name when unnamed). */
  name: string
  /** True when the Space named it. */
  named: boolean
  /** 0 is the first of its original stage. */
  position: number
  aliases: string[]
}

export const MAX_STAGE_NAME = 40
export const MAX_SPLIT = 6

export const originalName = (s: StageId | string, locale: 'en' | 'ar' | string = 'en') =>
  (locale === 'ar' ? STAGE_META[s as StageId]?.label_ar : STAGE_META[s as StageId]?.label_en) ?? String(s)

const clean = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, MAX_STAGE_NAME)

/** The Space's stages in pipeline order, every original stage covered. */
export function stagesForSpace(spaceId: string, rows: SpaceStageRow[], locale: 'en' | 'ar' | string = 'en'): SpaceStageEntry[] {
  const mine = rows.filter(r => r.space_id === spaceId)
  const out: SpaceStageEntry[] = []
  for (const s of ALL_STAGES) {
    const list = mine.filter(r => r.stage_id === s).sort((a, b) => a.position - b.position)
    if (!list.length) { out.push({ id: `orig:${s}`, stage_id: s, name: originalName(s, locale), named: false, position: 0, aliases: [] }); continue }
    list.forEach((r, i) => out.push({ id: r.id, stage_id: s, name: r.name?.trim() || originalName(s, locale), named: !!r.name?.trim(), position: i, aliases: r.aliases ?? [] }))
  }
  return out
}

/** Whether the Space changes anything (a name or a split); otherwise its views keep the original columns. */
export const hasOwnStages = (entries: SpaceStageEntry[]) => entries.some(e => e.named || e.position > 0)

/** The first Space stage of an original stage. */
export const firstOf = (entries: SpaceStageEntry[], stage: string) => entries.find(e => e.stage_id === stage)

/**
 * The task's Space stage: its remembered sub-stage while its original stage is
 * still the recorded one, else the first Space stage of its current stage.
 */
export function spaceStageOf(task: { id: string; status: string }, spaceId: string, entries: SpaceStageEntry[], taskRows: TaskSpaceStageRow[]): SpaceStageEntry | undefined {
  const row = taskRows.find(r => r.task_id === task.id && r.space_id === spaceId)
  if (row && row.stage_id === task.status) {
    const e = entries.find(x => x.id === row.space_stage_id && x.stage_id === task.status)
    if (e) return e
  }
  return firstOf(entries, task.status)
}

/** A typed name: a Space stage's name or alias, or an original stage's id or name (its first Space stage). */
export function matchSpaceStage(text: string, entries: SpaceStageEntry[]): SpaceStageEntry | null {
  const t = normTitle(text)
  if (!t) return null
  return entries.find(e => normTitle(e.name) === t)
    ?? entries.find(e => e.aliases.some(a => normTitle(a) === t))
    ?? (() => {
      const s = ALL_STAGES.find(id => id === t || normTitle(originalName(id, 'en')) === t || normTitle(originalName(id, 'ar')) === t)
      return s ? firstOf(entries, s) ?? null : null
    })()
}

export interface StageInput { id?: string | null; stage_id: string; name?: string | null; position?: number; aliases?: string[] | string | null }
export interface StageProblem { kind: 'missing' | 'unknown' | 'duplicate' | 'original' | 'too_many'; stage?: string; name?: string }

/** The stages as sent, cleaned: known stages, trimmed names, aliases as a list, positions 0..n per stage. */
export function cleanStages(raw: StageInput[]): { id: string | null; stage_id: StageId; name: string | null; position: number; aliases: string[] }[] {
  const out: { id: string | null; stage_id: StageId; name: string | null; position: number; aliases: string[] }[] = []
  for (const s of ALL_STAGES) {
    const list = (Array.isArray(raw) ? raw : []).filter(r => r && r.stage_id === s)
      .map((r, i) => ({ r, i })).sort((a, b) => (a.r.position ?? a.i) - (b.r.position ?? b.i)).map(x => x.r)
    list.forEach((r, i) => {
      const aliases = (Array.isArray(r.aliases) ? r.aliases : typeof r.aliases === 'string' ? r.aliases.split(',') : [])
        .map(a => (typeof a === 'string' ? clean(a) : '')).filter(Boolean)
      out.push({ id: typeof r.id === 'string' && r.id ? r.id : null, stage_id: s, name: typeof r.name === 'string' && clean(r.name) ? clean(r.name) : null, position: i, aliases: [...new Set(aliases)].slice(0, 12) })
    })
  }
  return out
}

/**
 * What's wrong with a Space's stages (data-model validation): every original
 * stage covered; names and aliases unique in the Space (ignoring case and
 * spacing); no name equal to another original stage's name; one stage per row.
 */
export function validateStages(raw: StageInput[]): StageProblem[] {
  const problems: StageProblem[] = []
  for (const r of Array.isArray(raw) ? raw : []) if (!r || !(ALL_STAGES as string[]).includes(r.stage_id)) problems.push({ kind: 'unknown', stage: r?.stage_id })
  const rows = cleanStages(raw)
  for (const s of ALL_STAGES) {
    const n = rows.filter(r => r.stage_id === s).length
    if (!n) problems.push({ kind: 'missing', stage: s })
    if (n > MAX_SPLIT) problems.push({ kind: 'too_many', stage: s })
  }
  const owner = new Map<string, string>()
  for (const r of rows) {
    const key = `${r.stage_id}#${r.position}`
    // An unnamed row shows the original name, so two unnamed rows of one stage would clash.
    const names = [r.name ?? originalName(r.stage_id), ...r.aliases]
    for (const nm of names) {
      const k = normTitle(nm)
      const before = owner.get(k)
      if (before && before !== key) problems.push({ kind: 'duplicate', stage: r.stage_id, name: nm })
      owner.set(k, key)
      const other = ALL_STAGES.find(id => id !== r.stage_id && (id === k || normTitle(originalName(id, 'en')) === k || normTitle(originalName(id, 'ar')) === k))
      if (other) problems.push({ kind: 'original', stage: r.stage_id, name: nm })
    }
  }
  return problems
}

/**
 * One-time (R8): a Space's status words as Space stages — one row per original
 * stage named by its first word (else unnamed), the other words as aliases.
 */
export function stagesFromWords(words: Record<string, string[]> | null | undefined): { stage_id: StageId; name: string | null; position: number; aliases: string[] }[] {
  return ALL_STAGES.map(s => {
    const list = (words?.[s] ?? []).map(w => (typeof w === 'string' ? clean(w) : '')).filter(Boolean)
    return { stage_id: s, name: list[0] ?? null, position: 0, aliases: [...new Set(list.slice(1))] }
  })
}
