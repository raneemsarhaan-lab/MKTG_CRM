'use client'

/**
 * Formatting on the Content and Video sheets (spec 015 FR-070–FR-075).
 *
 * - Records are keyed by task id and column key, so a task's look follows it
 *   through regrouping, sorting, dropping and restoring (FR-071).
 * - Any member may format here, and formatting never changes the task (FR-072):
 *   it saves through `applyLinkedFormats`, not the task's fields.
 * - Built-in pills (status, editor, type, choices) keep their own colours; a
 *   fill is the cell's background, so it shows around them (FR-073).
 * - Merge is off, with the reason (FR-074). Number formats apply to the
 *   team's own text columns only; the built-in columns show what they show.
 * - Undo and redo go through the sheet's own stack (useLinkedEditing).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { CellStyle, SheetFormatRecord } from '@/types/index'
import { loadLinkedSheetExtras, applyLinkedFormats } from '@/actions/sheets'
import { formatKey, indexFormats, planBorders, planRect, resolveStyle, toCss, type FormatItem } from '@/lib/sheet-format'
import { useFormatBridge, type FormatCmd, type FormatState } from '@/components/sheets/format/bus'
import type { ActiveCell, GridCol, GridRect } from './GridCore'

export interface LinkedFormatsInput<R extends { key: string }> {
  /** Off outside the Sheets workbook's linked tab and the Content page (no `linked` prop). */
  enabled: boolean
  sheetKey: 'linked_content' | 'linked_video'
  rows: R[]
  cols: GridCol[]
  active: ActiveCell | null
  /** The task a row is, or null for headings and draft rows. */
  taskOf(row: R): string | null
  /** How people name a cell: "Ramadan teaser · Status". */
  cellName(row: R, col: GridCol): string
  textValue(row: R, col: GridCol): string
  recordFormats(label: string, items: FormatItem[]): void
  say(text: string): void
  /** Spec 015 comments: a new comment on this cell. */
  onComment?(cell: { rowKey: string; colKey: string; name: string }): void
}

export function useLinkedFormats<R extends { key: string }>(p: LinkedFormatsInput<R>) {
  const t = useTranslations('sheets.format')
  const ref = useRef(p)
  ref.current = p
  const [formats, setFormats] = useState<SheetFormatRecord[]>([])
  const formatsRef = useRef(formats)
  formatsRef.current = formats
  const rect = useRef<GridRect>({ r0: 0, c0: 0, r1: 0, c1: 0 })
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!p.enabled) return
    let live = true
    void loadLinkedSheetExtras(p.sheetKey).then(r => { if (live && r.success) setFormats(r.extras.formats) }).catch(() => {})
    return () => { live = false }
  }, [p.enabled, p.sheetKey])

  const index = useMemo(() => indexFormats(formats), [formats])

  /** Show the new looks at once, then save; on a refusal, put the old ones back. */
  const put = useCallback(async (items: FormatItem[], look: 'after' | 'before' = 'after') => {
    const apply = (list: SheetFormatRecord[], which: 'after' | 'before') => {
      const map = new Map(list.map(f => [formatKey(f.rowKey, f.colKey), f]))
      for (const it of items) {
        const st = it[which], k = formatKey(it.rowKey, it.colKey)
        if (st) map.set(k, { rowKey: it.rowKey, colKey: it.colKey, style: st }); else map.delete(k)
      }
      return [...map.values()]
    }
    setFormats(f => apply(f, look))
    const res = await applyLinkedFormats(ref.current.sheetKey, { formats: items.map(it => ({ rowKey: it.rowKey, colKey: it.colKey, style: it[look], mode: 'set' as const })) }).catch(() => ({ success: false as const, error: 'network' }))
    if (!res.success) {
      setFormats(f => apply(f, look === 'after' ? 'before' : 'after'))
      ref.current.say(t('err.generic'))
      return false
    }
    return true
  }, [t])

  const size = { rows: p.rows.length, cols: p.cols.length }
  const rk = (r: number) => { const row = p.rows[r]; return row ? p.taskOf(row) : null }
  const ck = (c: number) => p.cols[c] ?? null

  const run = (cmd: FormatCmd) => {
    const q = rect.current
    if (cmd.kind === 'merge') { p.say(t('merge.why')); return }
    if (cmd.kind === 'comment') {
      const row = p.rows[q.r0], col = p.cols[q.c0], task = row ? p.taskOf(row) : null
      if (row && col && task) p.onComment?.({ rowKey: task, colKey: col, name: p.cellName(row, col) })
      return
    }
    const items = cmd.kind === 'patch'
      ? planRect(index, q, size, rk, ck, cmd.patch)
      : planBorders(index, q, size, rk, ck, cmd.preset, cmd.line)
    if (!items) { p.say(t('err.too_many_formats')); return }
    if (!items.length) return
    void put(items).then(ok => { if (ok) ref.current.recordFormats(cmd.kind === 'patch' ? cmd.label : 'borders', items) })
  }

  const activeRow = p.active ? p.rows.find(r => r.key === p.active!.key) : undefined
  const activeTask = activeRow ? p.taskOf(activeRow) : null
  const state: FormatState | null = p.active && activeRow ? {
    source: 'linked',
    style: activeTask ? resolveStyle(index, activeTask, p.active.col) : null,
    value: p.textValue(activeRow, p.active.col),
    cell: p.cellName(activeRow, p.active.col),
    readOnly: activeTask ? null : t('merge.why'),
    mergeOff: t('merge.why'),
    merged: false,
    multi: rect.current.r0 !== rect.current.r1 || rect.current.c0 !== rect.current.c1,
  } : null
  useFormatBridge('linked', p.enabled, state, run)

  return {
    /** For the grid: a task cell's look. */
    cellStyle: (row: R, col: GridCol) => {
      if (!p.enabled || col === 'rowNo') return null
      const task = p.taskOf(row)
      const st = task ? resolveStyle(index, task, col) : null
      return st ? toCss(st) : null
    },
    styleOf: (row: R, col: GridCol): CellStyle | null => { const task = p.taskOf(row); return task ? resolveStyle(index, task, col) : null },
    onSelect: (q: GridRect) => { rect.current = q; setTick(x => x + 1) },
    /** For undo and redo (useLinkedEditing): put records to the given looks. */
    applyFormats: (items: FormatItem[]) => put(items),
  }
}
