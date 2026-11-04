'use client'

import { useTranslations } from 'next-intl'

/**
 * Grey tiles at the real tile size while files load, so nothing shifts when
 * they arrive (spec 007 FR-070, SC-010). One per file, up to seven.
 */
export function PlaceholderTiles({ count }: { count: number }) {
  const t = useTranslations('attachments')
  const n = Math.min(Math.max(count, 0), 7)
  return (
    <>
      <span role="status" className="fx-att-sr" style={SR_ONLY}>{t('loading', { count })}</span>
      <div className="fx-att-grid" aria-hidden="true" data-att-loading="">
        {Array.from({ length: n }, (_, i) => (
          // The tile's own parts, so the height matches a real tile exactly.
          <div key={i} className="fx-att-tile fx-att-skel">
            <span className="fx-att-thumb" />
            <span className="fx-att-info">
              <span className="fx-att-name"><b /></span>
              <span className="fx-att-meta"><i /><b /></span>
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

/** Visually hidden, still read by screen readers. */
export const SR_ONLY: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}
