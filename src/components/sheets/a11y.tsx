'use client'

/**
 * What the workbook's controls share for the keyboard and screen readers (UI
 * review against the Web Interface Guidelines):
 * - arrow keys over tabs, lists of options and rows of radios, one Tab stop
 *   each (the sheet tabs are the model);
 * - a toolbar's roving Tab stop;
 * - where focus goes back to when a dialog, panel or popover closes;
 * - a number box that can be emptied while typing;
 * - colours named in words, not by their hex code.
 */
import { useEffect, useState, type InputHTMLAttributes, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { STANDARD_COLORS, THEME_COLORS } from '@/lib/sheet-format'

const isRtl = (el: Element) => getComputedStyle(el).direction === 'rtl'
const usable = (x: HTMLElement) => !x.closest('[hidden]') && !(x as HTMLButtonElement).disabled

/**
 * Arrow keys, Home and End over the items in `e.currentTarget` that match
 * `selector`: focus moves (←/→ mirrored in Arabic) and, with `pick`, the item
 * is chosen too, as tabs and single-choice lists do. True when the key was used.
 */
export function roveKeys(e: React.KeyboardEvent<HTMLElement>, selector: string, opts: { axis?: 'x' | 'y' | 'both'; pick?: boolean; wrap?: boolean } = {}): boolean {
  const { axis = 'both', pick = true, wrap = false } = opts
  if (e.altKey || e.ctrlKey || e.metaKey) return false
  const list = [...e.currentTarget.querySelectorAll<HTMLElement>(selector)].filter(usable)
  const i = list.indexOf((e.target as HTMLElement).closest(selector) as HTMLElement)
  if (i < 0) return false
  const k = e.key
  let n: number | null = null
  if (k === 'Home') n = 0
  else if (k === 'End') n = list.length - 1
  else if (axis !== 'y' && (k === 'ArrowRight' || k === 'ArrowLeft')) n = i + ((k === 'ArrowRight') !== isRtl(e.currentTarget) ? 1 : -1)
  else if (axis !== 'x' && (k === 'ArrowDown' || k === 'ArrowUp')) n = i + (k === 'ArrowDown' ? 1 : -1)
  if (n === null) return false
  n = wrap ? (n + list.length) % list.length : Math.max(0, Math.min(list.length - 1, n))
  e.preventDefault()
  e.stopPropagation()
  const next = list[n]
  next.focus()
  if (pick && next !== list[i]) next.click()
  return true
}

/** Tabs: ←/→ (mirrored), Home and End move and open the tab. */
export const tabKeys = (e: React.KeyboardEvent<HTMLElement>) => { roveKeys(e, '[role="tab"]', { axis: 'x', wrap: true }) }
/** A list of options whose choice follows focus: ↑/↓ (and ←/→ in a grid of them), Home, End. */
export const optionKeys = (e: React.KeyboardEvent<HTMLElement>, axis: 'y' | 'both' = 'y') => { roveKeys(e, '[role="option"], [role="radio"]', { axis }) }
/** The one Tab stop of a list: the chosen item, or the first when none is. */
export const stopOf = (i: number, chosen: number) => ((chosen < 0 ? i === 0 : i === chosen) ? 0 : -1)

/**
 * A toolbar's roving Tab stop: one Tab into the toolbar, ←/→ (mirrored),
 * Home and End between its controls, and Tab out. The last control used keeps
 * the stop. Text boxes in it keep their own arrow keys.
 */
export function useRovingToolbar(ref: RefObject<HTMLElement | null>, on: unknown = true) {
  useEffect(() => {
    const bar = ref.current
    if (!bar || !on) return
    const ITEMS = 'button, input, select'
    let cur: HTMLElement | null = null
    const items = () => [...bar.querySelectorAll<HTMLElement>(ITEMS)].filter(usable)
    const sync = () => {
      const list = items()
      if (!cur || !list.includes(cur)) cur = list[0] ?? null
      for (const x of list) x.tabIndex = x === cur ? 0 : -1
    }
    const focus = (e: FocusEvent) => {
      const el = (e.target as HTMLElement).closest?.(ITEMS) as HTMLElement | null
      if (el && bar.contains(el) && el !== cur) { cur = el; sync() }
    }
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented || el.matches('input, select, textarea')) return
      const list = items(), i = list.indexOf(el)
      if (i < 0) return
      let n: number
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') n = i + ((e.key === 'ArrowRight') !== isRtl(bar) ? 1 : -1)
      else if (e.key === 'Home') n = 0
      else if (e.key === 'End') n = list.length - 1
      else return
      e.preventDefault()
      list[(n + list.length) % list.length]?.focus()
    }
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(bar, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'disabled'] })
    bar.addEventListener('focusin', focus)
    bar.addEventListener('keydown', key)
    return () => { mo.disconnect(); bar.removeEventListener('focusin', focus); bar.removeEventListener('keydown', key) }
  }, [ref, on])
}

// ─── focus going back ────────────────────────────────────────────────────────

/** The grid's active cell, where focus goes when what opened a window is gone. */
export const gridCell = () => document.querySelector<HTMLElement>('.fx-sh-panel .fx-sheet-td.is-active, .fx-sh-panel [role="gridcell"][tabindex="0"]')

/** A menu item that opens a window: the menu is gone by then, so it notes its button here. */
const opened = { el: null as HTMLElement | null, at: 0 }
export function noteOpener(el: HTMLElement | null | undefined) { opened.el = el ?? null; opened.at = Date.now() }

/** What a window opening now should hand focus back to. */
export function opener(): HTMLElement | null {
  const a = document.activeElement as HTMLElement | null
  if (a && a !== document.body) return a
  if (opened.el?.isConnected && Date.now() - opened.at < 2000) return opened.el
  return gridCell()
}

/** After a window closed: focus back to `back` (or the grid), unless it already went somewhere on purpose. */
export function focusBack(back: HTMLElement | null) {
  requestAnimationFrame(() => {
    const a = document.activeElement
    if (a && a !== document.body && a.isConnected) return
    ;(back?.isConnected ? back : gridCell())?.focus({ preventScroll: true })
  })
}

/** Remembers what had focus when a window opened, and gives it back when the window goes. */
export function useFocusReturn() {
  useEffect(() => {
    const back = opener()
    return () => focusBack(back)
  }, [])
}

// ─── a number box ────────────────────────────────────────────────────────────

/**
 * A whole number between `min` and `max` that can be emptied or half-typed:
 * each keystroke that reads as a number in range is kept, anything else waits,
 * and leaving the box shows the kept number again.
 */
export function NumField({ value, min, max, onValue, onBlur, ...rest }: { value: number; min: number; max: number; onValue(n: number): void }
  & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'type'>) {
  const [text, setText] = useState<string | null>(null)
  return (
    <input type="number" inputMode="numeric" min={min} max={max} {...rest} value={text ?? String(value)}
           onChange={e => {
             const s = e.target.value, n = Number(s)
             setText(s)
             if (s.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onValue(Math.round(n))
           }}
           onBlur={e => { setText(null); onBlur?.(e) }} />
  )
}

// ─── colour names ────────────────────────────────────────────────────────────

const THEME_KEYS = ['white', 'black', 'grey', 'blueGrey', 'blue', 'orange', 'grey2', 'gold', 'blue2', 'green'] as const
const STD_KEYS = ['darkRed', 'red', 'orange', 'yellow', 'lightGreen', 'green', 'lightBlue', 'blue', 'darkBlue', 'purple'] as const
const HUES: [number, string][] = [[12, 'red'], [40, 'orange'], [66, 'yellow'], [95, 'lime'], [160, 'green'], [190, 'teal'], [250, 'blue'], [285, 'purple'], [335, 'pink'], [360, 'red']]

/** A colour in plain words: its hue, and light or dark. */
export function colorWords(hex: string): { hue: string; shade: 'light' | 'dark' | null } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return { hue: 'grey', shade: null }
  const v = parseInt(m[1], 16), r = (v >> 16) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  const shade = l > 0.72 ? 'light' : l < 0.3 ? 'dark' : null
  if (s < 0.15 || d < 0.06) return l > 0.94 ? { hue: 'white', shade: null } : l < 0.1 ? { hue: 'black', shade: null } : { hue: 'grey', shade }
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  const hue = HUES.find(([to]) => h < to)?.[1] ?? 'red'
  if ((hue === 'orange' || hue === 'red') && l < 0.36 && h > 10) return { hue: 'brown', shade: null }
  return { hue, shade }
}

/** A swatch's name: the palette's own name when it is one, otherwise its colour in words. */
export function useColorName() {
  const t = useTranslations('sheets.format.color')
  const u = useTranslations('sheets.ux')
  return (hex: string) => {
    const h = hex.toUpperCase()
    const si = STANDARD_COLORS.findIndex(c => c.toUpperCase() === h)
    if (si >= 0 && STD_KEYS[si]) return t(`stdNames.${STD_KEYS[si]}`)
    const ti = THEME_COLORS.findIndex(c => c.toUpperCase() === h)
    if (ti >= 0 && THEME_KEYS[ti]) return t(`themeNames.${THEME_KEYS[ti]}`)
    const w = colorWords(h), name = u(`hue.${w.hue}`)
    return w.shade ? u(`shade.${w.shade}`, { name }) : name
  }
}
