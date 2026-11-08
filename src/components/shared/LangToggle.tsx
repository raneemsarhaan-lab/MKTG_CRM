'use client'

import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { setLocale } from '@/actions/notifications'
import { applyLocale } from '@/lib/locale-switch'

export function LangToggle() {
  const locale = useLocale()
  const router = useRouter()
  const t      = useTranslations('nav')
  const isAr   = locale === 'ar'

  function toggle() {
    const next = isAr ? 'en' : 'ar'
    applyLocale(next)
    // Phone alerts and emails follow the member's language (spec 012 R13).
    void setLocale(next).catch(() => {})
    router.refresh()
  }

  return (
    <button
      onClick={toggle}
      aria-label={t('toggleLanguage')}
      title={t('toggleLanguage')}
      style={{
        width: 38, height: 38, borderRadius: 10,
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.12)',
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', marginBottom: 4, flexShrink: 0,
        fontFamily: isAr ? 'var(--font-body)' : 'var(--font-accent)',
        fontSize: isAr ? '0.72rem' : '0.95rem',
        fontWeight: 700,
        letterSpacing: isAr ? '0.03em' : 0,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.13)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
    >
      {isAr ? 'EN' : 'ع'}
    </button>
  )
}
