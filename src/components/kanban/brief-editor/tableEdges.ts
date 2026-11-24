import { Extension, getHTMLFromFragment, mergeAttributes } from '@tiptap/core'
import { Table } from '@tiptap/extension-table'
import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView, NodeView, ViewMutationRecord } from '@tiptap/pm/view'
import { selectedRect } from '@tiptap/pm/tables'

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

  // In the editor the table is drawn by a node view, not renderHTML alone, so
  // a resize can restyle the table and its <col>s while the pointer moves.
  // Without one, ProseMirror reads those style changes as foreign edits and
  // redraws the table from its saved sizes, so the table only jumped to its
  // new widths on release. (renderHTML still serves copy and the HTML export.)
  addNodeView() {
    return ({ node, HTMLAttributes }) =>
      new BriefTableView(node, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes))
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

/**
 * The table as renderHTML draws it — <table style> › <colgroup> › <tbody> —
 * kept in step with the node on every update, and deaf to style changes on
 * the table and its columns, which belong to a resize in progress
 * (applyLive / restoreLive). Edits inside the cells are still read as usual.
 */
class BriefTableView implements NodeView {
  dom: HTMLTableElement
  contentDOM: HTMLElement
  private colgroup: HTMLTableColElement
  private node: PMNode

  constructor(node: PMNode, attrs: Record<string, unknown>) {
    this.node = node
    this.dom = document.createElement('table')
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || k.startsWith('data-')) continue  // data-* follow the node, in draw()
      if (k === 'style') this.dom.style.cssText = String(v)
      else this.dom.setAttribute(k, String(v))
    }
    this.colgroup = this.dom.appendChild(document.createElement('colgroup'))
    this.contentDOM = this.dom.appendChild(document.createElement('tbody'))
    this.draw(node)
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.draw(node)
    return true
  }

  ignoreMutation(m: ViewMutationRecord) {
    if (m.type === 'selection') return false
    // The table element and its colgroup are this view's own; the cells are not.
    return !this.contentDOM.contains(m.target)
  }

  private draw(node: PMNode) {
    const t = this.dom
    t.style.width = `${round1(node.attrs.width)}%`
    t.style.marginInlineStart = `${round1(node.attrs.offset)}%`
    t.style.tableLayout = 'fixed'
    const widths = columnWidths(node)
    const data: Record<string, string | null> = {
      'data-widths': widths ? widths.map(round1).join(',') : null,
      'data-width': node.attrs.width !== 100 ? String(round1(node.attrs.width)) : null,
      'data-offset': node.attrs.offset ? String(round1(node.attrs.offset)) : null,
    }
    for (const [k, v] of Object.entries(data)) {
      if (v == null) t.removeAttribute(k)
      else t.setAttribute(k, v)
    }
    const cols = node.firstChild?.childCount ?? 0
    while (this.colgroup.children.length > cols) this.colgroup.lastElementChild!.remove()
    while (this.colgroup.children.length < cols) this.colgroup.appendChild(document.createElement('col'))
    Array.from(this.colgroup.children).forEach((c, i) => {
      (c as HTMLElement).style.width = widths ? `${round1(widths[i])}%` : ''
    })
  }
}

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

/** The texts the resize handle and its badge use, read when used. */
export interface TableResizeTexts {
  /** A share of 100, written as the locale writes a percentage. */
  pct: (share: number) => string
  /** "80% wide", given the written percentage. */
  wide: (pct: string) => string
  columns: string
  table: string
  /** The handle's name while it has keyboard focus. */
  columnWidth: string
  tableWidth: string
}

const key = new PluginKey('briefTableResize')

/** Each editor's way into a keyboard resize; set while its plugin view lives. */
const keyboardResize = new WeakMap<EditorView, () => boolean>()

/**
 * Resize the column the cursor is in from the keyboard: focuses the handle on
 * the column's end border (the table's end edge for the last column), where
 * the arrow keys move it. False when the cursor isn't in a table.
 */
export function startKeyboardResize(view: EditorView): boolean {
  return keyboardResize.get(view)?.() ?? false
}

/**
 * The sizes with `d.edge` moved `dx` px along the reading direction, kept
 * within the brief and above the minimum column width. `dx` comes back
 * clamped, so a keyboard session can't run up a debt past the limit.
 */
function resize(d: DragState, dx: number) {
  const px = [...d.px]
  const n = px.length
  let tableW = d.tableW
  let offsetPx = d.offsetPx
  if (d.edge === -1) {
    dx = Math.max(-d.offsetPx, Math.min(dx, px[0] - MIN_COL_PX))
    px[0] -= dx; tableW -= dx; offsetPx += dx
  } else if (d.edge === n - 1) {
    dx = Math.max(MIN_COL_PX - px[n - 1], Math.min(dx, d.boxW - d.offsetPx - d.tableW))
    px[n - 1] += dx; tableW += dx
  } else {
    const sum = px[d.edge] + px[d.edge + 1]
    px[d.edge] = Math.max(MIN_COL_PX, Math.min(sum - MIN_COL_PX, px[d.edge] + dx))
    px[d.edge + 1] = sum - px[d.edge]
    dx = px[d.edge] - d.px[d.edge]
  }
  return {
    dx, px, tableW,
    result: { widths: px.map(p => p / tableW * 100), width: tableW / d.boxW * 100, offset: offsetPx / d.boxW * 100 },
  }
}

/**
 * What the handle stands for, as a separator's value: the table's width for
 * an outer edge, else the share of the column before the border; with the
 * badge text that says the same.
 */
function measureFor(d: DragState, r: ReturnType<typeof resize>, texts: TableResizeTexts | undefined) {
  const n = d.px.length
  if (d.edge === -1 || d.edge === n - 1) {
    const now = r.tableW / d.boxW * 100
    const spare = d.px[d.edge === -1 ? 0 : n - 1] - MIN_COL_PX
    const max = d.edge === -1 ? d.tableW + d.offsetPx : d.boxW - d.offsetPx
    return {
      now, min: (d.tableW - spare) / d.boxW * 100, max: max / d.boxW * 100,
      text: texts ? texts.wide(texts.pct(now)) : '',
    }
  }
  const a = r.px[d.edge] / r.tableW * 100
  const b = r.px[d.edge + 1] / r.tableW * 100
  const sum = d.px[d.edge] + d.px[d.edge + 1]
  return {
    now: a, min: MIN_COL_PX / d.tableW * 100, max: (sum - MIN_COL_PX) / d.tableW * 100,
    text: texts ? `${texts.pct(a)} · ${texts.pct(b)}` : '',
  }
}

/**
 * Resize a table by dragging (FR-067): the border between two columns trades
 * width between them; the table's outer edges make the whole table narrower
 * or wider and move its start, with the edge column taking up the
 * difference. Nothing goes wider than the brief or narrower than 64 px a
 * column. The table updates live; one undoable change is saved on release.
 * `label` reports the size for the badge shown while dragging.
 *
 * The same handle works from the keyboard (`startKeyboardResize`, offered by
 * the table bar): it takes focus as a separator with its value, the arrow
 * keys move it (Shift for bigger steps), Enter or Tab keeps the size and Esc
 * puts it back, returning to the cell either way.
 */
export const TableResize = Extension.create<{ label: { current: (text: string, x: number, y: number) => void } | null; texts: { current: TableResizeTexts } | null }>({
  name: 'briefTableResize',
  addOptions() { return { label: null, texts: null } },

  addProseMirrorPlugins() {
    const opts = this.options
    let handle: HTMLDivElement | null = null
    let hover: { tableEl: HTMLTableElement; edge: number } | null = null
    let drag: DragState | null = null
    /** A keyboard resize in progress; `dx` is where the arrows have moved the edge. */
    let kbd: (DragState & { dx: number }) | null = null

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

    const edgeX = (tableEl: HTMLTableElement, edge: number, rtl = getComputedStyle(tableEl).direction === 'rtl') => {
      const cells = firstRowCells(tableEl)
      if (edge === -1) { const r = cells[0].getBoundingClientRect(); return rtl ? r.right : r.left }
      const r = cells[edge].getBoundingClientRect()
      return rtl ? r.left : r.right
    }

    const moveHandle = (x: number, t: DOMRect) => {
      const h = ensureHandle()
      Object.assign(h.style, { left: `${x - 3}px`, top: `${t.top}px`, height: `${t.height}px` })
      h.hidden = false
    }

    const place = (tableEl: HTMLTableElement, edge: number) => {
      const h = ensureHandle()
      const t = tableEl.getBoundingClientRect()
      const x = edgeX(tableEl, edge)
      const n = firstRowCells(tableEl).length
      const outer = edge === -1 || edge === n - 1
      moveHandle(x, t)
      const label = outer ? opts.texts?.current.table ?? '' : opts.texts?.current.columns ?? ''
      h.title = label
      if (!kbd) h.setAttribute('aria-label', label)
      return x
    }

    const hide = () => { if (handle && !drag && !kbd) handle.hidden = true; hover = null }

    return [new Plugin({
      key,
      view(view) {
        const h = ensureHandle()

        /** The start of a resize: where the table and its columns are now. */
        const begin = (tableEl: HTMLTableElement, tablePos: number, edge: number, x0: number): DragState => {
          const box = contentBox(view)
          const cells = firstRowCells(tableEl)
          const t = tableEl.getBoundingClientRect()
          const rtl = getComputedStyle(tableEl).direction === 'rtl'
          const start = rtl ? box.right - t.right : t.left - box.left
          return {
            tableEl, tablePos, edge, x0, rtl,
            px: cells.map(c => c.getBoundingClientRect().width),
            tableW: t.width, offsetPx: Math.max(0, start), boxW: box.width,
          }
        }

        /**
         * Show the table at `dx`: all the writes first, then one round of
         * reads for where the edge has landed, then the handle and badge.
         * One layout per call; interleaving them forced several.
         */
        const show = (d: DragState, dx: number) => {
          const r = resize(d, dx)
          const m = measureFor(d, r, opts.texts?.current)
          d.result = r.result
          applyLive(d.tableEl, r.result)
          const x = edgeX(d.tableEl, d.edge, d.rtl)
          const t = d.tableEl.getBoundingClientRect()
          moveHandle(x, t)
          h.setAttribute('aria-valuenow', String(Math.round(m.now)))
          h.setAttribute('aria-valuemin', String(Math.round(m.min)))
          h.setAttribute('aria-valuemax', String(Math.round(m.max)))
          h.setAttribute('aria-valuetext', m.text)
          opts.label?.current(m.text, x, t.top + t.height / 2)
          return r
        }

        const commit = (d: DragState) => {
          if (!d.result) return
          const node = view.state.doc.nodeAt(d.tablePos)
          if (!node || node.type.name !== 'table') return
          view.dispatch(view.state.tr.setNodeMarkup(d.tablePos, undefined, {
            ...node.attrs, widths: d.result.widths, width: d.result.width, offset: d.result.offset,
          }))
        }

        // Pointer moves arrive faster than frames: keep the last one, draw once a frame.
        let frame = 0
        let pointerX = 0
        const flush = () => {
          frame = 0
          if (!drag) return
          let dx = pointerX - drag.x0
          if (drag.rtl) dx = -dx
          show(drag, dx)
        }
        const onMove = (e: PointerEvent) => {
          if (!drag) return
          pointerX = e.clientX
          if (!frame) frame = requestAnimationFrame(flush)
        }

        const onUp = () => {
          if (!drag) return
          if (frame) { cancelAnimationFrame(frame); flush() }
          const d = drag
          drag = null
          h.classList.remove('on')
          document.body.classList.remove('fx-resizing')
          opts.label?.current('', 0, 0)
          commit(d)
        }

        h.addEventListener('pointerdown', e => {
          if (!hover || kbd || !view.editable) return
          e.preventDefault()
          h.setPointerCapture(e.pointerId)
          const { tableEl, edge } = hover
          const tablePos = tableNodePos(view, tableEl)
          if (tablePos === null) return
          drag = begin(tableEl, tablePos, edge, e.clientX)
          pointerX = e.clientX
          h.classList.add('on')
          document.body.classList.add('fx-resizing')
        })
        h.addEventListener('pointermove', onMove)
        h.addEventListener('pointerup', onUp)
        h.addEventListener('pointercancel', onUp)

        // ── From the keyboard ──
        const endKeyboard = (keep: boolean, refocus: boolean) => {
          const d = kbd
          if (!d) return
          kbd = null
          h.classList.remove('on')
          h.removeAttribute('tabindex')
          for (const a of ['aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-valuetext']) h.removeAttribute(a)
          h.hidden = true
          hover = null
          opts.label?.current('', 0, 0)
          if (keep) commit(d)
          else {
            const node = view.state.doc.nodeAt(d.tablePos)
            if (node?.type.name === 'table') restoreLive(d.tableEl, node)
          }
          if (refocus) view.focus()
        }

        keyboardResize.set(view, () => {
          if (!view.editable || drag) return false
          let rect
          try { rect = selectedRect(view.state) } catch { return false }
          const at = view.domAtPos(view.state.selection.from).node
          const tableEl = (at.nodeType === Node.ELEMENT_NODE ? at as Element : at.parentElement)?.closest('table')
          if (!tableEl || !view.dom.contains(tableEl)) return false
          const n = firstRowCells(tableEl).length
          if (!n) return false
          // The end border of the cursor's column; for the last one, the table's end edge.
          const edge = Math.min(rect.right - 1, n - 1)
          kbd = { ...begin(tableEl, rect.tableStart - 1, edge, 0), dx: 0 }
          hover = { tableEl, edge }
          place(tableEl, edge)
          const outer = edge === n - 1
          h.setAttribute('aria-label', (outer ? opts.texts?.current.tableWidth : opts.texts?.current.columnWidth) ?? '')
          h.tabIndex = -1
          h.classList.add('on')
          show(kbd, 0)
          h.focus({ preventScroll: true })
          return true
        })

        h.addEventListener('keydown', e => {
          const d = kbd
          if (!d) return
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            // Arrows move the handle the way a drag would, on screen.
            const step = Math.max(4, d.boxW * (e.shiftKey ? 0.1 : 0.02))
            const onScreen = e.key === 'ArrowRight' ? step : -step
            d.dx = show(d, d.dx + (d.rtl ? -onScreen : onScreen)).dx
          } else if (e.key === 'Enter' || e.key === 'Tab') endKeyboard(true, true)
          else if (e.key === 'Escape') endKeyboard(false, true)
          else return
          // Handled here: the task panel's own Esc and Tab must not also act.
          e.preventDefault()
          e.stopPropagation()
        })
        // Focus elsewhere (a click away) keeps the size, as letting go of a drag does.
        h.addEventListener('blur', () => endKeyboard(true, false))

        const onHover = (e: PointerEvent) => {
          if (drag || kbd || !view.editable) return
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
            if (frame) cancelAnimationFrame(frame)
            keyboardResize.delete(view)
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

/** Back to the sizes the node holds, as `renderHTML` draws them (a cancelled resize). */
function restoreLive(tableEl: HTMLTableElement, node: PMNode) {
  const widths = columnWidths(node)
  tableEl.style.width = `${round1(node.attrs.width)}%`
  tableEl.style.marginInlineStart = `${round1(node.attrs.offset)}%`
  tableEl.querySelectorAll('col').forEach((c, i) => { (c as HTMLElement).style.width = widths ? `${round1(widths[i])}%` : '' })
}
