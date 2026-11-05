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
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { ColumnKind, Member, SheetId, Task } from '@/types/index'
import {
  MAX_CUSTOM_COLUMNS, SHEET_SETS, applyLayout, builtInOf, checkName, formatValue, isCustomKey, normName, type LaidColumn, type PasteValueColumn,
} from '@/lib/sheet-columns'
import { contentTypeColor } from '@/lib/tokens'
import { siteName } from '@/lib/content-plan'
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
  | { kind: 'editor'; anchor: HTMLElement; col?: LaidColumn; rel?: 'before' | 'after'; at?: string }
  | { kind: 'panel'; anchor: HTMLElement }
  | { kind: 'delete'; anchor: HTMLElement; col: LaidColumn }
  | { kind: 'link'; anchor: HTMLElement; col: LaidColumn; task: Task; rowKey: string }
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
}

export function useSheetColumns(o: UseSheetColumns) {
  const t = useTranslations('sheet.columns')
  const locale = useLocale()
  const { sheet, set, bundle, me } = o
  const api = bundle.api

  const laid = useMemo(() => applyLayout(sheet, bundle.records, set), [sheet, bundle.records, set])
  const shown = useMemo(() => laid.filter(c => c.shown), [laid])
  const byKey = useMemo(() => new Map(laid.map(c => [c.key, c])), [laid])
  const nameOf = useCallback((key: string) => byKey.get(key)?.name ?? (isCustomKey(key) ? '' : o.defaultName(key)), [byKey, o])
  const valuesOf = (key: string) => bundle.values[key.slice(2)] ?? {}
  const valueOf = (task: Task, key: string) => bundle.values[key.slice(2)]?.[task.id] ?? ''
  const ctxFor = (c: LaidColumn) => ({ members: o.members, options: c.options })

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
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
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
  function moveBy(key: string, d: -1 | 1) {
    const vis = shown.map(c => c.key)
    const i = vis.indexOf(key)
    const target = vis[i + d]
    if (!target || target === 'title') return
    // Before the one to the left; or before the one after the next to the right.
    const before = d < 0 ? target : vis[i + 2] ?? null
    void run(api.move(sheet, key, before), t('movedCol', { name: nameOf(key) }))
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
        onSelect: pick(() => void run(api.setShown(sheet, key, set, false), t('hidden', { name: nameOf(key) }))) })
    }
    if (c.kind) {
      items.push({ key: 'edit', group: '   ', text: t('edit'), label: t('edit'), onSelect: () => setPopup({ kind: 'editor', anchor, col: c }) })
      items.push({ key: 'delete', group: '   ', text: t('delete'), label: t('delete'), tone: 'danger', onSelect: () => setPopup({ kind: 'delete', anchor, col: c }) })
    }
    setPopup({ kind: 'menu', anchor, label: t('menuFor', { name: nameOf(key) || o.defaultName(key) }), items })
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
      return !!c && ['text', 'number', 'date'].includes(c.kind ?? '') && o.canEdit(task) && !gone(task)
    },
    isMenu: (key: string) => ['link', 'person', 'choice'].includes(byKey.get(key)?.kind ?? ''),
    textValue: (task: Task, key: string) => valueOf(task, key),
    cellClass: (key: string) => (byKey.get(key)?.kind === 'number' ? 'fx-sheet-num' : ''),
    readOnlyNote: (task: Task, key: string) => (!o.canEdit(task) ? t('err.not_authorized') : gone(task) ? t('err.archived') : null),
    render: (task: Task, key: string): ReactNode => {
      const c = byKey.get(key)
      if (!c?.kind) return null
      const v = valueOf(task, key)
      if (c.kind === 'checkbox') {
        return <span className={`fx-sheet-check${v ? ' is-on' : ''}`} data-checked={v ? 'true' : 'false'}>{v ? '✓' : ''}<span className="fx-sheet-sr">{v ? t('checked') : t('unchecked')}</span></span>
      }
      if (!v) return null
      switch (c.kind) {
        case 'text': return <span className="fx-sheet-ellipsis" title={v}>{v}</span>
        case 'number': return <span>{formatValue('number', v)}</span>
        case 'date': return <span className="fx-sheet-ellipsis">{formatValue('date', v)}</span>
        case 'link': return <a className="fx-sheet-link fx-sheet-ellipsis" href={v} target="_blank" rel="noopener noreferrer" tabIndex={-1} onClick={e => e.stopPropagation()}>{siteName(v) || v}</a>
        case 'person': return <PersonChip member={o.members.find(m => m.id === v)} />
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
    clear: (task: Task, key: string, rowKey: string) => {
      const note = custom.readOnlyNote(task, key)
      if (note) { o.onNote(`${rowKey}|${key}`, note); return }
      void custom.set(task, key, '', rowKey)
    },
    /** A letter typed on a Choice cell opens its type-ahead with that letter. */
    typeAhead: (task: Task, key: string, ch: string, anchor: HTMLElement, rowKey: string) => {
      const c = byKey.get(key)
      if (c?.kind !== 'choice') return false
      if (popupRef.current?.kind === 'combo') { typed.current += ch; return true }
      const note = custom.readOnlyNote(task, key)
      if (note) { o.onNote(`${rowKey}|${key}`, note); return true }
      typed.current = ch
      choiceCombo(task, c, anchor, rowKey)
      return true
    },
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
      items: types.map(x => ({ key: x.label, text: x.label, render: hl => <span className="fx-content-type" style={{ background: contentTypeColor(x.label) }}>{hl(x.label)}</span> })),
      add: { label: name => t('combo.addType', { name }), hint: t('combo.typeHint'), allowed: me.access === 'admin', deniedHint: t('combo.askAdmin') },
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
    onReorder: (col: string, before: string | null) => { void run(api.move(sheet, col, before), t('movedCol', { name: nameOf(col) })) },
    onResize: (col: string, width: number) => { void run(api.resize(sheet, col, width)) },
    headerName: (col: string) => t('menuButton', { name: nameOf(col) || o.defaultName(col) }),
  }
  const header = (key: string) => {
    const c = byKey.get(key)
    if (!c?.kind) return null
    return { text: c.name ?? '' }
  }
  const customCount = laid.filter(c => c.kind).length

  const openAdd = (anchor: HTMLElement) => {
    if (customCount >= MAX_CUSTOM_COLUMNS) { o.say(t('err.limit')); return }
    setPopup({ kind: 'editor', anchor })
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
        <RenameForm initial={nameOf(c.key)} placeholder={c.builtIn ? o.defaultName(c.key) : ''} label={t('nameLabel')}
                    saveLabel={t('renameSave')} cancelLabel={t('cancel')} onCancel={() => close(true)}
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
                <input type="checkbox" id={`fx-colshow-${c.key}`} checked={c.shown} disabled={c.key === 'title'} aria-describedby={`fx-colwho-${c.key}`}
                       data-autofocus={i === 1 ? '' : undefined}
                       onChange={e => void run(api.setShown(sheet, c.key, set, e.target.checked), t(e.target.checked ? 'shownCol' : 'hidden', { name: label }))} />
                <label htmlFor={`fx-colshow-${c.key}`}>
                  <span className="fx-sheet-ellipsis">{label}{c.kind ? <span className="fx-sheet-muted"> · {t(`kinds.${c.kind}`)}</span> : null}</span>
                  <span className="fx-col-who" id={`fx-colwho-${c.key}`}>{changedBy(c)}</span>
                </label>
                <button type="button" className="fx-col-ib" aria-label={t('moveUp', { name: label })} disabled={i <= 1}
                        onClick={() => void run(api.move(sheet, c.key, laid[i - 1].key), t('movedCol', { name: label }))}>↑</button>
                <button type="button" className="fx-col-ib" aria-label={t('moveDown', { name: label })} disabled={c.key === 'title' || i === laid.length - 1}
                        onClick={() => void run(api.move(sheet, c.key, laid[i + 2]?.key ?? null), t('movedCol', { name: label }))}>↓</button>
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
        <LinkPrompt title={nameOf(c.key)} initial={valueOf(task, c.key)} saveLabel={t('save')} skipLabel={t('cancel')}
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
    cols: shown.map(c => c.key),
    widths: Object.fromEntries(laid.map(c => [c.key, c.width])) as Record<string, number>,
    nameOf, header, grid, custom, typeCombo, toolbar, layer,
    sets: SHEET_SETS[sheet],
    /** The column's current names, for paste matching (R9). */
    pasteNames: laid.map(c => ({ key: c.key, kind: c.kind, names: [nameOf(c.key), c.builtIn ? o.defaultName(c.key) : '', builtInOf(sheet, c.key)?.en ?? ''].filter(Boolean) })),
    /** Custom columns a paste can fill (FR-050, FR-051). */
    pasteColumns: laid.filter(c => isCustomKey(c.key) && c.kind).map((c): PasteValueColumn => ({
      id: c.key.slice(2), key: c.key, name: nameOf(c.key), kind: c.kind as ColumnKind, ctx: ctxFor(c),
    })),
    /** "Add as a column" for a pasted heading no column has (FR-052): a Text column at the end. */
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

function RenameForm({ initial, placeholder, label, saveLabel, cancelLabel, onSave, onCancel }: {
  initial: string; placeholder: string; label: string; saveLabel: string; cancelLabel: string
  onSave(name: string): Promise<string | null>; onCancel(): void
}) {
  const [v, setV] = useState(initial)
  const [note, setNote] = useState<string | null>(null)
  return (
    <form className="fx-sheet-pop-form" data-column-rename="" onSubmit={async e => { e.preventDefault(); setNote(await onSave(v)) }}>
      <label className="fx-sheet-pop-title">
        {label}
        <input type="text" value={v} maxLength={40} placeholder={placeholder} aria-invalid={note ? true : undefined}
               onFocus={e => e.currentTarget.select()} onChange={e => { setV(e.target.value); setNote(null) }} />
      </label>
      {note && <span className="fx-sheet-note" role="alert">{note}</span>}
      <span className="fx-sheet-pop-row">
        <button type="button" className="fx-sheet-btn" onClick={onCancel}>{cancelLabel}</button>
        <button type="submit" className="fx-sheet-btn is-primary">{saveLabel}</button>
      </span>
    </form>
  )
}
export type SheetColumnsHook = ReturnType<typeof useSheetColumns>
