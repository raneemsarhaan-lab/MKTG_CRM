import { getTranslations } from 'next-intl/server'
import { AuthCard } from '../AuthCard'
import { ForgotForm } from './ForgotForm'

export default async function ForgotPasswordPage() {
  const t = await getTranslations('passwordReset')
  return <AuthCard title={t('forgotTitle')}><ForgotForm /></AuthCard>
}
