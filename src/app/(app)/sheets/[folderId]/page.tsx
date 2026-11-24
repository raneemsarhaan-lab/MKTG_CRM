import { notFound, redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { folderHome } from '@/lib/sheet-home'

export const dynamic = 'force-dynamic'

/**
 * Spec 026 (§1): a sheet lives on its Space, brand or My tasks page. An old Sheets address, and the
 * link in a sheet-comment notification, lead there, on the same tab and cell.
 */
export default async function FolderPage({ params, searchParams }: {
  params: Promise<{ folderId: string }>
  searchParams: Promise<{ sheet?: string; cell?: string }>
}) {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  const { folderId } = await params
  const { sheet, cell } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(folderId)) notFound()
  const home = await folderHome(folderId)
  if (!home) notFound()
  const q = new URLSearchParams()
  if (sheet) q.set('tab', sheet)
  if (cell && cell.length < 200) q.set('cell', cell)
  redirect(q.size ? `${home}&${q.toString()}` : home)
}
