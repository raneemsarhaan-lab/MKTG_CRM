'use client'

/**
 * Owner, 26 Nov 2026: every field a card (or a calendar or list row) shows can be edited right
 * there. A click on the field opens a small editor beside it — a list for Brand, Type, Priority,
 * Assignee, Tags and choice fields, a date box for dates, a text box for the other custom fields.
 * The server applies the same permissions as anywhere else; a refusal is shown in the editor.
 */
import { createContext, useContext, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { updateTask } from '@/actions/tasks'
import { setTaskTags } from '@/actions/tags'
import { setFieldValue } from '@/actions/task-fields'
import { useCardFields } from '@/components/fields/CardFields'
import { SheetMenu, SheetPopover, type MenuItem } from '@/components/sheet/SheetMenu'
import { PRIORITIES, priorityColor } from '@/lib/priorities'
import { fieldName } from '@/lib/task-fields'
import type { Brand, Priority } from '@/types/index'

export interface EditableTask {
  id: string
  brand_id?: string | null
  content_type_label?: string | null
  priority?: string | null
  assignee_id?: string | null
  publish_date?: string | null
  due_date?: string | null
  start_date?: string | null
  tag_ids?: string[]
}
export type CardEditKey = 'brand' | 'type' | 'priority' | 'assignee' | 'publish' | 'due' | 'start' | 'tags' | `f:${string}`

interface Open { task: EditableTask; key: CardEditKey; anchor: HTMLElement }
const Ctx = createContext<{ open(task: EditableTask, key: CardEditKey, anchor: HTMLElement): void } | null>(null)
export const useCardEdit = () => useContext(Ctx)

export function CardEditProvider({ brands = [], children }: { brands?: Pick<Brand, 'id' | 'name'>[]; children: ReactNode }) {
  const [at, setAt] = useState<Open | null>(null)
  const [msg, setMsg] = useState('')
  const [text, setText] = useState('')
  const router = useRouter()
  const locale = useLocale()
  const ctx = useCardFields()
  const t = useTranslations('cardEdit')
  const tPanel = useTranslations('panel')
  const tPri = useTranslations('priority')
  const close = () => { setAt(null); setMsg('') }
  const done = (r: { success: boolean; error?: string }) => {
    if (!r.success) { setMsg(r.error === 'not_authorized' ? t('notYours') : t('notSaved')); return }
    close(); router.refresh()
  }
  const save = (patch: Parameters<typeof updateTask>[1]) => { if (at) void updateTask(at.task.id, patch).then(done).catch(() => setMsg(t('notSaved'))) }
  const open = (task: EditableTask, key: CardEditKey, anchor: HTMLElement) => {
    setMsg('')
    const fd = key.startsWith('f:') ? ctx?.fields.find(f => f.id === key.slice(2)) : undefined
    const cur = fd ? ctx?.values.get(task.id)?.get(fd.id) : key === 'publish' ? task.publish_date : key === 'due' ? task.due_date : key === 'start' ? task.start_date : null
    setText(typeof cur === 'string' ? cur.slice(0, 10) : typeof cur === 'number' ? String(cur) : '')
    // A checkbox needs no editor: a click flips it.
    if (fd?.kind === 'checkbox') { void setFieldValue(task.id, fd.id, cur === true ? false : true).then(r => { if (r.success) router.refresh() }); return }
    setAt({ task, key, anchor })
  }

  let layer: ReactNode = null
  let isForm = false
  if (at) {
    const { task, key, anchor } = at
    const tone = (on: boolean) => (on ? ('next' as const) : undefined)
    const menu = (label: string, items: MenuItem[]) => <SheetMenu anchor={anchor} label={label} items={items} onClose={close} />
    const fd = key.startsWith('f:') ? ctx?.fields.find(f => f.id === key.slice(2)) : undefined
    if (key === 'brand') layer = menu(tPanel('brand'), brands.map(b => ({ key: b.id, text: b.name, label: b.name, tone: tone(b.id === task.brand_id), onSelect: () => save({ brand_id: b.id }) })))
    else if (key === 'type') layer = menu(tPanel('type'), (ctx?.types ?? []).map(ty => { const n = locale.startsWith('ar') && ty.name_ar ? ty.name_ar : ty.label; return { key: ty.label, text: n, label: n, tone: tone(ty.label === task.content_type_label), onSelect: () => save({ content_type_label: ty.label }) } }))
    else if (key === 'priority') layer = menu(tPanel('priority'), PRIORITIES.map(p => ({ key: p, text: tPri(p), label: <span style={{ display: 'inline-flex', gap: 6 }}><span aria-hidden="true" style={{ color: priorityColor(p) }}>⚑</span>{tPri(p)}</span>, tone: tone(p === task.priority), onSelect: () => save({ priority: p as Priority }) })))
    else if (key === 'assignee') layer = menu(t('assignee'), [
      ...(ctx?.members ?? []).map(m => ({ key: m.id, text: m.name, label: m.name, tone: tone(m.id === task.assignee_id), onSelect: () => save({ assignee_id: m.id }) })),
      { key: '', text: t('unassigned'), label: t('unassigned'), tone: tone(!task.assignee_id), onSelect: () => save({ assignee_id: null }) },
    ])
    else if (key === 'tags') {
      const have = task.tag_ids ?? []
      layer = menu(t('tags'), (ctx?.tags ?? []).map(tg => ({ key: tg.id, text: tg.name, label: <span>{have.includes(tg.id) ? '☑' : '☐'} {tg.name}</span>,
        onSelect: () => void setTaskTags(task.id, have.includes(tg.id) ? have.filter(x => x !== tg.id) : [...have, tg.id]).then(done) })))
    } else if (fd && (fd.kind === 'choice' || fd.kind === 'multi')) {
      const cur = ctx?.values.get(task.id)?.get(fd.id)
      const picked = Array.isArray(cur) ? cur as string[] : typeof cur === 'string' ? [cur] : []
      layer = menu(fieldName(fd, locale), (fd.options.choices ?? []).map(c => {
        const n = locale.startsWith('ar') && c.ar ? c.ar : c.en
        const next = fd.kind === 'multi' ? (picked.includes(c.id) ? picked.filter(x => x !== c.id) : [...picked, c.id]) : c.id
        return { key: c.id, text: n, label: <span>{fd.kind === 'multi' ? (picked.includes(c.id) ? '☑ ' : '☐ ') : ''}{n}</span>, tone: tone(picked.includes(c.id)), onSelect: () => void setFieldValue(task.id, fd.id, next).then(done) }
      }))
    } else {
      // Dates and the other custom fields: a small box with Save.
      isForm = true
      const isDate = key === 'publish' || key === 'due' || key === 'start' || fd?.kind === 'date'
      const label = fd ? fieldName(fd, locale) : key === 'publish' ? t('publish') : key === 'due' ? tPanel('dueDate') : t('start')
      const submit = () => {
        if (fd) { void setFieldValue(task.id, fd.id, text).then(r => (r.success ? done(r) : setMsg(t('invalid')))); return }
        const v = text || null
        save(key === 'publish' ? { publish_date: v } : key === 'due' ? { due_date: v } : { start_date: v })
      }
      layer = (
        <SheetPopover anchor={anchor} label={label} onClose={close} width={240}>
          <form data-card-editor={key} onSubmit={e => { e.preventDefault(); submit() }} style={{ display: 'grid', gap: 8, padding: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>{label}
              <input autoFocus type={isDate ? 'date' : 'text'} value={text} onChange={e => setText(e.target.value)} dir={isDate ? 'ltr' : 'auto'}
                     style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 8px', borderRadius: 6, border: '1px solid #D9DCE3', font: 'inherit' }} />
            </label>
            {msg && <span role="alert" style={{ color: '#C8243C', fontSize: 12 }}>{msg}</span>}
            <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button type="button" onClick={close}>{t('cancel')}</button>
              <button type="submit" data-card-editor-save="">{t('save')}</button>
            </span>
          </form>
        </SheetPopover>
      )
    }
    if (msg && !isForm) layer = <>{layer}<SheetPopover anchor={anchor} label={t('notSaved')} onClose={close}><p role="alert" style={{ margin: 0, padding: 10, color: '#C8243C', fontSize: 12.5 }}>{msg}</p></SheetPopover></>
  }
  return <Ctx.Provider value={{ open }}>{children}{layer}</Ctx.Provider>
}

/** A field on a card or row that opens its editor; it never starts a drag or opens the task. */
export function CardEditTarget({ task, field, children, label }: { task: EditableTask; field: CardEditKey; children: ReactNode; label: string }) {
  const edit = useCardEdit()
  if (!edit) return <>{children}</>
  return (
    <span role="button" tabIndex={0} data-card-edit={field} aria-label={label} title={label} className="fx-card-edit"
          onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); e.preventDefault(); edit.open(task, field, e.currentTarget) }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); edit.open(task, field, e.currentTarget) } }}
          style={{ display: 'inline-flex', cursor: 'pointer', borderRadius: 6 }}>
      {children}
    </span>
  )
}
