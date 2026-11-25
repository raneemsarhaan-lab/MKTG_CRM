import { prisma } from '@/lib/prisma'

/**
 * Where the app opens for a member (owner's request, 25 Nov 2026): the Space they own — the first by the
 * sidebar's order if they own several — else the Overview. Server-only.
 */
export async function landingFor(member: { id: string }): Promise<string> {
  const space = await prisma.teamSpace.findFirst({
    where: { archived_at: null, settings: { path: ['owner_id'], equals: member.id } },
    orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    select: { key: true },
  }).catch(() => null)
  return space ? `/spaces/${space.key}` : '/overview'
}
