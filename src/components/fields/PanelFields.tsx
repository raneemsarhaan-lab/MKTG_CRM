'use client'

/**
 * Task fields in the task panel (spec 023, user 2026-11-23, design/023-description-fields.html):
 *   - "top" fields (Channels) are rows beside Status and Assignee;
 *   - the others are sections around the Description: Caption above it, TOV below it.
 * A required field has a "Required" badge (hover: "Required before C-Review"); empty,
 * it shows red words in its place ("Caption not added") that open it for editing.
 * The value is the task's: the sheets, cards and the Fields button read the same one.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { FieldOption, StageId, TaskFieldDef, TaskTypeFieldLink } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { fieldName, fieldsForType, formatValue, isEmpty, parseValue, placeOf, type FieldPlace } from '@/lib/task-fields'
import { setFieldValue } from '@/actions/task-fields'
import { useCardFields } from './CardFields'

export const FIELD_RED = '#D22040'
/** Sent by the panel when a move is refused: the sections it names are outlined and scrolled to. */
export const REQUIRED_EVENT = 'fx-required-fields'

type Entry = { field: TaskFieldDef; link: TaskTypeFieldLink; value: unknown }

function usePanelFields(task: { id: string; content_type_label: string | null }) {
  const c = useCardFields()
  const router = useRouter()
  const [local, setLocal] = useState<Record<string, unknown>>({})
  const base = c?.values.get(task.id)
  useEffect(() => { setLocal({}) }, [base])
  const entries: Entry[] = useMemo(() => (c ? fieldsForType(task.content_type_label, c.links, c.fields) : [])
    .map(x => ({ ...x, value: x.field.id in local ? local[x.field.id] : base?.get(x.field.id) })), [c, task.content_type_label, local, base])
  async function save(f: TaskFieldDef, value: unknown): Promise<string | null> {
    const p = parseValue(f, value)
    if (!p.ok) return 'invalid'
    setLocal(l => ({ ...l, [f.id]: p.value }))
    const r = await setFieldValue(task.id, f.id, value).catch(() => ({ success: false as const, error: 'generic' }))
    if (!r.success) { setLocal(l => { const n = { ...l }; delete n[f.id]; return n }); return r.error ?? 'generic' }
    router.refresh()
    return null
  }
  return { entries, save, members: c?.members ?? [], taskName: c?.taskName }
}

const stageName = (s: string | null, locale: string) => {
  const m = s ? STAGE_META[s as StageId] : null
  return m ? (locale.startsWith('ar') ? m.label_ar : m.label_en) : ''
}

function RequiredBadge({ link }: { link: TaskTypeFieldLink }) {
  const t = useTranslations('fields')
  const locale = useLocale()
  if (!link.required_from) return null
  const why = t('requiredBefore', { stage: stageName(link.required_from, locale) })
  return (
    <span data-field-required-badge="" title={why} aria-label={why} tabIndex={0}
      style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: '#F3F6FD', border: '1px solid #E9EDF4', color: '#68738D', cursor: 'help' }}>
      {t('required')}
    </span>
  )
}

// ─── the top rows (Channels) ────────────────────────────────────────────────

/** The panel's top rows for fields placed there; `Row` is the panel's own row (label + value). */
export function PanelTopFields({ task, canEdit, Row }: {
  task: { id: string; content_type_label: string | null }; canEdit: boolean
  Row: (p: { label: string; children: ReactNode }) => ReactNode
}) {
  const { entries, save } = usePanelFields(task)
  const locale = useLocale()
  // Row is called, not mounted: the panel passes a fresh function each render, and the editors keep their state.
  return <>{entries.filter(e => placeOf(e.field) === 'top').map(e => (
    <Fragment key={e.field.id}>{Row({ label: fieldName(e.field, locale), children: (
      <span data-panel-field={e.field.name_en} style={{ display: 'contents' }}>
        <FieldValueEditor entry={e} canEdit={canEdit} save={save} compact />
      </span>
    ) })}</Fragment>
  ))}</>
}

// ─── the sections around the Description (Caption above, TOV below) ────────

export function hasSections(task: { content_type_label: string | null }, fields: TaskFieldDef[] | undefined, links: TaskTypeFieldLink[] | undefined) {
  return !!fields && !!links && fieldsForType(task.content_type_label, links, fields).some(x => placeOf(x.field) !== 'top')
}

export function PanelFieldSections({ task, canEdit, place }: {
  task: { id: string; content_type_label: string | null }; canEdit: boolean; place: Exclude<FieldPlace, 'top'>
}) {
  const { entries, save } = usePanelFields(task)
  const [flagged, setFlagged] = useState<string[]>([])
  const refs = useRef(new Map<string, HTMLElement>())
  useEffect(() => {
    const on = (ev: Event) => {
      const d = (ev as CustomEvent<{ taskId: string; missing: string[] }>).detail
      if (d?.taskId !== task.id) return
      setFlagged(d.missing)
      const first = entries.find(e => d.missing.includes(e.field.name_en) && placeOf(e.field) === place)
      const el = first ? refs.current.get(first.field.id) : null
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    window.addEventListener(REQUIRED_EVENT, on)
    return () => window.removeEventListener(REQUIRED_EVENT, on)
  }, [task.id, entries, place])
  const list = entries.filter(e => placeOf(e.field) === place)
  if (!list.length) return null
  return (
    <div data-field-sections={place} style={{ display: 'grid', gap: 6, margin: place === 'above' ? '0 0 10px' : '12px 0 0' }}>
      {list.map(e => (
        <Section key={e.field.id} entry={e} canEdit={canEdit} save={save}
          flagged={flagged.includes(e.field.name_en) && isEmpty(e.value)} setRef={el => { if (el) refs.current.set(e.field.id, el) }} />
      ))}
    </div>
  )
}

/** The "Description" heading, shown when the type has sections around it. */
export function DescriptionLabel() {
  const t = useTranslations('fields')
  return <div style={{ ...HEAD, marginBottom: 4 }}>{t('descriptionLabel')}</div>
}

const HEAD: React.CSSProperties = { fontSize: 12.5, fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', color: '#18233F' }

function Section({ entry, canEdit, save, flagged, setRef }: { entry: Entry; canEdit: boolean; save: (f: TaskFieldDef, v: unknown) => Promise<string | null>; flagged: boolean; setRef: (el: HTMLElement | null) => void }) {
  const locale = useLocale()
  const { field, link, value } = entry
  const hint = field.options.hint ? (locale.startsWith('ar') && field.options.hint.ar ? field.options.hint.ar : field.options.hint.en) : null
  const count = field.kind === 'text' && typeof value === 'string' && value.trim() ? value.trim().length : null
  return (
    <section ref={setRef} data-field-section={field.name_en} data-field-id={field.id}
      style={{ borderRadius: 10, padding: '8px 10px 10px', margin: '0 -10px', display: 'grid', gap: 4,
        background: flagged ? '#FDE7EA' : 'transparent', boxShadow: flagged ? `inset 0 0 0 1.5px ${FIELD_RED}` : 'none', transition: 'background .15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={locale.startsWith('ar') ? { ...HEAD, textTransform: 'none', letterSpacing: 0 } : HEAD}>{fieldName(field, locale)}</span>
        {hint && <span style={{ fontSize: 12, color: '#929CB0' }}>{hint}</span>}
        <RequiredBadge link={link} />
        {count !== null && <span data-field-count="" style={{ marginInlineStart: 'auto', fontSize: 11.5, color: '#929CB0', fontVariantNumeric: 'tabular-nums' }}>{count.toLocaleString(locale.startsWith('ar') ? 'ar-EG-u-nu-latn' : 'en-US')}</span>}
      </div>
      <FieldValueEditor entry={entry} canEdit={canEdit} save={save} />
    </section>
  )
}

// ─── one value's editor, by kind ────────────────────────────────────────────

function FieldValueEditor({ entry, canEdit, save, compact = false }: { entry: Entry; canEdit: boolean; save: (f: TaskFieldDef, v: unknown) => Promise<string | null>; compact?: boolean }) {
  const t = useTranslations('fields')
  const locale = useLocale()
  const { field, link, value } = entry
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  const run = async (v: unknown) => { const e = await save(field, v); setErr(e ? t('badValue', { field: fieldName(field, locale) }) : '') }
  const required = !!link.required_from
  const empty = isEmpty(value)
  const ctx = useCardFields()
  const shown = empty ? '' : formatValue(field, value, { locale, memberName: id => ctx?.members.find(m => m.id === id)?.name, taskName: ctx?.taskName })
  const input: React.CSSProperties = { font: 'inherit', fontSize: 14.5, color: '#18233F', border: '1px solid #E9EDF4', borderRadius: 8, padding: '6px 9px', background: '#fff', minWidth: 0 }

  if (field.kind === 'multi' || field.kind === 'choice') {
    return <Chips field={field} value={value} canEdit={canEdit} onChange={run} />
  }
  if (field.kind === 'text') {
    if (empty && !open) {
      if (required) {
        return (
          <button type="button" data-field-missing={field.name_en} disabled={!canEdit} onClick={() => setOpen(true)}
            style={{ justifySelf: 'start', border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 14.5, color: FIELD_RED, cursor: canEdit ? 'text' : 'default', textAlign: 'start' }}>
            {t('notAdded', { field: fieldName(field, locale) })}
          </button>
        )
      }
      if (!canEdit) return <span style={{ color: '#929CB0', fontSize: 14.5 }}>–</span>
    }
    return <TextArea key={field.id} value={typeof value === 'string' ? value : shown} canEdit={canEdit} autoFocus={open} label={fieldName(field, locale)}
      placeholder={t('writeHere', { field: fieldName(field, locale) })} onDone={async v => { setOpen(false); if (v !== (typeof value === 'string' ? value : '')) await run(v) }} />
  }
  if (!canEdit) return <span style={{ fontSize: 14.5, color: empty ? '#929CB0' : '#18233F' }}>{shown || '–'}</span>
  let control: ReactNode
  switch (field.kind) {
    case 'checkbox':
      control = <input type="checkbox" aria-label={fieldName(field, locale)} checked={value === true} onChange={e => void run(e.target.checked)} />
      break
    case 'rating': {
      const max = field.options.max ?? 5, n = typeof value === 'number' ? value : 0
      control = <span role="radiogroup" aria-label={fieldName(field, locale)} style={{ display: 'inline-flex', gap: 2 }}>
        {Array.from({ length: max }, (_, i) => (
          <button key={i} type="button" role="radio" aria-checked={n === i + 1} aria-label={String(i + 1)} onClick={() => void run(n === i + 1 ? null : i + 1)}
            style={{ border: 'none', background: 'none', padding: 0, fontSize: 18, cursor: 'pointer', color: i < n ? '#C99A06' : '#D5DAE5' }}>★</button>
        ))}
      </span>
      break
    }
    case 'person':
      control = <select aria-label={fieldName(field, locale)} style={input} value={typeof value === 'string' ? value : ''} onChange={e => void run(e.target.value || null)}>
        <option value="">–</option>{ctx?.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      break
    case 'date':
      control = <input type="date" aria-label={fieldName(field, locale)} style={input} defaultValue={typeof value === 'string' ? value : ''} onBlur={e => { if (e.target.value !== (value ?? '')) void run(e.target.value || null) }} />
      break
    default:
      control = <input aria-label={fieldName(field, locale)} style={{ ...input, width: compact ? 'auto' : '100%' }} defaultValue={shown} inputMode={field.kind === 'number' || field.kind === 'money' ? 'decimal' : undefined}
        dir={field.kind === 'link' ? 'ltr' : undefined} onBlur={e => { if (e.target.value !== shown) void run(e.target.value) }} />
  }
  return <span style={{ display: 'grid', gap: 2 }}>{control}{err && <span role="alert" style={{ color: FIELD_RED, fontSize: 12.5 }}>{err}</span>}</span>
}

function TextArea({ value, canEdit, autoFocus, label, placeholder, onDone }: { value: string; canEdit: boolean; autoFocus: boolean; label: string; placeholder: string; onDone: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [v, setV] = useState(value)
  useEffect(() => { if (document.activeElement !== ref.current) setV(value) }, [value])
  const grow = () => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` } }
  useEffect(() => { grow(); if (autoFocus) ref.current?.focus() }, [autoFocus]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(grow, [v])
  return (
    <textarea ref={ref} rows={1} value={v} readOnly={!canEdit} aria-label={label} placeholder={placeholder} data-field-text=""
      onChange={e => setV(e.target.value)} onBlur={() => onDone(v.replace(/\s+$/, ''))}
      onKeyDown={e => { if (e.key === 'Escape') { setV(value); (e.target as HTMLTextAreaElement).blur() } }}
      style={{ font: 'inherit', fontSize: 14.5, lineHeight: 1.6, color: '#18233F', border: 'none', outline: 'none', resize: 'none', background: 'transparent',
        padding: 0, width: '100%', overflow: 'hidden', whiteSpace: 'pre-wrap' }} />
  )
}

/** Choice and multi-choice: coloured chips, × to remove, "+ Add" for the rest. */
function Chips({ field, value, canEdit, onChange }: { field: TaskFieldDef; value: unknown; canEdit: boolean; onChange: (v: unknown) => void }) {
  const t = useTranslations('fields')
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const all = field.options.choices ?? []
  const multi = field.kind === 'multi'
  const picked: string[] = multi ? (Array.isArray(value) ? value as string[] : []) : typeof value === 'string' && value ? [value] : []
  const name = (c: FieldOption) => (locale.startsWith('ar') && c.ar ? c.ar : c.en)
  const rest = all.filter(c => !picked.includes(c.id))
  const set = (ids: string[]) => onChange(multi ? ids : ids[ids.length - 1] ?? null)
  return (
    <span ref={box} data-field-chips={field.name_en} style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', position: 'relative' }}>
      {picked.map(id => all.find(c => c.id === id)).filter((c): c is FieldOption => !!c).map(c => (
        <span key={c.id} data-chip={c.en} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '3px 9px', borderRadius: 999, border: '1px solid #E9EDF4', background: '#fff', color: '#18233F' }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: c.color ?? '#929CB0' }} />
          {name(c)}
          {canEdit && <button type="button" aria-label={t('removeOne', { name: name(c) })} onClick={() => set(picked.filter(x => x !== c.id))}
            style={{ border: 'none', background: 'none', padding: 0, color: '#929CB0', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>}
        </span>
      ))}
      {!picked.length && !canEdit && <span style={{ color: '#929CB0' }}>–</span>}
      {canEdit && rest.length > 0 && (
        <button type="button" data-chip-add="" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}
          style={{ border: '1px dashed #D5DAE5', background: 'transparent', borderRadius: 999, padding: '3px 10px', font: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#68738D', cursor: 'pointer' }}>
          {t('add')}
        </button>
      )}
      {open && (
        <span role="listbox" aria-label={fieldName(field, locale)} style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', insetInlineStart: 0, minWidth: 170, maxHeight: 260, overflowY: 'auto',
          background: '#fff', border: '1px solid #E9EDF4', borderRadius: 10, boxShadow: '0 12px 34px rgba(20,20,20,.16)', padding: 4, display: 'grid' }}>
          {rest.map(c => (
            <button key={c.id} type="button" role="option" aria-selected={false} data-chip-option={c.en} onClick={() => { set([...picked, c.id]); if (!multi || rest.length === 1) setOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', padding: '7px 9px', borderRadius: 7, font: 'inherit', fontSize: 13.5, color: '#18233F', cursor: 'pointer', textAlign: 'start' }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: c.color ?? '#929CB0' }} />{name(c)}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
