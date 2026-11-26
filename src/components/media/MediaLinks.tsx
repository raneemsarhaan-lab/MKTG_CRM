'use client'

/**
 * Link task on the content side (spec 022 US3, R19, design/task-methodology.html §3b).
 *
 *   - MediaChips: a content task's linked media tasks — "Design · D-In Progress",
 *     name opens it, ⇄ changes the link, × unlinks at once (Undo).
 *   - MediaLinkPicker: the list Link task opens — unlinked Design and Video
 *     tasks searched by what was typed, then Create task (Design, Video, both).
 *   - useMediaLinks: the cell behaviour for any sheet or calendar.
 */
import { createContext, useContext, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { MediaBoard } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { createMediaTask, linkFromCalendar, linkToMedia, relinkMedia, unlinkMedia } from '@/actions/media'
import { Modal } from '@/components/sheets/Dialogs'
import { SheetPopover } from '@/components/sheet/SheetMenu'

export interface MediaTaskLike {
  id: string
  name: string
  status: string
  media_board?: MediaBoard | null
  content_task_id?: string | null
  dropped_at?: string | null
  assignee_id?: string | null
  brand?: { name: string } | null
}

const BOARD_COLOR: Record<MediaBoard, string> = { design: '#8F6FE8', video: '#1E9E8A' }
const AFTER_D_CHECK = ['final-check', 'ready-publish', 'scheduled', 'publish']

export function useStageLabel() {
  const locale = useLocale()
  return (s: string) => { const m = STAGE_META[s as keyof typeof STAGE_META]; return m ? (locale === 'ar' ? m.label_ar : m.label_en) : s }
}

/** A content task's linked media tasks as chips with ⇄ and ×. */
export function MediaChips({ media, onOpen, onChange, onUnlink, compact = false }: {
  media: MediaTaskLike[]
  onOpen(id: string): void
  onChange?(m: MediaTaskLike, anchor: HTMLElement): void
  onUnlink?(m: MediaTaskLike): void
  compact?: boolean
}) {
  const t = useTranslations('media')
  const stage = useStageLabel()
  if (!media.length) return null
  // User, 2026-11-23: each linked task as its name (a link that opens it), then its board —
  // "Carousel – Q4 results · Design" — with ⇄ and ×. One per board. Its stage is in Status
  // (and on hover), so the cell doesn't repeat it.
  return (
    <span className="fx-tasklink" data-media-links="" style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, minWidth: 0, width: '100%', overflow: 'hidden' }}>
      {media.map(m => {
        const color = BOARD_COLOR[m.media_board ?? 'design']
        return (
          <span key={m.id} data-media-chip={m.media_board ?? ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, minWidth: 0, flex: '0 1 auto', overflow: 'hidden' }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: color, flex: 'none' }} />
            <a href={`?task=${m.id}`} tabIndex={-1} data-media-open={m.id} title={m.name}
               onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); e.stopPropagation(); onOpen(m.id) }}
               style={{ flex: '0 1 auto', minWidth: 28, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fx-link, #2F5BD3)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}>
              {m.name}
            </a>
            {!compact && (
              <span data-media-where="" title={`${t(m.media_board ?? 'design')} · ${stage(m.status)}`}
                    style={{ flex: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color, fontWeight: 600, fontSize: '0.92em' }}>
                · {t(m.media_board ?? 'design')}
              </span>
            )}
            {onChange && <button type="button" tabIndex={-1} className="fx-tasklink-ib" data-media-change="" aria-label={t('change')} title={t('change')} style={{ flex: 'none' }} onClick={e => { e.stopPropagation(); onChange(m, (e.currentTarget.closest('[data-cell]') as HTMLElement | null) ?? e.currentTarget) }}>⇄</button>}
            {onUnlink && <button type="button" tabIndex={-1} className="fx-tasklink-ib" data-media-unlink="" aria-label={t('unlink')} title={t('unlink')} style={{ flex: 'none' }} onClick={e => { e.stopPropagation(); onUnlink(m) }}>×</button>}
          </span>
        )
      })}
    </span>
  )
}

export function MediaLinkPicker({ typed, options, onPick, onCreate, onClose }: {
  typed: string
  options: MediaTaskLike[]
  onPick(id: string, typed: string): void
  onCreate(boards: MediaBoard[], name: string): void
  onClose(): void
}) {
  const t = useTranslations('media')
  const stage = useStageLabel()
  const [q, setQ] = useState(typed)
  const [hi, setHi] = useState(0)
  const [boards, setBoards] = useState<'design' | 'video' | 'both'>('design')
  void options; void onPick; void stage
  const hits: MediaTaskLike[] = []
  const name = q.trim()
  const rows = hits.length + 1
  const create = () => onCreate(boards === 'both' ? ['design', 'video'] : [boards], name)
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h + (e.key === 'ArrowDown' ? 1 : -1) + rows) % rows); return }
    if (e.key === 'Enter') { e.preventDefault(); if (hi < hits.length) onPick(hits[hi].id, name); else create() }
  }
  return (
    <div className="fx-linkpick" role="dialog" aria-label={t('linkTask')} data-media-pick="" onKeyDown={onKey}>
      <input value={q} aria-label={t('search')} placeholder={t('search')} autoComplete="off" data-media-search=""
             onChange={e => { setQ(e.target.value); setHi(0) }} />
      {/* QA 26 Nov 2026 (F21, owner): no list of separate Design/Video tasks to link — the task itself goes on the boards. */}
      <div>
        <div className={`fx-linkpick-opt is-create${hi === hits.length ? ' is-hi' : ''}`} data-media-create="" onMouseEnter={() => setHi(hits.length)}>
          <button type="button" style={{ border: 'none', background: 'none', font: 'inherit', fontWeight: 700, cursor: 'pointer', padding: 0, textAlign: 'start' }} onClick={create}>
            ＋ {name ? t('createNamed', { name }) : t('create')}
          </button>
          <span className="fx-linkpick-seg" role="radiogroup" aria-label={t('boards')} data-media-board="">
            {(['design', 'video', 'both'] as const).map(b => (
              <button key={b} type="button" role="radio" aria-checked={boards === b} data-media-board-choice={b} onClick={() => setBoards(b)}>{t(b)}</button>
            ))}
          </span>
        </div>
      </div>
      <p className="fx-linkpick-hint">{t('hint')}</p>
    </div>
  )
}

/**
 * The Link task cell for a content task, in any sheet or calendar: chips,
 * typing (or Enter) opens the list, ⇄ swaps a link, × unlinks with Undo.
 */
export function useMediaLinks({ tasks, onOpenTask, say }: {
  tasks: MediaTaskLike[]
  onOpenTask(id: string): void
  say(text: string, undo?: () => void): void
}) {
  const t = useTranslations('media')
  const router = useRouter()
  const [pick, setPick] = useState<{ taskId: string; anchor: HTMLElement; typed: string; replacing?: MediaTaskLike } | null>(null)
  const busy = useRef(false)
  const linkedOf = (id: string) => tasks.filter(x => x.content_task_id === id && !!x.media_board && !x.dropped_at)
  const unlinked = tasks.filter(x => !!x.media_board && !x.content_task_id && !x.dropped_at)
  const why = (e: string) => (['one_task', 'past_d_check', 'already_linked', 'not_found', 'no_board', 'not_authorized'].includes(e) ? t(`err.${e}` as 'err.past_d_check') : t('err.generic'))

  async function run<T extends { success: boolean; error?: string }>(p: Promise<T>): Promise<T | null> {
    if (busy.current) return null
    busy.current = true
    try {
      const r = await p.catch(() => ({ success: false, error: 'generic' }) as unknown as T)
      if (!r.success) { say(why(r.error ?? 'generic')); return null }
      router.refresh()
      return r
    } finally { busy.current = false }
  }

  async function unlink(m: MediaTaskLike) {
    const r = await run(unlinkMedia(m.id))
    if (r && r.success) say(t('unlinked', { name: m.name }), () => void run(relinkMedia(m.id, r.contentTaskId)))
  }

  const canLink = (task: { status: string; media_board?: string | null }) => !task.media_board && !AFTER_D_CHECK.includes(task.status)

  return {
    linkedOf,
    canLink,
    render: (task: MediaTaskLike) => (
      <MediaChips media={linkedOf(task.id)} onOpen={onOpenTask} compact={false}
        onChange={canLink(task) ? (m, anchor) => setPick({ taskId: task.id, anchor, typed: '', replacing: m }) : undefined}
        onUnlink={m => void unlink(m)} />
    ),
    open: (task: MediaTaskLike, anchor: HTMLElement, typed = '') => {
      if (!canLink(task)) { say(t('err.past_d_check')); return }
      setPick({ taskId: task.id, anchor, typed })
    },
    text: (task: MediaTaskLike) => linkedOf(task.id).map(m => `${t(m.media_board ?? 'design')}: ${m.name}`).join(', '),
    layer: pick ? (
      <SheetPopover anchor={pick.anchor} label={t('linkTask')} onClose={() => setPick(null)}>
        <MediaLinkPicker typed={pick.typed} options={unlinked} onClose={() => setPick(null)}
          onPick={async id => {
            const p = pick; setPick(null)
            if (p.replacing) await run(unlinkMedia(p.replacing.id))
            const r = await run(linkToMedia(p.taskId, { mediaTaskId: id }))
            if (r) say(t('linked', { name: unlinked.find(x => x.id === id)?.name ?? '' }), () => void run(unlinkMedia(id)))
          }}
          onCreate={async (boards, name) => {
            const p = pick; setPick(null)
            const r = await run(linkToMedia(p.taskId, { create: { boards, name } }))
            if (r) say(t('created'))
          }} />
      </SheetPopover>
    ) : null,
  }
}

/** A media board's Create task (spec 022 FR-004): an unlinked media task at Ready For Design. */
export function MediaCreateButton({ board, boardName, brands, label, split = false }: { board: MediaBoard; boardName: string; brands: { id: string; name: string }[]; /** Spec 024: the Space's own text for the button. */ label?: string
  /** The simple sheet header's "+ Post ▾": the left half of the split button. */
  split?: boolean }) {
  const t = useTranslations('media')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [brand, setBrand] = useState(brands[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function go() {
    if (!name.trim() || busy) return
    setBusy(true); setError(null)
    const r = await createMediaTask(board, { name, brand_id: brand || null }).catch(() => ({ success: false as const, error: 'generic' }))
    setBusy(false)
    if (!r.success) { setError(t('err.generic')); return }
    setOpen(false); setName(''); router.refresh()
  }
  return (
    <>
      <button type="button" data-media-create-open="" onClick={() => setOpen(true)} className={split ? 'fx-sheetbar-addmain' : undefined}
              style={split ? undefined : { border: 'none', background: '#14131A', color: '#FFFFFF', borderRadius: 9, padding: '6px 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        ＋ {label ?? t('createOnBoard')}
      </button>
      {open && (
        <Modal title={t('createTitle', { board: boardName })} body={t('createBody')} onCancel={() => setOpen(false)} attr="data-media-create-dialog">
          <label style={{ display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 600 }}>
            {t('createName')}
            <input data-media-create-name="" value={name} autoFocus onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void go() }}
                   style={{ border: '1px solid #E1E1E0', borderRadius: 8, padding: '7px 9px', fontFamily: 'inherit', fontSize: 13.5 }} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 600 }}>
            {t('brand')}
            <select value={brand} onChange={e => setBrand(e.target.value)} style={{ border: '1px solid #E1E1E0', borderRadius: 8, padding: '7px 9px', fontFamily: 'inherit', fontSize: 13.5 }}>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          {error && <p role="alert" style={{ margin: 0, color: '#C2353A', fontSize: 12.5, fontWeight: 600 }}>{error}</p>}
          <div className="fx-sh-dialog-row">
            <button type="button" onClick={() => setOpen(false)}>{t('cancel')}</button>
            <button type="button" className="is-go" data-media-create-go="" disabled={!name.trim() || busy} onClick={() => void go()}>{t('createGo')}</button>
          </div>
        </Modal>
      )}
    </>
  )
}

/**
 * The task panel's Media row (design §4): a content task's media tasks with
 * ⇄, × and "＋ Link task"; a linked media task shows its content task and Unlink.
 */
export function MediaPanelSection({ task, tasks, onOpenTask }: {
  task: MediaTaskLike & { status: string }
  tasks: MediaTaskLike[]
  onOpenTask(id: string): void
}) {
  const t = useTranslations('media')
  const [note, setNote] = useState<{ text: string; undo?: () => void } | null>(null)
  const ml = useMediaLinks({ tasks, onOpenTask, say: (text, undo) => setNote({ text, undo }) })
  const content = task.content_task_id ? tasks.find(x => x.id === task.content_task_id) : null
  const media = task.media_board ? [] : ml.linkedOf(task.id)
  if (task.media_board && !content) return null
  if (!task.media_board && !media.length && !ml.canLink(task)) return null
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 30, fontSize: 14, flexWrap: 'wrap' }
  return (
    <div data-media-section="" style={{ display: 'grid', gap: 6, margin: '6px 0' }}>
      {content ? (
        <div style={row}>
          <span style={{ width: 130, flex: 'none', color: '#6B7280', fontSize: 13 }}>{t('contentTask')}</span>
          <button type="button" className="fx-tasklink-name" data-media-content={content.id} onClick={() => onOpenTask(content.id)}><span>↗ {content.name}</span></button>
          <button type="button" className="fx-tasklink-ib" data-media-unlink="" aria-label={t('unlink')} title={t('unlink')}
                  style={{ width: 'auto', padding: '0 6px', opacity: .8 }}
                  onClick={async () => {
                    const r = await unlinkMedia(task.id).catch(() => null)
                    if (r?.success) setNote({ text: t('unlinked', { name: content.name }), undo: () => void relinkMedia(task.id, r.contentTaskId) })
                    else setNote({ text: r && !r.success && r.error === 'not_authorized' ? t('err.not_authorized') : t('err.generic') })
                  }}>× {t('unlink')}</button>
        </div>
      ) : (
        <div style={row}>
          <span style={{ width: 130, flex: 'none', color: '#6B7280', fontSize: 13 }}>{t('mediaRow')}</span>
          {ml.render(task)}
          {ml.canLink(task) && (
            <button type="button" className="fx-tasklink-ib" data-media-link="" style={{ width: 'auto', padding: '0 6px', opacity: .8 }}
                    onClick={e => ml.open(task, e.currentTarget)}>＋ {t('linkTask')}</button>
          )}
        </div>
      )}
      {note && (
        <p role="status" style={{ margin: 0, fontSize: 12.5, color: '#6B7280', display: 'flex', gap: 8, alignItems: 'center' }}>
          {note.text}
          {note.undo && <button type="button" className="fx-sheet-btn" data-media-undo="" onClick={() => { const u = note.undo; setNote(null); u?.() }}>{t('undo')}</button>}
        </p>
      )}
      {ml.layer}
    </div>
  )
}


/** Board cards' view of media links, provided by the board (spec 022 design §3–4). */
export interface MediaIndex { byContent: Map<string, { board: MediaBoard; status: string }[]>; names: Map<string, string> }
export const MediaIndexContext = createContext<MediaIndex>({ byContent: new Map(), names: new Map() })

export function buildMediaIndex(tasks: MediaTaskLike[]): MediaIndex {
  const byContent = new Map<string, { board: MediaBoard; status: string }[]>()
  const names = new Map<string, string>()
  for (const x of tasks) {
    names.set(x.id, x.name)
    if (x.media_board && x.content_task_id && !x.dropped_at) {
      const list = byContent.get(x.content_task_id) ?? []
      list.push({ board: x.media_board, status: x.status })
      byContent.set(x.content_task_id, list)
    }
  }
  return { byContent, names }
}

/** On a card: a content task's media chips, or a media task's link to its content (or "Unlinked"). */
export function CardMedia({ task }: { task: MediaTaskLike }) {
  const t = useTranslations('media')
  const stage = useStageLabel()
  const idx = useContext(MediaIndexContext)
  const chip = (key: string, color: string, text: string, attrs: Record<string, string>) => (
    <span key={key} {...attrs} style={{ display: 'inline-flex', alignItems: 'center', maxWidth: 190, height: 22, padding: '0 8px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
    </span>
  )
  if (task.media_board) {
    // QA 26 Nov 2026 (F03, F21): a Design or Video task on its own is just a task, so no "Unlinked" tag.
    if (!task.content_task_id) return null
    const passed = AFTER_D_CHECK.includes(task.status)
    return chip('c', '#3E7BEA', passed ? t('withContent') : t('linkedTo', { name: idx.names.get(task.content_task_id) ?? '' }), { 'data-media-linked': task.content_task_id })
  }
  const list = idx.byContent.get(task.id) ?? []
  return <>{list.map((m, i) => chip(`${m.board}${i}`, BOARD_COLOR[m.board], `${t(m.board)} · ${stage(m.status)}`, { 'data-media-chip': m.board }))}</>
}

/**
 * Link task on a calendar day (spec 022 R19, design §3b): what's typed names the
 * content task and searches the unlinked Design and Video tasks. Picking one makes
 * the content task on that day (its publishing date) and links it; Create task
 * makes it with new linked media tasks.
 */
export function useCalendarLink({ spaceId, media, say }: {
  spaceId: string | null
  media: MediaTaskLike[]
  say(text: string): void
}) {
  const t = useTranslations('media')
  const router = useRouter()
  const [pick, setPick] = useState<{ day: string; anchor: HTMLElement; typed: string } | null>(null)
  const busy = useRef(false)
  const unlinked = media.filter(x => !!x.media_board && !x.content_task_id && !x.dropped_at)
  async function make(day: string, name: string, target: Parameters<typeof linkFromCalendar>[3]) {
    if (!name.trim()) { say(t('calNeedName')); return }
    if (busy.current) return
    busy.current = true
    try {
      const r = await linkFromCalendar(spaceId, day, name, target).catch(() => ({ success: false as const, error: 'generic' }))
      if (!r.success) { say(['past_d_check', 'already_linked', 'not_found', 'no_board'].includes(r.error) ? t(`err.${r.error}` as 'err.past_d_check') : t('err.generic')); return }
      router.refresh()
      say(t('calMade', { name: name.trim() }))
    } finally { busy.current = false }
  }
  return {
    open: (day: string, anchor: HTMLElement, typed = '') => setPick({ day, anchor, typed }),
    layer: pick ? (
      <SheetPopover anchor={pick.anchor} label={t('linkTask')} onClose={() => setPick(null)}>
        <MediaLinkPicker typed={pick.typed} options={unlinked} onClose={() => setPick(null)}
          onPick={(id, typed) => { const p = pick; setPick(null); void make(p.day, typed || unlinked.find(x => x.id === id)?.name || '', { mediaTaskId: id }) }}
          onCreate={(boards, name) => { const p = pick; setPick(null); void make(p.day, name, { create: { boards } }) }} />
      </SheetPopover>
    ) : null,
  }
}
