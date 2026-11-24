import { notFound, redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { loadBoardData } from '@/lib/board-data'
import { BrandPage, type BrandFolderSlug } from '@/components/views/BrandPage'

const FOLDERS: BrandFolderSlug[] = ['calendar', 'assets', 'sheet', 'library', 'settings']

/**
 * A brand's page (spec 021, restructured in spec 025): three sections —
 * Brand (`/brands/<id>`), Assets and Settings (admins only). The old Calendar
 * and Sheet folders are views of the Brand section now, so their addresses
 * lead there; the Library stays reachable by address.
 * `/brands/none` is the virtual "No brand" brand: tasks with no brand.
 */
export default async function BrandRoute({ params }: { params: Promise<{ brandId: string; folder?: string[] }> }) {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  const { brandId, folder } = await params
  const slug = folder?.[0]
  if ((folder?.length ?? 0) > 1 || (slug && !FOLDERS.includes(slug as BrandFolderSlug))) notFound()
  if (slug === 'calendar' || slug === 'sheet') redirect(`/brands/${brandId}?view=${slug}`)
  if (slug === 'settings' && (member.access !== 'admin' || brandId === 'none')) notFound()
  if (slug === 'assets' && brandId === 'none') notFound()
  const data = await loadBoardData(member)
  if (brandId !== 'none' && !data.brands.some(b => b.id === brandId)) notFound()
  return <BrandPage data={data} brandId={brandId === 'none' ? null : brandId} folder={(slug as BrandFolderSlug | undefined) ?? null} />
}
