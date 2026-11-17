'use client'

/**
 * The cell, row-number and heading menus on the Video and Content sheets
 * (spec 013 FR-040–FR-045, T042), and their row heights.
 *
 * - Cut, Copy, Paste and Clear act on the selection, through the linked editing.
 * - Insert row starts a new clip or piece in that row's group, as "+ Clip" and
 *   "+ Piece" do: a row is a task, so it has to belong somewhere.
 * - Delete rows asks, then drops clips or archives pieces through today's API,
 *   as one step Undo can bring back.
 * - Insert column opens spec 010's add-column form; only the team's own
 *   columns can be deleted.
 * - Row heights are shared by the team (`setLinkedRowHeights`).
 */
import { useContext, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { CellWrite, GridCol, GridRect, MenuTarget, WriteResult, WriteWhy } from './GridCore'
import { parseClipboard, pastePlan, toGrid } from '@/lib/sheet-clipboard'
import { PopMenu, type PopItem } from '@/components/sheets/PopMenu'
import { ConfirmDialog, ResizeDialog } from '@/components/sheets/Dialogs'
import type { SheetColumnsHook } from './useSheetColumns'
import { LinkedFormatsContext } from '@/components/sheets/format/context'
import { askComment } from '@/components/sheets/format/bus'
import { areaRows, unionCells } from '@/lib/sheet-selection'

export interface LinkedMenuInput<R extends { key: string }> {
  rows: R[]
  cols: GridCol[]
  widths: Record<GridCol, number>
  columns: SheetColumnsHook
  /** The sheet's word for removing a row. */
  removal: 'drop' | 'archive'
  /** The task a row holds, if any. */
  taskOf(row: R): { id: string } | null
  /** Whether this member may drop or archive this row now. */
  canRemove(row: R): boolean
  /** Start a new clip or piece in this row's group; false when it has none. */
  insertRow(row: R): boolean
  writeCells(writes: CellWrite[], why: WriteWhy): Promise<WriteResult>
  dropRows(taskIds: string[]): Promise<void>
  onSkipped?(skipped: Partial<Record<string, number>>): void
  say(text: string): void
  /** Saved heights by task id, and how to save new ones. */
  heights?: Record<string, number>
  saveHeights?(entries: { taskId: string; height: number | null }[]): Promise<{ success: boolean }>
  /** Spec 017: every selected area, the newest last. */
  areas?(): GridRect[]
}

export function useLinkedMenu<R extends { key: string }>(p: LinkedMenuInput<R>) {
  const t = useTranslations('sheets')
  const ta = useTranslations('sheets.areas')
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: PopItem[]; anchor: HTMLElement } | null>(null)
  const [confirm, setConfirm] = useState<{ taskIds: string[] } | null>(null)
  const [resize, setResize] = useState<{ kind: 'row' | 'col'; keys: string[]; value: number } | null>(null)
  const [heights, setHeights] = useState<Record<string, number>>(p.heights ?? {})

  const focusActive = (anchor: HTMLElement) => requestAnimationFrame(() => {
    const a = document.activeElement
    if (a && a !== document.body && a.closest('[role="dialog"], [role="menu"]')) return
    anchor.closest('[data-sheet-grid]')?.querySelector<HTMLElement>('.fx-sheet-td.is-active')?.focus({ preventScroll: true })
  })

  function clipboardCommand(kind: 'copy' | 'cut', anchor: HTMLElement) {
    const cell = anchor.closest('[data-sheet-grid]')?.querySelector<HTMLElement>('.fx-sheet-td.is-active') ?? anchor
    cell.focus()
    let ok = false
    try { ok = document.execCommand(kind) } catch { ok = false }
    if (!ok) p.say(t('grid.pasteHint'))
  }
  async function menuPaste(q: GridRect, sel: GridRect[] = [q]) {
    let html = '', text = ''
    try {
      for (const it of await navigator.clipboard.read()) {
        if (it.types.includes('text/html')) html = await (await it.getType('text/html')).text()
        if (it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text()
      }
    } catch {
      try { text = await navigator.clipboard.readText() } catch { p.say(t('grid.pasteHint')); return }
    }
    const g = toGrid(parseClipboard({ html, text }, new DOMParser()))
    if (!g.length) return
    if (sel.length > 1) {
      // Spec 017 FR-012: one cell fills every area; a block needs one area.
      if (g.length !== 1 || g[0].length !== 1) { p.say(ta('pasteBlock')); return }
      const res = await p.writeCells(unionCells(sel).map(({ r, c }) => ({ r, c, value: g[0][0] })), 'paste')
      if (res) p.onSkipped?.(res.skipped)
      return
    }
    const plan = pastePlan(g, q)
    const list: CellWrite[] = []
    for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) list.push({ r: q.r0 + r, c: q.c0 + c, value: plan.value(r, c) })
    const res = await p.writeCells(list, 'paste')
    if (res) p.onSkipped?.(res.skipped)
  }
  async function clear(sel: GridRect[]) {
    const list: CellWrite[] = unionCells(sel).map(({ r, c }) => ({ r, c, value: '' }))
    const res = await p.writeCells(list, 'clear')
    if (res) p.onSkipped?.(res.skipped)
  }

  function setRowHeights(keys: string[], h: number | null) {
    const ids = keys.map(k => p.rows.find(r => r.key === k)).map(r => (r ? p.taskOf(r)?.id : null)).filter((x): x is string => !!x)
    if (!ids.length) return
    const before = heights
    setHeights(hs => { const n = { ...hs }; for (const id of ids) { if (h === null) delete n[id]; else n[id] = h } return n })
    void p.saveHeights?.(ids.map(taskId => ({ taskId, height: h }))).then(r => { if (!r.success) { setHeights(before); p.say(t('err.generic')) } })
  }

  const inWorkbook = !!useContext(LinkedFormatsContext)
  function contextMenu(target: MenuTarget, at: { x: number; y: number }, anchor: HTMLElement) {
    const q = target.rect
    // Spec 017: opened inside a selection of several areas, the menu acts on all of them.
    const all = p.areas?.() ?? [q]
    const tr = target.kind === 'col' ? 0 : target.r, tc = target.kind === 'row' ? 0 : target.c
    const inside = all.length > 1 && (target.kind === 'row' ? all.some(a => tr >= a.r0 && tr <= a.r1)
      : target.kind === 'col' ? all.some(a => tc >= a.c0 && tc <= a.c1)
      : all.some(a => tr >= a.r0 && tr <= a.r1 && tc >= a.c0 && tc <= a.c1))
    const areas = inside ? all : [q]
    const one = inside ? { disabled: true, why: ta('oneArea') } : {}
    const sel = inside ? areaRows(areas).map(r => p.rows[r]).filter((r): r is R => !!r) : p.rows.slice(q.r0, q.r1 + 1)
    const removable = sel.filter(r => p.canRemove(r)).map(r => p.taskOf(r)!.id)
    const here = p.rows[target.kind === 'col' ? q.r0 : target.r]
    const cols = p.cols.slice(q.c0, q.c1 + 1)
    const col = target.kind === 'row' ? p.cols[0] : p.cols[target.kind === 'col' ? target.c : target.c]
    const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    const k = (key: string) => `${mac ? '⌘' : 'Ctrl+'}${key}`
    const no = (why: string) => ({ disabled: true, why })
    const clip: PopItem[] = [
      { key: 'cut', label: t('menu.cut'), kbd: k('X'), ...one, onSelect: () => clipboardCommand('cut', anchor) },
      { key: 'copy', label: t('menu.copy'), kbd: k('C'), onSelect: () => clipboardCommand('copy', anchor) },
      { key: 'paste', label: t('menu.paste'), kbd: k('V'), onSelect: () => void menuPaste(q, areas) },
      { key: 'clear', label: t('menu.clear'), kbd: 'Delete', onSelect: () => void clear(areas) },
      // Spec 015: comments, where the workbook hosts them.
      ...(inWorkbook && target.kind === 'cell' ? [{ key: 'comment', label: t('comments.new'), kbd: mac ? '⌘⌥M' : 'Ctrl+Alt+M', onSelect: () => askComment() } as PopItem] : []),
    ]
    const insertRow: PopItem = { key: 'insertRow', label: p.removal === 'drop' ? t('menu.newClip') : t('menu.newPiece'), ...one, onSelect: () => { if (here && !p.insertRow(here)) p.say(t('err.generic')) } }
    const removeRows: PopItem = {
      key: 'deleteRow', danger: true,
      label: p.removal === 'drop' ? t('menu.dropRows', { n: removable.length || sel.length }) : t('menu.archiveRows', { n: removable.length || sel.length }),
      ...(removable.length ? {} : no(t('menu.cantRemove'))),
      onSelect: () => setConfirm({ taskIds: removable }),
    }
    const insertCols: PopItem[] = [
      { key: 'insertColLeft', label: t('menu.insertColLeft'), ...(col === 'title' ? no(t('menu.titleFirst')) : one), onSelect: () => p.columns.grid.insertColumn('before', col, anchor) },
      { key: 'insertColRight', label: t('menu.insertColRight'), ...one, onSelect: () => p.columns.grid.insertColumn('after', cols[cols.length - 1] ?? col, anchor) },
    ]
    const deletable = !inside && cols.length === 1 && p.columns.grid.canDelete(cols[0])
    const deleteCol: PopItem = { key: 'deleteCol', label: t('menu.deleteCol', { n: cols.length }), danger: true,
      ...(deletable ? {} : no(cols.length > 1 ? t('menu.oneColumn') : t('menu.pipelineCol'))),
      onSelect: () => p.columns.grid.deleteColumn(cols[0], anchor) }
    const resizeRow: PopItem = { key: 'resizeRow', label: t('menu.resizeRow'),
      ...(sel.some(r => p.taskOf(r)) ? {} : no(t('menu.noTask'))),
      onSelect: () => setResize({ kind: 'row', keys: sel.map(r => r.key), value: (here && p.taskOf(here) && heights[p.taskOf(here)!.id]) || 24 }) }
    const resizeCol: PopItem = { key: 'resizeCol', label: t('menu.resizeCol'),
      onSelect: () => setResize({ kind: 'col', keys: cols, value: p.widths[cols[0]] ?? 120 }) }
    const items: PopItem[] = target.kind === 'row'
      ? [...clip, { kind: 'sep', key: 's1' }, insertRow, removeRows, { kind: 'sep', key: 's2' }, resizeRow]
      : target.kind === 'col'
        ? [...clip, { kind: 'sep', key: 's1' }, ...insertCols, deleteCol, { kind: 'sep', key: 's2' }, resizeCol]
        : [...clip, { kind: 'sep', key: 's1' }, insertRow, ...insertCols, { kind: 'sep', key: 's2' }, removeRows, deleteCol]
    setMenu({ at, items, anchor })
  }

  const node: ReactNode = (
    <>
      {menu && <PopMenu at={menu.at} items={menu.items} label={t('tabMenu.label')} attr="data-cell-menu"
                        onClose={() => { const a = menu.anchor; setMenu(null); focusActive(a) }} />}
      {confirm && (
        <ConfirmDialog danger attr="data-drop-rows"
                       title={p.removal === 'drop' ? t('menu.deleteRowsTitle', { n: confirm.taskIds.length }) : t('menu.archiveRowsTitle', { n: confirm.taskIds.length })}
                       body={p.removal === 'drop' ? t('menu.deleteRowsNote') : t('menu.archiveRowsNote')}
                       ok={p.removal === 'drop' ? t('menu.drop') : t('menu.archive')} cancel={t('deleteSheet.cancel')}
                       onCancel={() => setConfirm(null)}
                       onOk={() => { const ids = confirm.taskIds; setConfirm(null); void p.dropRows(ids) }} />
      )}
      {resize && (
        <ResizeDialog kind={resize.kind} value={resize.value} onCancel={() => setResize(null)}
                      onOk={v => {
                        if (resize.kind === 'row') setRowHeights(resize.keys, v)
                        else for (const c of resize.keys) p.columns.grid.onResize(c, v ?? 120)
                        setResize(null)
                      }} />
      )}
    </>
  )

  return {
    contextMenu,
    node,
    rowHeight: (row: R) => { const id = p.taskOf(row)?.id; return (id && heights[id]) || null },
    onRowResize: (row: R, h: number | null) => setRowHeights([row.key], h),
  }
}
