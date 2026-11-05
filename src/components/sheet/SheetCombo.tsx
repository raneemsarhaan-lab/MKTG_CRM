'use client'

/**
 * A type-ahead list for a cell (spec 010, design/sheet-columns.html): type to
 * filter, ↑↓ to move, Enter to pick, Esc to close. When nothing matches what
 * was typed it offers to add it: a type (admins) or a Choice option (anyone).
 *
 * Letters typed on the cell before this mounts arrive through `typed`, so a
 * fast "po" stays "po" (the same care GridCore takes for drafts).
 */
import { useLayoutEffect, useRef, useState, type ReactNode, type MutableRefObject } from 'react'
import { normName } from '@/lib/sheet-columns'

export interface ComboItem { key: string; text: string; render(hl: (s: string) => ReactNode): ReactNode }

export function SheetCombo({ label, items, current, typed, placeholder, noMatch, currentLabel, clearLabel, add, onPick, onAdd }: {
  label: string
  items: ComboItem[]
  current?: string | null
  /** Characters typed on the cell so far; read once, when the box mounts. */
  typed?: MutableRefObject<string>
  placeholder: string
  noMatch: string
  currentLabel: string
  clearLabel?: string
  add?: { label(text: string): string; hint: string; allowed: boolean; deniedHint: string }
  onPick(key: string): void
  onAdd?(text: string): void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)

  useLayoutEffect(() => {
    const first = typed?.current ?? ''
    if (typed) typed.current = ''
    setQ(first)
    const el = input.current
    if (el) { el.value = first; el.focus(); el.setSelectionRange(first.length, first.length) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nq = normName(q).toLowerCase()
  const hits = items
    .filter(it => !nq || it.text.toLowerCase().includes(nq))
    .sort((a, b) => Number(b.text.toLowerCase().startsWith(nq)) - Number(a.text.toLowerCase().startsWith(nq)))
  const exact = items.some(it => normName(it.text).toLowerCase() === nq)
  type Row = { kind: 'pick'; item: ComboItem } | { kind: 'add'; text: string } | { kind: 'clear' }
  const rows: Row[] = [
    ...hits.map(item => ({ kind: 'pick' as const, item })),
    ...(nq && !exact && add ? [{ kind: 'add' as const, text: normName(q) }] : []),
    ...(!nq && clearLabel ? [{ kind: 'clear' as const }] : []),
  ]
  const at = Math.min(sel, Math.max(0, rows.length - 1))

  const hl = (s: string): ReactNode => {
    if (!nq) return s
    const i = s.toLowerCase().indexOf(nq)
    return i < 0 ? s : <>{s.slice(0, i)}<mark>{s.slice(i, i + nq.length)}</mark>{s.slice(i + nq.length)}</>
  }
  function choose(r: Row | undefined) {
    if (!r) return
    if (r.kind === 'add') { if (add?.allowed) onAdd?.(r.text); return }
    onPick(r.kind === 'clear' ? '' : r.item.key)
  }

  return (
    <div className="fx-sheet-combo" data-sheet-combo="">
      <input
        ref={input}
        className="fx-sheet-pop-input"
        role="combobox"
        aria-expanded="true"
        aria-controls="fx-sheet-combo-list"
        aria-autocomplete="list"
        aria-activedescendant={rows.length ? `fx-combo-${at}` : undefined}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { setQ(e.target.value); setSel(0) }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((at + 1) % Math.max(1, rows.length)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((at - 1 + rows.length) % Math.max(1, rows.length)) }
          else if (e.key === 'Enter') { e.preventDefault(); choose(rows[at]) }
        }}
      />
      <div className="fx-sheet-combo-list" id="fx-sheet-combo-list" role="listbox" aria-label={label}>
        {rows.length === 0 && <div className="fx-sheet-combo-empty">{noMatch}</div>}
        {rows.map((r, i) => (
          r.kind === 'add'
            ? (
              <button key="add" type="button" role="option" id={`fx-combo-${i}`} aria-selected={i === at}
                      className="fx-sheet-combo-opt is-add" disabled={!add?.allowed} data-combo-add=""
                      onClick={() => choose(r)}>
                {add?.label(r.text)}<small>{add?.allowed ? add.hint : add?.deniedHint}</small>
              </button>
            )
            : r.kind === 'clear'
              ? <button key="clear" type="button" role="option" id={`fx-combo-${i}`} aria-selected={i === at} className="fx-sheet-combo-opt" data-combo-option="" onClick={() => choose(r)}>{clearLabel}</button>
              : (
                <button key={r.item.key} type="button" role="option" id={`fx-combo-${i}`} aria-selected={i === at}
                        className="fx-sheet-combo-opt" data-combo-option={r.item.key} onClick={() => choose(r)}>
                  {r.item.render(hl)}{r.item.key === current && <small>{currentLabel}</small>}
                </button>
              )
        ))}
      </div>
    </div>
  )
}
