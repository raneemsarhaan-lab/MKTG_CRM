'use server'

/** ☆ in the simple sheet header: add the page to the member's favourites, or take it off. */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { cleanFavourites, MAX_FAVOURITES } from '@/lib/favourites'
import type { Favourite } from '@/types/index'

export async function toggleFavourite(page: Favourite): Promise<{ success: true; on: boolean; favourites: Favourite[] } | { success: false; error: string }> {
  const m = await getSessionMember()
  if (!m) return { success: false, error: 'not_authenticated' }
  const [want] = cleanFavourites([page])
  if (!want) return { success: false, error: 'invalid' }
  const row = await prisma.member.findUnique({ where: { id: m.id }, select: { favourites: true } })
  const list = cleanFavourites(row?.favourites)
  const had = list.some(f => f.href === want.href)
  const next = had ? list.filter(f => f.href !== want.href) : [...list, want].slice(-MAX_FAVOURITES)
  await prisma.member.update({ where: { id: m.id }, data: { favourites: next as object[] } })
  revalidatePath('/', 'layout')
  return { success: true, on: !had, favourites: next }
}
