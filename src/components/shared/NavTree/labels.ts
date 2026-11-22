/**
 * A Space's shown name. The four seeded Spaces are translated while they keep
 * their seeded English name; a Space an admin renamed, or created, shows the
 * name it was given.
 */
const SEEDED: Record<string, string> = { content: 'Content', design: 'Design', video: 'Video', planning: 'Planning' }

export function spaceLabel(space: { key: string; name: string }, t: (k: string) => string): string {
  return SEEDED[space.key] === space.name ? t(`names.${space.key}`) : space.name
}
