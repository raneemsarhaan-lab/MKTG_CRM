import { notFound, redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { loadBoardData } from '@/lib/board-data'
import { prisma } from '@/lib/prisma'
import { BrandPage, type BrandFolderSlug } from '@/components/views/BrandPage'

const FOLDERS: BrandFolderSlug[] = ['calendar', 'assets', 'sheet', 'library']

/**
 * A brand and its four Folders (spec 021 US1/US2, contracts/routes.md).
 * `/brands/none` is the virtual "No brand" brand: tasks with no brand.
 */
export default async function BrandRoute({ params }: { params: Promise<{ brandId: string; folder?: string[] }> }) {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  const { brandId, folder } = await params
  const slug = folder?.[0]
  if ((folder?.length ?? 0) > 1 || (slug && !FOLDERS.includes(slug as BrandFolderSlug))) notFound()
  const data = await loadBoardData(member)
  if (brandId !== 'none' && !data.brands.some(b => b.id === brandId)) notFound()
  const assets = slug === 'assets' && brandId !== 'none'
    ? (await prisma.brandAsset.findMany({ where: { brand_id: brandId }, orderBy: { uploaded_at: 'asc' }, select: { id: true, filename: true, url: true } }))
    : []
  return <BrandPage data={data} brandId={brandId === 'none' ? null : brandId} folder={(slug as BrandFolderSlug | undefined) ?? null} assets={assets} />
}
