'use client'

/**
 * Task types & fields (spec 023 US1–US2, design/023-stage-a.html parts 1–2).
 *   Types tab:  every task type with its Arabic name, icon, colour, default
 *               priority, boards, SLA days and fields. Admins edit.
 *   Fields tab: the workspace field library; each field's kind, options and
 *               the types it's attached to, optional or required from a stage.
 *               Admins and superusers edit.
 * Everyone else reads both.
 */
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { ContentType, FieldKind, FieldOption, StageId, TaskFieldDef, TaskTypeFieldLink } from '@/types/index'
import { CURRENCIES } from '@/types/index'
import { TYPE_COLORS, TYPE_ICONS, typeName } from '@/lib/task-types'
import { FIELD_KINDS, fieldName, newChoiceId } from '@/lib/task-fields'
import { ALL_STAGES, STAGE_META } from '@/lib/stage-meta'
import { saveTaskType } from '@/actions/task-types'
import { createContentType } from '@/actions/settings'
import { attachField, createField, detachField, retireField, updateField } from '@/actions/task-fields'
import { deleteTag, mergeTags, recolorTag, renameTag } from '@/actions/tags'
import { TAG_COLORS } from '@/lib/tags'
import { TypeIcon } from './TypeIcon'
import { TemplatesSettings } from '@/components/settings/TemplatesSettings'
import type { TaskTemplate } from '@/types/index'

interface Props {
  types: ContentType[]
  fields: TaskFieldDef[]
  links: TaskTypeFieldLink[]
  slaDays: Record<string, number>
  taskCounts: Record<string, number>
  canEditTypes: boolean
  canEditFields: boolean
  /** Spec 023 (US4): tags with how many tasks use each; admins manage them. */
  tags?: { id: string; name: string; color: string; count: number }[]
  /** Spec 023 (US7): templates per type; admins and superusers edit. */
  templates?: TaskTemplate[]
  roles?: string[]
}

const PRIORITY_CHOICES = ['Urgent', 'High', 'Normal', 'Low', 'None'] as const
const REQUIRED_STAGES: StageId[] = ALL_STAGES.filter(s => s !== 'todo')

const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--line, #E4E4DF)', borderRadius: 12 }
const input: React.CSSProperties = { font: 'inherit', fontSize: '0.85rem', padding: '7px 10px', borderRadius: 8, border: '1px solid #D9D9D3', background: '#fff', color: 'var(--ink)', minWidth: 0 }
const btn = (primary = false): React.CSSProperties => ({
  font: 'inherit', fontSize: '0.8rem', fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
  border: primary ? 'none' : '1px solid #D9D9D3', background: primary ? 'var(--ink)' : '#fff', color: primary ? '#fff' : 'var(--ink)',
})
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', padding: '3px 9px', borderRadius: 999, background: '#F1F1EE', color: 'var(--ink)' }
const label: React.CSSProperties = { display: 'grid', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)' }

export function TaskTypesPage(p: Props) {
  const t = useTranslations('types')
  const tf = useTranslations('fields')
  const locale = useLocale()
  const [tab, setTab] = useState<'types' | 'fields' | 'tags' | 'templates'>('types')
  const readOnly = tab === 'fields' || tab === 'templates' ? !p.canEditFields : !p.canEditTypes

  return (
    // A darker muted grey on this page: the app-wide one is under 4.5:1 on these greys (axe).
    <div style={{ overflowY: 'auto', height: '100%', background: '#F6F6F4', ['--muted' as string]: '#5E6166' } as React.CSSProperties}>
      <div className="fx-settings" style={{ maxWidth: 980, margin: '0 auto', padding: '32px 40px 60px' }}>
        <div style={{ marginBottom: 22 }}>
          <p style={{ fontWeight: 700, fontSize: '0.62rem', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 8px' }}>{t('eyebrow')}</p>
          <div style={{ height: 2, width: 32, background: '#C8F24E', borderRadius: 2, marginBottom: 14 }} />
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--ink)', margin: 0 }}>{t('title')}</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '6px 0 0' }}>{t('intro')}</p>
        </div>
        <div role="tablist" className="fx-tabs" style={{ display: 'inline-flex', borderRadius: 10, padding: 4, background: '#EBEBEB', marginBottom: 20, gap: 2 }}>
          {(['types', 'fields', 'tags', 'templates'] as const).map(k => (
            <button key={k} role="tab" aria-selected={tab === k} data-types-tab={k} onClick={() => setTab(k)}
              style={{ fontSize: '0.82rem', fontWeight: 700, padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: tab === k ? '#fff' : 'transparent', color: tab === k ? 'var(--ink)' : 'var(--muted)', boxShadow: tab === k ? '0 1px 3px rgba(16,16,11,.12)' : 'none' }}>
              {k === 'types' ? t('tabTypes') : k === 'fields' ? t('tabFields') : k === 'tags' ? t('tabTags') : t('tabTemplates')}
            </button>
          ))}
        </div>
        {readOnly && <p data-read-only style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 14px' }}>{tab === 'types' ? t('readOnly') : tab === 'tags' ? t('tagsReadOnly') : tab === 'templates' ? t('templatesReadOnly') : tf('readOnly')}</p>}
        {tab === 'types' ? <TypesTab {...p} locale={locale} /> : tab === 'fields' ? <FieldsTab {...p} locale={locale} /> : tab === 'tags' ? <TagsTab tags={p.tags ?? []} canEdit={p.canEditTypes} />
          : <TemplatesSettings templates={p.templates ?? []} types={p.types} roles={p.roles ?? []} canEdit={p.canEditFields} />}
      </div>
    </div>
  )
}

// ─── Types ──────────────────────────────────────────────────────────────────

function TypesTab(p: Props & { locale: string }) {
  const t = useTranslations('types')
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [msg, setMsg] = useState('')
  const [pending, start] = useTransition()
  const fieldsOf = (label: string) => p.links.filter(l => l.type_label === label)
    .map(l => p.fields.find(f => f.id === l.field_id)).filter((f): f is TaskFieldDef => !!f && !f.retired)

  function add() {
    const name = newName.trim()
    if (!name) return
    start(async () => {
      const r = await createContentType(name)
      if (!r.success) { setMsg(t('err.exists')); return }
      setNewName(''); setMsg(t('added', { name })); router.refresh()
    })
  }

  return (
    <div data-task-types style={{ ...card, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: 640 }}>
          <thead>
            <tr style={{ textAlign: 'start', color: 'var(--muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {['type', 'arabic', 'priority', 'boards', 'sla', 'fields', ''].map(h => <th key={h} style={{ textAlign: 'start', padding: '10px 14px', fontWeight: 700, borderBottom: '1px solid #EEE' }}>{h ? t(`col.${h}`) : ''}</th>)}
            </tr>
          </thead>
          <tbody>
            {p.types.map(ct => (
              <TypeRow key={ct.id} ct={ct} p={p} fields={fieldsOf(ct.label)} editing={editing === ct.label}
                onEdit={() => setEditing(editing === ct.label ? null : ct.label)} onDone={m => { setEditing(null); if (m) setMsg(m); router.refresh() }} />
            ))}
          </tbody>
        </table>
      </div>
      {p.canEditTypes && (
        <div style={{ display: 'flex', gap: 8, padding: 14, borderTop: '1px solid #EEE', flexWrap: 'wrap' }}>
          <input aria-label={t('newName')} placeholder={t('newName')} value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }} style={{ ...input, flex: '1 1 200px' }} data-type-new-name />
          <button style={btn(true)} onClick={add} disabled={pending || !newName.trim()} data-type-new>{t('add')}</button>
        </div>
      )}
      <p role="status" aria-live="polite" style={{ margin: 0, padding: msg ? '0 14px 12px' : 0, fontSize: '0.8rem', color: 'var(--muted)' }}>{msg}</p>
    </div>
  )
}

function TypeRow({ ct, p, fields, editing, onEdit, onDone }: { ct: ContentType; p: Props & { locale: string }; fields: TaskFieldDef[]; editing: boolean; onEdit: () => void; onDone: (msg?: string) => void }) {
  const t = useTranslations('types')
  const tp = useTranslations('types.priorities')
  const boards = ct.media_boards?.length ? ct.media_boards.map(b => t(`boards.${b}` as 'boards.design')).join(' · ') : t('boards.none')
  const cell: React.CSSProperties = { padding: '10px 14px', borderBottom: '1px solid #F2F2EF', verticalAlign: 'middle' }
  return (
    <>
      <tr data-task-type={ct.label}>
        <td style={cell}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 7, background: `${ct.color ?? '#6B7280'}1A` }}>
              <TypeIcon icon={ct.icon} color={ct.color} size={15} />
            </span>
            {ct.label}
          </span>
        </td>
        <td style={cell} dir="rtl" lang="ar">{ct.name_ar || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
        <td style={cell}>{ct.default_priority ? tp(priorityKey(ct.default_priority)) : <span style={{ color: 'var(--muted)' }}>{t('creatorChooses')}</span>}</td>
        <td style={cell}>{boards}</td>
        <td style={cell}>{t('slaDays', { n: p.slaDays[ct.label] ?? 0 })}</td>
        <td style={cell}>{fields.length ? fields.map(f => fieldName(f, p.locale)).join(' · ') : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
        <td style={{ ...cell, textAlign: 'end' }}>
          {p.canEditTypes && <button style={btn()} onClick={onEdit} aria-expanded={editing} data-type-edit={ct.label}>{editing ? t('close') : t('edit')}</button>}
        </td>
      </tr>
      {editing && (
        <tr><td colSpan={7} style={{ padding: 0, borderBottom: '1px solid #EEE', background: '#FAFAF8' }}>
          <TypeEditor ct={ct} count={p.taskCounts[ct.label] ?? 0} onDone={onDone} />
        </td></tr>
      )}
    </>
  )
}

const priorityKey = (v: string) => (v === 'Medium' ? 'Normal' : v) as 'Normal' // older rows

function TypeEditor({ ct, count, onDone }: { ct: ContentType; count: number; onDone: (msg?: string) => void }) {
  const t = useTranslations('types')
  const tp = useTranslations('types.priorities')
  const [name, setName] = useState(ct.label)
  const [ar, setAr] = useState(ct.name_ar ?? '')
  const [icon, setIcon] = useState(ct.icon ?? 'doc')
  const [color, setColor] = useState((ct.color ?? '#6B7280').toUpperCase())
  const [priority, setPriority] = useState<string>(ct.default_priority ? priorityKey(ct.default_priority) : '')
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const save = () => start(async () => {
    const r = await saveTaskType(ct.label, { label: name, name_ar: ar || null, icon, color, default_priority: priority || null })
    if (!r.success) { setErr(t(`err.${r.error === 'exists' ? 'exists' : r.error === 'not_authorized' ? 'notAllowed' : 'invalid'}`)); return }
    onDone(t('saved', { name: r.label }))
  })
  return (
    <div data-type-editor={ct.label} style={{ display: 'grid', gap: 14, padding: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <label style={label}>{t('englishName')}
          <input style={input} value={name} onChange={e => setName(e.target.value)} maxLength={40} data-type-field="label" />
          {name.trim() !== ct.label && count > 0 && <span style={{ fontWeight: 400 }}>{t('renameNote', { n: count })}</span>}
        </label>
        <label style={label}>{t('arabicName')}
          <input style={input} value={ar} onChange={e => setAr(e.target.value)} maxLength={40} dir="rtl" lang="ar" data-type-field="name_ar" />
        </label>
        <label style={label}>{t('defaultPriority')}
          <select style={input} value={priority} onChange={e => setPriority(e.target.value)} data-type-field="priority">
            <option value="">{t('creatorChooses')}</option>
            {PRIORITY_CHOICES.map(v => <option key={v} value={v}>{tp(v)}</option>)}
          </select>
        </label>
      </div>
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ ...label, marginBottom: 6 }}>{t('icon')}</legend>
        <div role="radiogroup" aria-label={t('icon')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TYPE_ICONS.map(i => (
            <button key={i} type="button" role="radio" aria-checked={icon === i} aria-label={i} title={i} data-type-icon-choice={i} onClick={() => setIcon(i)}
              style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer',
                border: icon === i ? `2px solid ${color}` : '1px solid #D9D9D3', background: icon === i ? `${color}14` : '#fff' }}>
              <TypeIcon icon={i} color={icon === i ? color : '#4A5061'} size={16} />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ ...label, marginBottom: 6 }}>{t('colour')}</legend>
        <div role="radiogroup" aria-label={t('colour')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TYPE_COLORS.map(c => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} data-type-color-choice={c} onClick={() => setColor(c)}
              style={{ width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', background: c, border: color === c ? '3px solid var(--ink)' : '2px solid #fff', boxShadow: '0 0 0 1px #D9D9D3' }} />
          ))}
        </div>
      </fieldset>
      {err && <p role="alert" style={{ margin: 0, color: '#B42318', fontSize: '0.8rem' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button style={btn()} onClick={() => onDone()}>{t('cancel')}</button>
        <button style={btn(true)} onClick={save} disabled={pending || !name.trim()} data-type-save>{t('save')}</button>
      </div>
    </div>
  )
}

// ─── Fields ─────────────────────────────────────────────────────────────────

function FieldsTab(p: Props & { locale: string }) {
  const tf = useTranslations('fields')
  const router = useRouter()
  const [showRetired, setShowRetired] = useState(false)
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState('')
  const live = p.fields.filter(f => !f.retired)
  const retired = p.fields.filter(f => f.retired)
  const done = (m?: string) => { if (m) setMsg(m); router.refresh() }
  return (
    <div data-fields style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--ink)' }}>{tf('library')}</h2>
        {p.canEditFields && !creating && <button style={btn(true)} onClick={() => setCreating(true)} data-field-new>{tf('new')}</button>}
      </div>
      {creating && <FieldEditorForm onDone={m => { setCreating(false); done(m) }} />}
      {!live.length && !creating && <p style={{ ...card, padding: 18, margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>{tf('empty')}</p>}
      {live.map(f => <FieldRow key={f.id} f={f} p={p} onDone={done} />)}
      {retired.length > 0 && (
        <div>
          <button style={{ ...btn(), border: 'none', background: 'transparent', paddingInline: 0, color: 'var(--muted)' }} onClick={() => setShowRetired(v => !v)} aria-expanded={showRetired} data-fields-retired>
            {tf('retiredCount', { n: retired.length })}
          </button>
          {showRetired && <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>{retired.map(f => <FieldRow key={f.id} f={f} p={p} onDone={done} />)}</div>}
        </div>
      )}
      <p role="status" aria-live="polite" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>{msg}</p>
    </div>
  )
}

function stageLabel(id: StageId, locale: string) {
  const m = STAGE_META[id]
  return locale.startsWith('ar') ? m.label_ar : m.label_en
}

function FieldRow({ f, p, onDone }: { f: TaskFieldDef; p: Props & { locale: string }; onDone: (m?: string) => void }) {
  const tf = useTranslations('fields')
  const tk = useTranslations('fields.kinds')
  const [editing, setEditing] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const attached = p.links.filter(l => l.field_id === f.id)
  const typeOf = (label: string) => p.types.find(x => x.label === label)
  const free = p.types.filter(x => !attached.some(a => a.type_label === x.label))
  const run = (fn: () => Promise<{ success: boolean; error?: string }>, ok?: string) => start(async () => {
    const r = await fn()
    if (!r.success) { setErr(tf(r.error === 'not_authorized' ? 'err.notAllowed' : r.error === 'exists' ? 'err.exists' : 'err.invalid')); return }
    setErr(''); onDone(ok)
  })
  const kindText = f.kind === 'money' ? `${tk('money')} · ${f.options.currency ?? 'EGP'}` : tk(f.kind)
  return (
    <div data-field-row={f.name_en} style={{ ...card, padding: 14, display: 'grid', gap: 10, opacity: f.retired ? 0.7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.92rem', color: 'var(--ink)' }}>{fieldName(f, p.locale)}</strong>
        {f.name_ar && !p.locale.startsWith('ar') && <span dir="rtl" lang="ar" style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{f.name_ar}</span>}
        <span style={{ ...chip, background: '#EEF3FF' }} data-field-kind={f.kind}>{kindText}</span>
        {f.on_card && <span style={chip}>{tf('onCard')}</span>}
        {f.switchable && <span style={chip}>{tf('switchable')}</span>}
        {f.retired && <span style={{ ...chip, background: '#FDECEC' }}>{tf('retired')}</span>}
        <span style={{ flex: 1 }} />
        {p.canEditFields && !f.retired && <button style={btn()} onClick={() => setEditing(v => !v)} aria-expanded={editing} data-field-edit>{editing ? tf('close') : tf('edit')}</button>}
        {p.canEditFields && (
          <button style={btn()} disabled={pending} data-field-retire={f.retired ? 'restore' : 'retire'}
            onClick={() => run(() => retireField(f.id, !f.retired), f.retired ? tf('restored', { name: f.name_en }) : tf('retiredMsg', { name: f.name_en }))}>
            {f.retired ? tf('restore') : tf('retire')}
          </button>
        )}
      </div>
      {(f.kind === 'choice' || f.kind === 'multi') && !!f.options.choices?.length && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {f.options.choices.map(c => (
            <span key={c.id} style={{ ...chip, background: c.color ? `${c.color}22` : '#F1F1EE' }}>
              {c.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />}
              {p.locale.startsWith('ar') && c.ar ? c.ar : c.en}
            </span>
          ))}
        </div>
      )}
      {editing && <FieldEditorForm field={f} onDone={m => { setEditing(false); onDone(m) }} />}
      {!f.retired && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {attached.map(a => {
            const ty = typeOf(a.type_label)
            return (
              <span key={a.type_label} style={{ ...chip, background: '#fff', border: '1px solid #E4E4DF' }} data-field-attached={a.type_label}>
                <TypeIcon icon={ty?.icon} color={ty?.color} size={12} />
                {ty ? typeName(ty, p.locale) : a.type_label}
                {p.canEditFields ? (
                  <select aria-label={tf('requiredFor', { type: a.type_label })} value={a.required_from ?? ''} data-field-required={a.type_label}
                    onChange={e => run(() => attachField(a.type_label, f.id, { required_from: e.target.value || null }), tf('savedAttach'))}
                    style={{ font: 'inherit', fontSize: '0.75rem', border: 'none', background: 'transparent', color: a.required_from ? '#B42318' : 'var(--muted)', cursor: 'pointer' }}>
                    <option value="">{tf('optional')}</option>
                    {REQUIRED_STAGES.map(s => <option key={s} value={s}>{tf('requiredFrom', { stage: stageLabel(s, p.locale) })}</option>)}
                  </select>
                ) : (
                  <span style={{ color: a.required_from ? '#B42318' : 'var(--muted)' }}>· {a.required_from ? tf('requiredFrom', { stage: stageLabel(a.required_from, p.locale) }) : tf('optional')}</span>
                )}
                {p.canEditFields && (
                  <button aria-label={tf('detach', { type: a.type_label })} data-field-detach={a.type_label} onClick={() => run(() => detachField(a.type_label, f.id))}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1, padding: 0 }}>×</button>
                )}
              </span>
            )
          })}
          {!attached.length && <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{tf('notAttached')}</span>}
          {p.canEditFields && free.length > 0 && !attaching && <button style={{ ...btn(), padding: '3px 10px', fontSize: '0.75rem' }} onClick={() => setAttaching(true)} data-field-attach>{tf('attach')}</button>}
          {attaching && <AttachForm f={f} types={free} locale={p.locale} onCancel={() => setAttaching(false)}
            onSave={(label, req) => { setAttaching(false); run(() => attachField(label, f.id, { required_from: req }), tf('savedAttach')) }} />}
        </div>
      )}
      {err && <p role="alert" style={{ margin: 0, color: '#B42318', fontSize: '0.8rem' }}>{err}</p>}
    </div>
  )
}

function AttachForm({ f, types, locale, onCancel, onSave }: { f: TaskFieldDef; types: ContentType[]; locale: string; onCancel: () => void; onSave: (label: string, required: StageId | null) => void }) {
  const tf = useTranslations('fields')
  const [type, setType] = useState(types[0]?.label ?? '')
  const [req, setReq] = useState<string>('')
  return (
    <span data-attach-form={f.name_en} style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <select aria-label={tf('attachTo')} style={{ ...input, padding: '4px 8px', fontSize: '0.78rem' }} value={type} onChange={e => setType(e.target.value)} data-attach-type>
        {types.map(x => <option key={x.label} value={x.label}>{typeName(x, locale)}</option>)}
      </select>
      <select aria-label={tf('requiredLabel')} style={{ ...input, padding: '4px 8px', fontSize: '0.78rem' }} value={req} onChange={e => setReq(e.target.value)} data-attach-required>
        <option value="">{tf('optional')}</option>
        {REQUIRED_STAGES.map(s => <option key={s} value={s}>{tf('requiredFrom', { stage: stageLabel(s, locale) })}</option>)}
      </select>
      <button style={{ ...btn(true), padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => type && onSave(type, (req || null) as StageId | null)} data-attach-save>{tf('attachSave')}</button>
      <button style={{ ...btn(), padding: '4px 10px', fontSize: '0.75rem' }} onClick={onCancel}>{tf('cancel')}</button>
    </span>
  )
}

function FieldEditorForm({ field, onDone }: { field?: TaskFieldDef; onDone: (msg?: string) => void }) {
  const tf = useTranslations('fields')
  const tk = useTranslations('fields.kinds')
  const [name, setName] = useState(field?.name_en ?? '')
  const [ar, setAr] = useState(field?.name_ar ?? '')
  const [kind, setKind] = useState<FieldKind>(field?.kind ?? 'text')
  const [choices, setChoices] = useState<FieldOption[]>(field?.options.choices ?? [])
  const [currency, setCurrency] = useState(field?.options.currency ?? 'EGP')
  const [place, setPlace] = useState<'top' | 'above' | 'below'>(field?.options.place ?? 'above')
  const [onCard, setOnCard] = useState(field?.on_card ?? false)
  const [switchable, setSwitchable] = useState(field?.switchable ?? false)
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const hasChoices = kind === 'choice' || kind === 'multi'
  const options = useMemo(() => ({
    ...(hasChoices ? { choices: choices.filter(c => c.en.trim()) } : kind === 'money' ? { currency } : kind === 'rating' ? { max: 5 } : {}),
    place, ...(field?.options.hint ? { hint: field.options.hint } : {}),
  }), [hasChoices, choices, kind, currency, place, field])
  const save = () => start(async () => {
    const payload = { name_en: name, name_ar: ar || null, kind, options, on_card: onCard, switchable }
    const r = field ? await updateField(field.id, payload) : await createField(payload)
    if (!r.success) { setErr(tf(r.error === 'exists' ? 'err.exists' : r.error === 'not_authorized' ? 'err.notAllowed' : 'err.invalid')); return }
    const kept = 'kept' in r && typeof r.kept === 'number' ? r.kept : 0
    onDone(field ? (kept ? tf('savedKept', { name, n: kept }) : tf('saved', { name })) : tf('created', { name }))
  })
  return (
    <div data-field-form={field?.id ?? 'new'} style={{ ...card, padding: 14, display: 'grid', gap: 12, background: '#FAFAF8' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label style={label}>{tf('englishName')}<input style={input} value={name} maxLength={60} onChange={e => setName(e.target.value)} data-field-input="name" /></label>
        <label style={label}>{tf('arabicName')}<input style={input} value={ar} maxLength={60} dir="rtl" lang="ar" onChange={e => setAr(e.target.value)} data-field-input="name_ar" /></label>
        <label style={label}>{tf('kind')}
          <select style={input} value={kind} onChange={e => setKind(e.target.value as FieldKind)} data-field-input="kind">
            {FIELD_KINDS.map(k => <option key={k} value={k}>{tk(k)}</option>)}
          </select>
          {field && field.kind !== kind && <span style={{ fontWeight: 400 }}>{tf('kindChangeNote')}</span>}
        </label>
        <label style={label}>{tf('place')}
          <select style={input} value={place} onChange={e => setPlace(e.target.value as 'top' | 'above' | 'below')} data-field-input="place">
            <option value="top">{tf('placeTop')}</option>
            <option value="above">{tf('placeAbove')}</option>
            <option value="below">{tf('placeBelow')}</option>
          </select>
        </label>
        {kind === 'money' && (
          <label style={label}>{tf('currency')}
            <select style={input} value={currency} onChange={e => setCurrency(e.target.value)} data-field-input="currency">
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
      </div>
      {hasChoices && (
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          <legend style={{ ...label, marginBottom: 6 }}>{tf('choices')}</legend>
          {choices.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }} data-choice-row={i}>
              <input aria-label={tf('choiceName', { n: i + 1 })} style={{ ...input, flex: '1 1 140px' }} value={c.en} maxLength={40}
                onChange={e => setChoices(cs => cs.map(x => (x.id === c.id ? { ...x, en: e.target.value } : x)))} />
              <input aria-label={tf('choiceNameAr', { n: i + 1 })} style={{ ...input, flex: '1 1 120px' }} value={c.ar ?? ''} dir="rtl" lang="ar" maxLength={40}
                onChange={e => setChoices(cs => cs.map(x => (x.id === c.id ? { ...x, ar: e.target.value } : x)))} />
              <span role="radiogroup" aria-label={tf('choiceColour', { n: i + 1 })} style={{ display: 'inline-flex', gap: 3 }}>
                {TYPE_COLORS.map(col => (
                  <button key={col} type="button" role="radio" aria-checked={c.color === col} aria-label={col} onClick={() => setChoices(cs => cs.map(x => (x.id === c.id ? { ...x, color: col } : x)))}
                    style={{ width: 18, height: 18, borderRadius: '50%', background: col, cursor: 'pointer', border: c.color === col ? '2px solid var(--ink)' : '1px solid #fff', boxShadow: '0 0 0 1px #D9D9D3', padding: 0 }} />
                ))}
              </span>
              <button aria-label={tf('removeChoice', { n: i + 1 })} onClick={() => setChoices(cs => cs.filter(x => x.id !== c.id))}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontSize: '1rem' }}>×</button>
            </div>
          ))}
          <div><button type="button" style={{ ...btn(), padding: '4px 10px', fontSize: '0.75rem' }} data-choice-add
            onClick={() => setChoices(cs => [...cs, { id: newChoiceId(cs), en: '', ar: null, color: TYPE_COLORS[cs.length % TYPE_COLORS.length] }])}>{tf('addChoice')}</button></div>
        </fieldset>
      )}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--ink)' }}>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={onCard} onChange={e => setOnCard(e.target.checked)} data-field-input="on_card" />{tf('showOnCards')}</label>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={switchable} onChange={e => setSwitchable(e.target.checked)} data-field-input="switchable" />{tf('brandSwitch')}</label>
      </div>
      {err && <p role="alert" style={{ margin: 0, color: '#B42318', fontSize: '0.8rem' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button style={btn()} onClick={() => onDone()}>{tf('cancel')}</button>
        <button style={btn(true)} onClick={save} disabled={pending || !name.trim()} data-field-save>{field ? tf('save') : tf('create')}</button>
      </div>
    </div>
  )
}

// ─── Tags ───────────────────────────────────────────────────────────────────

function TagsTab({ tags, canEdit }: { tags: { id: string; name: string; color: string; count: number }[]; canEdit: boolean }) {
  const t = useTranslations('tags')
  const router = useRouter()
  const [msg, setMsg] = useState('')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ success: boolean; error?: string; moved?: number }>, ok: (r: { moved?: number }) => string) => start(async () => {
    const r = await fn()
    setMsg(r.success ? ok(r) : r.error === 'exists' ? t('exists') : t('failed'))
    if (r.success) router.refresh()
  })
  if (!tags.length) return <p style={{ ...card, padding: 18, margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }} data-tags-settings="">{t('none')}</p>
  return (
    <div data-tags-settings="" style={{ ...card, overflow: 'hidden' }}>
      {tags.map(tag => (
        <div key={tag.id} data-tag-row={tag.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid #F2F2EF', flexWrap: 'wrap' }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: tag.color }} />
          {canEdit
            ? <input defaultValue={tag.name} aria-label={t('rename')} maxLength={40} data-tag-rename={tag.name} style={{ ...input, flex: '1 1 160px' }}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== tag.name) run(() => renameTag(tag.id, v), () => t('rename')) }} />
            : <strong style={{ flex: '1 1 160px', fontSize: '0.9rem', color: 'var(--ink)' }}>{tag.name}</strong>}
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{t('count', { n: tag.count })}</span>
          {canEdit && <>
            <span role="radiogroup" aria-label={t('colour')} style={{ display: 'inline-flex', gap: 3 }}>
              {TAG_COLORS.map(c => <button key={c} type="button" role="radio" aria-checked={tag.color === c} aria-label={c} onClick={() => run(() => recolorTag(tag.id, c), () => t('colour'))}
                style={{ width: 16, height: 16, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0, border: tag.color === c ? '2px solid var(--ink)' : '1px solid #fff', boxShadow: '0 0 0 1px #D9D9D3' }} />)}
            </span>
            <select aria-label={t('merge')} value="" data-tag-merge={tag.name} disabled={pending} style={{ ...input, padding: '5px 8px' }}
              onChange={e => { const into = e.target.value; if (into) run(() => mergeTags(tag.id, into), r => t('mergeDone', { n: r.moved ?? 0 })) }}>
              <option value="">{t('merge')}</option>
              {tags.filter(x => x.id !== tag.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <button type="button" style={{ ...btn(), color: '#B42318' }} data-tag-delete={tag.name}
              onClick={() => { if (window.confirm(t('deleteConfirm', { name: tag.name, n: tag.count }))) run(() => deleteTag(tag.id), () => t('delete')) }}>{t('delete')}</button>
          </>}
        </div>
      ))}
      <p role="status" aria-live="polite" style={{ margin: 0, padding: msg ? '8px 14px 12px' : 0, fontSize: '0.8rem', color: 'var(--muted)' }}>{msg}</p>
    </div>
  )
}
