'use client'

/**
 * Task fields as sheet columns `f:<id>` (spec 023 R3), for sheets whose grid
 * reads its columns from `useSheetColumns` (the Content sheet). The wrapper
 * adds the columns and answers the column hook's custom-cell calls for them,
 * so the grid itself doesn't change. Values are the task's own (one value
 * everywhere); an empty required field says so in red ("Caption not added").
 */
import { useMemo, useState, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { Task, TaskFieldDef } from '@/types/index'
import { applies, fieldName, formatValue, isEmpty, parseValue } from '@/lib/task-fields'
import { setFieldValue } from '@/actions/task-fields'
import { useCardFields } from './CardFields'
import { FEATURE_OFF_CELL, fieldOn } from '@/lib/brand-features'
import type { useSheetColumns } from '@/components/sheet/useSheetColumns'
import type { FieldColumn } from '@/lib/sheet-columns'

type Columns = ReturnType<typeof useSheetColumns>
const RED = '#D22040'

/**
 * Spec 026 (§6): the field library as columns of a sheet of rows. A field shows by itself while a
 * type in use on the sheet carries it; any other is there to switch on (＋ Column › Task field, or
 * the Fields drawer).
 */
export function useFieldColumnDefs(tasks: Task[]): (FieldColumn & { name: string })[] {
  const c = useCardFields()
  const locale = useLocale()
  return useMemo(() => {
    if (!c) return []
    const typesHere = new Set(tasks.map(x => x.content_type_label).filter(Boolean) as string[])
    return c.fields.filter(f => !f.retired).sort((a, b) => a.position - b.position).map(f => ({
      key: `f:${f.id}`, name: fieldName(f, locale), width: f.kind === 'text' ? 220 : 160,
      shown: c.links.some(l => l.field_id === f.id && typesHere.has(l.type_label)),
    }))
  }, [c, tasks, locale])
}

export function useTaskFieldColumns(cl: Columns, o: { tasks: Task[]; canEdit(task: Task): boolean }): Columns {
  const c = useCardFields()
  const t = useTranslations('fields')
  const locale = useLocale()
  const router = useRouter()
  const [local, setLocal] = useState<Record<string, unknown>>({})
  useEffect(() => { setLocal({}) }, [c?.values])

  // The sheet lays the field columns itself (a sheet of rows), or they follow its own columns (the lab's Video sheet).
  const laysFields = cl.laid.some(x => x.field)
  const typesHere = useMemo(() => new Set(o.tasks.map(x => x.content_type_label).filter(Boolean) as string[]), [o.tasks])
  const fields = useMemo(() => (c?.fields ?? []).filter(f => !f.retired && (laysFields || c!.links.some(l => l.field_id === f.id && typesHere.has(l.type_label))))
    .sort((a, b) => a.position - b.position), [c, typesHere, laysFields])
  const byKey = useMemo(() => new Map(fields.map(f => [`f:${f.id}`, f])), [fields])
  if (!c || !fields.length) return cl

  const isField = (key: string) => byKey.has(key)
  const fieldOf = (key: string) => byKey.get(key) as TaskFieldDef
  const valueOf = (task: Task, key: string) => { const k = `${task.id}|${key.slice(2)}`; return k in local ? local[k] : c.values.get(task.id)?.get(key.slice(2)) }
  const has = (task: Task, key: string) => applies(task.content_type_label, key.slice(2), c.links) && fieldOn(task.brand, fieldOf(key))
  const required = (task: Task, key: string) => c.links.some(l => l.type_label === task.content_type_label && l.field_id === key.slice(2) && !!l.required_from)
  const text = (task: Task, key: string) => {
    const v = valueOf(task, key)
    return !has(task, key) || isEmpty(v) ? '' : formatValue(fieldOf(key), v, { locale, memberName: id => c.members.find(m => m.id === id)?.name, taskName: c.taskName })
  }
  const note = (task: Task, key: string) => (!has(task, key) ? t('notApplicable') : !o.canEdit(task) ? t('cellReadOnly') : null)

  const custom: Columns['custom'] = {
    ...cl.custom,
    is: key => isField(key) || cl.custom.is(key),
    // QA 26 Nov 2026 (QF-21): a checkbox also takes typed words (yes/no, نعم/لا, true/false); a click still toggles it.
    isText: (task, key) => (isField(key) ? has(task, key) && o.canEdit(task) : cl.custom.isText(task, key)),
    isMenu: key => (isField(key) ? false : cl.custom.isMenu(key)),
    textValue: (task, key) => (isField(key) ? text(task, key) : cl.custom.textValue(task, key)),
    cellClass: key => (isField(key) ? (['number', 'money'].includes(fieldOf(key).kind) ? 'fx-sheet-num' : '') : cl.custom.cellClass(key)),
    readOnlyNote: (task, key) => (isField(key) ? note(task, key) : cl.custom.readOnlyNote(task, key)),
    render: (task, key): ReactNode => {
      if (!isField(key)) return cl.custom.render(task, key)
      if (!has(task, key)) return <span data-field-na="" title={note(task, key) ?? ''} style={{ display: 'block', width: '100%', height: '100%', ...FEATURE_OFF_CELL }} />
      const f = fieldOf(key), v = valueOf(task, key)
      if (isEmpty(v)) return required(task, key) ? <span className="fx-sheet-ellipsis" data-field-missing={f.name_en} style={{ color: RED }}>{t('notAdded', { field: fieldName(f, locale) })}</span> : null
      if (f.kind === 'choice' || f.kind === 'multi') {
        const ids = Array.isArray(v) ? v as string[] : [String(v)]
        return <span className="fx-sheet-ellipsis" style={{ display: 'inline-flex', gap: 4 }}>{ids.map(id => (f.options.choices ?? []).find(x => x.id === id)).filter(Boolean).map(ch => (
          <span key={ch!.id} className="fx-sheet-pill" style={{ background: `${ch!.color ?? '#929CB0'}26`, color: '#18233F' }}>{locale.startsWith('ar') && ch!.ar ? ch!.ar : ch!.en}</span>))}</span>
      }
      const s = text(task, key)
      return <span className="fx-sheet-ellipsis" title={s}>{s}</span>
    },
    commit: async (task, key, value) => {
      if (!isField(key)) return cl.custom.commit(task, key, value)
      const n = note(task, key)
      if (n) return n
      const f = fieldOf(key), p = parseValue(f, value)
      if (!p.ok) return t('badValue', { field: fieldName(f, locale) })
      const k = `${task.id}|${f.id}`
      setLocal(l => ({ ...l, [k]: p.value }))
      const r = await setFieldValue(task.id, f.id, value).catch(() => ({ success: false as const, error: 'generic' }))
      if (!r.success) { setLocal(l => { const x = { ...l }; delete x[k]; return x }); return t('badValue', { field: fieldName(f, locale) }) }
      router.refresh()
      return null
    },
    typeAhead: (task, key, ch, anchor, rowKey) => (isField(key) ? false : cl.custom.typeAhead(task, key, ch, anchor, rowKey)),
    activate: (task, key, rowKey) => {
      if (!isField(key)) return cl.custom.activate(task, key, rowKey)
      if (fieldOf(key).kind !== 'checkbox' || note(task, key)) return false
      void custom.commit(task, key, valueOf(task, key) ? 'false' : 'true')
      return true
    },
    clear: async (task, key, rowKey, onCleared) => { if (isField(key)) void custom.commit(task, key, ''); else await cl.custom.clear(task, key, rowKey, onCleared) },
    open: (task, key, anchor, rowKey) => { if (!isField(key)) cl.custom.open(task, key, anchor, rowKey) },
  }
  if (laysFields) return { ...cl, header: key => (isField(key) ? { text: cl.nameOf(key) } : cl.header(key)), custom }
  return {
    ...cl,
    cols: [...cl.cols, ...fields.map(f => `f:${f.id}`)],
    widths: { ...cl.widths, ...Object.fromEntries(fields.map(f => [`f:${f.id}`, f.kind === 'text' ? 220 : 160])) },
    nameOf: key => (isField(key) ? fieldName(fieldOf(key), locale) : cl.nameOf(key)),
    header: key => (isField(key) ? { text: fieldName(fieldOf(key), locale) } : cl.header(key)),
    custom,
  }
}
