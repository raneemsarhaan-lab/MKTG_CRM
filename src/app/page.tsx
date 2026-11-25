import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { landingFor } from '@/lib/landing'

export const dynamic = 'force-dynamic'

// Root / opens the member's own Space if they own one, else the Overview (middleware handles unauth → /login).
export default async function RootPage() {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  redirect(await landingFor(member))
}
