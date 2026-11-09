'use client'

/**
 * The workbook's tab bar, as in Excel (spec 013 US5–US7, contracts/ui.md §5):
 * scroll arrows when the tabs overflow, "+", the all-sheets list, then the
 * tabs. A tab opens on click, renames on double-click or F2, reorders by drag
 * (Ctrl or Option+drag copies), and opens its menu on right-click, the ▾,
 * Shift+F10 or the menu key. The workbook owns the state and the menus; this
 * file owns the gestures.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { SheetSummary } from '@/types/index'

export interface TabBarProps {
  sheets: SheetSummary[]
  openId: string
  grouped: Set<string>
  renaming: string | null
  label: string
  nameOf(s: SheetSummary): string
  onOpen(id: string, how: { ctrl: boolean; shift: boolean }): void
  onNew(): void
  onAll(anchor: HTMLElement): void
  onMenu(id: string, at: { x: number; y: number }, anchor: HTMLElement): void
  onRenameStart(id: string): void
  /** The new name, or null when the rename was cancelled. Returns an error to show, or null. */
  onRename(id: string, name: string | null): string | null
  onDrop(id: string, beforeId: string | null, copy: boolean): void
}

export function TabBar(p: TabBarProps) {
  const t = useTranslations('sheets')
  const listRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)
  const [drag, setDrag] = useState<{ id: string; before: string | null; copy: boolean } | null>(null)
  const [focusId, setFocusId] = useState(p.openId)
  useEffect(() => { setFocusId(p.openId) }, [p.openId])

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const read = () => setOverflow(el.scrollWidth > el.clientWidth + 1)
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [p.sheets.length])

  // The open tab stays in view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-sheet-tab="${CSS.escape(p.openId)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [p.openId])

  const tabEl = (id: string) => listRef.current?.querySelector<HTMLElement>(`[data-sheet-tab="${CSS.escape(id)}"]`)
  const scrollBy = (dir: 1 | -1) => {
    const el = listRef.current
    if (!el) return
    const rtl = getComputedStyle(el).direction === 'rtl'
    el.scrollBy({ left: 160 * dir * (rtl ? -1 : 1), behavior: 'smooth' })
  }

  function onTabKey(e: React.KeyboardEvent, s: SheetSummary, i: number) {
    if (p.renaming === s.id) return
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const move = (n: number) => {
      e.preventDefault()
      const next = p.sheets[Math.max(0, Math.min(p.sheets.length - 1, n))]
      if (next) { setFocusId(next.id); tabEl(next.id)?.focus() }
    }
    if (e.key === 'ArrowRight') return move(i + (rtl ? -1 : 1))
    if (e.key === 'ArrowLeft') return move(i + (rtl ? 1 : -1))
    if (e.key === 'Home') return move(0)
    if (e.key === 'End') return move(p.sheets.length - 1)
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onOpen(s.id, { ctrl: false, shift: false }); return }
    if (e.key === 'F2') { e.preventDefault(); p.onRenameStart(s.id); return }
    if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      e.preventDefault()
      const b = e.currentTarget.getBoundingClientRect()
      p.onMenu(s.id, { x: b.left, y: b.top - 4 }, e.currentTarget as HTMLElement)
    }
  }

  function dragOver(e: React.DragEvent, s: SheetSummary) {
    if (!drag) return
    e.preventDefault()
    const b = e.currentTarget.getBoundingClientRect()
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const firstHalf = rtl ? e.clientX > b.left + b.width / 2 : e.clientX < b.left + b.width / 2
    const i = p.sheets.findIndex(x => x.id === s.id)
    const before = firstHalf ? s.id : p.sheets[i + 1]?.id ?? null
    const copy = e.ctrlKey || e.altKey || e.metaKey
    e.dataTransfer.dropEffect = copy ? 'copy' : 'move'
    if (drag.before !== before || drag.copy !== copy) setDrag({ ...drag, before, copy })
  }
  function drop(e: React.DragEvent) {
    if (!drag) return
    e.preventDefault()
    const { id, before } = drag
    const copy = drag.copy || e.ctrlKey || e.altKey || e.metaKey
    setDrag(null)
    const i = p.sheets.findIndex(x => x.id === id)
    // Dropping a tab where it already is does nothing (unless it's a copy).
    if (!copy && (before === id || before === p.sheets[i + 1]?.id || (before === null && i === p.sheets.length - 1))) return
    p.onDrop(id, before, copy)
  }

  return (
    <div className="fx-sh-tabs" data-sheet-tabs="">
      <div className="fx-sh-tabs-fixed">
        {overflow && (
          <>
            <button type="button" className="is-arrow" data-tabs-scroll="start" aria-label={t('tabs.scrollStart')} onClick={() => scrollBy(-1)}>‹</button>
            <button type="button" className="is-arrow" data-tabs-scroll="end" aria-label={t('tabs.scrollEnd')} onClick={() => scrollBy(1)}>›</button>
          </>
        )}
        <button type="button" data-new-sheet="" aria-label={t('tabs.new')} title={t('tabs.new')} onClick={p.onNew}>+</button>
        <button type="button" data-all-sheets="" aria-label={t('tabs.all')} title={t('tabs.all')} aria-haspopup="menu"
                onClick={e => p.onAll(e.currentTarget)}>≡</button>
      </div>
      <div ref={listRef} role="tablist" aria-label={p.label} className="fx-sh-tablist"
           onDragOver={e => { if (drag) { e.preventDefault(); if (e.target === e.currentTarget && drag.before !== null) setDrag({ ...drag, before: null }) } }}
           onDrop={drop}>
        {p.sheets.map((s, i) => {
          const open = s.id === p.openId
          const linked = s.kind !== 'blank'
          if (p.renaming === s.id) return (
            <span key={s.id} className="fx-sh-tabslot">
              <span role="tab" aria-selected={open} id={`sheet-tab-${s.id}`} data-sheet-tab={s.id} className="fx-sh-tab is-renaming">
                <RenameInput initial={p.nameOf(s)} label={t('tabs.rename')} onDone={v => p.onRename(s.id, v)} />
              </span>
            </span>
          )
          return (
            <span key={s.id} className="fx-sh-tabslot">
              {drag && drag.before === s.id && drag.id !== s.id && <span className="fx-sh-drop" data-tab-drop="" aria-hidden="true" />}
              <button
                type="button"
                role="tab"
                id={`sheet-tab-${s.id}`}
                aria-selected={open}
                aria-controls="fx-sh-panel"
                tabIndex={s.id === focusId ? 0 : -1}
                data-sheet-tab={s.id}
                className={`fx-sh-tab${p.grouped.has(s.id) && p.grouped.size > 1 ? ' is-grouped' : ''}${drag?.id === s.id ? ' is-dragging' : ''}`}
                draggable
                onClick={e => p.onOpen(s.id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
                onDoubleClick={() => { if (!linked) p.onRenameStart(s.id) }}
                onKeyDown={e => onTabKey(e, s, i)}
                onFocus={() => setFocusId(s.id)}
                onContextMenu={e => { e.preventDefault(); p.onMenu(s.id, { x: e.clientX, y: e.clientY }, e.currentTarget) }}
                onDragStart={e => { setDrag({ id: s.id, before: null, copy: false }); e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', s.id) }}
                onDragOver={e => dragOver(e, s)}
                onDrop={drop}
                onDragEnd={() => setDrag(null)}
              >
                <span className="fx-sh-tabname">{p.nameOf(s)}</span>
                {linked && <span className="fx-sh-tabicon" title={t('sheet.linkedTitle')} aria-label={t('sheet.linkedTitle')}>🔗</span>}
                {s.protectedBy && <span className="fx-sh-tabicon" title={t('sheet.protected')} aria-label={t('sheet.protected')}>🔒</span>}
                <span className="fx-sh-caret" aria-hidden="true"
                      onClick={e => { e.stopPropagation(); const b = e.currentTarget.getBoundingClientRect(); p.onMenu(s.id, { x: b.left, y: b.top - 4 }, e.currentTarget.parentElement as HTMLElement) }}>▾</span>
                {s.color && <span className="fx-sh-stripe" style={{ background: `var(--sh-${s.color})` }} aria-hidden="true" />}
              </button>
            </span>
          )
        })}
        {drag && drag.before === null && <span className="fx-sh-drop" data-tab-drop="" aria-hidden="true" />}
      </div>
    </div>
  )
}

/** The inline rename (FR-055): Enter saves, Esc cancels, a bad name says why and stays open. */
function RenameInput({ initial, label, onDone }: { initial: string; label: string; onDone(v: string | null): string | null }) {
  const [v, setV] = useState(initial)
  const [err, setErr] = useState<string | null>(null)
  const done = useRef(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  const finish = (val: string | null) => {
    if (done.current) return
    const e = onDone(val)
    if (e) { setErr(e); requestAnimationFrame(() => ref.current?.focus()); return }
    done.current = true
  }
  return (
    <span className="fx-sh-rename">
      <input
        ref={ref}
        value={v}
        aria-label={label}
        aria-invalid={!!err || undefined}
        aria-describedby={err ? 'fx-sh-rename-err' : undefined}
        data-tab-rename=""
        maxLength={60}
        onChange={e => { setV(e.target.value); setErr(null) }}
        onClick={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Enter') { e.preventDefault(); finish(v) }
          else if (e.key === 'Escape') { e.preventDefault(); done.current = true; onDone(null) }
        }}
        onBlur={() => { if (!done.current) { const e = onDone(v); if (e) { done.current = true; onDone(null) } else done.current = true } }}
      />
      {err && <span className="fx-sh-rename-err" id="fx-sh-rename-err" role="alert">{err}</span>}
    </span>
  )
}
