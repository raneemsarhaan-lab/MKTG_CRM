'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react/menus'
import { selectedRect } from '@tiptap/pm/tables'
import { BRIEF_UI, COLORS, alpha } from '@/lib/tokens'
import { columnWidths, normalise, startKeyboardResize } from './tableEdges'
import { shortcut, withShortcut } from './shortcut'

/** Moves focus from a table cell onto the bar. */
const FOCUS_KEYS = 'Alt+F10'

/**
 * The bar above a table while the cursor is in it: add a row or column on
 * either side, delete a row, a column or the table, and reset sizes
 * (FR-063, FR-069, research R10, R26). Before, a table could only grow by
 * Tab at its end (audit E12).
 *
 * Column widths are kept in step: a new column takes half of the column it
 * was added beside, a deleted column's share goes to its neighbour.
 *
 * From the keyboard: Alt+F10 in a table moves focus onto the bar (the usual
 * editor shortcut for "go to the toolbar"); the arrow keys, Home and End move
 * between its buttons; Esc goes back to the cell. An action returns to the
 * cell too. "Resize column" hands the column's border to the arrow keys.
 */
export function TableMenu({ editor, onNote }: {
  editor: Editor
  /** The editor's status note: says what a destructive action did and how to undo it. */
  onNote: (msg: string, ms?: number) => void
}) {
  const t = useTranslations('briefEditor')
  // Read once: the direction doesn't change while editing, and this rendered
  // on every keystroke.
  const [rtl] = useState(() => getComputedStyle(document.documentElement).direction === 'rtl')
  const barRef = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)

  /** Run a table command and keep the table's `widths` matching its columns. */
  function columnCommand(kind: 'before' | 'after' | 'delete') {
    const { state } = editor
    let rect
    try { rect = selectedRect(state) } catch { return }
    const tablePos = rect.tableStart - 1
    const widths = columnWidths(rect.table)
    const col = rect.left
    const chain = editor.chain().focus()
    if (kind === 'before') chain.addColumnBefore()
    else if (kind === 'after') chain.addColumnAfter()
    else chain.deleteColumn()
    chain.run()
    if (!widths) return
    const next = [...widths]
    if (kind === 'delete') {
      const share = next.splice(col, 1)[0] ?? 0
      if (next.length) next[Math.min(col, next.length - 1)] += share
    } else {
      const half = next[col] / 2
      next[col] = half
      next.splice(kind === 'before' ? col : col + 1, 0, half)
    }
    const node = editor.state.doc.nodeAt(tablePos)
    if (node?.type.name !== 'table') return
    editor.view.dispatch(editor.state.tr.setNodeMarkup(tablePos, undefined, { ...node.attrs, widths: next.length ? normalise(next) : null }))
  }

  function resetSizes(which: 'columns' | 'table') {
    let rect
    try { rect = selectedRect(editor.state) } catch { return }
    const tablePos = rect.tableStart - 1
    const node = editor.state.doc.nodeAt(tablePos)
    if (node?.type.name !== 'table') return
    const attrs = which === 'columns' ? { ...node.attrs, widths: null } : { ...node.attrs, width: 100, offset: 0 }
    editor.view.dispatch(editor.state.tr.setNodeMarkup(tablePos, undefined, attrs))
    editor.commands.focus()
  }

  /** Gone in one click, so say so, and how to get it back (one undo step). */
  function deleteTable() {
    if (editor.chain().focus().deleteTable().run()) onNote(t('tableDeleted', { keys: shortcut('Mod+Z') }), 6000)
  }

  /** The column's border takes the arrow keys, and the note says which keys. */
  function resizeColumn() {
    if (startKeyboardResize(editor.view)) onNote(t('resizeKeys'), 6000)
    else editor.commands.focus()
  }

  const actions: { id: string; label: string; run: () => void; danger?: boolean; sep?: boolean }[] = [
    { id: 'rowAbove', label: t('rowAbove'), run: () => editor.chain().focus().addRowBefore().run() },
    { id: 'rowBelow', label: t('rowBelow'), run: () => editor.chain().focus().addRowAfter().run() },
    // "Before" is to the left in English and to the right in Arabic.
    { id: 'colLeft', label: t('colLeft'), run: () => columnCommand(rtl ? 'after' : 'before'), sep: true },
    { id: 'colRight', label: t('colRight'), run: () => columnCommand(rtl ? 'before' : 'after') },
    { id: 'resizeColumn', label: t('resizeColumn'), run: resizeColumn, sep: true },
    { id: 'equalWidths', label: t('equalWidths'), run: () => resetSizes('columns') },
    { id: 'fullWidth', label: t('fullWidth'), run: () => resetSizes('table') },
    { id: 'deleteRow', label: t('deleteRow'), run: () => editor.chain().focus().deleteRow().run(), danger: true, sep: true },
    { id: 'deleteColumn', label: t('deleteColumn'), run: () => columnCommand('delete'), danger: true },
    { id: 'deleteTable', label: t('deleteTable'), run: deleteTable, danger: true },
  ]

  // Alt+F10 in a table: onto the bar, at the button last used there.
  useEffect(() => {
    const dom = editor.view.dom
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || e.key !== 'F10' || !editor.isActive('table')) return
      const btn = barRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')
      if (!btn?.isConnected) return
      e.preventDefault()
      btn.focus()
    }
    dom.addEventListener('keydown', onKey)
    return () => dom.removeEventListener('keydown', onKey)
  }, [editor])

  /** Roving focus (one Tab stop), arrows reversed in right-to-left, like the main toolbar. */
  function onBarKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      // Handled: neither the editor's "leave editing" nor the task panel's Esc.
      e.preventDefault()
      e.stopPropagation()
      editor.commands.focus()
      return
    }
    const btns = [...(barRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    let n: number | null = null
    if (e.key === 'ArrowRight') n = rtl ? i - 1 : i + 1
    if (e.key === 'ArrowLeft') n = rtl ? i + 1 : i - 1
    if (e.key === 'Home') n = 0
    if (e.key === 'End') n = btns.length - 1
    if (n === null) return
    e.preventDefault()
    n = (n + btns.length) % btns.length
    setAt(n)
    btns[n].focus()
  }

  // Stable props: the bubble menu re-sends its options whenever these change
  // identity, and that update is a transaction, which re-renders the editor.
  // Shown while the cursor is in a table, and while focus is on the bar itself.
  const shouldShow = useCallback(
    ({ editor: ed, view }: { editor: Editor; view: { hasFocus: () => boolean } }) =>
      ed.isEditable && ed.isActive('table') && (view.hasFocus() || !!barRef.current?.contains(document.activeElement)),
    [],
  )
  const anchorTable = useCallback(() => {
    const { from } = editor.state.selection
    const at = editor.view.domAtPos(from).node as Node
    const el = (at.nodeType === Node.ELEMENT_NODE ? at as Element : at.parentElement)?.closest('table')
    return el ? { getBoundingClientRect: () => el.getBoundingClientRect(), getClientRects: () => el.getClientRects() } : null
  }, [editor])
  const options = useMemo(() => ({ placement: (rtl ? 'top-end' : 'top-start') as 'top-end' | 'top-start', offset: 8 }), [rtl])

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="briefTableMenu"
      shouldShow={shouldShow}
      getReferencedVirtualElement={anchorTable}
      options={options}
    >
      <div
        ref={barRef}
        role="toolbar"
        aria-label={t('table')}
        aria-keyshortcuts={FOCUS_KEYS}
        title={withShortcut(t('table'), FOCUS_KEYS)}
        data-table-menu=""
        data-overlay=""
        onMouseDown={e => e.preventDefault()}
        onKeyDown={onBarKey}
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, padding: 4, maxWidth: 560,
          background: COLORS.panel, borderRadius: 12, boxShadow: `0 12px 32px ${alpha(BRIEF_UI.ink, 0.16)}`,
        }}
      >
        {actions.map((a, i) => (
          <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {a.sep && <span aria-hidden="true" style={{ width: 1, height: 18, background: BRIEF_UI.line, margin: '0 3px' }} />}
            <button type="button" data-action={a.id} onClick={a.run}
                    tabIndex={i === Math.min(at, actions.length - 1) ? 0 : -1}
                    className="fx-focus"
                    onFocus={() => setAt(i)}
                    style={{
                      border: 'none', background: 'transparent', borderRadius: 7, padding: '5px 8px',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      color: a.danger ? BRIEF_UI.error : BRIEF_UI.ink, whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = BRIEF_UI.blueLight }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              {a.label}
            </button>
          </span>
        ))}
      </div>
    </BubbleMenu>
  )
}
