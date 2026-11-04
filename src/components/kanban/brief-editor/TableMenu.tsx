'use client'

import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react/menus'
import { selectedRect } from '@tiptap/pm/tables'
import { BRIEF_UI, COLORS, alpha } from '@/lib/tokens'
import { columnWidths, normalise } from './tableEdges'

/**
 * The bar above a table while the cursor is in it: add a row or column on
 * either side, delete a row, a column or the table, and reset sizes
 * (FR-063, FR-069, research R10, R26). Before, a table could only grow by
 * Tab at its end (audit E12).
 *
 * Column widths are kept in step: a new column takes half of the column it
 * was added beside, a deleted column's share goes to its neighbour.
 */
export function TableMenu({ editor }: { editor: Editor }) {
  const t = useTranslations('briefEditor')
  const rtl = typeof document !== 'undefined' && getComputedStyle(editor.view.dom).direction === 'rtl'

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

  const actions: { id: string; label: string; run: () => void; danger?: boolean; sep?: boolean }[] = [
    { id: 'rowAbove', label: t('rowAbove'), run: () => editor.chain().focus().addRowBefore().run() },
    { id: 'rowBelow', label: t('rowBelow'), run: () => editor.chain().focus().addRowAfter().run() },
    // "Before" is to the left in English and to the right in Arabic.
    { id: 'colLeft', label: t('colLeft'), run: () => columnCommand(rtl ? 'after' : 'before'), sep: true },
    { id: 'colRight', label: t('colRight'), run: () => columnCommand(rtl ? 'before' : 'after') },
    { id: 'equalWidths', label: t('equalWidths'), run: () => resetSizes('columns'), sep: true },
    { id: 'fullWidth', label: t('fullWidth'), run: () => resetSizes('table') },
    { id: 'deleteRow', label: t('deleteRow'), run: () => editor.chain().focus().deleteRow().run(), danger: true, sep: true },
    { id: 'deleteColumn', label: t('deleteColumn'), run: () => columnCommand('delete'), danger: true },
    { id: 'deleteTable', label: t('deleteTable'), run: () => editor.chain().focus().deleteTable().run(), danger: true },
  ]

  // Stable props: the bubble menu re-sends its options whenever these change
  // identity, and that update is a transaction, which re-renders the editor.
  const shouldShow = useCallback(
    ({ editor: ed, view }: { editor: Editor; view: { hasFocus: () => boolean } }) =>
      ed.isEditable && ed.isActive('table') && view.hasFocus(),
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
        role="toolbar"
        aria-label={t('table')}
        data-table-menu=""
        data-overlay=""
        onMouseDown={e => e.preventDefault()}
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, padding: 4, maxWidth: 560,
          background: COLORS.panel, borderRadius: 12, boxShadow: `0 12px 32px ${alpha(BRIEF_UI.ink, 0.16)}`,
        }}
      >
        {actions.map(a => (
          <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {a.sep && <span aria-hidden="true" style={{ width: 1, height: 18, background: BRIEF_UI.line, margin: '0 3px' }} />}
            <button type="button" data-action={a.id} onClick={a.run}
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
