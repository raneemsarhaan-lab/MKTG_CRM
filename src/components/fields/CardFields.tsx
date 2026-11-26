'use client'

/**
 * What a Board's cards show (spec 023, the Fields button): the standard fields
 * switched on, and custom field values under the title. Pages with a Fields
 * button pass their choice; elsewhere every standard field shows, with the
 * custom fields marked "show on cards".
 */
import { CardEditTarget } from '@/components/fields/CardEditor'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { BrandFeatures, ContentType, Member, Tag, TaskFieldDef, TaskFieldValueRow, TaskTypeFieldLink, TeamSpace, StageId } from '@/types/index'
import { fieldRule, stageAt } from '@/lib/space-settings'
import { fieldOnIn } from '@/lib/field-catalog'
import { applies, fieldName, formatValue, isEmpty, requiredEmpty } from '@/lib/task-fields'
import { PIPE } from '@/lib/pipeline-tokens'
import { fieldOn } from '@/lib/brand-features'

export interface CardFieldsData {
  /** Field keys switched on; null = the default (standard + "show on cards"). */
  shown: string[] | null
  fields: TaskFieldDef[]
  links: TaskTypeFieldLink[]
  values: Map<string, Map<string, unknown>>
  types: ContentType[]
  members: Member[]
  taskName?(id: string): string | undefined
  /** Spec 023 (R8): the workspace's tags. */
  tags: Tag[]
  /** Spec 024 (§4): every Space's settings, and the Space this page is (null outside a Space). */
  spaces: TeamSpace[]
  viewSpaceId: string | null
  /** Fields (25 Nov 2026): custom fields promoted to Standard (on in every Space). */
  promoted: string[]
  /** Owner, 26 Nov 2026: themes and their pillars, for a card's Theme › Pillar line and its editor. */
  themes: { id: string; name: string; pillars: { id: string; name: string }[] }[]
}

/**
 * Spec 024 (§4): a field's rule for a task here — shown or hidden by the Space being
 * looked at; required before a stage by that Space, else by the Space whose rules apply
 * to the task. A stage earlier than that Space's start is never asked for.
 */
export function ruleFor(c: Pick<CardFieldsData, 'spaces' | 'viewSpaceId'> & { promoted?: string[]; fields?: TaskFieldDef[] } | null | undefined, task: { home_space_id?: string | null }, link: TaskTypeFieldLink): { shown: boolean; before: StageId | null } {
  const view = c?.viewSpaceId ? c.spaces.find(s => s.id === c.viewSpaceId) : undefined
  const home = task.home_space_id ? c?.spaces.find(s => s.id === task.home_space_id) : undefined
  const s = (view ?? home)?.settings
  const field = c?.fields?.find(f => f.id === link.field_id)
  // Fields (25 Nov 2026): a custom field shows where it is on — in the Space looked at, else the task's own Space.
  if (!s) return { shown: field?.options?.default_on !== false, before: link.required_from }
  const r = fieldRule(s, link)
  const on = fieldOnIn(`f:${link.field_id}`, s.fields, c?.promoted ?? [], field)
  return { shown: on, before: !on ? null : r.before && stageAt(r.before) < stageAt(s.flow.start) ? null : r.before }
}

/**
 * Fields (25 Nov 2026): the custom fields of a task here, in the Space's order — the fields its type
 * carries, and the fields made in a Space (attached to no type) — each with its rule here.
 */
export function fieldsHere(c: CardFieldsData | null | undefined, task: { id: string; content_type_label: string | null | undefined; home_space_id?: string | null; brand?: { features?: BrandFeatures | null } | null }) {
  if (!c) return []
  const view = c.viewSpaceId ? c.spaces.find(s => s.id === c.viewSpaceId) : undefined
  const home = task.home_space_id ? c.spaces.find(s => s.id === task.home_space_id) : undefined
  const order = (view ?? home)?.settings.field_order ?? []
  const rank = (f: TaskFieldDef) => { const i = order.indexOf(`f:${f.id}`); return i < 0 ? 1000 + f.position : i }
  return c.fields.filter(f => !f.retired && fieldOn(task.brand, f) && applies(task.content_type_label, f.id, c.links))
    .sort((a, b) => rank(a) - rank(b))
    .map(field => {
      const link = c.links.find(l => l.field_id === field.id && l.type_label === task.content_type_label)
        ?? { type_label: task.content_type_label ?? '', field_id: field.id, required_from: null, default_value: null, position: field.position }
      return { field, link, rule: ruleFor(c, task, link) }
    })
}

const NO_SPACES: TeamSpace[] = []
const Ctx = createContext<CardFieldsData | null>(null)
/** Set by a page's Fields button; a board inside it keeps the outer choice. */
const ShownCtx = createContext<string[] | null | undefined>(undefined)

export function ShownFieldsProvider({ shown, children }: { shown: string[] | null | undefined; children: ReactNode }) {
  return <ShownCtx.Provider value={shown ?? null}>{children}</ShownCtx.Provider>
}

const NO_KEYS: string[] = []
const NO_THEMES: { id: string; name: string; pillars: { id: string; name: string }[] }[] = []
export function CardFieldsProvider({ fields = [], links = [], values = [], types, members, taskName, tags = [], spaces = NO_SPACES, viewSpaceId = null, promoted = NO_KEYS, themes = NO_THEMES, children }: {
  fields?: TaskFieldDef[]; links?: TaskTypeFieldLink[]; values?: TaskFieldValueRow[]; types: ContentType[]; members: Member[]; tags?: Tag[]
  /** Owner, 26 Nov 2026: themes and their pillars, for a card's Theme › Pillar line and its editor. */
  themes?: { id: string; name: string; pillars: { id: string; name: string }[] }[]
  spaces?: TeamSpace[]; viewSpaceId?: string | null; promoted?: string[]
  taskName?(id: string): string | undefined; children: ReactNode
}) {
  const shown = useContext(ShownCtx) ?? null
  const byTask = useMemo(() => {
    const m = new Map<string, Map<string, unknown>>()
    for (const v of values) { let x = m.get(v.task_id); if (!x) m.set(v.task_id, (x = new Map())); x.set(v.field_id, v.value) }
    return m
  }, [values])
  const value = useMemo(() => ({ shown, fields, links, values: byTask, types, members, taskName, tags, spaces, viewSpaceId, promoted, themes }), [shown, fields, links, byTask, types, members, taskName, tags, spaces, viewSpaceId, promoted, themes])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCardFields() { return useContext(Ctx) }

/** Whether a standard field shows on cards here. */
export function useCardShows() {
  const c = useContext(Ctx)
  return (key: string) => !c?.shown || c.shown.includes(key)
}

/** The custom field values a card shows, under its title. */
export function CardFieldValues({ taskId, typeLabel, status, brand, homeSpaceId }: { taskId: string; typeLabel: string | null | undefined; status?: string; brand?: { features?: BrandFeatures | null } | null; homeSpaceId?: string | null }) {
  const c = useContext(Ctx)
  const locale = useLocale()
  const t = useTranslations('fields')
  if (!c || !typeLabel) return null
  // Required fields still empty: a small red label each ("Caption missing"), until it's published.
  const here = fieldsHere(c, { id: taskId, content_type_label: typeLabel, home_space_id: homeSpaceId, brand })
  const missingNew = status === 'publish' ? [] : here.filter(x => x.rule.shown && x.rule.before && isEmpty(c.values.get(taskId)?.get(x.field.id))).map(x => ({ field: x.field }))
  const missing = missingNew
  const vals = c.values.get(taskId)
  const list = here.filter(x => x.rule.shown).map(x => x.field).filter(f => c.shown ? c.shown.includes(`f:${f.id}`) : f.on_card)
  const rows = list.map(f => {
    const v = vals?.get(f.id)
    if (isEmpty(v)) return null
    const text = formatValue(f, v, { locale, memberName: id => c.members.find(m => m.id === id)?.name, taskName: c.taskName })
    return text ? { f, text } : null
  }).filter((x): x is { f: TaskFieldDef; text: string } => !!x)
  if (!rows.length && !missing.length) return null
  return (
    <div data-card-fields style={{ display: 'grid', gap: 2, marginTop: 5 }}>
      {missing.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 8px' }}>
          {missing.map(({ field }) => (
            <CardEditTarget key={field.id} task={{ id: taskId }} field={`f:${field.id}`} label={fieldName(field, locale)}>
              <span data-card-missing={field.name_en} style={{ fontSize: 10.5, fontWeight: 700, color: '#D22040' }}>{t('missingCard', { field: fieldName(field, locale) })}</span>
            </CardEditTarget>
          ))}
        </div>
      )}
      {rows.map(({ f, text }) => (
        <CardEditTarget key={f.id} task={{ id: taskId }} field={`f:${f.id}`} label={fieldName(f, locale)}>
        <div data-card-field={f.id} style={{ display: 'flex', gap: 5, fontSize: 10.5, lineHeight: 1.35, minWidth: 0 }}>
          <span style={{ color: PIPE.textFaint, fontWeight: 600, flexShrink: 0 }}>{fieldName(f, locale)}</span>
          <span style={{ color: PIPE.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
        </div>
        </CardEditTarget>
      ))}
    </div>
  )
}
