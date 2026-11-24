/**
 * A Space's shown name. The four seeded Spaces are translated while they keep
 * their seeded English name; a Space an admin renamed, or created, shows the
 * name it was given — its Arabic name (spec 024 §1) when reading in Arabic.
 */
const SEEDED: Record<string, string> = { content: 'Content', design: 'Design', video: 'Video', planning: 'Planning' }

type Labelled = { key: string; name: string; name_ar?: string | null; settings?: { name_ar?: string | null } | null }

export function spaceLabel(space: Labelled, t: (k: string) => string): string {
  if (SEEDED[space.key] === space.name) return t(`names.${space.key}`)
  const ar = space.name_ar ?? space.settings?.name_ar
  return ar && t('names.lang') === 'ar' ? ar : space.name
}
