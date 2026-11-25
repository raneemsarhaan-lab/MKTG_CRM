'use client'

/**
 * Spec 019's settings for a blank sheet's task fields:
 * - the ⚙ Fields drawer (the task column, every task field with a switch,
 *   group rows by, the regular columns);
 * - the ＋ picker after the last heading;
 * - Values: this sheet's own words for a stage, a type or a priority;
 * - Match the values: turning a regular column into one of those fields.
 */
import { FieldGlyph } from '@/components/sheet/AddColumnPanel'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { GroupBy, SheetTaskMap, StageId, TaskField, WordField } from '@/types/index'
import { TASK_FIELDS } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { normTitle } from '@/lib/sheet-links'
import { SheetMenu, type MenuItem } from '@/components/sheet/SheetMenu'
import { StagePill } from '@/components/sheet/StatusCell'
import { FieldIcon } from './FieldCells'
import { Modal } from '../Dialogs'

/** The workbook's ⚙ Fields button and Data › Task fields open the drawer of the sheet on screen. */
export const FIELDS_OPEN = 'momentum:fields-open'
export const openFields = () => document.dispatchEvent(new CustomEvent(FIELDS_OPEN))
/** A sheet of rows' own commands, from the workbook's Data menu: Paste plan, only my rows, show archived. */
export const ROWS_COMMAND = 'momentum:rows-command'
export type RowsCommand = 'pastePlan' | 'mine' | 'archived'
export const rowsCommand = (c: RowsCommand) => document.dispatchEvent(new CustomEvent(ROWS_COMMAND, { detail: c }))
/** Spec 026 (§6): a sheet of rows' "+ Column" opens its add menu (Task field or Sheet only) at the button. */
export const ADD_COLUMN_OPEN = 'momentum:add-column-open'
export const openAddColumn = (anchor: HTMLElement) => document.dispatchEvent(new CustomEvent(ADD_COLUMN_OPEN, { detail: anchor }))

export interface ColRef { id: string; letter: string; name: string; field: TaskField | null; task: boolean }
const STAGES = Object.keys(STAGE_META) as StageId[]
const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low', 'None']

/** The board's values a word field takes, with their names. */
export function boardValues(field: WordField, types: string[], locale: string): { value: string; name: string }[] {
  if (field === 'stage') return STAGES.map(id => ({ value: id, name: locale.startsWith('ar') ? STAGE_META[id].label_ar : STAGE_META[id].label_en }))
  if (field === 'type') return types.map(x => ({ value: x, name: x }))
  return PRIORITIES.map(x => ({ value: x, name: x }))
}

export function FieldsDrawer({ map, cols, teamCols, groupBy, groupCols, readOnly, look, onLook, onToggle, onValues, onGroupBy, onAddRegular, onAskLink, onClose }: {
  map: SheetTaskMap | null
  cols: ColRef[]
  teamCols: { id: string; name: string }[]
  groupBy: GroupBy | null
  groupCols: ColRef[]
  readOnly: string | null
  /** The sheet's look: the Content sheet's, or a spreadsheet. */
  look?: 'content' | 'grid'
  onLook?(look: 'content' | 'grid'): void
  onToggle(field: TaskField, on: boolean): void
  onValues(field: WordField): void
  onGroupBy(g: GroupBy | null): void
  onAddRegular(): void
  onAskLink(): void
  onClose(): void
}) {
  const t = useTranslations('sheets.fields')
  const tu = useTranslations('sheets.ux')
  const [q, setQ] = useState('')
  const ref = useRef<HTMLElement>(null)
  useEffect(() => { ref.current?.querySelector<HTMLElement>('button, input, select')?.focus() }, [])
  const all: TaskField[] = [...TASK_FIELDS.filter(f => f !== 'title'), ...teamCols.map(c => `col:${c.id}` as TaskField)]
  const name = (f: TaskField) => (f.startsWith('col:') ? teamCols.find(c => `col:${c.id}` === f)?.name ?? f : t(`names.${f}`))
  const colOf = new Map(cols.filter(c => c.field).map(c => [c.field!, c]))
  const taskCol = cols.find(c => c.task)
  const shownList = all.filter(f => !q || name(f).toLowerCase().includes(q.toLowerCase()))
  const gval = groupBy && groupBy.by !== 'none' ? (groupBy.by === 'col' ? `col:${groupBy.col}` : groupBy.by) : ''
  return (
    <aside ref={ref} className="fx-fd-drawer" aria-label={t('title')} data-fields-drawer=""
           onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }}>
      <header>
        <h2>{t('title')}</h2>
        <button type="button" aria-label={t('close')} data-fields-close="" onClick={onClose}>×</button>
      </header>
      <div className="fx-fd-scroll">
        {readOnly && <p className="fx-fd-why"><span aria-hidden="true">🔒 </span>{readOnly}</p>}
        {look && onLook && (
          <section>
            <h3>{t('lookTitle')}</h3>
            <label className="fx-fd-group">
              <span className="sr-only">{t('lookTitle')}</span>
              <select value={look} data-look-select="" disabled={!!readOnly} onChange={e => onLook(e.target.value as 'content' | 'grid')}>
                <option value="content">{t('lookContent')}</option>
                <option value="grid">{t('lookGrid')}</option>
              </select>
            </label>
          </section>
        )}
        <section>
          <h3>{t('linkedTitle')}</h3>
          {map && taskCol
            ? <div className="fx-fd-src"><b>{t('taskColIs', { col: `${taskCol.letter} · ${taskCol.name || t('untitled')}` })}</b><small>{t('taskColHelp')}</small>
                <button type="button" className="fx-fd-link" onClick={onAskLink} disabled={!!readOnly}>{t('changeTaskCol')}</button></div>
            : <div className="fx-fd-src"><b>{t('notLinked')}</b><small>{t('notLinkedHelp')}</small>
                <button type="button" className="fx-fd-go" data-fields-link="" onClick={onAskLink} disabled={!!readOnly}>{t('pickTaskCol')}</button></div>}
        </section>
        <section>
          <h3>{t('groupTitle')}</h3>
          <label className="fx-fd-group">
            <span className="sr-only">{t('groupTitle')}</span>
            <select value={gval} data-group-by="" disabled={!!readOnly} onChange={e => {
              const v = e.target.value
              onGroupBy(!v ? null : v.startsWith('col:') ? { by: 'col', col: v.slice(4) } : { by: v as 'theme' | 'stage' | 'assignee' | 'type' })
            }}>
              <option value="">{t('groupNone')}</option>
              {map && <optgroup label={t('groupTaskFields')}>
                <option value="theme">{t('groupTheme')}</option>
                <option value="stage">{t('names.stage')}</option>
                <option value="assignee">{t('names.assignee')}</option>
                <option value="type">{t('names.type')}</option>
              </optgroup>}
              <optgroup label={t('groupColumns')}>
                {groupCols.map(c => <option key={c.id} value={`col:${c.id}`}>{c.letter} · {c.name || t('untitled')}</option>)}
              </optgroup>
            </select>
          </label>
        </section>
        <section>
          <h3>{t('fieldsTitle')}</h3>
          <input type="search" value={q} placeholder={tu('ph.fields')} aria-label={t('search')} name="field-search" autoComplete="off" onChange={e => setQ(e.target.value)} />
          <ul className="fx-fd-list">
            {shownList.map(f => {
              const c = colOf.get(f)
              const word = f === 'stage' || f === 'type' || f === 'priority'
              return (
                <li key={f} className="fx-fd-row" data-field-row={f}>
                  <FieldIcon field={f} />
                  <span className="fx-fd-nm">{name(f)}{c && <small>{t('inColumn', { col: c.letter })}</small>}</span>
                  {word && map && <button type="button" className="fx-fd-values" data-field-values={f} aria-label={tu('valuesFor', { name: name(f) })} onClick={() => onValues(f as WordField)}>{t('values')}</button>}
                  <button type="button" role="switch" className="fx-nt-sw" aria-checked={!!c} aria-label={t('showField', { name: name(f) })} data-field-switch={f}
                          disabled={!!readOnly} onClick={() => onToggle(f, !c)} />
                </li>
              )
            })}
          </ul>
          <p className="fx-fd-hint">{t('dragHint')}</p>
        </section>
        <section>
          <h3>{t('regularTitle')}</h3>
          <ul className="fx-fd-list">
            {cols.filter(c => !c.field && !c.task).map(c => (
              <li key={c.id} className="fx-fd-row"><FieldIcon field="regular" /><span className="fx-fd-nm">{c.name || t('untitled')}<small>{t('inColumn', { col: c.letter })}</small></span></li>
            ))}
          </ul>
          <button type="button" className="fx-fd-add" data-add-regular="" disabled={!!readOnly} onClick={onAddRegular}><span aria-hidden="true">＋ </span>{t('addRegular')}</button>
        </section>
      </div>
    </aside>
  )
}

/** The ＋ after the last heading: a task field not shown yet, or a regular column. */
export function AddFieldMenu({ anchor, shown, teamCols, linked, onField, onRegular, onClose }: {
  anchor: HTMLElement
  shown: Set<TaskField>
  teamCols: { id: string; name: string }[]
  linked: boolean
  onField(f: TaskField): void
  onRegular(): void
  onClose(restore: boolean): void
}) {
  const t = useTranslations('sheets.fields')
  const fields: TaskField[] = [...TASK_FIELDS.filter(f => f !== 'title'), ...teamCols.map(c => `col:${c.id}` as TaskField)].filter(f => !shown.has(f))
  const name = (f: TaskField) => (f.startsWith('col:') ? teamCols.find(c => `col:${c.id}` === f)?.name ?? f : t(`names.${f}`))
  const items: MenuItem[] = [
    ...fields.map(f => ({ key: f, text: name(f), group: t('fieldsTitle'), label: <span className="fx-fd-mi"><FieldIcon field={f} />{name(f)}</span>, onSelect: () => onField(f) })),
    { key: 'regular', text: t('spreadsheetCol'), group: t('regularTitle'), label: <span className="fx-fd-mi"><FieldIcon field="regular" />{t('spreadsheetCol')}</span>, onSelect: onRegular },
  ]
  if (!linked) items.unshift({ key: 'link', text: t('pickTaskCol'), group: t('linkedTitle'), label: <span className="fx-fd-mi"><span aria-hidden="true">↗ </span>{t('pickTaskCol')}</span>, onSelect: () => onField('title') })
  return <SheetMenu anchor={anchor} label={t('addTitle')} items={items} onClose={onClose} />
}

/** ⚙ Fields → Values: each board value and this sheet's words for it. */
export function ValuesDialog({ field, map, types, defaults, onSave, onClose }: {
  field: WordField
  map: Pick<SheetTaskMap, 'words' | 'show'>
  types: string[]
  /** Spec 019 stage 2: a sheet's built-in word per value (the Content sheet's Writing, Editing…), shown until changed. */
  defaults?: Record<string, string>
  onSave(words: Record<string, string[]>, show: 'sheet' | 'board'): void
  onClose(): void
}) {
  const t = useTranslations('sheets.fields')
  const tu = useTranslations('sheets.ux')
  const locale = useLocale()
  const values = boardValues(field, types, locale)
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(values.map(v => [v.value, (map.words?.[field]?.[v.value] ?? (defaults?.[v.value] ? [defaults[v.value]] : [])).join(', ')])))
  const [show, setShow] = useState<'sheet' | 'board'>(map.show ?? 'sheet')
  const [err, setErr] = useState('')
  function save() {
    const out: Record<string, string[]> = {}, seen = new Map<string, string>()
    for (const v of values) {
      const list = (draft[v.value] ?? '').split(',').map(x => x.trim()).filter(Boolean)
      for (const w of list) { const k = normTitle(w); if (seen.has(k) && seen.get(k) !== v.value) { setErr(t('wordTwice', { word: w })); return } seen.set(k, v.value) }
      if (list.length) out[v.value] = list
    }
    onSave(out, show)
  }
  // A Modal: focus moves in, Tab stays inside, Esc cancels, and focus goes back to the Values button.
  return (
    <Modal title={t('valuesTitle', { field: t(`names.${field}`) })} body={t('valuesHelp')} onCancel={onClose} className="fx-fd-dialog" attrs={{ 'data-values-dialog': field }}>
        <div className="fx-fd-vtable">
          <b>{t('onBoard')}</b><b>{t('sheetCalls')}</b>
          {values.map(v => [
            <span key={`${v.value}-n`}>{field === 'stage' ? <StagePill stage={v.value as StageId} name={v.name} /> : v.name}</span>,
            <input key={`${v.value}-i`} value={draft[v.value] ?? ''} data-word-for={v.value} aria-label={t('wordsFor', { name: v.name })} name={`words-${v.value}`} autoComplete="off"
                   placeholder={field === 'stage' && v.value === 'd-prog' ? tu('ph.words') : ''}
                   onChange={e => { setErr(''); setDraft(d => ({ ...d, [v.value]: e.target.value })) }} />,
          ])}
        </div>
        <fieldset className="fx-fd-radios">
          <legend>{t('cellsShow')}</legend>
          <label><input type="radio" name="fx-fd-show" checked={show === 'sheet'} onChange={() => setShow('sheet')} /> {t('showSheet')}</label>
          <label><input type="radio" name="fx-fd-show" checked={show === 'board'} onChange={() => setShow('board')} /> {t('showBoard')}</label>
        </fieldset>
        {err && <p className="fx-fd-err" role="alert">{err}</p>}
        <div className="fx-sh-dialog-row">
          <button type="button" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="is-go" data-values-save="" onClick={save}>{t('save')}</button>
        </div>
    </Modal>
  )
}

/** "Use this column for Stage/Type/Priority": each distinct value in the column matched once. */
export function MatchDialog({ field, colName, values, map, types, linkedRows, onSave, onClose }: {
  field: WordField
  colName: string
  /** The column's distinct values and how many rows hold each. */
  values: { text: string; n: number }[]
  map: SheetTaskMap
  types: string[]
  linkedRows: number
  onSave(words: Record<string, string[]>, win: 'board' | 'sheet'): void
  onClose(): void
}) {
  const t = useTranslations('sheets.fields')
  const locale = useLocale()
  const board = useMemo(() => boardValues(field, types, locale), [field, types, locale])
  const known = (text: string) => {
    const k = normTitle(text)
    const hit = board.find(b => normTitle(b.name) === k || normTitle(b.value) === k || (field === 'stage' && normTitle(STAGE_META[b.value as StageId].label_en) === k))
    if (hit) return hit.value
    for (const [v, list] of Object.entries(map.words?.[field] ?? {})) if (list.some(w => normTitle(w) === k)) return v
    return ''
  }
  const [pick, setPick] = useState<Record<string, string>>(() => Object.fromEntries(values.map(v => [v.text, known(v.text)])))
  const [win, setWin] = useState<'board' | 'sheet'>('board')
  function save() {
    const words: Record<string, string[]> = { ...(map.words?.[field] ?? {}) }
    for (const [text, value] of Object.entries(pick)) {
      if (!value) continue
      const name = board.find(b => b.value === value)?.name ?? ''
      if (normTitle(name) === normTitle(text) || normTitle(value) === normTitle(text)) continue
      const list = words[value] ?? []
      if (!list.some(w => normTitle(w) === normTitle(text))) words[value] = [...list, text]
    }
    onSave(words, win)
  }
  return (
    <Modal title={t('matchTitle', { col: colName })} body={t('matchHelp', { n: values.length, field: t(`names.${field}`) })} onCancel={onClose} className="fx-fd-dialog" attrs={{ 'data-match-dialog': field }}>
        <div className="fx-fd-vtable">
          <b>{t('inColumnHead')}</b><b>{t(`names.${field}`)}</b>
          {values.map(v => [
            <span key={`${v.text}-n`}>“{v.text}” <small>{t('rows', { n: v.n })}</small></span>,
            <select key={`${v.text}-s`} value={pick[v.text] ?? ''} data-match-for={v.text} aria-label={t('matchFor', { text: v.text })}
                    onChange={e => setPick(p => ({ ...p, [v.text]: e.target.value }))}>
              <option value="">{t('notAValue')}</option>
              {board.map(b => <option key={b.value} value={b.value}>{b.name}</option>)}
            </select>,
          ])}
        </div>
        {linkedRows > 0 && (
          <fieldset className="fx-fd-radios">
            <legend>{t('winTitle')}</legend>
            <label><input type="radio" name="fx-fd-win" checked={win === 'board'} onChange={() => setWin('board')} data-win="board" /> {t('winBoard')}</label>
            <label><input type="radio" name="fx-fd-win" checked={win === 'sheet'} onChange={() => setWin('sheet')} data-win="sheet" /> {t('winSheet')}</label>
          </fieldset>
        )}
        <div className="fx-sh-dialog-row">
          <button type="button" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="is-go" data-match-save="" onClick={save}>{t('useFor', { field: t(`names.${field}`) })}</button>
        </div>
    </Modal>
  )
}

/** One row of the Content sheet's drawer: a column, who changed it last, ↑ ↓, and its switch. */
export interface PresetRow { key: string; glyph?: import('@/lib/field-catalog').CatalogKind | null; name: string; icon: TaskField | 'taskcol' | 'regular' | null; shown: boolean; who: string; locked?: boolean; values?: WordField; up: boolean; down: boolean; upLabel: string; downLabel: string }

/**
 * Spec 019 stage 2: the drawer of a sheet whose rows come from the board (the
 * Content sheet). Its rows are a preset; its columns are the sheet's fields
 * and the team's own columns, with the same switches as a team sheet's.
 */
export function PresetFieldsDrawer({ rowsName, rowsHelp, groups, group, onGroup, fields, custom, regular, onToggle, onMove, onValues, onAddRegular, onRename, renameLabel, onClose, view }: {
  /** Fields (25 Nov 2026): custom fields as their own group (Standard first, then Custom, then Sheet only). */
  custom?: PresetRow[]
  /** Fields (25 Nov 2026): your own columns, or the Space's default (admins); Reset to Space default. */
  view?: { mode: 'me' | 'default'; canDefault: boolean; hasOwn: boolean; onMode(mode: 'me' | 'default'): void; onReset(): void }
  rowsName: string
  rowsHelp: string
  groups: { value: string; label: string }[]
  group: string
  onGroup(value: string): void
  fields: PresetRow[]
  regular: PresetRow[]
  onToggle(key: string, on: boolean): void
  onMove(key: string, dir: -1 | 1): void
  onValues(field: WordField): void
  onAddRegular(anchor: HTMLElement): void
  /** Spec 026 (§6): rename a column from the drawer (the sheet's rename box opens at the button). */
  onRename?(key: string, anchor: HTMLElement): void
  renameLabel?(name: string): string
  onClose(): void
}) {
  const t = useTranslations('sheets.fields')
  const tu = useTranslations('sheets.ux')
  const tfs = useTranslations('fieldSystem')
  const ref = useRef<HTMLElement>(null)
  const [q, setQ] = useState('')
  useEffect(() => { ref.current?.querySelector<HTMLElement>('select, button')?.focus() }, [])
  const hit = (r: PresetRow) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())
  const row = (r: PresetRow) => (
    <li key={r.key} className="fx-fd-row" data-field-row={r.key} data-panel-col={r.key}>
      {r.glyph ? <FieldGlyph kind={r.glyph} tone={custom?.includes(r) ? 'custom' : regular.includes(r) ? 'regular' : 'standard'} /> : r.icon && <FieldIcon field={r.icon} />}
      <span className="fx-fd-nm">{r.name}<small className="fx-col-who">{r.who}</small></span>
      {r.values && <button type="button" className="fx-fd-values" data-field-values={r.values} aria-label={tu('valuesFor', { name: r.name })} onClick={() => onValues(r.values!)}>{t('values')}</button>}
      {onRename && <button type="button" className="fx-fd-mv" data-field-rename={r.key} aria-label={renameLabel?.(r.name) ?? r.name} title={renameLabel?.(r.name)} onClick={e => onRename(r.key, e.currentTarget)}>✎</button>}
      <button type="button" className="fx-fd-mv" aria-label={r.upLabel} disabled={!r.up} onClick={() => onMove(r.key, -1)}>↑</button>
      <button type="button" className="fx-fd-mv" aria-label={r.downLabel} disabled={!r.down} onClick={() => onMove(r.key, 1)}>↓</button>
      <button type="button" role="switch" className="fx-nt-sw" aria-checked={r.shown} aria-label={t('showField', { name: r.name })} data-field-switch={r.key}
              disabled={r.locked} onClick={() => onToggle(r.key, !r.shown)} />
    </li>
  )
  return (
    <aside ref={ref} className="fx-fd-drawer" aria-label={t('title')} data-fields-drawer="" data-columns-panel=""
           onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }}>
      <header>
        <h2>{t('title')}</h2>
        <button type="button" aria-label={t('close')} data-fields-close="" onClick={onClose}>×</button>
      </header>
      <div className="fx-fd-scroll">
        {view && (
          <section className="fx-fd-view" data-fields-view={view.mode}>
            <div className="fx-fd-viewbar">
              <div className="fx-fd-seg" role="group" aria-label={tfs('justMe')}>
                <button type="button" aria-pressed={view.mode === 'me'} data-fields-mode="me" onClick={() => view.onMode('me')}>{tfs('justMe')}</button>
                {view.canDefault && <button type="button" aria-pressed={view.mode === 'default'} data-fields-mode="default" onClick={() => view.onMode('default')}>{tfs('spaceDefault')}</button>}
              </div>
              {view.mode === 'me' && view.hasOwn && <button type="button" className="fx-fd-reset" data-fields-reset="" onClick={view.onReset}>{tfs('resetDefault')}</button>}
            </div>
            <label className="fx-fd-search">{tfs('search')}
              <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder={tfs('searchHint')} data-fields-search="" />
            </label>
          </section>
        )}
        <section>
          <h3>{t('rowsTitle')}</h3>
          <div className="fx-fd-src" data-rows-source="">
            <b>{rowsName}</b><small>{rowsHelp}</small>
            <label className="fx-fd-group">
              <span>{t('groupTitle')}</span>
              <select value={group} data-group-by="" onChange={e => onGroup(e.target.value)}>
                {groups.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </label>
          </div>
        </section>
        <section>
          <h3>{custom ? tfs('standard') : t('fieldsTitle')}</h3>
          <ul className="fx-fd-list">{fields.filter(hit).map(row)}</ul>
          {!custom && <p className="fx-fd-hint">{t('dragHint')}</p>}
        </section>
        {custom && (
          <section data-fields-custom="">
            <h3>{tfs('custom')}</h3>
            <ul className="fx-fd-list">{custom.filter(hit).map(row)}</ul>
            <p className="fx-fd-hint">{t('dragHint')}</p>
          </section>
        )}
        <section>
          <h3>{t('regularTitle')}</h3>
          <ul className="fx-fd-list">{regular.filter(hit).map(row)}</ul>
          <button type="button" className="fx-fd-add" data-add-regular="" onClick={e => onAddRegular(e.currentTarget)}><span aria-hidden="true">＋ </span>{t('addRegular')}</button>
        </section>
      </div>
    </aside>
  )
}
