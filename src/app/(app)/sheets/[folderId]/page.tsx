import { notFound, redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { listFolders, listSheets } from '@/actions/sheets'
import { loadBoardData } from '@/lib/board-data'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { WorkbookPage } from '@/components/sheets/pages'

export const dynamic = 'force-dynamic'

/**
 * A folder, open as a workbook (spec 013 US5–US7). The Content and Video
 * folders' linked tab is the board's own sheet, from the same loader as the
 * Board page (R2), so the two always agree.
 */
export default async function FolderPage({ params, searchParams }: {
  params: Promise<{ folderId: string }>
  searchParams: Promise<{ sheet?: string }>
}) {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  const { folderId } = await params
  const { sheet } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(folderId)) notFound()

  const [folders, sheets] = await Promise.all([listFolders(), listSheets(folderId)])
  if (!folders.success || !sheets.success) notFound()
  const folder = folders.folders.find(f => f.id === folderId)
  if (!folder) notFound()

  const linkedKind = folder.kind === 'content' ? 'content' : folder.kind === 'video' ? 'sheet' : null
  const board = linkedKind ? await loadBoardData(member) : null
  const names = board
    ? Object.fromEntries(board.members.map(m => [m.id, m.name]))
    : Object.fromEntries((await prisma.member.findMany({ select: { id: true, name: true } })).map(m => [m.id, m.name]))

  return (
    <WorkbookPage
      folder={folder}
      folders={folders.folders}
      sheets={sheets.sheets}
      me={{ id: member.id, admin: member.access === 'admin' }}
      names={names}
      sheetId={sheet ?? null}
      linked={board && linkedKind ? <KanbanBoard {...board} surface="sheets" sheetsView={linkedKind} /> : undefined}
    />
  )
}
