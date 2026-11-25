'use client'

/**
 * The field system on a sheet (owner's design of 25 Nov 2026): what the ＋ offers, and which custom
 * columns the Space has turned off. Shared by a Space's sheet of rows and the task sheets.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { Member, SheetId, TaskFieldDef, TeamSpace } from '@/types/index'
import { builtInField, classOf, fieldOnIn, isBuiltInCustom, isLibraryKey, requiredIn, toCanonical, type CatalogKind } from '@/lib/field-catalog'
import type { MenuItem } from '@/components/sheet/SheetMenu'
import { fieldName } from '@/lib/task-fields'
import { createSpaceField, setFieldOn, setFieldRequired } from '@/actions/fields'
import { AddColumnPanel, sheetKindOf, type AddItem, type NewFieldInput } from '@/components/sheet/AddColumnPanel'
import type { ColumnsApi } from '@/components/sheet/types'
import type { LaidColumn } from '@/lib/sheet-columns'

interface Cl {
  laid: LaidColumn[]
  nameOf(key: string): string
  setShown(key: string, on: boolean): Promise<boolean>
}

/** Built-in columns of a sheet that aren't in the field catalogue: their kind, for the icon. */
const OTHER_KIND: Record<string, CatalogKind> = { task: 'task', space: 'choice', platform: 'choice', archive: 'checkbox', date: 'date', inStage: 'number', files: 'link', editor: 'person', reviewer: 'person' }

export function useAddColumn(o: {
  cl: Cl
  sheet: SheetId
  rowsSheet: boolean
  /** The Space this sheet is; null on a brand's or My tasks' sheet. */
  space: TeamSpace | null
  spaces: TeamSpace[]
  promoted: string[]
  library: TaskFieldDef[]
  me: Member
  api: ColumnsApi
  say(text: string): void
  builtInName(key: string): string
}) {
  const t = useTranslations('fieldSystem')
  const locale = useLocale()
  const router = useRouter()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const live = useMemo(() => o.library.filter(f => !f.retired), [o.library])
  const defOf = (key: string) => (isLibraryKey(key) ? live.find(f => f.id === key.slice(2)) ?? null : null)
  const canon = (key: string) => toCanonical(o.rowsSheet, key)
  const onHere = (key: string) => !o.space || fieldOnIn(canon(key), o.space.settings.fields, o.promoted, defOf(key))
  const nameFor = (key: string) => { const d = defOf(key); return d ? fieldName(d, locale) : o.cl.nameOf(key) || (key.startsWith('c:') || key.startsWith('f:') ? '' : o.builtInName(key)) }
  const kindFor = (key: string): CatalogKind | null => defOf(key)?.kind ?? builtInField(canon(key))?.kind ?? OTHER_KIND[key] ?? null
  const isCustomField = (key: string) => (isLibraryKey(key) || isBuiltInCustom(canon(key))) && classOf(canon(key), o.promoted) === 'custom'
  const whereOn = (key: string) => o.spaces.filter(s => !s.archived_at && fieldOnIn(canon(key), s.settings.fields, o.promoted, defOf(key))).map(s => s.name).join(', ')

  /** A built-in custom column (Priority, Pillar…) the Space has turned off: not on this sheet. */
  const offHere = (key: string) => isBuiltInCustom(canon(key)) && !onHere(key)

  const lists = useMemo(() => {
    const laidKeys = new Set(o.cl.laid.map(c => c.key))
    const hidden = o.cl.laid.filter(c => !c.shown && c.key !== 'title')
    const item = (key: string, where?: string): AddItem => ({ key, name: nameFor(key), kind: kindFor(key), ...(where ? { where } : {}) })
    const standard = hidden.filter(c => !c.kind && !isCustomField(c.key)).map(c => item(c.key))
    const customOn = hidden.filter(c => !c.kind && isCustomField(c.key) && onHere(c.key)).map(c => item(c.key))
    const regular = hidden.filter(c => !!c.kind).map(c => ({ key: c.key, name: o.cl.nameOf(c.key), kind: (c.kind === 'task' ? 'task' : c.kind) as CatalogKind }))
    // Off here: this sheet's built-in custom columns the Space turned off, and library fields not on here.
    const customOff = o.space ? [
      ...o.cl.laid.filter(c => !c.kind && isBuiltInCustom(canon(c.key)) && !onHere(c.key)).map(c => item(c.key, whereOn(c.key))),
      ...live.filter(f => !onHere(`f:${f.id}`) && classOf(`f:${f.id}`, o.promoted) === 'custom').map(f => item(`f:${f.id}`, whereOn(`f:${f.id}`))),
    ] : []
    // A library field on here that the sheet doesn't lay yet (made a moment ago): offer it too.
    for (const f of live) {
      const k = `f:${f.id}`
      if (!laidKeys.has(k) && onHere(k) && !customOn.some(x => x.key === k) && !customOff.some(x => x.key === k)) customOn.push(item(k))
    }
    return { standard, customOn: [...customOn, ...regular], customOff }
  }, [o.cl.laid, o.space, o.spaces, o.promoted, live]) // eslint-disable-line react-hooks/exhaustive-deps

  async function turnOn(key: string) {
    if (!o.space) return
    const r = await setFieldOn(o.space.id, canon(key), true).catch(() => ({ success: false as const, error: 'generic' }))
    if (!r.success) { o.say(r.error === 'not_authorized' ? t('notAllowed') : t('failed')); return }
    await o.cl.setShown(key, true)
    o.say(t('turnedOn', { name: nameFor(key), space: o.space.name }))
    router.refresh()
  }

  async function create(input: NewFieldInput): Promise<string | null> {
    if (input.place === 'task') {
      const r = await createSpaceField({ name: input.name, kind: input.kind, spaceIds: input.spaceIds, choices: input.choices }).catch(() => ({ success: false as const, error: 'generic' }))
      if (!r.success) return r.error === 'exists' ? t('exists') : r.error === 'not_authorized' ? t('notAllowed') : r.error === 'name_empty' ? t('nameEmpty') : t('failed')
      await o.cl.setShown(r.key, true)
      o.say(t('made', { name: input.name }))
      router.refresh()
      return null
    }
    const kind = sheetKindOf(input.kind)
    if (!kind) return t('kindSheetOnly')
    const r = await o.api.add(o.sheet, { name: input.name, kind, options: input.choices.map(name => ({ name })) })
    if (!r.success || !r.column) return r.error === 'name_taken' ? t('exists') : t('failed')
    await o.cl.setShown(r.column.key, true)
    o.say(t('made', { name: input.name }))
    return null
  }

  const node: ReactNode = anchor ? (
    <AddColumnPanel anchor={anchor} onClose={() => setAnchor(null)}
      space={o.space ? { id: o.space.id, name: o.space.name } : null}
      standard={lists.standard} customOn={lists.customOn} customOff={lists.customOff}
      spaces={o.spaces.filter(s => !s.archived_at).map(s => ({ id: s.id, name: s.name }))}
      onShow={key => { void o.cl.setShown(key, true) }}
      onTurnOn={key => { void turnOn(key) }}
      onCreate={create} />
  ) : null

  /**
   * The column header menu's field items (admins, superusers, in a Space): "Required in this Space" for a
   * custom field, and turning it off here. A value is never lost; off only hides it in this Space.
   */
  const lead = o.me.access === 'admin' || o.me.access === 'superuser'
  function menuFor(key: string): MenuItem[] {
    if (!o.space || !lead || !isCustomField(key)) return []
    const space = o.space
    const req = requiredIn(canon(key), space.settings.fields)?.required ?? false
    const name = nameFor(key)
    const run = async (p: Promise<{ success: boolean; error?: string }>, ok: string) => {
      const r = await p.catch(() => ({ success: false, error: 'generic' }))
      o.say(r.success ? ok : r.error === 'not_authorized' ? t('notAllowed') : t('failed'))
      if (r.success) router.refresh()
    }
    return [
      { key: 'required', group: '    ', text: req ? t('notRequiredHere') : t('requiredHere'), label: <span data-required-here={req ? 'on' : 'off'}>{req ? t('notRequiredHere') : t('requiredHere')}</span>,
        onSelect: () => void run(setFieldRequired(space.id, canon(key), !req), req ? t('requiredOff', { name }) : t('requiredSet', { name })) },
      { key: 'off-here', group: '    ', text: t('offHere'), label: <span data-field-off-here="">{t('offHere')}</span>,
        onSelect: () => void run(setFieldOn(space.id, canon(key), false), t('offDone', { name, space: space.name })) },
    ]
  }

  const classFor = (key: string): 'standard' | 'custom' | 'regular' => (o.cl.laid.find(c => c.key === key)?.kind ? 'regular' : isCustomField(key) ? 'custom' : 'standard')
  return { open: (a: HTMLElement) => setAnchor(a), node, offHere, onHere, kindOf: kindFor, classFor, menuFor }
}
