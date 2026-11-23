'use client'

/**
 * What a Board's cards show (spec 023, the Fields button): the standard fields
 * switched on, and custom field values under the title. Pages with a Fields
 * button pass their choice; elsewhere every standard field shows, with the
 * custom fields marked "show on cards".
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLocale } from 'next-intl'
import type { ContentType, Member, TaskFieldDef, TaskFieldValueRow, TaskTypeFieldLink } from '@/types/index'
import { applies, fieldName, formatValue, isEmpty } from '@/lib/task-fields'
import { PIPE } from '@/lib/pipeline-tokens'

export interface CardFieldsData {
  /** Field keys switched on; null = the default (standard + "show on cards"). */
  shown: string[] | null
  fields: TaskFieldDef[]
  links: TaskTypeFieldLink[]
  values: Map<string, Map<string, unknown>>
  types: ContentType[]
  members: Member[]
  taskName?(id: string): string | undefined
}

const Ctx = createContext<CardFieldsData | null>(null)
/** Set by a page's Fields button; a board inside it keeps the outer choice. */
const ShownCtx = createContext<string[] | null | undefined>(undefined)

export function ShownFieldsProvider({ shown, children }: { shown: string[] | null | undefined; children: ReactNode }) {
  return <ShownCtx.Provider value={shown ?? null}>{children}</ShownCtx.Provider>
}

export function CardFieldsProvider({ fields = [], links = [], values = [], types, members, taskName, children }: {
  fields?: TaskFieldDef[]; links?: TaskTypeFieldLink[]; values?: TaskFieldValueRow[]; types: ContentType[]; members: Member[]
  taskName?(id: string): string | undefined; children: ReactNode
}) {
  const shown = useContext(ShownCtx) ?? null
  const byTask = useMemo(() => {
    const m = new Map<string, Map<string, unknown>>()
    for (const v of values) { let x = m.get(v.task_id); if (!x) m.set(v.task_id, (x = new Map())); x.set(v.field_id, v.value) }
    return m
  }, [values])
  const value = useMemo(() => ({ shown, fields, links, values: byTask, types, members, taskName }), [shown, fields, links, byTask, types, members, taskName])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCardFields() { return useContext(Ctx) }

/** Whether a standard field shows on cards here. */
export function useCardShows() {
  const c = useContext(Ctx)
  return (key: string) => !c?.shown || c.shown.includes(key)
}

/** The custom field values a card shows, under its title. */
export function CardFieldValues({ taskId, typeLabel }: { taskId: string; typeLabel: string | null | undefined }) {
  const c = useContext(Ctx)
  const locale = useLocale()
  if (!c || !typeLabel) return null
  const vals = c.values.get(taskId)
  const list = c.fields.filter(f => !f.retired && applies(typeLabel, f.id, c.links)
    && (c.shown ? c.shown.includes(`f:${f.id}`) : f.on_card))
  const rows = list.map(f => {
    const v = vals?.get(f.id)
    if (isEmpty(v)) return null
    const text = formatValue(f, v, { locale, memberName: id => c.members.find(m => m.id === id)?.name, taskName: c.taskName })
    return text ? { f, text } : null
  }).filter((x): x is { f: TaskFieldDef; text: string } => !!x)
  if (!rows.length) return null
  return (
    <div data-card-fields style={{ display: 'grid', gap: 2, marginTop: 5 }}>
      {rows.map(({ f, text }) => (
        <div key={f.id} data-card-field={f.id} style={{ display: 'flex', gap: 5, fontSize: 10.5, lineHeight: 1.35, minWidth: 0 }}>
          <span style={{ color: PIPE.textFaint, fontWeight: 600, flexShrink: 0 }}>{fieldName(f, locale)}</span>
          <span style={{ color: PIPE.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
        </div>
      ))}
    </div>
  )
}
