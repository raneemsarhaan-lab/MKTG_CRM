'use client'

/**
 * The column layer both sheets share (spec 010). Given the sheet's records,
 * values and the host's ColumnsApi, it works out the columns to show
 * (applyLayout), and owns everything about shaping them:
 *
 *   · the header menu (▾, or Alt+↓ from a cell): rename, reset, insert, move, hide, edit, delete
 *   · drag to reorder and edge resize (through GridCore's hooks)
 *   · the Columns panel (the keyboard path, with "Changed by …", FR-004)
 *   · the column editor, the delete confirmation and its 10 s Undo
 *   · custom cells: display, editing, the kind's checks (FR-022, FR-023)
 *   · the type-ahead box for the Type cell and Choice cells, with add-if-missing
 *
 * A sheet passes its built-in default names and plugs the returned pieces
 * into its grid model, toolbar and popups.
 */
import { TypePill, useTypeLook } from '@/components/types/TypePill'
import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { ColumnKind, Member, SheetId, Task } from '@/types/index'
import {
  MAX_CUSTOM_COLUMNS, setsFor, applyLayout, applyPersonal, builtInOf, checkName, defaultShownIn, formatValue, isCustomKey, isFieldKey, normName, sheetLocale, type FieldColumn, type LaidColumn, type PasteValueColumn, type PersonalLayout,
} from '@/lib/sheet-columns'
import { contentTypeColor } from '@/lib/tokens'
import { siteName } from '@/lib/content-plan'
import { LinkTaskPicker, type TaskLinkCtx } from './LinkTaskPicker'
import { SheetMenu, SheetPopover, type MenuItem } from './SheetMenu'
import { SheetCombo, type ComboItem } from './SheetCombo'
import { ColumnEditor } from './ColumnEditor'
import { LinkPrompt } from './PublishedCell'
import { PersonChip } from './PersonChip'
import { editorOrder } from './EditorCell'
import type { ColumnsBundle } from './types'

type Popup =
  | { kind: 'menu'; anchor: HTMLElement; label: string; items: MenuItem[] }
  | { kind: 'rename'; anchor: HTMLElement; col: LaidColumn }
  | { kind: 'editor'; anchor: HTMLElement; col?: LaidColumn; rel?: 'before' | 'after'; at?: string; preset?: ColumnKind }
  | { kind: 'panel'; anchor: HTMLElement }
  | { kind: 'delete'; anchor: HTMLElement; col: LaidColumn }
  | { kind: 'link'; anchor: HTMLElement; col: LaidColumn; task: Task; rowKey: string }
  | { kind: 'task'; anchor: HTMLElement; col: LaidColumn; task: Task; rowKey: string; typed: string }
  | { kind: 'combo'; anchor: HTMLElement; label: string; items: ComboItem[]; current: string | null; clear?: boolean
      add?: { label(text: string): string; hint: string; allowed: boolean; deniedHint: string }
      onPick(key: string): void; onAdd?(text: string): void }

export interface UseSheetColumns {
  sheet: SheetId
  /** The Video sheet's current set; the Content sheet passes 'all'. */
  set: string
  bundle: ColumnsBundle
  me: Member
  members: Member[]
  /** A built-in column's default name in the member's language. */
  defaultName(key: string): string
  canEdit(task: Task): boolean
  say(text: string, undo?: () => void): void
  onNote(cellKey: string, note: string | null): void
  /** More items for a column's menu (the Video sheet's "Link to a board field…"). */
  extraMenu?(key: string, anchor: HTMLElement): MenuItem[]
  /** Spec 021: what Task link fields pick from and create in. */
  taskLinks?: TaskLinkCtx
  /** Spec 023: "Make it a task field" on a team column (admins and superusers; rows are tasks). */
  makeField?: { label: string; run(key: string): void }
  /** Spec 026 (§6): the field library as columns of a sheet of rows — shown, hidden, moved and renamed like the others. */
  fields?: (FieldColumn & { name: string })[]
  /** Spec 024 (§5): the Space's default sheet columns (built-in keys); empty = all of them. */
  defaultShown?: string[]
  /**
   * Fields (25 Nov 2026): each person's own columns in this view. Hide, show, move and resize change
   * only their view; in 'default' mode (admins) they change the Space's default for everyone.
   */
  personal?: { viewKey: string; layout: PersonalLayout | null; mode: 'me' | 'default'; save(layout: PersonalLayout | null): Promise<{ success: boolean; error?: string }> }
}

export function useSheetColumns(given: UseSheetColumns) {
  const typeLook = useTypeLook()
  const fieldNames = useMemo(() => new Map((given.fields ?? []).map(f => [f.key, f.name])), [given.fields])
  const o: UseSheetColumns = {
    ...given,
    taskLinks: given.taskLinks ?? given.bundle.taskLinks,
    // A task field's default name is its name in the library.
    defaultName: key => fieldNames.get(key) ?? given.defaultName(key),
  }
  const t = useTranslations('sheet.columns')
  const locale = useLocale()
  const { sheet, set, bundle, me } = o
  const api = bundle.api

  // A field's record outlives the field (retired, or a sheet that has no field library): only fields at hand are laid.
  const base = useMemo(() => applyLayout(sheet, bundle.records, set, given.fields, given.defaultShown).filter(c => !isFieldKey(c.key) || fieldNames.has(c.key)),
    [sheet, bundle.records, set, given.fields, given.defaultShown, fieldNames])
  // Fields (25 Nov 2026): this person's own view, saved per view; optimistic here.
  const pv = given.personal
  const [mine, setMine] = useState<{ key: string; layout: PersonalLayout | null } | null>(null)
  const myLayout = pv ? (mine && mine.key === pv.viewKey ? mine.layout : pv.layout) : null
  const personalMode = !!pv && pv.mode === 'me'
  const laid = useMemo(() => (pv && pv.mode === 'me' ? applyPersonal(base, myLayout) : base), [base, pv, myLayout])
  const shown = useMemo(() => laid.filter(c => c.shown), [laid])
  const byKey = useMemo(() => new Map(laid.map(c => [c.key, c])), [laid])
  const nameOf = useCallback((key: string) => byKey.get(key)?.name ?? (isCustomKey(key) ? '' : fieldNames.get(key) ?? given.defaultName(key)), [byKey, fieldNames, given])
  const valuesOf = (key: string) => bundle.values[key.slice(2)] ?? {}
  const valueOf = (task: Task, key: string) => bundle.values[key.slice(2)]?.[task.id] ?? ''
  const ctxFor = (c: LaidColumn) => ({ members: o.members, options: c.options, tasks: o.taskLinks?.tasks })
  const taskName = (id: string) => o.taskLinks?.tasks.find(x => x.id === id)?.name ?? null

  // ── popups ──────────────────────────────────────────────────────────────
  const [popup, setPopup] = useState<Popup | null>(null)
  const typed = useRef('')
  const popupRef = useRef<Popup | null>(null)
  popupRef.current = popup
  const close = useCallback((restore: boolean) => {
    setPopup(prev => {
      if (restore && prev) requestAnimationFrame(() => (prev.anchor.closest('[data-cell]') as HTMLElement | null ?? prev.anchor).focus())
      return null
    })
  }, [])
  const err = (code?: string) => {
    if (code?.startsWith('invalid_')) return t(`invalid.${code.slice(8)}` as 'invalid.number')
    const known = ['name_empty', 'name_long', 'name_taken', 'limit', 'no_options', 'option_in_use', 'title_fixed', 'built_in', 'gone', 'not_authorized', 'archived']
    return code && known.includes(code) ? t(`err.${code}` as 'err.generic') : t('err.generic')
  }

  /** Every other column's names: current, default in this language, default in English (R12). */
  const nameError = (name: string, exceptKey?: string) => {
    const others = laid.filter(c => c.key !== exceptKey).map(c => [nameOf(c.key), c.builtIn ? o.defaultName(c.key) : '', builtInOf(sheet, c.key)?.en ?? ''])
    const code = checkName(name, others)
    return code ? t(`err.name_${code}` as 'err.name_empty') : null
  }

  const when = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    const rtf = new Intl.RelativeTimeFormat(sheetLocale(locale), { numeric: 'auto' })
    if (Math.abs(mins) < 60) return rtf.format(-Math.max(0, mins), 'minute')
    const h = Math.round(mins / 60)
    if (h < 24) return rtf.format(-h, 'hour')
    return rtf.format(-Math.round(h / 24), 'day')
  }
  const changedBy = (c: LaidColumn) => c.record && c.record.updatedByName
    ? t('changedBy', { name: c.record.updatedBy === me.id ? t('you') : c.record.updatedByName, when: when(c.record.updatedAt) })
    : t('byDefault')
  const setName = (s: string) => (sheet === 'video' ? s[0].toUpperCase() + s.slice(1) : '')

  // ── layout actions (optimistic in the host) ─────────────────────────────
  async function run(p: Promise<{ success: boolean; error?: string }>, ok?: string) {
    const r = await p
    if (!r.success) o.say(err(r.error)); else if (ok) o.say(ok)
    return r.success
  }
  /** Fields (25 Nov 2026): in a person's own view, hide, show, move and resize change only their layout. */
  function saveMine(next: PersonalLayout | null) {
    if (!pv) return Promise.resolve({ success: true })
    setMine({ key: pv.viewKey, layout: next })
    return pv.save(next)
  }
  const current = (): PersonalLayout => ({ cols: laid.filter(c => c.shown).map(c => c.key), widths: myLayout?.widths ?? {} })
  function doShown(key: string, on: boolean) {
    if (!personalMode) return api.setShown(sheet, key, set, on)
    const cur = current()
    const cols = on ? (cur.cols.includes(key) ? cur.cols : [...cur.cols, key]) : cur.cols.filter(k => k !== key)
    return saveMine({ ...cur, cols })
  }
  function doMove(key: string, before: string | null) {
    if (!personalMode) return api.move(sheet, key, before)
    const cur = current()
    const cols = cur.cols.filter(k => k !== key)
    const i = before ? cols.indexOf(before) : -1
    if (i >= 0) cols.splice(i, 0, key); else if (laid.find(c => c.key === key)?.shown) cols.push(key)
    return saveMine({ ...cur, cols })
  }
  function doResize(key: string, width: number) {
    if (!personalMode) return api.resize(sheet, key, width)
    const cur = current()
    return saveMine({ ...cur, widths: { ...(cur.widths ?? {}), [key]: width } })
  }
  function moveBy(key: string, d: -1 | 1) {
    const vis = shown.map(c => c.key)
    const i = vis.indexOf(key)
    const target = vis[i + d]
    if (!target || target === 'title') return
    // Before the one to the left; or before the one after the next to the right.
    const before = d < 0 ? target : vis[i + 2] ?? null
    void run(doMove(key, before), t('movedCol', { name: nameOf(key) }))
  }

  function columnMenu(key: string, anchor: HTMLElement) {
    const c = byKey.get(key)
    if (!c) return
    const title = key === 'title'
    const vis = shown.map(x => x.key)
    const i = vis.indexOf(key)
    const pick = (fn: () => void) => () => { close(false); fn() }
    const items: MenuItem[] = [
      { key: 'rename', text: t('rename'), label: t('rename'), onSelect: () => setPopup({ kind: 'rename', anchor, col: c }) },
    ]
    if (c.builtIn && c.name) items.push({ key: 'reset', text: t('resetName'), label: t('resetName'), hint: o.defaultName(key),
      onSelect: pick(() => void run(api.rename(sheet, key, null), t('resetDone', { name: o.defaultName(key) }))) })
    if (!title) items.push({ key: 'before', group: ' ', text: t('insertBefore'), label: t('insertBefore'), onSelect: () => setPopup({ kind: 'editor', anchor, rel: 'before', at: key }) })
    items.push({ key: 'after', group: ' ', text: t('insertAfter'), label: t('insertAfter'), onSelect: () => setPopup({ kind: 'editor', anchor, rel: 'after', at: key }) })
    if (!title) {
      if (i > 1) items.push({ key: 'left', group: '  ', text: t('moveLeft'), label: t('moveLeft'), onSelect: pick(() => moveBy(key, -1)) })
      if (i < vis.length - 1) items.push({ key: 'right', group: '  ', text: t('moveRight'), label: t('moveRight'), onSelect: pick(() => moveBy(key, 1)) })
      items.push({ key: 'hide', group: '  ', text: t('hide'), label: t('hide'), hint: sheet === 'video' ? t('hideIn', { set: setName(set) }) : undefined,
        onSelect: pick(() => void run(doShown(key, false), t('hidden', { name: nameOf(key) }))) })
    }
    items.push(...(o.extraMenu?.(key, anchor) ?? []).map(it => ({ ...it, onSelect: () => { close(false); it.onSelect() } })))
    if (c.kind) {
      items.push({ key: 'edit', group: '   ', text: t('edit'), label: t('edit'), onSelect: () => setPopup({ kind: 'editor', anchor, col: c }) })
      // Spec 023 (D5): a team column becomes a task field, keeping its values (admins, superusers).
      if (o.makeField && c.kind !== 'task') items.push({ key: 'make-field', group: '   ', text: o.makeField.label, label: <span data-make-field="">{o.makeField.label}</span>, onSelect: pick(() => o.makeField!.run(key)) })
      items.push({ key: 'delete', group: '   ', text: t('delete'), label: t('delete'), tone: 'danger', onSelect: () => setPopup({ kind: 'delete', anchor, col: c }) })
    } else if (!title && !personalMode) {
      // Taking a built-in column off the sheet for everyone is the Space default (admins); in your own view, Hide.
      items.push({ key: 'delete', group: '   ', text: t('delete'), label: t('delete'), tone: 'danger', onSelect: () => void removeBuiltIn(key) })
    }
    setPopup({ kind: 'menu', anchor, label: t('menuFor', { name: nameOf(key) || o.defaultName(key) }), items })
  }

  /**
   * Delete a built-in column (Source, File name…): it leaves the sheet in
   * every set. Its values are the tasks' and stay on the board; Undo, ＋ or
   * ⚙ Fields bring it back.
   */
  async function removeBuiltIn(key: string) {
    const c = byKey.get(key)
    if (!c || key === 'title') return
    close(false)
    const was = c.record && !c.record.shownDefault ? c.record.shownIn : defaultShownIn(sheet, key)
    for (const s of setsFor(sheet)) {
      const r = await api.setShown(sheet, key, s, false)
      if (!r.success) { o.say(err(r.error)); return }
    }
    const name = nameOf(key) || o.defaultName(key)
    o.say(t('removed', { name }), () => {
      void (async () => { for (const s of was) await api.setShown(sheet, key, s, true); o.say(t('shownCol', { name })) })()
    })
  }

  async function remove(c: LaidColumn) {
    close(true)
    const id = c.key.slice(2)
    const r = await api.remove(id)
    if (!r.success) { o.say(err(r.error)); return }
    o.say(t('deleted', { name: nameOf(c.key) }), () => { void api.restore(id).then(x => o.say(x.success ? t('restored', { name: c.name ?? '' }) : err(x.error))) })
  }

  // ── custom cells ────────────────────────────────────────────────────────
  const gone = (task: Task) => !!task.dropped_at
  const custom = {
    is: (key: string) => isCustomKey(key) && byKey.has(key),
    isText: (task: Task, key: string) => {
      const c = byKey.get(key)
      // Spec 013 R8 (FR-060): team columns are open to every member on a live task.
      return !!c && ['text', 'number', 'date'].includes(c.kind ?? '') && !gone(task)
    },
    isMenu: (key: string) => ['link', 'person', 'choice', 'task'].includes(byKey.get(key)?.kind ?? ''),
    textValue: (task: Task, key: string) => (byKey.get(key)?.kind === 'task' ? taskName(valueOf(task, key)) ?? '' : valueOf(task, key)),
    cellClass: (key: string) => (byKey.get(key)?.kind === 'number' ? 'fx-sheet-num' : ''),
    readOnlyNote: (task: Task, key: string) => (gone(task) ? t('err.archived') : null),
    render: (task: Task, key: string): ReactNode => {
      const c = byKey.get(key)
      if (!c?.kind) return null
      const v = valueOf(task, key)
      if (c.kind === 'checkbox') {
        return <span className={`fx-sheet-check${v ? ' is-on' : ''}`} data-checked={v ? 'true' : 'false'}><span aria-hidden="true">{v ? '✓' : ''}</span><span className="fx-sheet-sr">{v ? t('checked') : t('unchecked')}</span></span>
      }
      if (!v) return null
      switch (c.kind) {
        case 'text': return <span className="fx-sheet-ellipsis" title={v}>{v}</span>
        case 'number': return <span>{formatValue('number', v, { lang: locale })}</span>
        case 'date': return <span className="fx-sheet-ellipsis">{formatValue('date', v, { lang: locale })}</span>
        case 'link': return <a className="fx-sheet-link fx-sheet-ellipsis" href={v} target="_blank" rel="noopener noreferrer" tabIndex={-1} onClick={e => e.stopPropagation()}>{siteName(v) || v}</a>
        case 'person': return <PersonChip member={o.members.find(m => m.id === v)} />
        case 'task': return taskChip(task, c, v)
        case 'choice': {
          const op = c.options.find(x => x.id === v)
          return op ? <span className="fx-sheet-pill" style={{ background: op.color }}>{op.name}</span> : null
        }
      }
      return null
    },
    /** Typed into (Text, Number, Date): the kind decides; a refusal is the cell's note. */
    commit: async (task: Task, key: string, value: string): Promise<string | null> => {
      const r = await api.setValue(key.slice(2), task.id, value)
      return r.success ? null : err(r.error)
    },
    set: async (task: Task, key: string, raw: string, rowKey: string) => {
      const r = await api.setValue(key.slice(2), task.id, raw)
      if (!r.success) o.onNote(`${rowKey}|${key}`, err(r.error))
    },
    /** Click or Enter on a Link, Person or Choice cell. */
    open: (task: Task, key: string, anchor: HTMLElement, rowKey: string) => {
      const c = byKey.get(key)
      if (!c?.kind) return
      const note = custom.readOnlyNote(task, key)
      if (note) { o.onNote(`${rowKey}|${key}`, note); return }
      if (c.kind === 'link') { setPopup({ kind: 'link', anchor, col: c, task, rowKey }); return }
      if (c.kind === 'task') { setPopup({ kind: 'task', anchor, col: c, task, rowKey, typed: '' }); return }
      if (c.kind === 'person') {
        const cur = valueOf(task, key)
        const items: MenuItem[] = [
          ...editorOrder(o.members).map(m => ({ key: m.id, text: `${m.name}, ${m.role}`, label: <PersonChip member={m} />, hint: m.role,
            tone: m.id === cur ? ('next' as const) : undefined, onSelect: () => { close(true); void custom.set(task, key, m.id, rowKey) } })),
          { key: '', text: t('clear'), label: t('clear'), onSelect: () => { close(true); void custom.set(task, key, '', rowKey) } },
        ]
        setPopup({ kind: 'menu', anchor, label: nameOf(key), items })
        return
      }
      if (c.kind === 'choice') choiceCombo(task, c, anchor, rowKey)
    },
    /** Space, Enter or a click on a Checkbox cell toggles it. */
    activate: (task: Task, key: string, rowKey: string) => {
      const c = byKey.get(key)
      if (c?.kind !== 'checkbox') return false
      const note = custom.readOnlyNote(task, key)
      if (note) { o.onNote(`${rowKey}|${key}`, note); return true }
      void custom.set(task, key, valueOf(task, key) ? '' : '1', rowKey)
      return true
    },
    /**
     * Delete on a cell no one types into (Choice, Person, Link, Checkbox). It is
     * never final: `onCleared` puts the old value on the sheet's undo stack, or,
     * for a sheet without one, the message offers Undo.
     */
    clear: async (task: Task, key: string, rowKey: string, onCleared?: (before: string) => void) => {
      const note = custom.readOnlyNote(task, key)
      if (note) { o.onNote(`${rowKey}|${key}`, note); return }
      if (byKey.get(key)?.kind === 'task') { unlink(task, key, rowKey); return }
      const before = valueOf(task, key)
      if (!before) return
      const r = await api.setValue(key.slice(2), task.id, '')
      if (!r.success) { o.onNote(`${rowKey}|${key}`, err(r.error)); return }
      if (onCleared) onCleared(before)
      else o.say(t('valueCleared', { name: nameOf(key) }), () => void custom.set(task, key, before, rowKey))
    },
    /** A letter typed on a Choice cell opens its type-ahead with that letter. */
    typeAhead: (task: Task, key: string, ch: string, anchor: HTMLElement, rowKey: string) => {
      const c = byKey.get(key)
      // Spec 021: typing in a Task link cell opens Link task, already searching for it.
      if (c?.kind === 'task') {
        const note = custom.readOnlyNote(task, key)
        if (note) { o.onNote(`${rowKey}|${key}`, note); return true }
        if (popupRef.current?.kind === 'task') return true
        setPopup({ kind: 'task', anchor, col: c, task, rowKey, typed: ch })
        return true
      }
      if (c?.kind !== 'choice') return false
      if (popupRef.current?.kind === 'combo') { typed.current += ch; return true }
      const note = custom.readOnlyNote(task, key)
      if (note) { o.onNote(`${rowKey}|${key}`, note); return true }
      typed.current = ch
      choiceCombo(task, c, anchor, rowKey)
      return true
    },
  }

  /** × Unlink: removed at once, with Undo. The linked task itself is untouched. */
  function unlink(task: Task, key: string, rowKey: string) {
    const prev = valueOf(task, key)
    if (!prev) return
    const name = taskName(prev) ?? t('taskLink.missing')
    void custom.set(task, key, '', rowKey)
    o.say(t('taskLink.unlinked', { name }), () => void custom.set(task, key, prev, rowKey))
  }

  /** A linked task: its name (opens it), ⇄ Change and × Unlink (approved 2026-11-22). */
  function taskChip(task: Task, c: LaidColumn, id: string): ReactNode {
    const name = taskName(id)
    const cellOf = (el: HTMLElement) => (el.closest('[data-cell]') as HTMLElement | null) ?? el
    const rowKeyOf = (el: HTMLElement) => cellOf(el).getAttribute('data-row-key') ?? ''
    const can = !gone(task)
    return (
      <span className="fx-tasklink" data-task-link={id}>
        <button type="button" tabIndex={-1} className={`fx-tasklink-name${name ? '' : ' is-missing'}`} data-tasklink-open=""
                title={name ? t('taskLink.open', { name }) : undefined}
                onClick={e => { e.stopPropagation(); if (name) o.taskLinks?.openTask(id) }}>
          <span>{name ? `↗ ${name}` : t('taskLink.missing')}</span>
        </button>
        {can && (
          <>
            <button type="button" tabIndex={-1} className="fx-tasklink-ib" data-tasklink-change="" aria-label={t('taskLink.change')} title={t('taskLink.change')}
                    onClick={e => { e.stopPropagation(); const cell = cellOf(e.currentTarget); setPopup({ kind: 'task', anchor: cell, col: c, task, rowKey: rowKeyOf(e.currentTarget), typed: '' }) }}>⇄</button>
            <button type="button" tabIndex={-1} className="fx-tasklink-ib" data-tasklink-unlink="" aria-label={t('taskLink.unlink')} title={t('taskLink.unlink')}
                    onClick={e => { e.stopPropagation(); unlink(task, c.key, rowKeyOf(e.currentTarget)) }}>×</button>
          </>
        )}
      </span>
    )
  }

  function choiceCombo(task: Task, c: LaidColumn, anchor: HTMLElement, rowKey: string) {
    const key = c.key
    setPopup({
      kind: 'combo', anchor, label: nameOf(key), current: valueOf(task, key) || null, clear: true,
      items: c.options.map(op => ({ key: op.id, text: op.name, render: hl => <span className="fx-sheet-pill" style={{ background: op.color }}>{hl(op.name)}</span> })),
      add: { label: name => t('combo.addOption', { name }), hint: t('combo.optionHint', { column: nameOf(key) }), allowed: true, deniedHint: '' },
      onPick: id => { close(true); void custom.set(task, key, id, rowKey) },
      onAdd: async name => {
        close(true)
        const r = await api.update(key.slice(2), { options: [...c.options, { name }] })
        if (!r.success) { o.say(err(r.error)); return }
        o.say(t('combo.optionAdded', { name, column: nameOf(key) }))
        // The new option's id comes from the server: set the value by its name.
        void custom.set(task, key, name, rowKey)
      },
    })
  }

  /**
   * The Type cell's type-ahead (built-in, both sheets). Admins may add a
   * missing type; it starts with Post's deadlines.
   */
  function typeCombo(task: Task, anchor: HTMLElement, types: { label: string }[], onPick: (label: string) => void, first?: string) {
    if (first !== undefined) {
      if (popupRef.current?.kind === 'combo') { typed.current += first; return }
      typed.current = first
    }
    setPopup({
      kind: 'combo', anchor, label: o.defaultName('type'), current: task.content_type_label || null,
      items: types.map(x => ({ key: x.label, text: x.label, render: hl => <TypePill label={x.label} look={typeLook} highlight={hl} /> })),
      add: { label: name => t('combo.addType', { name }), hint: t('combo.typeHint'), allowed: me.access === 'admin' || me.access === 'superuser', deniedHint: t('combo.askAdmin') },
      onPick: label => { close(true); onPick(label) },
      onAdd: async name => {
        close(true)
        const r = await api.addContentType(name)
        if (!r.success || !r.label) { o.say(err(r.error)); return }
        o.say(t('combo.typeAdded', { name: r.label }))
        onPick(r.label)
      },
    })
  }

  // ── grid hooks ──────────────────────────────────────────────────────────
  const grid = {
    headerMenu: (col: string, anchor: HTMLElement) => columnMenu(col, anchor),
    onReorder: (col: string, before: string | null) => { void run(doMove(col, before), t('movedCol', { name: nameOf(col) })) },
    onResize: (col: string, width: number) => { void run(doResize(col, width)) },
    headerName: (col: string) => t('menuButton', { name: nameOf(col) || o.defaultName(col) }),
    // Spec 013 (FR-042): the grid's own menus reach spec 010's add and delete flows.
    /** Insert column: the add-column form, beside this column. Title has nothing before it. */
    insertColumn: (rel: 'before' | 'after', at: string, anchor: HTMLElement) => {
      if (laid.filter(c => c.kind).length >= MAX_CUSTOM_COLUMNS) { o.say(t('err.limit')); return }
      setPopup({ kind: 'editor', anchor, rel: at === 'title' ? 'after' : rel, at })
    },
    /** Every column but Title can be deleted: a team column with its values; a built-in one leaves the sheet (spec 019). */
    isTeamColumn: (key: string) => !!byKey.get(key)?.kind,
    canDelete: (key: string) => key !== 'title' && byKey.has(key),
    deleteColumn: (key: string, anchor: HTMLElement) => {
      const c = byKey.get(key)
      if (c?.kind) setPopup({ kind: 'delete', anchor, col: c })
      else if (c && personalMode) void run(doShown(key, false), t('hidden', { name: nameOf(key) || o.defaultName(key) }))
      else if (c) void removeBuiltIn(key)
    },
  }
  const header = (key: string) => {
    const c = byKey.get(key)
    if (!c?.kind) return null
    return { text: c.name ?? '' }
  }
  const customCount = laid.filter(c => c.kind).length

  /** ＋ Field: a new column, optionally of a kind chosen already (Task link). */
  const openAdd = (anchor: HTMLElement, preset?: ColumnKind) => {
    if (customCount >= MAX_CUSTOM_COLUMNS) { o.say(t('err.limit')); return }
    setPopup({ kind: 'editor', anchor, preset })
  }
  const toolbar = (
    <>
      <button type="button" className="fx-sheet-btn" data-columns-button="" aria-haspopup="dialog" aria-expanded={popup?.kind === 'panel'}
              onClick={e => setPopup(popup?.kind === 'panel' ? null : { kind: 'panel', anchor: e.currentTarget })}>{t('button')}</button>
      <button type="button" className="fx-sheet-btn" data-add-column="" onClick={e => openAdd(e.currentTarget)}>{t('add')}</button>
    </>
  )

  // ── the popups ──────────────────────────────────────────────────────────
  let layer: ReactNode = null
  if (popup?.kind === 'menu') layer = <SheetMenu anchor={popup.anchor} label={popup.label} items={popup.items} onClose={close} />
  else if (popup?.kind === 'rename') {
    const c = popup.col
    layer = (
      <SheetPopover anchor={popup.anchor} label={t('nameLabel')} onClose={close}>
        <RenameForm initial={nameOf(c.key)} placeholder={c.builtIn ? `${o.defaultName(c.key)}…` : ''} label={t('nameLabel')}
                    saveLabel={t('renameSave')} savingLabel={t('saving')} cancelLabel={t('cancel')} onCancel={() => close(true)}
                    onSave={async name => {
                      const bad = nameError(name, c.key)
                      if (bad) return bad
                      const reset = c.builtIn && normName(name) === o.defaultName(c.key)
                      const r = await api.rename(sheet, c.key, reset ? null : name)
                      if (!r.success) return err(r.error)
                      close(true)
                      o.say(t('renamed', { name: normName(name) }))
                      return null
                    }} />
      </SheetPopover>
    )
  } else if (popup?.kind === 'editor') {
    const c = popup.col
    const heading = c ? t('editorEdit')
      : [t('editorAdd'), popup.at ? t(popup.rel === 'before' ? 'editorBefore' : 'editorAfter', { name: nameOf(popup.at) || o.defaultName(popup.at) }) : '',
         sheet === 'video' ? t('editorSets', { set: setName(set) }) : ''].filter(Boolean).join(' · ')
    layer = (
      <SheetPopover anchor={popup.anchor} label={heading} onClose={close}>
        <ColumnEditor
          initial={c?.kind ? { name: c.name ?? '', kind: c.kind, options: c.options } : undefined}
          preset={popup.preset}
          values={c ? valuesOf(c.key) : {}}
          members={o.members}
          heading={heading}
          nameError={name => nameError(name, c?.key)}
          onCancel={() => close(true)}
          onSave={async patch => {
            if (c) {
              const r = await api.update(c.key.slice(2), patch)
              if (!r.success) return err(r.error)
              close(true)
              o.say(r.cleared ? `${t('saved', { name: normName(patch.name) })} · ${t('clearedN', { n: r.cleared })}` : t('saved', { name: normName(patch.name) }))
              return null
            }
            const r = await api.add(sheet, {
              name: patch.name, kind: patch.kind as ColumnKind, options: patch.options,
              [popup.rel === 'before' ? 'before' : 'after']: popup.at, set: sheet === 'video' ? set : undefined,
            })
            if (!r.success) return err(r.error)
            close(true)
            o.say(t('added', { name: normName(patch.name) }))
            return null
          }}
        />
      </SheetPopover>
    )
  } else if (popup?.kind === 'panel') {
    layer = (
      <SheetPopover anchor={popup.anchor} label={t('panelTitle')} onClose={close}>
        <div className="fx-col-panel" data-columns-panel="">
          <span className="fx-col-sub">{[t('panelTitle'), sheet === 'video' ? t('panelSet', { set: setName(set) }) : '', t('panelNote')].filter(Boolean).join(' · ')}</span>
          {laid.map((c, i) => {
            const label = nameOf(c.key) || o.defaultName(c.key)
            return (
              <div key={c.key} className="fx-col-prow" data-panel-col={c.key}>
                <input type="checkbox" id={`fx-colshow-${c.key}`} name={`show-${c.key}`} checked={c.shown} disabled={c.key === 'title'} aria-describedby={`fx-colwho-${c.key}`}
                       data-autofocus={i === 1 ? '' : undefined}
                       onChange={e => void run(doShown(c.key, e.target.checked), t(e.target.checked ? 'shownCol' : 'hidden', { name: label }))} />
                <label htmlFor={`fx-colshow-${c.key}`}>
                  <span className="fx-sheet-ellipsis">{label}{c.kind ? <span className="fx-sheet-muted"> · {t(`kinds.${c.kind}`)}</span> : null}</span>
                  <span className="fx-col-who" id={`fx-colwho-${c.key}`}>{changedBy(c)}</span>
                </label>
                <button type="button" className="fx-col-ib" aria-label={t('moveUp', { name: label })} disabled={i <= 1}
                        onClick={() => void run(doMove(c.key, laid[i - 1].key), t('movedCol', { name: label }))}>↑</button>
                <button type="button" className="fx-col-ib" aria-label={t('moveDown', { name: label })} disabled={c.key === 'title' || i === laid.length - 1}
                        onClick={() => void run(doMove(c.key, laid[i + 2]?.key ?? null), t('movedCol', { name: label }))}>↓</button>
                <button type="button" className="fx-col-ib" aria-label={t('more', { name: label })} aria-haspopup="menu"
                        onClick={e => columnMenu(c.key, e.currentTarget)}>⋯</button>
              </div>
            )
          })}
          <span><button type="button" className="fx-sheet-btn" onClick={e => openAdd(e.currentTarget)}>{t('add')}</button></span>
        </div>
      </SheetPopover>
    )
  } else if (popup?.kind === 'delete') {
    const c = popup.col
    const n = Object.keys(valuesOf(c.key)).length
    layer = (
      <SheetPopover anchor={popup.anchor} label={t('deleteTitle', { name: nameOf(c.key) })} onClose={close}>
        <div className="fx-sheet-pop-form" data-column-delete="">
          <b>{t('deleteTitle', { name: nameOf(c.key) })}</b>
          <span>{t('deleteBody', { n })}</span>
          <span className="fx-sheet-pop-row">
            <button type="button" className="fx-sheet-btn" onClick={() => close(true)}>{t('cancel')}</button>
            <button type="button" className="fx-sheet-btn is-danger" data-autofocus="" onClick={() => void remove(c)}>{t('deleteConfirm')}</button>
          </span>
        </div>
      </SheetPopover>
    )
  } else if (popup?.kind === 'link') {
    const { col: c, task, rowKey } = popup
    layer = (
      <SheetPopover anchor={popup.anchor} label={nameOf(c.key)} onClose={close}>
        <LinkPrompt title={nameOf(c.key)} initial={valueOf(task, c.key)} saveLabel={t('save')} savingLabel={t('saving')} skipLabel={t('cancel')}
                    badLink={t('invalid.link')} placeholder="https://…" onSkip={() => close(true)}
                    onSave={async url => {
                      const r = await api.setValue(c.key.slice(2), task.id, url)
                      if (!r.success) return err(r.error)
                      close(true)
                      o.onNote(`${rowKey}|${c.key}`, null)
                      return null
                    }} />
      </SheetPopover>
    )
  } else if (popup?.kind === 'task' && o.taskLinks) {
    const { col: c, task, rowKey, typed: first } = popup
    const ctx = o.taskLinks
    layer = (
      <SheetPopover anchor={popup.anchor} label={t('taskLink.dialog', { name: nameOf(c.key) })} onClose={close}>
        <LinkTaskPicker ctx={ctx} typed={first} current={valueOf(task, c.key) || null} exclude={task.id}
                        brandId={task.brand_id || null} onClose={() => close(true)}
                        onPick={async (id, name) => {
                          close(true)
                          const prev = valueOf(task, c.key)
                          const r = await api.setValue(c.key.slice(2), task.id, id)
                          if (!r.success) { o.onNote(`${rowKey}|${c.key}`, err(r.error)); return }
                          o.onNote(`${rowKey}|${c.key}`, null)
                          o.say(t('taskLink.linked', { name }), () => void custom.set(task, c.key, prev, rowKey))
                        }} />
      </SheetPopover>
    )
  } else if (popup?.kind === 'combo') {
    const pc = popup
    layer = (
      <SheetPopover anchor={pc.anchor} label={pc.label} onClose={close}>
        <SheetCombo label={pc.label} items={pc.items} current={pc.current} typed={typed}
                    placeholder={t('combo.search')} noMatch={t('combo.noMatch')} currentLabel={t('combo.current')}
                    clearLabel={pc.clear ? t('clear') : undefined} add={pc.add} onPick={pc.onPick} onAdd={pc.onAdd} />
      </SheetPopover>
    )
  }

  return {
    laid, shown,
    /** Spec 019 stage 2: the Fields drawer and ＋ drive the same layout actions as the Columns panel. */
    openAdd,
    /** The rename box for a column, opened from outside the grid (the Fields drawer). */
    openRename: (key: string, anchor: HTMLElement) => { const c = byKey.get(key); if (c) setPopup({ kind: 'rename', anchor, col: c }) },
    setShown: (key: string, on: boolean) => run(doShown(key, on), t(on ? 'shownCol' : 'hidden', { name: nameOf(key) || o.defaultName(key) })),
    move: (key: string, before: string | null) => run(doMove(key, before), t('movedCol', { name: nameOf(key) || o.defaultName(key) })),
    /** Fields (25 Nov 2026): whether this person sees their own view, and putting the Space's default back. */
    personalMode,
    hasOwnView: personalMode && !!myLayout,
    resetToDefault: () => run(saveMine(null), t('resetView')),
    changedBy,
    cols: shown.map(c => c.key),
    widths: Object.fromEntries(laid.map(c => [c.key, c.width])) as Record<string, number>,
    nameOf, header, grid, custom, typeCombo, toolbar, layer,
    sets: setsFor(sheet),
    /** The column's current names, for paste matching (R9). */
    pasteNames: laid.map(c => ({ key: c.key, kind: c.kind, names: [nameOf(c.key), c.builtIn ? o.defaultName(c.key) : '', builtInOf(sheet, c.key)?.en ?? ''].filter(Boolean) })),
    /** Custom columns a paste can fill (FR-050, FR-051). */
    pasteColumns: laid.filter(c => isCustomKey(c.key) && c.kind).map((c): PasteValueColumn => ({
      id: c.key.slice(2), key: c.key, name: nameOf(c.key), kind: c.kind as ColumnKind, ctx: ctxFor(c),
    })),
    /** "Add as a column" for a pasted heading no column has (FR-052): a Text column at the end. */
    /** A new Text column, and its key (for a column that will follow a board field). */
    addTextColumnKey: async (name: string): Promise<{ key?: string; error?: string }> => {
      const bad = nameError(name)
      if (bad) return { error: bad }
      const r = await api.add(sheet, { name, kind: 'text', set: sheet === 'video' ? set : undefined })
      if (!r.success || !r.column) return { error: err(r.error) }
      return { key: r.column.key }
    },
    addTextColumn: async (name: string): Promise<string | null> => {
      const bad = nameError(name)
      if (bad) return bad
      const r = await api.add(sheet, { name, kind: 'text', set: sheet === 'video' ? set : undefined })
      if (!r.success) return err(r.error)
      o.say(t('added', { name: normName(name) }))
      return null
    },
    ctxFor,
  }
}

function RenameForm({ initial, placeholder, label, saveLabel, savingLabel, cancelLabel, onSave, onCancel }: {
  initial: string; placeholder: string; label: string; saveLabel: string; savingLabel: string; cancelLabel: string
  onSave(name: string): Promise<string | null>; onCancel(): void
}) {
  const [v, setV] = useState(initial)
  const [note, setNote] = useState<string | null>(null)
  // One save at a time: a second Enter while the first is on its way does nothing.
  const [busy, setBusy] = useState(false)
  const noteId = useId()
  return (
    <form className="fx-sheet-pop-form" data-column-rename="" aria-busy={busy || undefined}
          onSubmit={async e => {
            e.preventDefault()
            if (busy) return
            setBusy(true)
            const fail = await onSave(v)
            setBusy(false)
            setNote(fail)
          }}>
      <label className="fx-sheet-pop-title">
        {label}
        <input type="text" name="column-name" autoComplete="off" value={v} maxLength={40} placeholder={placeholder}
               aria-invalid={note ? true : undefined} aria-describedby={note ? noteId : undefined}
               onFocus={e => e.currentTarget.select()} onChange={e => { setV(e.target.value); setNote(null) }} />
      </label>
      {note && <span className="fx-sheet-note" id={noteId} role="alert">{note}</span>}
      <span className="fx-sheet-pop-row">
        <button type="button" className="fx-sheet-btn" onClick={onCancel}>{cancelLabel}</button>
        <button type="submit" className="fx-sheet-btn is-primary" disabled={busy}>{busy ? savingLabel : saveLabel}</button>
      </span>
    </form>
  )
}
export type SheetColumnsHook = ReturnType<typeof useSheetColumns>
