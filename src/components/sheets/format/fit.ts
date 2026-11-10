/**
 * Row autofit (spec 015 US1 scenario 4): how tall a cell's text needs its row
 * to be, from its font, size and wrap, measured with a canvas the browser
 * keeps (no layout). Rounded to whole pixels; at least the default 24 px.
 */
import type { CellStyle } from '@/types/index'
import { FONTS } from '@/lib/sheet-format'

let ctx: CanvasRenderingContext2D | null = null
const PAD_X = 16, PAD_Y = 10

export function fitHeight(text: string, st: CellStyle, colWidth: number): number {
  const px = st.size ? st.size * 4 / 3 : 13
  const line = Math.ceil(px * 1.45)
  if (!st.wrap) return line + PAD_Y
  if (typeof document === 'undefined') return line + PAD_Y
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return line + PAD_Y
  ctx.font = `${st.i ? 'italic ' : ''}${st.b ? 700 : 400} ${px}px ${(FONTS.find(f => f.name === st.font) ?? FONTS[0]).stack}`
  const room = Math.max(20, colWidth - PAD_X - (st.indent ?? 0) * 12)
  let lines = 0
  for (const para of text.split('\n')) {
    let width = 0, n = 1
    for (const word of para.split(/(\s+)/)) {
      const w = ctx.measureText(word).width
      if (width + w > room && width > 0) { n++; width = /^\s+$/.test(word) ? 0 : w }
      else width += w
      while (width > room) { n++; width -= room }
    }
    lines += n
  }
  return Math.max(1, lines) * line + PAD_Y
}
