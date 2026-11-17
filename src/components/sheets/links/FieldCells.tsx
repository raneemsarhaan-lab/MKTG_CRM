'use client'

/**
 * Task fields in a blank sheet (spec 019): how a field cell looks on a linked
 * row, and the control it opens. The looks are the Content sheet's own
 * (StagePill, PersonChip, the type pill); the choices come from the task
 * (the stages this member may move it to) and the workspace (people, types,
 * a theme's pillars). Every choice is saved as the text the board's write path
 * already reads (a stage id, a name, a label, a date), so typing and picking
 * go through the same rules and undo.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { LinkedTask, SheetTaskMap, StageId, TaskField } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { STAGE_COLORS, contentTypeColor } from '@/lib/tokens'
import { shownWord } from '@/lib/sheet-links'
import { StagePill } from '@/components/sheet/StatusCell'
import { PersonChip } from '@/components/sheet/PersonChip'
import { SheetMenu, type MenuItem } from '@/components/sheet/SheetMenu'

export interface FieldChoices {
  people: { id: string; name: string; color: string | null; avatar: string | null }[]
  types: string[]
  pillars: { id: string; name: string; projectId: string }[]
  projects: { id: string; name: string; isTheme?: boolean }[]
}

/** Fields that open a control (the rest are typed, like a team column's text). */
export const CONTROL_FIELDS = new Set<TaskField>(['stage', 'assignee', 'owner', 'type', 'pillar', 'theme', 'priority', 'due', 'link:doc', 'link:design', 'link:post', 'link:published'])
const PRIORITIES = ['High', 'Medium', 'Low'] as const
const PRIORITY_COLOR: Record<string, string> = { High: '#B42318', Medium: '#334155', Low: '#64748B' }

const boardStage = (id: string, locale: string) => {
  const m = STAGE_META[id as StageId]
  return m ? (locale.startsWith('ar') ? m.label_ar : m.label_en) : id
}
/** A link's label: the site's name ("Google Docs", "Canva"), as on the Content sheet. */
export function siteName(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '')
    if (h === 'docs.google.com') return 'Google Docs'
    if (h === 'drive.google.com') return 'Google Drive'
    if (h.endsWith('canva.com')) return 'Canva'
    if (h.endsWith('figma.com')) return 'Figma'
    return h
  } catch { return url.replace(/^https?:\/\//, '').slice(0, 40) }
}

/** What a field cell shows on a linked row. */
export function FieldValue({ field, raw, map, people }: { field: TaskField; raw: string; map: SheetTaskMap; people: FieldChoices['people'] }) {
  const locale = useLocale()
  const t = useTranslations('sheets.fields')
  switch (field) {
    case 'stage':
      return raw ? <StagePill stage={raw as StageId} name={shownWord(raw, map.words?.stage, map.show, boardStage(raw, locale))} chevron /> : null
    case 'assignee': case 'owner': {
      const p = raw ? people.find(x => x.name === raw) : undefined
      return <PersonChip member={raw ? { name: raw, avatar_url: p?.avatar ?? undefined } : undefined} empty={t('unassigned')} />
    }
    case 'type':
      return raw ? <span className="fx-content-type" style={{ background: contentTypeColor(raw) }}>{shownWord(raw, map.words?.type, map.show, raw)}</span> : null
    case 'pillar': case 'theme':
      return raw ? <span className="fx-fd-chip">{raw}</span> : null
    case 'priority':
      return raw ? <span className="fx-fd-prio" style={{ color: PRIORITY_COLOR[raw] }}>⚑ {shownWord(raw, map.words?.priority, map.show, raw)}</span> : null
    case 'due': {
      if (!raw) return null
      const d = new Date(`${raw}T00:00`)
      const late = raw < new Date().toISOString().slice(0, 10)
      return <span className={`fx-fd-due${late ? ' is-late' : ''}`}>{Number.isNaN(+d) ? raw : d.toLocaleDateString(locale.startsWith('ar') ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short' })}</span>
    }
    default:
      if (field.startsWith('link:')) {
        return raw
          ? <a className="fx-sheet-link fx-sheet-ellipsis" href={raw} target="_blank" rel="noopener noreferrer" tabIndex={-1} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>{siteName(raw)}</a>
          : <span className="fx-fd-add">{t('addLink')}</span>
      }
      return <span className="fx-sheet-cell-text" dir="auto">{raw}</span>
  }
}

/** The control a field cell opens. `onPick` gets the text the board's write path reads. */
export function FieldEditor({ field, task, anchor, choices, map, onPick, onClose }: {
  field: TaskField
  task: LinkedTask
  anchor: HTMLElement
  choices: FieldChoices
  map: SheetTaskMap
  onPick(value: string): void
  onClose(restore: boolean): void
}) {
  const t = useTranslations('sheets.fields')
  const locale = useLocale()
  const raw = task.values[field] ?? ''
  const pick = (v: string) => { onClose(true); onPick(v) }
  if (field === 'due' || field.startsWith('link:')) return <InputPop field={field} value={raw} anchor={anchor} onSave={pick} onClose={onClose} />
  let items: MenuItem[] = []
  let label = t(`names.${field}`)
  if (field === 'stage') {
    const moves = task.moves ?? []
    const name = (id: string) => shownWord(id, map.words?.stage, map.show, boardStage(id, locale))
    items = [
      { key: raw, text: name(raw), label: <><StagePill stage={raw as StageId} name={name(raw)} /> <span className="fx-fd-now">{t('now')}</span></>, tone: 'next', onSelect: () => onClose(true) },
      ...moves.map(id => ({ key: id, text: name(id), dot: STAGE_COLORS[id], label: <StagePill stage={id as StageId} name={name(id)} />, onSelect: () => pick(id) })),
    ]
    if (!moves.length) items.push({ key: 'why', text: t('noMoves'), label: <span className="fx-fd-why">{t('noMoves')}</span>, onSelect: () => onClose(true) })
    label = t('names.stage')
  } else if (field === 'assignee' || field === 'owner') {
    items = choices.people.map(p => ({ key: p.id, text: p.name, label: <PersonChip member={{ name: p.name, avatar_url: p.avatar ?? undefined }} />, tone: p.name === raw ? 'next' as const : undefined, onSelect: () => pick(p.name) }))
    if (field === 'assignee') items.push({ key: '', text: t('unassigned'), label: <PersonChip member={undefined} empty={t('unassigned')} />, onSelect: () => pick('') })
  } else if (field === 'type') {
    items = choices.types.map(x => ({ key: x, text: x, label: <span className="fx-content-type" style={{ background: contentTypeColor(x) }}>{shownWord(x, map.words?.type, map.show, x)}</span>, tone: x === raw ? 'next' as const : undefined, onSelect: () => pick(x) }))
  } else if (field === 'priority') {
    items = PRIORITIES.map(x => ({ key: x, text: x, label: <span className="fx-fd-prio" style={{ color: PRIORITY_COLOR[x] }}>⚑ {shownWord(x, map.words?.priority, map.show, x)}</span>, tone: x === raw ? 'next' as const : undefined, onSelect: () => pick(x) }))
  } else if (field === 'theme') {
    items = choices.projects.filter(p => p.isTheme !== false).map(p => ({ key: p.id, text: p.name, label: <span className="fx-fd-chip">{p.name}</span>, tone: p.name === raw ? 'next' as const : undefined, onSelect: () => pick(p.name) }))
  } else if (field === 'pillar') {
    const theme = choices.projects.find(p => p.name === task.meta?.theme)
    items = choices.pillars.filter(p => p.projectId === theme?.id).map(p => ({ key: p.id, text: p.name, label: <span className="fx-fd-chip">{p.name}</span>, tone: p.name === raw ? 'next' as const : undefined, onSelect: () => pick(p.name) }))
    items.push({ key: '', text: t('noPillar'), label: <span className="fx-sheet-muted">{t('noPillar')}</span>, onSelect: () => pick('') })
  }
  return <SheetMenu anchor={anchor} label={label} items={items} onClose={onClose} />
}

/** A date or a link: a small box under the cell. */
function InputPop({ field, value, anchor, onSave, onClose }: { field: TaskField; value: string; anchor: HTMLElement; onSave(v: string): void; onClose(restore: boolean): void }) {
  const t = useTranslations('sheets.fields')
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(value)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect(), el = ref.current
    if (!el) return
    const w = el.offsetWidth, rtl = getComputedStyle(anchor).direction === 'rtl'
    setPos({ left: Math.max(8, Math.min(rtl ? r.right - w : r.left, window.innerWidth - w - 8)), top: Math.min(r.bottom + 4, window.innerHeight - el.offsetHeight - 8) })
  }, [anchor])
  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(false) }
    document.addEventListener('pointerdown', down, true)
    return () => document.removeEventListener('pointerdown', down, true)
  }, [onClose])
  const date = field === 'due'
  return (
    <div ref={ref} className="fx-fd-pop" role="dialog" aria-label={t(`names.${field}`)} data-field-pop={field} style={pos ? pos : { left: -9999, top: -9999 }}
         onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(true) } }}>
      <input autoFocus type={date ? 'date' : 'url'} value={v} placeholder={date ? '' : t('pasteLink')} aria-label={t(`names.${field}`)}
             onChange={e => setV(e.target.value)}
             onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSave(v.trim()) } }} />
      <div className="fx-fd-pop-row">
        {value && !date && <a href={value} target="_blank" rel="noopener noreferrer" className="fx-fd-open">{t('openLink')} ↗</a>}
        {value && <button type="button" onClick={() => onSave('')}>{t('clear')}</button>}
        <button type="button" className="is-go" onClick={() => onSave(v.trim())}>{t('save')}</button>
      </div>
    </div>
  )
}

/** A field heading's icon. */
export function FieldIcon({ field }: { field: TaskField | 'task' | 'regular' }): ReactNode {
  const ch = field === 'task' ? '✓' : field === 'regular' ? 'A' : field === 'stage' ? '◐' : field === 'assignee' || field === 'owner' ? '◉' : field === 'due' ? '▦' : field === 'priority' ? '⚑' : field === 'type' ? '▣' : field === 'theme' ? '◆' : field === 'pillar' ? '◇' : field === 'platform' ? '◎' : field === 'title' ? 'T' : field.startsWith('link:') ? '↗' : '✎'
  return <span className={`fx-fd-ic${field === 'regular' ? ' is-reg' : ''}`} aria-hidden="true">{ch}</span>
}
