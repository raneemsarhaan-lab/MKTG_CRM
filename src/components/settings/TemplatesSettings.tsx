'use client'

/**
 * Templates (spec 023 US7, D15–D16), a tab on Task types. Each template
 * belongs to a task type: a name pattern ({Brand}, {Type}, {Month}, {Date}),
 * a brief, priority, hours, the assignee by role and subtasks whose dates are
 * days from the publishing date. Field values and tags come from "Save as
 * template" on a task and are kept as they are. Admins and superusers edit;
 * editing changes new tasks only.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { ContentType, TaskTemplate, TaskTemplateSubtask } from '@/types/index'
import { typeName } from '@/lib/task-types'
import { fillPattern } from '@/lib/templates'
import { deleteTemplate, saveTemplate, setDefaultTemplate } from '@/actions/templates'
import { TypeIcon } from '@/components/types/TypeIcon'

const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--line, #E4E4DF)', borderRadius: 12 }
const input: React.CSSProperties = { font: 'inherit', fontSize: '0.85rem', padding: '7px 10px', borderRadius: 8, border: '1px solid #D9D9D3', background: '#fff', color: 'var(--ink)', minWidth: 0 }
const btn = (primary = false): React.CSSProperties => ({
  font: 'inherit', fontSize: '0.8rem', fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
  border: primary ? 'none' : '1px solid #D9D9D3', background: primary ? 'var(--ink)' : '#fff', color: primary ? '#fff' : 'var(--ink)',
})
const label: React.CSSProperties = { display: 'grid', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)' }
const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low', 'None'] as const

type Draft = Omit<TaskTemplate, 'id' | 'updated_at'> & { id: string | null }
const blank = (type: string): Draft => ({ id: null, type_label: type, name: '', name_pattern: '{Brand} · ', brief: '', values: {}, subtasks: [] })

export function TemplatesSettings({ templates, types, roles, canEdit }: { templates: TaskTemplate[]; types: ContentType[]; roles: string[]; canEdit: boolean }) {
  const t = useTranslations('templates')
  const locale = useLocale()
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [msg, setMsg] = useState('')
  const [pending, start] = useTransition()

  const save = () => draft && start(async () => {
    const r = await saveTemplate({ ...draft, brief: draft.brief ?? '' })
    if (!r.success) { setMsg(r.error === 'name_required' ? t('nameRequired') : t('failed')); return }
    setMsg(t('saved')); setDraft(null); router.refresh()
  })
  const run = (fn: () => Promise<{ success: boolean }>, done: string) => start(async () => {
    const r = await fn()
    setMsg(r.success ? done : t('failed'))
    if (r.success) router.refresh()
  })
  const setSub = (i: number, patch: Partial<TaskTemplateSubtask>) => setDraft(d => d && { ...d, subtasks: d.subtasks.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const num = (v: string) => (v.trim() === '' ? null : Math.trunc(Number(v)))

  return (
    <div data-templates-settings="" style={{ display: 'grid', gap: 14 }}>
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>{t('intro')}</p>
      {types.map(ty => {
        const list = templates.filter(x => x.type_label === ty.label)
        if (!list.length && !canEdit) return null
        return (
          <section key={ty.label} data-templates-type={ty.label} style={{ ...card, overflow: 'hidden' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#FAFAF8', borderBottom: '1px solid #F2F2EF' }}>
              <TypeIcon icon={ty.icon} color={ty.color} size={16} />
              <strong style={{ fontSize: '0.9rem', color: 'var(--ink)', flex: 1 }}>{typeName(ty, locale)}</strong>
              {canEdit && list.length > 0 && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--muted)' }}>
                  {t('default')}
                  <select value={ty.default_template_id ?? ''} data-template-default={ty.label} disabled={pending} style={{ ...input, padding: '4px 8px', fontSize: '0.78rem' }}
                    onChange={e => run(() => setDefaultTemplate(ty.label, e.target.value || null), t('saved'))}>
                    <option value="">{t('noDefault')}</option>
                    {list.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
              )}
              {canEdit && <button type="button" style={btn()} data-template-new={ty.label} onClick={() => { setMsg(''); setDraft(blank(ty.label)) }}>＋ {t('new')}</button>}
            </header>
            {!list.length && <p style={{ margin: 0, padding: '10px 14px', fontSize: '0.8rem', color: 'var(--muted)' }}>{t('none')}</p>}
            {list.map(x => (
              <div key={x.id} data-template-row={x.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid #F2F2EF', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <strong style={{ display: 'block', fontSize: '0.88rem', color: 'var(--ink)' }}>{x.name}{ty.default_template_id === x.id && <span style={{ marginInlineStart: 8, fontSize: '0.7rem', color: '#4D6B00', fontWeight: 700 }}>{t('isDefault')}</span>}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {fillPattern(x.name_pattern, { brand: 'Forefront', type: ty.label, date: '2026-12-30' })} · {t('subtaskCount', { n: x.subtasks.length })}
                    {Object.keys(x.values.fields ?? {}).length > 0 && <> · {t('fieldCount', { n: Object.keys(x.values.fields ?? {}).length })}</>}
                  </span>
                </span>
                {canEdit && <>
                  <button type="button" style={btn()} data-template-edit={x.name} onClick={() => { setMsg(''); setDraft({ ...x }) }}>{t('edit')}</button>
                  <button type="button" style={{ ...btn(), color: '#B42318' }} data-template-delete={x.name}
                    onClick={() => { if (window.confirm(t('deleteConfirm', { name: x.name }))) run(() => deleteTemplate(x.id), t('deleted')) }}>{t('delete')}</button>
                </>}
              </div>
            ))}
            {draft && draft.type_label === ty.label && (
              <div data-template-editor="" style={{ display: 'grid', gap: 12, padding: 14, borderTop: '1px solid #F2F2EF', background: '#FCFCFA' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  <label style={label}>{t('name')}<input style={input} data-template-name value={draft.name} maxLength={80} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
                  <label style={label}>{t('pattern')}<input style={input} data-template-pattern value={draft.name_pattern} maxLength={200} onChange={e => setDraft({ ...draft, name_pattern: e.target.value })} /></label>
                  <label style={label}>{t('priority')}
                    <select style={input} value={draft.values.priority ?? ''} onChange={e => setDraft({ ...draft, values: { ...draft.values, priority: e.target.value || null } })}>
                      <option value="">—</option>
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <label style={label}>{t('assigneeRole')}
                    <select style={input} data-template-role value={draft.values.assigneeRole ?? ''} onChange={e => setDraft({ ...draft, values: { ...draft.values, assigneeRole: e.target.value || null } })}>
                      <option value="">{t('creator')}</option>
                      {roles.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <label style={label}>{t('hours')}<input style={input} type="number" min={0} step={0.5} value={draft.values.hours ?? ''} onChange={e => setDraft({ ...draft, values: { ...draft.values, hours: e.target.value === '' ? null : Number(e.target.value) } })} /></label>
                </div>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--muted)' }}>{t('patternHint')}</p>
                <label style={label}>{t('brief')}<textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} value={draft.brief ?? ''} onChange={e => setDraft({ ...draft, brief: e.target.value })} /></label>
                <div style={{ display: 'grid', gap: 6 }}>
                  <span style={label}>{t('subtasks')}</span>
                  {draft.subtasks.map((s, i) => (
                    <div key={i} data-template-subtask={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 2fr) 90px 90px minmax(120px, 1fr) auto', gap: 6, alignItems: 'center' }}>
                      <input style={input} aria-label={t('subtaskName')} value={s.name} onChange={e => setSub(i, { name: e.target.value })} />
                      <input style={input} type="number" aria-label={t('startOffset')} title={t('startOffset')} placeholder={t('startShort')} value={s.startOffset ?? ''} onChange={e => setSub(i, { startOffset: num(e.target.value) })} />
                      <input style={input} type="number" aria-label={t('dueOffset')} title={t('dueOffset')} placeholder={t('dueShort')} value={s.dueOffset ?? ''} onChange={e => setSub(i, { dueOffset: num(e.target.value) })} />
                      <select style={input} aria-label={t('assigneeRole')} value={s.assigneeRole ?? ''} onChange={e => setSub(i, { assigneeRole: e.target.value || null })}>
                        <option value="">{t('creator')}</option>
                        {roles.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button type="button" style={{ ...btn(), padding: '6px 10px' }} aria-label={t('removeSubtask')} onClick={() => setDraft({ ...draft, subtasks: draft.subtasks.filter((_, j) => j !== i) })}>✕</button>
                    </div>
                  ))}
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--muted)' }}>{t('offsetHint')}</p>
                  <button type="button" style={{ ...btn(), justifySelf: 'start' }} data-template-add-subtask onClick={() => setDraft({ ...draft, subtasks: [...draft.subtasks, { name: '', dueOffset: -7, startOffset: null, assigneeRole: null }] })}>＋ {t('addSubtask')}</button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" style={btn(true)} data-template-save disabled={pending} onClick={save}>{t('save')}</button>
                  <button type="button" style={btn()} onClick={() => setDraft(null)}>{t('cancel')}</button>
                </div>
              </div>
            )}
          </section>
        )
      })}
      <p role="status" aria-live="polite" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>{msg}</p>
    </div>
  )
}
