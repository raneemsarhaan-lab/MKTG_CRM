'use client'

/**
 * The column calls a sheet host makes (spec 010), for sheets outside the Board
 * (spec 021 T081: the Tasks sheets on Space, brand and My tasks pages). The same
 * actions and the same optimistic layout as the Board's own host: a change
 * shows now, the server decides, a refusal puts it back.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Member, SheetColumnRecord, SheetId, SheetValues } from '@/types/index'
import { applyOp, type LayoutOp } from '@/lib/sheet-columns'
import {
  addColumn, deleteColumn, moveColumn, renameColumn, resizeColumn, restoreColumn, setColumnShown, setValue as setSheetValue, updateColumn, addContentType,
} from '@/actions/sheet-columns'
import type { ColumnsApi, ColumnsBundle } from './types'

export function useColumnsBundle(initialColumns: SheetColumnRecord[], initialValues: SheetValues, me: Pick<Member, 'id' | 'name'>): ColumnsBundle {
  const router = useRouter()
  const [records, setRecords] = useState<SheetColumnRecord[]>(initialColumns)
  const [values, setValues] = useState<SheetValues>(initialValues)
  useEffect(() => { setRecords(initialColumns) }, [initialColumns])
  useEffect(() => { setValues(initialValues) }, [initialValues])
  const who = { id: me.id, name: me.name }

  async function layout(sheet: SheetId, op: LayoutOp, call: () => Promise<{ success: boolean; error?: string }>) {
    const before = records
    setRecords(r => applyOp(sheet, r, op, who))
    const res = await call().catch(() => ({ success: false, error: 'generic' }))
    if (!res.success) setRecords(before)
    else router.refresh()
    return res
  }

  const api: ColumnsApi = {
    async add(sheet, input) {
      const r = await addColumn(sheet, input).catch(() => ({ success: false as const, error: 'generic' }))
      if (r.success) { setRecords(rs => [...rs.filter(x => x.id !== r.column.id), r.column]); router.refresh() }
      return r
    },
    rename: (sheet, key, name) => layout(sheet, { op: 'rename', key, name }, () => renameColumn(sheet, key, name)),
    move: (sheet, key, before) => layout(sheet, { op: 'move', key, before }, () => moveColumn(sheet, key, before)),
    setShown: (sheet, key, set, shown) => layout(sheet, { op: 'shown', key, set, shown }, () => setColumnShown(sheet, key, set, shown)),
    resize: (sheet, key, width) => layout(sheet, { op: 'width', key, width }, () => resizeColumn(sheet, key, width)),
    async update(id, patch) {
      const r = await updateColumn(id, patch).catch(() => ({ success: false as const, error: 'generic' }))
      if (r.success) router.refresh()
      return r
    },
    async remove(id) {
      const before = records
      setRecords(rs => rs.filter(x => x.id !== id))
      const r = await deleteColumn(id).catch(() => ({ success: false as const, error: 'generic' }))
      if (!r.success) setRecords(before); else router.refresh()
      return r
    },
    async restore(id) {
      const r = await restoreColumn(id).catch(() => ({ success: false as const, error: 'generic' }))
      if (r.success) { setRecords(rs => [...rs.filter(x => x.id !== id), r.column]); router.refresh() }
      return r
    },
    async setValue(columnId, taskId, raw) {
      const before = values[columnId]?.[taskId]
      const r = await setSheetValue(columnId, taskId, raw).catch(() => ({ success: false as const, error: 'generic' }))
      if (r.success) {
        setValues(vs => {
          const col = { ...(vs[columnId] ?? {}) }
          if (r.value) col[taskId] = r.value; else delete col[taskId]
          return { ...vs, [columnId]: col }
        })
      } else if (before !== undefined) {
        setValues(vs => ({ ...vs, [columnId]: { ...(vs[columnId] ?? {}), [taskId]: before } }))
      }
      return r
    },
    async addContentType(label) {
      const r = await addContentType(label).catch(() => ({ success: false as const, error: 'generic' }))
      if (r.success) router.refresh()
      return r
    },
  }
  return { records, values, api }
}
