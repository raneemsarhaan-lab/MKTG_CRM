/**
 * The field system (owner's design of 25 Nov 2026). Pure: used by the server, the sheets, the task
 * panel and the cards.
 *
 *   - Standard: always on every task, in every Space; the system depends on them.
 *   - Custom: turned on per Space (built-in ones such as Priority, and library fields such as Caption).
 *     A value is never lost: off in a Space only hides it there.
 *   - Regular: a sheet-only column (`c:<id>`), a note on the row; the task never gets it.
 *
 * An admin can promote any custom field to Standard (workspace `standard_fields`), and demote it again.
 */
import type { FieldKind, TaskFieldDef } from '@/types/index'
import type { FieldRule } from '@/lib/space-settings'

export type FieldClass = 'standard' | 'custom' | 'regular'
/** The kinds a field is drawn with (its icon), beyond the library's own kinds. */
export type CatalogKind = FieldKind | 'stage' | 'brand' | 'type'

export interface BuiltInField { key: string; kind: CatalogKind; en: string; ar: string }

/** The minimum that connects tasks across Spaces. Never off. */
export const STANDARD_FIELDS: BuiltInField[] = [
  { key: 'title', kind: 'text', en: 'Title', ar: 'العنوان' },
  { key: 'brand', kind: 'brand', en: 'Brand', ar: 'البراند' },
  { key: 'type', kind: 'type', en: 'Type', ar: 'النوع' },
  { key: 'status', kind: 'stage', en: 'Status', ar: 'الحالة' },
  { key: 'owner', kind: 'person', en: 'Owner', ar: 'المالك' },
  { key: 'assignee', kind: 'person', en: 'Assignee', ar: 'المسؤول' },
  { key: 'publish', kind: 'date', en: 'Publishing date', ar: 'تاريخ النشر' },
  { key: 'due', kind: 'date', en: 'Due date', ar: 'تاريخ التسليم' },
  { key: 'media', kind: 'task', en: 'Link task', ar: 'ربط مهمة' },
]

/** Fields that used to be standard and are ready-made custom fields now. Stored on the task as before. */
export const BUILT_IN_CUSTOM: BuiltInField[] = [
  { key: 'priority', kind: 'choice', en: 'Priority', ar: 'الأولوية' },
  { key: 'tags', kind: 'multi', en: 'Tags', ar: 'الوسوم' },
  { key: 'start', kind: 'date', en: 'Start date', ar: 'تاريخ البدء' },
  { key: 'theme', kind: 'choice', en: 'Theme', ar: 'الثيم' },
  { key: 'pillar', kind: 'choice', en: 'Pillar', ar: 'المحور' },
  { key: 'doc', kind: 'link', en: 'Working Doc', ar: 'ملف العمل' },
  { key: 'design', kind: 'link', en: 'Design Link', ar: 'رابط التصميم' },
  { key: 'post', kind: 'link', en: 'LinkedIn Link', ar: 'رابط لينكدإن' },
  { key: 'published', kind: 'link', en: 'Published Link', ar: 'رابط المنشور' },
]

const STANDARD = new Set(STANDARD_FIELDS.map(f => f.key))
const BUILT_IN = new Map([...STANDARD_FIELDS, ...BUILT_IN_CUSTOM].map(f => [f.key, f]))
export const builtInField = (key: string) => BUILT_IN.get(key)
export const isBuiltInCustom = (key: string) => BUILT_IN_CUSTOM.some(f => f.key === key)
export const isLibraryKey = (key: string) => /^f:[0-9a-f-]{36}$/.test(key)
export const isRegularKey = (key: string) => key.startsWith('c:')

/** A sheet's own key for a field: a Space's sheet of rows calls the publishing date "date". */
export const toCanonical = (rowsSheet: boolean, key: string) => (rowsSheet && key === 'date' ? 'publish' : key)
export const toSheetKey = (rowsSheet: boolean, key: string) => (rowsSheet && key === 'publish' ? 'date' : key)

/** The key a Space's field rule is stored under: a library field's id, or the built-in key. */
export const ruleKeyOf = (key: string) => (isLibraryKey(key) ? key.slice(2) : key)

export function classOf(key: string, promoted: readonly string[]): FieldClass {
  if (isRegularKey(key)) return 'regular'
  if (STANDARD.has(key) || promoted.includes(key)) return 'standard'
  return 'custom'
}

/**
 * Whether a field is on in a Space. Standard (and promoted) fields always are. A custom field follows
 * the Space's choice; with none: a built-in field is on (as it always was), a library field is on unless
 * it was made in a Space (`default_on: false`), where only the Spaces that turn it on show it.
 */
export function fieldOnIn(
  key: string,
  fields: Record<string, FieldRule> | null | undefined,
  promoted: readonly string[],
  field?: Pick<TaskFieldDef, 'options'> | null,
): boolean {
  if (isRegularKey(key)) return true
  if (classOf(key, promoted) === 'standard') return true
  const rule = fields?.[ruleKeyOf(key)]
  if (rule && typeof rule.shown === 'boolean') return rule.shown
  if (field) return field.options?.default_on !== false
  return true
}

/** Whether a Space requires a custom field, and before which stage (null: the type's own stage). */
export function requiredIn(key: string, fields: Record<string, FieldRule> | null | undefined): { required: boolean; before: string | null } | null {
  const rule = fields?.[ruleKeyOf(key)]
  if (!rule || typeof rule.required !== 'boolean') return null
  return { required: rule.required, before: rule.before ?? null }
}

/** The kind a field is drawn with: its icon and its editor. */
export function kindOf(key: string, library?: Pick<TaskFieldDef, 'kind'> | null): CatalogKind | null {
  if (library) return library.kind
  return builtInField(key)?.kind ?? null
}

/** One glyph per kind, the same in every place a field is named (sheet headings, drawer, panel, Add column). */
export const KIND_GLYPH: Record<CatalogKind, string> = {
  text: 'Aa', number: '#', money: '¤', date: '▦', link: '↗', person: '◉', choice: '◆', multi: '◈',
  checkbox: '☑', rating: '★', task: '⇄', stage: '◐', brand: 'B', type: '▣',
}
