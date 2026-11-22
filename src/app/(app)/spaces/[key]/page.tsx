import { notFound, redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { loadBoardData } from '@/lib/board-data'
import { SpacePage } from '@/components/views/SpacePage'

/**
 * A team Space (spec 021 US1): one team's work from every brand.
 * A Space the member isn't in (and isn't an admin for) is a 404, so it can't
 * be guessed at (contracts/routes.md).
 */
export default async function SpaceRoute({ params }: { params: Promise<{ key: string }> }) {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  const { key } = await params
  const data = await loadBoardData(member)
  const space = data.spaces.find(s => s.key === key)
  if (!space) notFound()
  const isMember = data.spaceMembers.some(r => r.space_id === space.id && r.member_id === member.id)
  if (!isMember && member.access !== 'admin') notFound()
  return <SpacePage data={data} spaceId={space.id} />
}
