'use client'

/**
 * The Sheets dialogs (contracts/ui.md §5): Move or Copy, Unhide, the Delete
 * and Protect confirmations, and Resize row or column. Modal, labelled by
 * their title, Esc cancels, Tab stays inside, and focus goes back to where it
 * was when they close. Full screen on phones (CSS).
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { focusBack, opener } from './a11y'

export function Modal({ title, children, onCancel, attr, body, width, className, attrs }: {
  title: string
  /** A wider dialog than the default, in px (still full width on phones). */
  width?: number
  children: ReactNode
  onCancel(): void
  attr?: string
  body?: string
  /** More classes on the dialog box. */
  className?: string
  /** Data attributes with values (`data-values-dialog="stage"`). */
  attrs?: Record<string, string>
}) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Opened from a menu, the menu is gone by now: focus goes back to its button, or to the grid.
    const back = opener()
    requestAnimationFrame(() => {
      const box = ref.current
      const el = box?.querySelector<HTMLElement>('[data-autofocus]')
        ?? box?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [role="listbox"][tabindex="0"], [tabindex="0"]')
        ?? box?.querySelector<HTMLElement>('button.is-go:not(:disabled), button:not(:disabled)')
      el?.focus()
    })
    return () => focusBack(back)
  }, [])
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); return }
    if (e.key !== 'Tab') return
    const list = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])].filter(x => x.tabIndex >= 0 && !x.closest('[hidden]'))
    if (!list.length) return
    const first = list[0], last = list[list.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
  return (
    <div className="fx-sh-scrim" onPointerDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={body ? `${id}-b` : undefined}
           className={`fx-sh-dialog${className ? ` ${className}` : ''}`} onKeyDown={onKeyDown} style={width ? { width: `min(${width}px, 100%)` } : undefined} {...(attr ? { [attr]: '' } : {})} {...(attrs ?? {})}>
        <h2 id={`${id}-t`}>{title}</h2>
        {body && <p id={`${id}-b`}>{body}</p>}
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog({ title, body, ok, cancel, danger, onOk, onCancel, attr }: {
  title: string; body: string; ok: string; cancel: string; danger?: boolean
  onOk(): void; onCancel(): void; attr?: string
}) {
  return (
    <Modal title={title} body={body} onCancel={onCancel} attr={attr}>
      <div className="fx-sh-dialog-row">
        {/* A destructive confirm opens on Cancel, so a reflexive Enter keeps the data. */}
        <button type="button" data-autofocus={danger ? '' : undefined} onClick={onCancel}>{cancel}</button>
        <button type="button" className={danger ? 'is-danger' : 'is-go'} data-autofocus={danger ? undefined : ''} data-ok="" onClick={onOk}>{ok}</button>
      </div>
    </Modal>
  )
}

/** Resize row… / Resize column… (FR-044): a size in px, or back to the default. */
export function ResizeDialog({ kind, value, onOk, onCancel }: {
  kind: 'row' | 'col'; value: number
  onOk(v: number | null): void; onCancel(): void
}) {
  const t = useTranslations('sheets')
  const [v, setV] = useState(String(value))
  const [min, max] = kind === 'row' ? [21, 400] : [40, 600]
  const n = Number(v)
  const ok = Number.isFinite(n) && n >= min && n <= max
  return (
    <Modal title={kind === 'row' ? t('resize.rowTitle') : t('resize.colTitle')} onCancel={onCancel} attr="data-resize-dialog">
      <label className="fx-sh-field">
        <span>{kind === 'row' ? t('resize.height', { min, max }) : t('resize.width', { min, max })}</span>
        <input type="number" inputMode="numeric" min={min} max={max} value={v} data-autofocus="" name="size" autoComplete="off"
               onChange={e => setV(e.target.value)}
               onKeyDown={e => { if (e.key === 'Enter' && ok) { e.preventDefault(); onOk(Math.round(n)) } }} />
      </label>
      <div className="fx-sh-dialog-row">
        <button type="button" className="is-start" onClick={() => onOk(null)}>{t('resize.reset')}</button>
        <button type="button" onClick={onCancel}>{t('resize.cancel')}</button>
        <button type="button" className="is-go" disabled={!ok} onClick={() => onOk(Math.round(n))}>{t('ux.ok.resize')}</button>
      </div>
    </Modal>
  )
}

/** A keyboard list box: ↑/↓, Home and End choose, Enter confirms (double-click too). */
export function ListBox({ label, options, value, onChange, onEnter, attr, className }: {
  label: string
  options: { id: string; label: ReactNode; className?: string; dir?: string; data?: Record<string, string> }[]
  value: string
  onChange(id: string): void
  onEnter?(): void
  attr?: string
  /** More classes on the list. */
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const uid = useId()
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [value])
  function onKeyDown(e: React.KeyboardEvent) {
    const i = options.findIndex(o => o.id === value)
    const go = (n: number) => { e.preventDefault(); const o = options[Math.max(0, Math.min(options.length - 1, n))]; if (o) onChange(o.id) }
    if (e.key === 'ArrowDown') return go(i + 1)
    if (e.key === 'ArrowUp') return go(i - 1)
    if (e.key === 'Home') return go(0)
    if (e.key === 'End') return go(options.length - 1)
    if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter() }
  }
  const at = options.findIndex(o => o.id === value)
  return (
    <div ref={ref} role="listbox" aria-label={label} tabIndex={0} className={`fx-sh-listbox${className ? ` ${className}` : ''}`} onKeyDown={onKeyDown}
         aria-activedescendant={at >= 0 ? `${uid}-${at}` : undefined} {...(attr ? { [attr]: '' } : {})}>
      {options.map((o, i) => (
        <div key={o.id} id={`${uid}-${i}`} role="option" aria-selected={o.id === value} data-option={o.id} className={o.className} dir={o.dir} {...(o.data ?? {})}
             onClick={() => onChange(o.id)} onDoubleClick={onEnter}>{o.label}</div>
      ))}
    </div>
  )
}

/** Move or Copy (FR-058): to a folder, before a sheet, optionally as a copy. */
export function MoveCopyDialog({ folders, folderId, sheetsOf, linked, count, onOk, onCancel }: {
  folders: { id: string; name: string }[]
  folderId: string
  /** The visible sheets of a folder, for "Before sheet". Null while loading. */
  sheetsOf(folderId: string): { id: string; name: string }[] | null
  /** A linked sheet is among them: it can only be copied, into its own folder or any other. */
  linked: boolean
  count: number
  onOk(folderId: string, beforeId: string | null, copy: boolean): void
  onCancel(): void
}) {
  const t = useTranslations('sheets')
  const [to, setTo] = useState(folderId)
  const list = sheetsOf(to)
  const END = '__end'
  const [before, setBefore] = useState(END)
  const [copy, setCopy] = useState(linked)
  useEffect(() => { setBefore(END) }, [to])
  const done = () => onOk(to, before === END ? null : before, copy)
  return (
    <Modal title={t('moveCopy.title')} onCancel={onCancel} attr="data-move-copy" body={linked ? t('moveCopy.linkedNote') : undefined}>
      <label className="fx-sh-field">
        <span>{t('moveCopy.toFolder')}</span>
        <select value={to} onChange={e => setTo(e.target.value)} data-move-folder="">
          {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <div className="fx-sh-field">
        <span id="fx-sh-before">{t('moveCopy.before')}</span>
        <ListBox label={t('moveCopy.before')} value={before} onChange={setBefore} onEnter={done} attr="data-move-before"
                 options={[...(list ?? []).map(s => ({ id: s.id, label: s.name })), { id: END, label: t('moveCopy.toEnd') }]} />
      </div>
      <label className="fx-sh-check">
        <input type="checkbox" checked={copy} disabled={linked} onChange={e => setCopy(e.target.checked)} data-move-copy-box="" />
        <span>{t('moveCopy.copy')}</span>
      </label>
      <div className="fx-sh-dialog-row">
        <button type="button" onClick={onCancel}>{t('moveCopy.cancel')}</button>
        <button type="button" className="is-go" data-ok="" disabled={!list || (!copy && to === folderId && count === 0)} onClick={done}>{copy ? t('ux.ok.copy') : t('ux.ok.move')}</button>
      </div>
    </Modal>
  )
}

/** Unhide… (FR-059c): one hidden sheet at a time, as in Excel. */
export function UnhideDialog({ hidden, onOk, onCancel }: {
  hidden: { id: string; name: string }[]
  onOk(id: string): void
  onCancel(): void
}) {
  const t = useTranslations('sheets')
  const [pick, setPick] = useState(hidden[0]?.id ?? '')
  return (
    <Modal title={t('unhide.title')} onCancel={onCancel} attr="data-unhide">
      <div className="fx-sh-field">
        <span>{t('unhide.prompt')}</span>
        <ListBox label={t('unhide.prompt')} value={pick} onChange={setPick} onEnter={() => pick && onOk(pick)}
                 options={hidden.map(h => ({ id: h.id, label: h.name }))} />
      </div>
      <div className="fx-sh-dialog-row">
        <button type="button" onClick={onCancel}>{t('unhide.cancel')}</button>
        <button type="button" className="is-go" data-ok="" disabled={!pick} onClick={() => onOk(pick)}>{t('ux.ok.unhide')}</button>
      </div>
    </Modal>
  )
}
