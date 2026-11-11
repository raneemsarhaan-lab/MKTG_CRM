'use client'

/**
 * The Content and Video sheets' own settings (spec 015 FR-070–FR-075): their
 * formatting, conditional formatting rules, and a sort and filter that live
 * in the sheet, never on the board.
 *
 * Loaded once per sheet. Sort and filter work inside each group (a theme's
 * pieces, a video's clips stay under it), so the rows the grid shows are
 * arranged here, before the grid and the editing hooks see them.
 */
import { isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useTranslations } from 'next-intl'
import type { ColFilter, ConditionalRule, FilterArea, SheetFormatRecord, SortKey } from '@/types/index'
import { LinkedFormatsContext } from '@/components/sheets/format/context'
import { indexFormats, resolveStyle, type FormatIndex } from '@/lib/sheet-format'
import { arrangeGroups, evalRules, type RuleLook } from '@/lib/sheet-rules'
import type { GridCol } from './GridCore'

/** The words a rendered cell shows (a status pill's label, a member's name), for sort and filter. */
export function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).filter(Boolean).join(' ')
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode; 'aria-hidden'?: boolean | string; className?: string }
    if (props['aria-hidden'] === true || props['aria-hidden'] === 'true' || /\bsr-only\b/.test(props.className ?? '')) return ''
    return nodeText(props.children)
  }
  return ''
}

export interface LinkedView { sort?: SortKey[]; filter?: Record<string, ColFilter>; filterArea?: FilterArea | null }

export interface LinkedStore {
  enabled: boolean
  formats: SheetFormatRecord[]
  setFormats: Dispatch<SetStateAction<SheetFormatRecord[]>>
  index: FormatIndex
  rules: ConditionalRule[]
  view: LinkedView
  /** Show the new settings at once and save them; on a refusal, put the old ones back. */
  saveView(after: LinkedView): Promise<boolean>
  saveRules(after: ConditionalRule[]): Promise<boolean>
}

export function useLinkedView<R extends { key: string }>(p: {
  enabled: boolean
  sheetKey: 'linked_content' | 'linked_video'
  rows: R[]
  /** A row's part in a group: sorted and filtered (item), kept under its item (child), or left in place (fixed). */
  kind(row: R): 'item' | 'child' | 'fixed'
  taskOf(row: R): string | null
  textValue(row: R, col: GridCol): string
  say(text: string): void
}) {
  const t = useTranslations('sheets.format')
  const api = useContext(LinkedFormatsContext)
  const enabled = p.enabled && !!api
  const apiRef = useRef(api)
  apiRef.current = api
  const ref = useRef(p)
  ref.current = p
  const [formats, setFormats] = useState<SheetFormatRecord[]>([])
  const [rules, setRules] = useState<ConditionalRule[]>([])
  const [view, setView] = useState<LinkedView>({})
  const viewRef = useRef(view)
  viewRef.current = view
  const rulesRef = useRef(rules)
  rulesRef.current = rules

  useEffect(() => {
    if (!enabled) return
    let live = true
    void apiRef.current?.loadLinkedSheetExtras(p.sheetKey).then(r => {
      if (!live || !r.success) return
      setFormats(r.extras.formats)
      setRules(r.extras.rules ?? [])
      setView({ sort: r.extras.view.sort, filter: r.extras.view.filter, filterArea: r.extras.view.filterArea ?? null })
    })
    return () => { live = false }
  }, [enabled, p.sheetKey])

  const index = useMemo(() => indexFormats(formats), [formats])

  const saveView = useCallback(async (after: LinkedView) => {
    const before = viewRef.current
    setView(after)
    const res = apiRef.current
      ? await apiRef.current.applyLinkedFormats(ref.current.sheetKey, { view: { sort: after.sort ?? null, filter: after.filter ?? null, filterArea: after.filterArea ?? null } })
      : { success: false as const, error: 'generic' }
    if (!res.success) { setView(before); ref.current.say(t('err.generic')); return false }
    return true
  }, [t])
  const saveRules = useCallback(async (after: ConditionalRule[]) => {
    const before = rulesRef.current
    setRules(after)
    const now = new Set(after.map(r => r.id))
    const was = new Map(before.map(r => [r.id, JSON.stringify(r)]))
    const res = apiRef.current
      ? await apiRef.current.applyLinkedFormats(ref.current.sheetKey, { rules: { put: after.filter(r => was.get(r.id) !== JSON.stringify(r)), remove: before.filter(r => !now.has(r.id)).map(r => r.id) } })
      : { success: false as const, error: 'generic' }
    if (!res.success) { setRules(before); ref.current.say(t(`err.${'error' in res && res.error === 'too_many_rules' ? 'too_many_rules' : 'generic'}`)); return false }
    return true
  }, [t])

  // Sort and filter inside each group (FR-075); the board's own order is untouched.
  const rows = useMemo(() => {
    if (!enabled) return p.rows
    const cur = ref.current
    return arrangeGroups(p.rows, cur.kind, view.sort, view.filter, (row, col) => {
      const task = cur.taskOf(row)
      return { text: cur.textValue(row, col), style: task ? resolveStyle(index, task, col) : null }
    })
  }, [enabled, p.rows, view.sort, view.filter, index])

  /** Conditional formatting over the task rows on screen, keyed `taskId|col`. */
  const ruleLooks = useMemo(() => {
    if (!enabled || !rules.length) return new Map<string, RuleLook>()
    const cur = ref.current
    const byTask = new Map<string, R>()
    for (const r of rows) { const task = cur.taskOf(r); if (task && !byTask.has(task)) byTask.set(task, r) }
    const cols = [...new Set(rules.flatMap(r => r.range.cols))]
    return evalRules(rules, [...byTask.keys()], cols, (task, col) => { const row = byTask.get(task); return row ? cur.textValue(row, col) : '' })
  }, [enabled, rules, rows])

  const store: LinkedStore = { enabled, formats, setFormats, index, rules, view, saveView, saveRules }
  return { store, rows, ruleLooks }
}
