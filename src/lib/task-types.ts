/**
 * Task types (spec 023 US1, research R1). Pure: used by the server actions,
 * the views and the lab. Task types are the content types, with an Arabic
 * name, an icon, a colour and defaults for new tasks.
 */
import type { ContentType, Priority } from '@/types/index'

/** The icons a type can use: drawn by the app (src/components/types/TypeIcon.tsx), chosen by name. */
export const TYPE_ICONS = [
  'doc', 'image', 'images', 'video', 'reel', 'story', 'quote', 'megaphone', 'calendar', 'mail', 'chart', 'globe',
  'mic', 'pen', 'star', 'flag', 'gift', 'users', 'link', 'book', 'briefcase', 'heart', 'bolt', 'grid',
] as const
export type TypeIcon = typeof TYPE_ICONS[number]
export const isTypeIcon = (v: unknown): v is TypeIcon => typeof v === 'string' && (TYPE_ICONS as readonly string[]).includes(v)

/** The type palette: the same ten colours tags use (spec 023 R8). */
export const TYPE_COLORS = ['#3E7BEA', '#8F6FE8', '#1E9E8A', '#2F8F3F', '#C99A06', '#E8772E', '#D22040', '#D6409F', '#4A5061', '#6B7280'] as const
export const isTypeColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v)

/** A type's name in the reader's language (Arabic falls back to the English). */
export const typeName = (t: Pick<ContentType, 'label' | 'name_ar'> | null | undefined, locale: string) =>
  !t ? '' : locale.startsWith('ar') && t.name_ar ? t.name_ar : t.label

/** Starting icon and colour for the types that exist before spec 023 (once('task-types-v1')). */
export const STARTING_LOOKS: Record<string, { icon: TypeIcon; color: string; ar: string }> = {
  Article: { icon: 'doc', color: '#4A5061', ar: 'مقال' },
  Deck: { icon: 'grid', color: '#C99A06', ar: 'عرض تقديمي' },
  Design: { icon: 'image', color: '#8F6FE8', ar: 'تصميم' },
  Email: { icon: 'mail', color: '#E8772E', ar: 'بريد إلكتروني' },
  'Framework/Model': { icon: 'briefcase', color: '#2F8F3F', ar: 'إطار عمل / نموذج' },
  Other: { icon: 'flag', color: '#6B7280', ar: 'أخرى' },
  Post: { icon: 'image', color: '#3E7BEA', ar: 'منشور' },
  Reel: { icon: 'reel', color: '#1E9E8A', ar: 'ريل' },
  Report: { icon: 'chart', color: '#D22040', ar: 'تقرير' },
  Story: { icon: 'story', color: '#D6409F', ar: 'ستوري' },
  Video: { icon: 'video', color: '#E8772E', ar: 'فيديو' },
}


/** What a new task of this type starts with when the creator didn't choose. */
export function defaultsFor(t: ContentType | null | undefined): { priority: Priority | null; tagIds: string[]; templateId: string | null } {
  return { priority: (t?.default_priority as Priority | null) ?? null, tagIds: t?.default_tag_ids ?? [], templateId: t?.default_template_id ?? null }
}
