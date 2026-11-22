'use client'

/**
 * A brand's Library Folder (spec 021 FR-006): everything the brand has
 * published, as a gallery, with the post link. It fills itself — nobody
 * curates it.
 */
import { useLocale, useTranslations } from 'next-intl'
import { PIPE } from '@/lib/pipeline-tokens'
import type { ViewTask } from '@/components/views/types'

export function BrandLibrary({ tasks, color, onOpen }: { tasks: ViewTask[]; color: string; onOpen: (id: string) => void }) {
  const t = useTranslations('spaces')
  const locale = useLocale()
  return (
    <div data-brand-library style={{ padding: '18px 26px 30px 38px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
      {tasks.length === 0 && <p style={{ color: PIPE.textMuted, fontSize: 13, gridColumn: '1 / -1' }}>{t('noLibrary')}</p>}
      {tasks.map(x => {
        const link = x.post_url || x.published_url
        return (
          <div key={x.id} data-library-item={x.id} style={{ border: `1px solid ${PIPE.border}`, borderRadius: 12, overflow: 'hidden', background: '#FFFFFF', display: 'grid' }}>
            {x.cover_thumb || x.cover_image_url
              ? <img src={x.cover_thumb || x.cover_image_url} alt="" style={{ width: '100%', height: 110, objectFit: 'cover' }} />
              : <span style={{ height: 70, background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 40%, #FFFFFF))` }} />}
            <div style={{ padding: '9px 10px', display: 'grid', gap: 6 }}>
              <button type="button" onClick={() => onOpen(x.id)} style={{ textAlign: 'start', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13.5, color: PIPE.ink }}>{x.name}</button>
              <span style={{ fontSize: 11.5, color: PIPE.textMuted }}>
                {[x.content_type_label, x.platform, x.due_date ? new Date(x.due_date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : null].filter(Boolean).join(' · ')}
              </span>
              {link && <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: PIPE.purple, textDecoration: 'none' }}>{t('openPost')} ↗</a>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
