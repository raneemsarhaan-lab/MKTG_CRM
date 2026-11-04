import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Where a click landed in the read brief, in terms the editor can find again
 * once it has replaced the read view: which top-level block, how many
 * characters into its text, and where that block sat on screen.
 * FR-015, SC-011, research R25.
 *
 * Briefs are read through `Brief` (embeds, link chips, Expand) and edited
 * through Tiptap; the two render the same Markdown into different DOM, so a
 * DOM position can't be carried across. A block index and a text offset can:
 * both views produce one top-level element per Markdown block.
 */
export interface ReadAnchor {
  block: number
  /** Visible (non-whitespace) characters before the click. Whitespace is not
   *  counted on either side: the read view has spaces and line breaks the
   *  editor's document doesn't (after a checkbox, between list items). */
  offset: number
  /** The clicked block's top edge in the viewport, for keeping it still. */
  top: number
}

export function anchorFromPoint(root: HTMLElement, x: number, y: number): ReadAnchor | null {
  const caret = caretAt(x, y)
  if (!caret || !root.contains(caret.node)) return null
  let block: Element | null = caret.node.nodeType === Node.ELEMENT_NODE ? caret.node as Element : caret.node.parentElement
  while (block && block.parentElement !== root) block = block.parentElement
  if (!block) return null
  const index = Array.prototype.indexOf.call(root.children, block)
  if (index < 0) return null

  // Visible characters before the caret, within the block.
  let offset = 0
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? ''
    if (n === caret.node) { offset += visible(text.slice(0, caret.offset)); break }
    offset += visible(text)
  }
  return { block: index, offset, top: block.getBoundingClientRect().top }
}

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y)
    if (p) return { node: p.offsetNode, offset: p.offset }
  }
  if (d.caretRangeFromPoint) {
    const r = d.caretRangeFromPoint(x, y)
    if (r) return { node: r.startContainer, offset: r.startOffset }
  }
  return null
}

/** The editor-side half: the document position for a read-view anchor. */
export function positionForAnchor(doc: PMNode, block: number, offset: number): number | null {
  if (block < 0 || block >= doc.childCount) return null
  let start = 0
  for (let i = 0; i < block; i++) start += doc.child(i).nodeSize
  const node = doc.child(block)
  let remaining = offset
  let found: number | null = null
  let lastText: number | null = null
  node.descendants((n, p) => {
    if (found !== null) return false
    if (n.isText && n.text) {
      const at = start + 1 + p
      const count = visible(n.text)
      if (remaining < count) {
        // Just before the next visible character: the one the person clicked
        // in front of, never inside the whitespace before it.
        let seen = 0
        for (let i = 0; i < n.text.length; i++) {
          if (!/\S/.test(n.text[i])) continue
          if (seen === remaining) { found = at + i; break }
          seen++
        }
        return false
      }
      remaining -= count
      lastText = at + n.text.length
    }
    return true
  })
  if (found !== null) return found
  if (lastText !== null) return lastText
  // A block with no text (an image, a divider): just inside it, or after it.
  return node.isTextblock ? start + 1 : start + node.nodeSize
}

/** The nearest ancestor that scrolls vertically, or the page. */
export function scrollParent(el: HTMLElement | null): HTMLElement {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return document.scrollingElement as HTMLElement
}

function visible(text: string): number {
  return text.replace(/\s+/g, '').length
}
