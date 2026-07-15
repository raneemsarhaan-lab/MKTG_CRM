import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

interface Props {
  searchParams: Promise<{ error?: string }>
}

const ERROR_MESSAGES: Record<string, string> = {
  domain:      'Access restricted to @forefront.consulting accounts',
  not_member:  'Your account is not registered as a team member. Contact your admin.',
  auth_failed: 'Authentication failed. Please try again.',
  no_code:     'OAuth code missing. Please try signing in again.',
}

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/overview')
  }

  async function signIn() {
    'use server'
    const supabase = await createServerClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`,
        queryParams: { hd: 'forefront.consulting' },
      },
    })
    if (data.url) {
      redirect(data.url)
    }
    if (error) {
      redirect('/login?error=auth_failed')
    }
  }

  return (
    <div
      style={{ background: 'var(--rail)', minHeight: '100vh' }}
      className="flex items-center justify-center"
    >
      <div
        style={{
          background: 'var(--panel)',
          borderRadius: '16px',
          padding: '48px',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
        }}
      >
        {/* Logo / wordmark */}
        <div className="mb-8 text-center">
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 900,
              fontSize: '28px',
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
            }}
          >
            Fluxo
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', marginTop: '4px' }}>
            Creative Operations
          </p>
        </div>

        {/* Error banner */}
        {error && ERROR_MESSAGES[error] && (
          <div
            style={{
              background: '#F8E7E5',
              color: '#C0453E',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '14px',
              marginBottom: '24px',
            }}
            role="alert"
          >
            {ERROR_MESSAGES[error]}
          </div>
        )}

        {/* Sign in form */}
        <form action={signIn}>
          <button
            type="submit"
            style={{
              background: 'var(--lime)',
              color: 'var(--ink)',
              borderRadius: '10px',
              padding: '14px 24px',
              width: '100%',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: '15px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
            }}
          >
            {/* Google icon */}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
              <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 6.294C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </form>

        <p style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>
          Access restricted to @forefront.consulting accounts
        </p>
      </div>
    </div>
  )
}
