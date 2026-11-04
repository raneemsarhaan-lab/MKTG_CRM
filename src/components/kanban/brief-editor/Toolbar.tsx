'use client'

import { useState } from 'react'
import { BRIEF_UI, COLORS, alpha } from '@/lib/tokens'

/** Line-icon set for the toolbar and its menus — matches the app's outlined SVG style. */
export type ToolIconName =
  | 'code' | 'link' | 'bulletList' | 'numberedList' | 'quote'
  | 'image' | 'divider' | 'toggle' | 'table' | 'toc' | 'youtube'
  | 'clear' | 'copy' | 'task' | 'subtask' | 'chevron' | 'undo' | 'redo'
  | 'text' | 'heading' | 'external'

export function ToolIcon({ name, size = 15 }: { name: ToolIconName; size?: number }) {
  const paths: Record<ToolIconName, React.ReactNode> = {
    code: <path d="M9 6 4 12l5 6M15 6l5 6-5 6" />,
    link: <><path d="M10.6 13.4a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7l-1.6 1.6" /><path d="M13.4 10.6a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 1 0 5.7 5.7l1.6-1.6" /></>,
    bulletList: <><circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none" /><path d="M9 6h11M9 12h11M9 18h11" /></>,
    numberedList: <>
      <text x="2.2" y="8"  fontSize="6.5" fontWeight={700} fill="currentColor" stroke="none">1</text>
      <text x="2.2" y="14" fontSize="6.5" fontWeight={700} fill="currentColor" stroke="none">2</text>
      <text x="2.2" y="20" fontSize="6.5" fontWeight={700} fill="currentColor" stroke="none">3</text>
      <path d="M9 6h11M9 12h11M9 18h11" />
    </>,
    quote: <path d="M6 9a2.4 2.4 0 0 0-2.4 2.4v1.2A2.4 2.4 0 0 0 6 15h.2L5 18M15.6 9a2.4 2.4 0 0 0-2.4 2.4v1.2a2.4 2.4 0 0 0 2.4 2.4h.2L14.4 18" />,
    image: <><rect x="3" y="4.5" width="18" height="15" rx="2.2" /><circle cx="8.5" cy="10" r="1.6" /><path d="m3.6 17.5 5-4.6 4 3.4 3-2.4 4.8 4" /></>,
    divider: <path d="M4 12h16" />,
    toggle: <path d="M9.5 6l6 6-6 6" />,
    table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 16h18M9 4v16M15 4v16" /></>,
    toc: <path d="M4 6h16M4 12h12M4 18h9" />,
    youtube: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10.5 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" /></>,
    clear: <><path d="M5 5h9M9.5 5v13" /><path d="M15.5 14.5l4.5 4.5M20 14.5l-4.5 4.5" /></>,
    copy: <><rect x="9" y="3" width="11" height="13" rx="2" /><path d="M6 8H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1" /></>,
    task: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12.5 2.5 2.5L16 9.5" /></>,
    subtask: <><path d="M6 4v9a3 3 0 0 0 3 3h6" /><circle cx="18" cy="16" r="2.6" /><path d="M18 6.4v3.6M16.2 8.2h3.6" /></>,
    chevron: <path d="M6 9.5l6 6 6-6" />,
    undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
    redo: <><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>,
    text: <path d="M5 6h14M12 6v13" />,
    heading: <path d="M5 5v14M15 5v14M5 12h10M18.5 19v-6l-2 1" />,
    external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         style={{ flexShrink: 0 }}>
      {paths[name]}
    </svg>
  )
}

/** A borderless toolbar action — the only chrome is a hover/active tint. */
export function ToolButton({ children, title, active, disabled, wide, chip, pressed, menu, expanded, onClick, tabIndex, buttonRef }: {
  children: React.ReactNode; title: string; active?: boolean; disabled?: boolean
  /** A labelled control (a dropdown trigger) rather than a bare icon. */
  wide?: boolean
  /** A dropdown trigger — sits on its own light chip even at rest, so it reads
   *  as a control rather than another icon in the row. */
  chip?: boolean
  /** Set for on/off formatting toggles, so assistive technology hears the state. */
  pressed?: boolean
  /** Opens a menu: announces it, and whether it is open. */
  menu?: boolean
  expanded?: boolean
  onClick: () => void
  tabIndex?: number
  buttonRef?: React.Ref<HTMLButtonElement>
}) {
  const [hover, setHover] = useState(false)
  const lit = !disabled && (active || hover)
  return (
    <button
      ref={buttonRef}
      type="button" title={title} aria-label={title} disabled={disabled}
      aria-pressed={pressed}
      aria-haspopup={menu ? 'menu' : undefined}
      aria-expanded={menu ? !!expanded : undefined}
      tabIndex={tabIndex}
      data-tool=""
      onMouseDown={e => e.preventDefault()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, whiteSpace: 'nowrap',
        padding: wide ? '0 12px' : '0 8px', minWidth: wide ? undefined : 34, flexShrink: 0,
        border: 'none', borderRadius: 9, cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 500,
        background: lit ? BRIEF_UI.blueActive : chip ? COLORS.panel : 'transparent',
        color: lit ? BRIEF_UI.blue : BRIEF_UI.ink, opacity: disabled ? 0.4 : 1,
        boxShadow: chip && !lit ? `0 1px 2px ${alpha(BRIEF_UI.ink, 0.05)}` : 'none',
        transition: 'background .1s',
      }}
    >
      {children}
    </button>
  )
}

/** A hairline between logical toolbar groups — never between two single buttons. */
export function Sep() {
  return <span aria-hidden="true" style={{ width: 1, height: 26, background: BRIEF_UI.line, margin: '0 4px', flexShrink: 0 }} />
}
