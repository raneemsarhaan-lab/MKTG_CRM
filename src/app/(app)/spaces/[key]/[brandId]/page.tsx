import { notFound, redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { loadBoardData } from '@/lib/board-data'
import { SpacePage } from '@/components/views/SpacePage'

/**
 * A Space › Brand folder (spec 025): one team's work for one brand. The same
 * page as the Space, narrowed to the brand; access is the Space's.
 */
export default async function SpaceBrandRoute({ params }: { params: Promise<{ key: string; brandId: string }> }) {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  const { key, brandId } = await params
  const data = await loadBoardData(member)
  const space = data.spaces.find(s => s.key === key)
  if (!space || !data.brands.some(b => b.id === brandId)) notFound()
  const isMember = data.spaceMembers.some(r => r.space_id === space.id && r.member_id === member.id)
  if (!isMember && member.access !== 'admin' && space.settings.visibility !== 'everyone') notFound()
  return <SpacePage data={data} spaceId={space.id} brandId={brandId} />
}
