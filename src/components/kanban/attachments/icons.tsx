/**
 * The handful of line icons the Attachments section uses. Its own copy rather
 * than TaskModal's `Icon`, which lives inside TaskModal and would make this
 * module import its own host. `currentColor`, so CSS decides the colour.
 */
export type AttIconName =
  | 'file' | 'download' | 'trash' | 'pencil' | 'dots' | 'chevron' | 'close'
  | 'plus' | 'left' | 'right' | 'clip' | 'external'

const PATHS: Record<AttIconName, React.ReactNode> = {
  file:     <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  trash:    <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></>,
  pencil:   <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  dots:     <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  chevron:  <path d="m6 9 6 6 6-6" />,
  close:    <path d="M18 6 6 18M6 6l12 12" />,
  plus:     <path d="M12 5v14M5 12h14" />,
  left:     <path d="m15 18-6-6 6-6" />,
  right:    <path d="m9 18 6-6-6-6" />,
  clip:     <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" />,
  external: <><path d="M14 4h6v6" /><path d="M10 14 20 4" /><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" /></>,
}

export function AttIcon({ name, size = 16, width = 2.1, style }: {
  name: AttIconName; size?: number; width?: number; style?: React.CSSProperties
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      {PATHS[name]}
    </svg>
  )
}
