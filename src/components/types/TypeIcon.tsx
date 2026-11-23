/**
 * A task type's icon (spec 023 R1): one of TYPE_ICONS, drawn by the app as a
 * line icon in the type's colour. Unknown names draw the document.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { ContentType } from '@/types/index'
import { isTypeIcon, typeName, type TypeIcon as IconName } from '@/lib/task-types'

const PATHS: Record<IconName, ReactNode> = {
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></>,
  images: <><rect x="7" y="3" width="14" height="14" rx="2" /><path d="M3 7v12a2 2 0 0 0 2 2h12" /><path d="m21 13-4-4-6 6" /></>,
  video: <><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m22 8-6 4 6 4z" /></>,
  reel: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 8h18M8 3l3 5M14 3l3 5" /><path d="m10 12 5 3-5 3z" /></>,
  story: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 6h4" /><circle cx="12" cy="14" r="3" /></>,
  quote: <><path d="M7 7H4v6h3l-1 4M17 7h-3v6h3l-1 4" /></>,
  megaphone: <><path d="m3 11 15-6v14L3 13z" /><path d="M7 13v5a2 2 0 0 0 4 0v-4" /></>,
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M8 16v-4M13 16V8M18 16v-7" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></>,
  pen: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  star: <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />,
  flag: <><path d="M4 22V4" /><path d="M4 4h12l-2 4 2 4H4" /></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v9H5v-9" /><path d="M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></>,
  briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z" />,
  bolt: <path d="M13 2 3 14h9l-1 8 10-12h-9z" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
}

export function TypeIcon({ icon, color, size = 14, style }: { icon?: string | null; color?: string | null; size?: number; style?: CSSProperties }) {
  const name: IconName = isTypeIcon(icon) ? icon : 'doc'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-type-icon={name} style={{ flex: 'none', ...style }}>
      {PATHS[name]}
    </svg>
  )
}

/** Icon and name together, as cards, the Type column and the panel show a type. */
export function TypeLabel({ type, label, locale, size = 13, style }: { type?: ContentType | null; label: string | null | undefined; locale: string; size?: number; style?: CSSProperties }) {
  if (!label) return null
  return (
    <span data-type-label={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, ...style }}>
      <TypeIcon icon={type?.icon} color={type?.color} size={size} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{type ? typeName(type, locale) : label}</span>
    </span>
  )
}
