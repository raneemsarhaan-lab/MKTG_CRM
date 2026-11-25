'use client'

/**
 * Fields in views (user, 25 Nov 2026, §5), for a page: a task's value for any field, and a saved view's
 * groups when it groups by a field. Space, brand and My tasks pages share it.
 */
import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { fieldLabel, filterChoices, groupable, groupByField, valueOfFrom, type FieldViewContext } from '@/lib/field-view'
import { isFieldViewKey, type FieldViewKey, type ViewConfig } from '@/lib/view-config'
import { KIND_GLYPH } from '@/lib/field-catalog'
import type { FieldPicker } from './ViewHost'
import { fieldValuesOf, type BoardData } from './types'
import type { ViewTask } from './types'

export function useFieldView(data: BoardData) {
  const locale = useLocale()
  const t = useTranslations('views')
  const ctx: FieldViewContext = useMemo(() => ({
    values: fieldValuesOf(data),
    defs: data.taskFields,
    members: data.members,
    pillars: (data.themes ?? []).flatMap(th => th.pillars ?? []),
    locale,
  }), [data, locale])
  const valueOf = useMemo(() => valueOfFrom(ctx), [ctx])
  /** A saved view's field groups, or null when it doesn't group by a field. */
  const groupsFor = <T extends ViewTask>(config: ViewConfig | undefined, tasks: T[]) =>
    config && isFieldViewKey(config.group) ? groupByField(tasks, config.group, ctx, { yes: t('yes'), none: t('noValue') }) : null
  /**
   * The fields a saved view's bar offers: Priority, Pillar, Start date and every live custom field, each
   * with its kind's symbol and whether it is on here (a page that isn't a Space: everything is on).
   */
  const picker = (tasks: (ViewTask & { id: string })[], onHere: (key: FieldViewKey) => boolean = () => true): FieldPicker => {
    const builtIn = (k: string) => t(`builtInField.${k as 'priority'}`)
    const keys: { key: FieldViewKey; glyph: string }[] = [
      { key: 'priority', glyph: KIND_GLYPH.choice }, { key: 'pillar', glyph: KIND_GLYPH.choice }, { key: 'start', glyph: KIND_GLYPH.date },
      ...data.taskFields.filter(f => !f.retired).map(f => ({ key: `f:${f.id}` as FieldViewKey, glyph: KIND_GLYPH[f.kind] ?? KIND_GLYPH.text })),
    ]
    return {
      fields: keys.map(k => ({ ...k, label: fieldLabel(k.key, ctx, builtIn), on: onHere(k.key) })),
      choices: key => filterChoices(key, ctx, tasks, t('yes')),
      groupable: key => groupable(key, ctx.defs),
      themeOn: onHere('theme' as FieldViewKey),
    }
  }
  return { ctx, valueOf, groupsFor, picker }
}
