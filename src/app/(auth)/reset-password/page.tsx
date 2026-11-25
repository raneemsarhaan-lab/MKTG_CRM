import { getTranslations } from 'next-intl/server'
import { checkToken } from '@/lib/password-reset'
import { AuthCard, authLink, authNote } from '../AuthCard'
import { ResetForm } from './ResetForm'

export const dynamic = 'force-dynamic'

/** The page a reset email links to. The link is checked first, so a spent or old one says so before anyone types. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getTranslations('passwordReset')
  const { token } = await searchParams
  const check = await checkToken(token)
  if (!check.ok) {
    return (
      <AuthCard title={t('resetTitle')}>
        <div style={authNote('error')} role="alert" data-reset-bad={check.reason}>{t(`bad.${check.reason}`)}</div>
        <p style={{ textAlign: 'center', margin: 0, display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <a href="/forgot-password" style={authLink}>{t('newLink')}</a>
          <a href="/login" style={authLink}>{t('backToLogin')}</a>
        </p>
      </AuthCard>
    )
  }
  return <AuthCard title={t('resetTitle')}><ResetForm token={token!} name={check.name} /></AuthCard>
}
