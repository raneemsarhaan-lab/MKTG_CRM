'use client'

/**
 * QA 26 Nov 2026 (QF-05, QF-06): one look for a task type everywhere a sheet shows it — the type's own
 * colour and icon from Settings › Task types, and its Arabic name in Arabic. Cards already drew types
 * this way; sheets used a fixed colour list and the English label.
 */
import { useLocale } from 'next-intl'
import { useCardFields } from '@/components/fields/CardFields'
import { TypeIcon } from '@/components/types/TypeIcon'
import { contentTypeColor } from '@/lib/tokens'
import type { ContentType } from '@/types/index'

export interface TypeLook { color: string; icon: string | null; name: string }

/** The colour, icon and shown name of a type by its label; unknown labels fall back to the old colour. */
export function useTypeLook(types?: Pick<ContentType, 'label' | 'color' | 'icon' | 'name_ar'>[] | null): (label: string) => TypeLook {
  const ctx = useCardFields()
  const locale = useLocale()
  const list = types ?? ctx?.types ?? []
  return (label: string) => {
    const t = list.find(x => x.label === label)
    return {
      color: t?.color ?? contentTypeColor(label),
      icon: t?.icon ?? null,
      name: locale.startsWith('ar') && t?.name_ar ? t.name_ar : label,
    }
  }
}

/** A type as a soft pill: icon, then the name (a sheet's own word for it wins when given). */
export function TypePill({ label, word, look, highlight }: { label: string; word?: string | null; look: (label: string) => TypeLook; highlight?: (s: string) => React.ReactNode }) {
  const l = look(label)
  const text = word && word !== label ? word : l.name
  return (
    <span className="fx-content-type is-soft" data-type-pill={label} style={{ ['--type-c' as string]: l.color }}>
      <TypeIcon icon={l.icon} color={l.color} size={11} />
      <span className="fx-sheet-ellipsis">{highlight ? highlight(text) : text}</span>
    </span>
  )
}
