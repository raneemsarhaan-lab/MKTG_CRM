'use client'

/**
 * "Fields" on a Board, List or Sheet (user, 2026-11-23): the standard fields
 * and the custom fields as one list of switches, and "+ Field" at the bottom
 * for admins and superusers — the new field is attached to the task types
 * picked (those on the page by default) and shown here at once.
 */
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { ContentType, FieldKind, TaskFieldDef, TaskTypeFieldLink } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import { VIEW_FIELDS } from '@/lib/view-config'
import { FIELD_KINDS, fieldName } from '@/lib/task-fields'
import { TYPE_COLORS, typeName } from '@/lib/task-types'
import { attachField, createField } from '@/actions/task-fields'
import { TypeIcon } from '@/components/types/TypeIcon'

export interface FieldsSetup {
  custom: TaskFieldDef[]
  links: TaskTypeFieldLink[]
  types: ContentType[]
  /** The task types of the tasks on this page: "+ Field" attaches to these unless changed. */
  typesOnPage: string[]
  canCreate: boolean
}

const pill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 8, padding: '5px 10px', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: PIPE.ink, cursor: 'pointer', whiteSpace: 'nowrap' }
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', fontSize: 12.5, cursor: 'pointer', borderRadius: 6 }
const head: React.CSSProperties = { margin: '6px 6px 4px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: PIPE.textMuted }

export function FieldsMenu({ shown, setup, onChange }: { shown: string[]; setup: FieldsSetup; onChange: (keys: string[]) => void }) {
  const t = useTranslations('fields')
  const tCol = useTranslations('taskSheet')
  const tk = useTranslations('fields.kinds')
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setAdding(false) } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const live = setup.custom.filter(f => !f.retired)
  const toggle = (key: string, on: boolean) => onChange(on ? [...shown.filter(k => k !== key), key] : shown.filter(k => k !== key))
  const count = shown.length
  const typesOf = (f: TaskFieldDef) => setup.links.filter(l => l.field_id === f.id).map(l => setup.types.find(x => x.label === l.type_label)).filter((x): x is ContentType => !!x)

  return (
    <div ref={box} style={{ position: 'relative' }} onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setAdding(false) } }}>
      <button type="button" data-fields-button aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)} style={pill}>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ flex: 'none' }}>
          <path d="M4 6h16M4 12h10M4 18h6" />
        </svg>
        {t('button')} <span style={{ color: PIPE.textMuted, fontWeight: 600 }}>{count}</span>
      </button>
      {open && (
        <div role="dialog" aria-label={t('button')} data-fields-menu
          style={{ position: 'absolute', zIndex: 40, top: 'calc(100% + 6px)', insetInlineEnd: 0, width: 280, maxHeight: 440, overflowY: 'auto',
            background: '#FFFFFF', border: `1px solid ${PIPE.border}`, borderRadius: 12, padding: 6, boxShadow: '0 12px 30px rgba(0,0,0,.12)' }}>
          <p style={head}>{t('standard')}</p>
          {VIEW_FIELDS.map(k => (
            <label key={k} style={row}>
              <input type="checkbox" data-view-field={k} checked={shown.includes(k)} onChange={e => toggle(k, e.target.checked)} />
              {tCol(`col.${k as 'brand'}`)}
            </label>
          ))}
          <p style={{ ...head, marginTop: 10 }}>{t('custom')}</p>
          {!live.length && <p style={{ margin: '2px 6px 6px', fontSize: 12, color: PIPE.textMuted }}>{t('noCustom')}</p>}
          {live.map(f => {
            const ts = typesOf(f)
            return (
              <label key={f.id} style={{ ...row, alignItems: 'flex-start' }}>
                <input type="checkbox" data-view-field={`f:${f.id}`} checked={shown.includes(`f:${f.id}`)} onChange={e => toggle(`f:${f.id}`, e.target.checked)} style={{ marginTop: 2 }} />
                <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
                  <span>{fieldName(f, locale)} <span style={{ color: PIPE.textMuted, fontSize: 11 }}>· {tk(f.kind)}</span></span>
                  <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', fontSize: 11, color: PIPE.textMuted }}>
                    {ts.length ? ts.map(x => <span key={x.label} style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}><TypeIcon icon={x.icon} color={x.color} size={10} />{typeName(x, locale)}</span>) : t('notAttached')}
                  </span>
                </span>
              </label>
            )
          })}
          {setup.canCreate && (
            <div style={{ borderTop: `1px solid ${PIPE.border}`, marginTop: 6, paddingTop: 6 }}>
              {adding
                ? <NewField setup={setup} onCancel={() => setAdding(false)} onMade={id => { setAdding(false); onChange([...shown, `f:${id}`]) }} />
                : <button type="button" data-field-add onClick={() => setAdding(true)} style={{ ...row, width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', fontWeight: 700, color: PIPE.ink }}>{t('addField')}</button>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NewField({ setup, onCancel, onMade }: { setup: FieldsSetup; onCancel: () => void; onMade: (id: string) => void }) {
  const t = useTranslations('fields')
  const tk = useTranslations('fields.kinds')
  const locale = useLocale()
  const router = useRouter()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<FieldKind>('text')
  const [choices, setChoices] = useState('')
  const [types, setTypes] = useState<string[]>(setup.typesOnPage)
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const input: React.CSSProperties = { font: 'inherit', fontSize: 12.5, padding: '6px 8px', borderRadius: 7, border: `1px solid ${PIPE.border}`, minWidth: 0, width: '100%', boxSizing: 'border-box' }
  const hasChoices = kind === 'choice' || kind === 'multi'
  function save() {
    start(async () => {
      const list = choices.split(/[,\n،]/).map(x => x.trim()).filter(Boolean)
      const r = await createField({ name_en: name, kind, options: hasChoices ? { choices: list.map((en, i) => ({ en, color: TYPE_COLORS[i % TYPE_COLORS.length] })) } : kind === 'money' ? { currency: 'EGP' } : {} })
      if (!r.success) { setErr(t(r.error === 'exists' ? 'err.exists' : r.error === 'not_authorized' ? 'err.notAllowed' : 'err.invalid')); return }
      for (const label of types) await attachField(label, r.field.id, {})
      onMade(r.field.id)
      router.refresh()
    })
  }
  return (
    <form data-field-add-form onSubmit={e => { e.preventDefault(); if (name.trim()) save() }} style={{ display: 'grid', gap: 8, padding: 6 }}>
      <input autoFocus aria-label={t('englishName')} placeholder={t('newFieldName')} value={name} maxLength={60} onChange={e => setName(e.target.value)} style={input} data-field-add-name />
      <select aria-label={t('kind')} value={kind} onChange={e => setKind(e.target.value as FieldKind)} style={input} data-field-add-kind>
        {FIELD_KINDS.map(k => <option key={k} value={k}>{tk(k)}</option>)}
      </select>
      {hasChoices && <input aria-label={t('choices')} placeholder={t('choicesHint')} value={choices} onChange={e => setChoices(e.target.value)} style={input} data-field-add-choices />}
      <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
        <legend style={{ fontSize: 11, fontWeight: 700, color: PIPE.textMuted, marginBottom: 4 }}>{t('forTypes')}</legend>
        {setup.types.map(x => (
          <label key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={types.includes(x.label)} data-field-add-type={x.label}
              onChange={e => setTypes(ts => (e.target.checked ? [...ts, x.label] : ts.filter(y => y !== x.label)))} />
            <TypeIcon icon={x.icon} color={x.color} size={11} />{typeName(x, locale)}
          </label>
        ))}
      </fieldset>
      {err && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#B42318' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={pill}>{t('cancel')}</button>
        <button type="submit" disabled={pending || !name.trim()} data-field-add-save style={{ ...pill, background: '#C8F24E', borderColor: '#C8F24E' }}>{t('create')}</button>
      </div>
    </form>
  )
}
