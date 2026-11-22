'use client'

/**
 * A brand's Assets Folder (spec 021 FR-006): its files — the brand asset
 * links managed in Settings › Brands — and its open Design tasks as asset
 * requests.
 */
import { useTranslations } from 'next-intl'
import { PIPE } from '@/lib/pipeline-tokens'
import type { ViewTask } from '@/components/views/types'

export function BrandAssets({ assets, requests, color, onOpen, tab }: {
  assets: { id: string; filename: string; url: string }[]
  requests: ViewTask[]
  color: string
  onOpen: (id: string) => void
  tab: 'files' | 'requests'
}) {
  const t = useTranslations('spaces')
  const ext = (n: string, u: string) => ((n.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? u.match(/\.([a-z0-9]{2,5})(?:\?|$)/i)?.[1] ?? 'LINK').toUpperCase())
  if (tab === 'files') {
    return (
      <div data-brand-files style={{ padding: '18px 26px 30px 38px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {assets.length === 0 && <p style={{ color: PIPE.textMuted, fontSize: 13, gridColumn: '1 / -1' }}>{t('noAssets')}</p>}
        {assets.map(a => (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer" data-asset={a.id}
            style={{ border: `1px solid ${PIPE.border}`, borderRadius: 12, overflow: 'hidden', textDecoration: 'none', display: 'grid', background: '#FFFFFF' }}>
            <span style={{ height: 84, display: 'grid', placeItems: 'center', background: color, color: '#FFFFFF', fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 20 }}>{ext(a.filename, a.url)}</span>
            <span style={{ padding: '8px 10px', fontSize: 12.5, fontWeight: 600, color: PIPE.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.filename}</span>
          </a>
        ))}
      </div>
    )
  }
  return (
    <div data-brand-requests style={{ padding: '18px 26px 30px 38px', display: 'grid', gap: 6 }}>
      {requests.length === 0 && <p style={{ color: PIPE.textMuted, fontSize: 13 }}>{t('noRequests')}</p>}
      {requests.map(r => (
        <button key={r.id} type="button" data-row={r.id} onClick={() => onOpen(r.id)}
          style={{ textAlign: 'start', padding: '9px 12px', border: `1px solid ${PIPE.border}`, borderRadius: 12, background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: PIPE.ink }}>
          {r.name}
        </button>
      ))}
    </div>
  )
}
