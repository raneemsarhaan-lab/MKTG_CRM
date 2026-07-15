import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(request: Request): Promise<Response> {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const supabase = await createServerClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const { data: { user } } = await supabase.auth.getUser()

  // Domain enforcement — FR-037
  if (!user?.email?.endsWith('@forefront.consulting')) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=domain`)
  }

  // Member lookup — only registered team members can access
  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('email', user.email)
    .single()

  if (!member) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=not_member`)
  }

  return NextResponse.redirect(`${origin}/overview`)
}
