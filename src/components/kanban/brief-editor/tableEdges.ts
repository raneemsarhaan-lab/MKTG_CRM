import { Extension, getHTMLFromFragment, mergeAttributes } from '@tiptap/core'
import { Table } from '@tiptap/extension-table'
import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/** Narrowest a column may get while resizing (FR-067). */
export const MIN_COL_PX = 64

/**
 * The brief's table: the stock table node, plus three size attributes, all
 * percentages so they look the same on a laptop, a phone and in the read view
 * (FR-067–069, research R26):
 *
 *   widths  each column's share of the table, summing to 100 (null = equal)
 *   width   the table's width as a share of the brief (default 100)
 *   offset  the gap before the table's start edge, as a share of the brief
 *
 * A table nobody resized is saved as a Markdown pipe table, exactly as before
 * (FR-100). A resized one is saved as an HTML table carrying `data-widths`,
 * `data-width` and `data-offset`, with each cell's content as full HTML, so
 * lists and paragraphs inside cells are kept (U2). The read view renders it
 * from those attributes.
 */
export const BriefTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      widths: {
        default: null,
        parseHTML: el => {
          const raw = el.getAttribute('data-widths')
          if (!raw) return null
          const list = raw.split(',').map(Number)
          return list.every(n => Number.isFinite(n) && n > 0) ? normalise(list) : null
        },
        renderHTML: attrs => (attrs.widths ? { 'data-widths': (attrs.widths as number[]).map(round1).join(',') } : {}),
      },
      width: {
        default: 100,
        parseHTML: el => clampPct(Number(el.getAttribute('data-width') ?? 100), 100),
        renderHTML: attrs => (attrs.width !== 100 ? { 'data-width': String(round1(attrs.width)) } : {}),
      },
      offset: {
        default: 0,
        parseHTML: el => clampPct(Number(el.getAttribute('data-offset') ?? 0), 0),
        renderHTML: attrs => (attrs.offset ? { 'data-offset': String(round1(attrs.offset)) } : {}),
      },
    }
  },

  renderHTML({ node, HTMLAttributes }) {
    const cols = node.firstChild?.childCount ?? 0
    const widths = columnWidths(node)
    const style = `width: ${round1(node.attrs.width)}%; margin-inline-start: ${round1(node.attrs.offset)}%; table-layout: fixed`
    const colgroup: [string, Record<string, string>, ...unknown[]] = ['colgroup', {},
      ...Array.from({ length: cols }, (_, i) => ['col', widths ? { style: `width: ${round1(widths[i])}%` } : {}])]
    return ['table', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { style }), colgroup, ['tbody', 0]]
  },

  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prosemirror-markdown's serializer state isn't re-exported by tiptap-markdown
        serialize(state: any, node: PMNode, parent: PMNode) {
          if (isResized(node) || !isPipeSerializable(node)) {
            state.write(tableHTML(node))
            state.closeBlock(node)
            return
          }
          // The pipe-table writer tiptap-markdown uses, unchanged.
          state.inTable = true
          node.forEach((row, _p, i) => {
            state.write('| ')
            row.forEach((cell, _q, j) => {
              if (j) state.write(' | ')
              const content = cell.firstChild
              if (content && content.textContent.trim()) state.renderInline(content)
            })
            state.write(' |')
            state.ensureNewLine()
            if (!i) {
              state.write(`| ${Array.from({ length: row.childCount }).map(() => '---').join(' | ')} |`)
              state.ensureNewLine()
            }
          })
          state.closeBlock(node)
          state.inTable = false
          void parent
        },
        parse: {},
      },
    }
  },
})

export function isResized(node: PMNode): boolean {
  return !!columnWidths(node) || node.attrs.width !== 100 || !!node.attrs.offset
}

/** The table's column shares when they match its column count, else null (equal). */
export function columnWidths(node: PMNode): number[] | null {
  const w = node.attrs.widths as number[] | null
  const cols = node.firstChild?.childCount ?? 0
  return w && w.length === cols ? w : null
}

function isPipeSerializable(node: PMNode): boolean {
  let ok = true
  node.forEach((row, _p, i) => row.forEach(cell => {
    const header = cell.type.name === 'tableHeader'
    if ((i === 0) !== header || cell.attrs.colspan > 1 || cell.attrs.rowspan > 1 || cell.childCount > 1) ok = false
  }))
  return ok
}

/** One line of HTML, so Markdown keeps it as a single HTML block. */
function tableHTML(node: PMNode): string {
  const html = getHTMLFromFragment(Fragment.from(node), node.type.schema)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return html
  table.removeAttribute('style')
  table.querySelectorAll('colgroup').forEach(c => c.remove())
  table.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'))
  table.querySelectorAll('[colspan="1"],[rowspan="1"]').forEach(el => { el.removeAttribute('colspan'); el.removeAttribute('rowspan') })
  return table.outerHTML.replace(/\n+/g, ' ')
}

const round1 = (n: number) => Math.round(n * 10) / 10
function clampPct(n: number, fallback: number): number {
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback
}
export function normalise(list: number[]): number[] {
  const sum = list.reduce((a, b) => a + b, 0) || 1
  return list.map(n => (n / sum) * 100)
}

// ── Dragging ──────────────────────────────────────────────────────────────

interface DragState {
  tableEl: HTMLTableElement
  tablePos: number
  /** -1 the start edge; 0..n-2 the border after column i; n-1 the end edge. */
  edge: number
  x0: number
  px: number[]
  tableW: number
  offsetPx: number
  boxW: number
  rtl: boolean
  result?: { widths: number[]; width: number; offset: number }
}

const key = new PluginKey('briefTableResize')

/**
 * Resize a table by dragging (FR-067): the border between two columns trades
 * width between them; the table's outer edges make the whole table narrower
 * or wider and move its start, with the edge column taking up the
 * difference. Nothing goes wider than the brief or narrower than 64 px a
 * column. The table updates live; one undoable change is saved on release.
 * `label` reports the size for the badge shown while dragging.
 */
export const TableResize = Extension.create<{ label: { current: (text: string, x: number, y: number) => void } | null; texts: { current: { wide: (n: number) => string; columns: string; table: string } } | null }>({
  name: 'briefTableResize',
  addOptions() { return { label: null, texts: null } },

  addProseMirrorPlugins() {
    const opts = this.options
    let handle: HTMLDivElement | null = null
    let hover: { tableEl: HTMLTableElement; edge: number } | null = null
    let drag: DragState | null = null

    const ensureHandle = () => {
      if (handle) return handle
      handle = document.createElement('div')
      handle.className = 'fx-col-handle'
      handle.setAttribute('role', 'separator')
      handle.setAttribute('aria-orientation', 'vertical')
      handle.setAttribute('data-overlay', '')
      handle.hidden = true
      document.body.appendChild(handle)
      return handle
    }

    const edgeX = (tableEl: HTMLTableElement, edge: number) => {
      const cells = firstRowCells(tableEl)
      const rtl = getComputedStyle(tableEl).direction === 'rtl'
      if (edge === -1) { const r = cells[0].getBoundingClientRect(); return rtl ? r.right : r.left }
      const r = cells[edge].getBoundingClientRect()
      return rtl ? r.left : r.right
    }

    const place = (tableEl: HTMLTableElement, edge: number) => {
      const h = ensureHandle()
      const t = tableEl.getBoundingClientRect()
      const x = edgeX(tableEl, edge)
      const n = firstRowCells(tableEl).length
      const outer = edge === -1 || edge === n - 1
      Object.assign(h.style, { left: `${x - 3}px`, top: `${t.top}px`, height: `${t.height}px` })
      const label = outer ? opts.texts?.current.table ?? '' : opts.texts?.current.columns ?? ''
      h.title = label
      h.setAttribute('aria-label', label)
      h.hidden = false
      return x
    }

    const hide = () => { if (handle && !drag) handle.hidden = true; hover = null }

    return [new Plugin({
      key,
      view(view) {
        const h = ensureHandle()

        const onMove = (e: PointerEvent) => {
          if (!drag) return
          const d = drag
          let dx = e.clientX - d.x0
          if (d.rtl) dx = -dx
          const px = [...d.px]
          const n = px.length
          let tableW = d.tableW
          let offsetPx = d.offsetPx
          let text = ''
          if (d.edge === -1) {
            dx = Math.max(-d.offsetPx, Math.min(dx, px[0] - MIN_COL_PX))
            px[0] -= dx; tableW -= dx; offsetPx += dx
            text = opts.texts?.current.wide(Math.round(tableW / d.boxW * 100)) ?? ''
          } else if (d.edge === n - 1) {
            dx = Math.max(MIN_COL_PX - px[n - 1], Math.min(dx, d.boxW - d.offsetPx - d.tableW))
            px[n - 1] += dx; tableW += dx
            text = opts.texts?.current.wide(Math.round(tableW / d.boxW * 100)) ?? ''
          } else {
            const sum = px[d.edge] + px[d.edge + 1]
            px[d.edge] = Math.max(MIN_COL_PX, Math.min(sum - MIN_COL_PX, px[d.edge] + dx))
            px[d.edge + 1] = sum - px[d.edge]
            text = `${Math.round(px[d.edge] / tableW * 100)}% · ${Math.round(px[d.edge + 1] / tableW * 100)}%`
          }
          d.result = { widths: px.map(p => p / tableW * 100), width: tableW / d.boxW * 100, offset: offsetPx / d.boxW * 100 }
          applyLive(d.tableEl, d.result)
          const x = place(d.tableEl, d.edge)
          const t = d.tableEl.getBoundingClientRect()
          opts.label?.current(text, x, t.top + t.height / 2)
        }

        const onUp = () => {
          if (!drag) return
          const d = drag
          drag = null
          h.classList.remove('on')
          document.body.classList.remove('fx-resizing')
          opts.label?.current('', 0, 0)
          if (!d.result) return
          const node = view.state.doc.nodeAt(d.tablePos)
          if (!node || node.type.name !== 'table') return
          view.dispatch(view.state.tr.setNodeMarkup(d.tablePos, undefined, {
            ...node.attrs, widths: d.result.widths, width: d.result.width, offset: d.result.offset,
          }))
        }

        h.addEventListener('pointerdown', e => {
          if (!hover || !view.editable) return
          e.preventDefault()
          h.setPointerCapture(e.pointerId)
          const { tableEl, edge } = hover
          const tablePos = tableNodePos(view, tableEl)
          if (tablePos === null) return
          const box = contentBox(view)
          const cells = firstRowCells(tableEl)
          const t = tableEl.getBoundingClientRect()
          const rtl = getComputedStyle(tableEl).direction === 'rtl'
          const start = rtl ? box.right - t.right : t.left - box.left
          drag = {
            tableEl, tablePos, edge, x0: e.clientX, rtl,
            px: cells.map(c => c.getBoundingClientRect().width),
            tableW: t.width, offsetPx: Math.max(0, start), boxW: box.width,
          }
          h.classList.add('on')
          document.body.classList.add('fx-resizing')
        })
        h.addEventListener('pointermove', onMove)
        h.addEventListener('pointerup', onUp)
        h.addEventListener('pointercancel', onUp)

        const onHover = (e: PointerEvent) => {
          if (drag || !view.editable) return
          const cell = (e.target as Element | null)?.closest?.('td, th')
          if (!cell || !view.dom.contains(cell)) { if (e.target !== h) hide(); return }
          const tableEl = cell.closest('table') as HTMLTableElement
          const n = firstRowCells(tableEl).length
          const zone = e.pointerType === 'touch' ? 14 : 6
          for (let edge = -1; edge < n; edge++) {
            if (Math.abs(e.clientX - edgeX(tableEl, edge)) <= zone) { hover = { tableEl, edge }; place(tableEl, edge); return }
          }
          hide()
        }
        view.dom.addEventListener('pointermove', onHover)
        const onLeave = (e: PointerEvent) => { if (e.relatedTarget !== h) hide() }
        view.dom.addEventListener('pointerleave', onLeave)

        return {
          destroy() {
            view.dom.removeEventListener('pointermove', onHover)
            view.dom.removeEventListener('pointerleave', onLeave)
            h.remove()
            handle = null
          },
        }
      },
    })]
  },
})

function firstRowCells(tableEl: HTMLTableElement): HTMLElement[] {
  return [...(tableEl.rows[0]?.cells ?? [])] as HTMLElement[]
}

function contentBox(view: EditorView) {
  const r = view.dom.getBoundingClientRect()
  const cs = getComputedStyle(view.dom)
  const left = r.left + parseFloat(cs.paddingLeft)
  const right = r.right - parseFloat(cs.paddingRight)
  return { left, right, width: right - left }
}

function tableNodePos(view: EditorView, tableEl: HTMLTableElement): number | null {
  try {
    const inside = view.posAtDOM(tableEl, 0)
    const $p = view.state.doc.resolve(inside)
    for (let d = $p.depth; d >= 0; d--) if ($p.node(d).type.name === 'table') return $p.before(d)
    const after = view.state.doc.nodeAt(inside)
    if (after?.type.name === 'table') return inside
    const before = $p.nodeAfter?.type.name === 'table' ? inside : null
    return before
  } catch { return null }
}

function applyLive(tableEl: HTMLTableElement, r: { widths: number[]; width: number; offset: number }) {
  tableEl.style.width = `${r.width}%`
  tableEl.style.marginInlineStart = `${r.offset}%`
  tableEl.querySelectorAll('col').forEach((c, i) => { (c as HTMLElement).style.width = `${r.widths[i]}%` })
}
