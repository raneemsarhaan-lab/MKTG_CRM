'use client'

/**
 * Link task (spec 021, design/spaces-stage-c.html §4): the task list a Task
 * link cell opens, already searching for what was typed. Pick a task to link
 * it, or "Create new task" at the bottom: choose its Space, and it gets that
 * Space's stages (simple in Planning, the pipeline in Content or Video).
 *
 * Esc closes it; nothing is linked or created unless you choose.
 */
import { useMemo, useRef, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { Member, TeamSpace } from '@/types/index'
import { EIGHT_STAGE, NINE_STAGE, STAGE_META } from '@/lib/stage-meta'
import { SIMPLE_KEYS } from '@/lib/space-words'
import { normTitle } from '@/lib/sheet-links'

export interface PickTask {
  id: string
  name: string
  brand_id?: string | null
  brand?: { name: string } | null
  status: string
  kind?: string | null
  simple_status?: string | null
  dropped_at?: string | null
}

/** What a Task link needs from the page it's on. */
export interface TaskLinkCtx {
  tasks: PickTask[]
  spaces: TeamSpace[]
  brands: { id: string; name: string; nine_stage_default?: boolean | null }[]
  me: Member
  /** The Space a new task starts in: the one you're in, else your own. */
  defaultSpaceId?: string | null
  /** The workspace's C-Check default, for the stage line. */
  workspaceNineStage?: boolean
  openTask(id: string): void
  /** Makes a task (the page passes `createTask`, so this file stays free of server code). */
  create?(input: { name: string; brand_id: string; content_type_label: string; task_owner_id: string; assignee_id: string; due_date: string | null; space_id: string | null }): Promise<{ success: boolean; id?: string; error?: string }>
  /** A new task made here: the page refreshes its data. */
  onCreated?(id: string): void
}

const MAX_HITS = 30

export function LinkTaskPicker({ ctx, typed, current, exclude, brandId, due, onPick, onClose }: {
  ctx: TaskLinkCtx
  /** What was typed in the cell: the search, and a new task's name. */
  typed: string
  current?: string | null
  /** The task this field belongs to: it can't link to itself. */
  exclude?: string | null
  /** A new task's brand: the row's, else the first. */
  brandId?: string | null
  /** A new task's due date (calendar days). */
  due?: string | null
  onPick(id: string, name: string): void
  onClose(): void
}) {
  const t = useTranslations('sheet.columns.taskLink')
  const ts = useTranslations('taskSheet')
  const locale = useLocale()
  const [q, setQ] = useState(typed)
  const [hi, setHi] = useState(0)
  const [creating, setCreating] = useState(false)
  const [space, setSpace] = useState<string>(() => ctx.defaultSpaceId ?? mySpace(ctx) ?? ctx.spaces[0]?.id ?? '')
  const [brand, setBrand] = useState<string>(brandId ?? ctx.brands[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const hits = useMemo(() => {
    const words = normTitle(q).split(' ').filter(Boolean)
    const live = ctx.tasks.filter(x => !x.dropped_at && x.id !== exclude)
    const found = !words.length ? live : live.filter(x => {
      const n = normTitle(x.name)
      return words.every(w => n.includes(w))
    })
    // Starts-with first, then the rest; the current link stays on top.
    const starts = (x: PickTask) => (words.length && normTitle(x.name).startsWith(words[0]) ? 0 : 1)
    return [...found].sort((a, b) => Number(b.id === current) - Number(a.id === current) || starts(a) - starts(b) || a.name.localeCompare(b.name)).slice(0, MAX_HITS)
  }, [ctx.tasks, q, exclude, current])

  const sp = ctx.spaces.find(x => x.id === space)
  // Made here, it is linked at once, so it is a pipeline task whichever Space it shows in (user, 2026-11-23).
  const simple = false
  const name = (q || typed).trim()
  const stageLine = (() => {
    if (!sp) return ''
    const word = (k: string, board: string) => sp.words?.[k]?.[0] ?? board
    if (simple) return SIMPLE_KEYS.map(k => word(k, ts(`simple.${k}`))).join(' › ')
    const b = ctx.brands.find(x => x.id === brand)
    const nine = b?.nine_stage_default ?? ctx.workspaceNineStage ?? false
    return (nine ? NINE_STAGE : EIGHT_STAGE).map(k => word(k, locale === 'ar' ? STAGE_META[k].label_ar : STAGE_META[k].label_en)).join(' › ')
  })()

  const stageOf = (x: PickTask) => {
    if (x.kind === 'simple') return ts(`simple.${(x.simple_status ?? 's-todo') as 's-todo'}`)
    const m = STAGE_META[x.status as keyof typeof STAGE_META]
    return m ? (locale === 'ar' ? m.label_ar : m.label_en) : x.status
  }

  const rows = hits.length + (ctx.create ? 1 : 0) || 1 // the tasks, then Create new task
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (creating) setCreating(false); else onClose(); return }
    if (creating) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = (hi + (e.key === 'ArrowDown' ? 1 : -1) + rows) % rows
      setHi(n)
      listRef.current?.querySelector<HTMLElement>(`[data-pick-index="${n}"]`)?.scrollIntoView({ block: 'nearest' })
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (hi < hits.length) onPick(hits[hi].id, hits[hi].name)
      else if (ctx.create) setCreating(true)
    }
  }

  async function make() {
    if (!name || busy) return
    setBusy(true); setError(null)
    if (!ctx.create) return
    const r = await ctx.create({
      name, brand_id: brand, content_type_label: '', task_owner_id: ctx.me.id, assignee_id: ctx.me.id,
      due_date: due ?? null, space_id: space || null,
    }).catch(() => ({ success: false as const, error: 'generic' }))
    setBusy(false)
    if (!r.success || !r.id) { setError(t('failed', { reason: r.error ?? 'generic' })); return }
    ctx.onCreated?.(r.id)
    onPick(r.id, name)
  }

  return (
    <div className="fx-linkpick" role="dialog" aria-label={t('linkTask')} data-link-picker="" onKeyDown={onKey}>
      <input value={q} aria-label={t('search')} placeholder={t('search')} autoComplete="off" data-link-search=""
             role="combobox" aria-expanded="true" aria-controls="fx-linkpick-list"
             aria-activedescendant={!creating ? `fx-linkpick-${hi}` : undefined}
             onChange={e => { setQ(e.target.value); setHi(0) }} />
      <div className="fx-linkpick-list" id="fx-linkpick-list" role="listbox" ref={listRef}>
        {hits.map((x, i) => (
          <button key={x.id} type="button" role="option" id={`fx-linkpick-${i}`} aria-selected={hi === i} data-pick-index={i}
                  data-pick-task={x.id} className={`fx-linkpick-opt${hi === i ? ' is-hi' : ''}${x.id === current ? ' is-current' : ''}`}
                  onMouseEnter={() => setHi(i)} onClick={() => onPick(x.id, x.name)}>
            <span className="fx-linkpick-name">
              <span className="fx-sheet-ellipsis">{x.name}</span>
              <small>{[x.brand?.name ?? t('noBrand'), stageOf(x)].join(' · ')}</small>
            </span>
            <span className={`fx-linkpick-kind${x.kind === 'simple' ? '' : ' is-pipe'}`}>{x.kind === 'simple' ? t('simple') : t('pipeline')}</span>
          </button>
        ))}
        {!hits.length && <p className="fx-linkpick-none">{t('noMatch', { q })}</p>}
        {ctx.create && <button type="button" role="option" id={`fx-linkpick-${hits.length}`} aria-selected={hi === hits.length} data-pick-index={hits.length}
                data-link-create="" className={`fx-linkpick-opt is-create${hi === hits.length ? ' is-hi' : ''}`}
                onMouseEnter={() => setHi(hits.length)} onClick={() => setCreating(true)}>
          <span>＋ {name ? t('create', { name }) : t('createEmpty')}</span>
        </button>}
      </div>
      {creating && (
        <div className="fx-linkpick-new" data-link-new="">
          <span className="fx-linkpick-label">{t('space')}</span>
          <div className="fx-linkpick-seg" role="radiogroup" aria-label={t('space')}>
            {ctx.spaces.map(s => (
              <button key={s.id} type="button" role="radio" aria-checked={space === s.id} data-link-space={s.key} onClick={() => setSpace(s.id)}>{s.name}</button>
            ))}
          </div>
          {sp && (
            <p className="fx-linkpick-gets" data-link-gets={simple ? 'simple' : 'pipeline'}>
              <span>{t(simple ? 'getsSimple' : 'getsPipeline', { space: sp.name })}</span>
              <span className="fx-sheet-muted">{stageLine}</span>
            </p>
          )}
          <div className="fx-linkpick-row">
            <label>
              <span className="fx-linkpick-label">{t('brand')}</span>
              <select value={brand} onChange={e => setBrand(e.target.value)} data-link-brand="">
                {ctx.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <span>
              <span className="fx-linkpick-label">{t('assignee')}</span>
              <span>{t('me', { name: ctx.me.name })}</span>
            </span>
            {due && (
              <span>
                <span className="fx-linkpick-label">{t('due')}</span>
                <span>{new Date(`${due}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </span>
            )}
          </div>
          {error && <p role="alert" className="fx-linkpick-err">{error}</p>}
          <div className="fx-linkpick-actions">
            <button type="button" className="fx-sheet-btn" onClick={() => setCreating(false)}>{t('cancel')}</button>
            <button type="button" className="fx-sheet-btn is-go" data-link-make="" disabled={!name || !brand || busy} onClick={() => void make()}>{busy ? t('making') : t('make')}</button>
          </div>
        </div>
      )}
      <p className="fx-linkpick-hint">{t('hint')}</p>
    </div>
  )
}

/** The first Space you're a member of, for a new task. */
function mySpace(ctx: TaskLinkCtx): string | null {
  const mine = ctx.spaces.find(s => (s as TeamSpace & { member_ids?: string[] }).member_ids?.includes(ctx.me.id))
  return mine?.id ?? null
}
