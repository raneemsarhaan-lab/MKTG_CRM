'use client'

import { useEffect, useState } from 'react'
import { getLinkPreview, type LinkPreviewData } from '@/actions/links'
import { hostOf, hrefFor, prettyPath } from '@/lib/links'

/**
 * The card under a link in a comment.
 *
 * It always renders something. The preview is a best effort — plenty of links
 * cannot be read from a server (a private Drive folder answers with a login
 * page) and the deployment may not be allowed to make outbound requests at all
 * — so the floor is a card that names the site and the path, which needs no
 * network at all. Anything the fetch does come back with is an improvement on
 * top of that, not the thing the card depends on.
 *
 * Fetched previews are cached in the database, so the second reader of a
 * comment pays nothing.
 */

/** Per-session memo, so re-rendering the panel does not re-ask the server. */
const seen = new Map<string, LinkPreviewData | null>()

const C = {
  text:   '#18233F',
  faint:  '#68738D',
  muted:  '#929CB0',
  surface:'#F7F9FC',
  blue:   '#3563E9',
  blueLight: '#EEF3FF',
  blueHover: '#E2EAFF',
}

export function LinkCard({ url }: { url: string }) {
  const href = hrefFor(url)
  const [data, setData] = useState<LinkPreviewData | null | undefined>(() => seen.get(href))
  const [hover, setHover] = useState(false)

  useEffect(() => {
    if (seen.has(href)) { setData(seen.get(href)); return }
    let alive = true
    getLinkPreview(href)
      .then(d => { seen.set(href, d); if (alive) setData(d) })
      .catch(() => { seen.set(href, null); if (alive) setData(null) })
    return () => { alive = false }
  }, [href])

  const host = hostOf(href)
  const path = prettyPath(href)
  const rich = data?.ok ? data : null
  const site = rich?.site_name || host

  // A link with nothing to say about itself must not say the same thing three
  // times over. The site is always the eyebrow; the headline is the page's
  // title when that adds something, and the path when it does not.
  const same     = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()
  const headline = rich?.title && !same(rich.title, site) ? rich.title : (path || site)
  const domain   = host + (path && path !== headline ? path : '')

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block', marginTop: 8, border: 'none', borderRadius: 18,
        overflow: 'hidden', textDecoration: 'none', color: 'inherit', background: C.surface,
        boxShadow: '0 4px 20px rgba(23,36,65,0.04)',
      }}
    >
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px 0', fontSize: 12, fontWeight: 700, color: C.faint,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          {rich?.favicon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rich.favicon} alt="" width={14} height={14}
                 referrerPolicy="no-referrer"
                 onError={e => { e.currentTarget.style.display = 'none' }}
                 style={{ borderRadius: 3, flexShrink: 0 }} />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{site}</span>
        </span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.muted}
             strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
          <path d="M12 3v12M8 7l4-4 4 4" />
        </svg>
      </span>

      {rich?.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={rich.image_url}
          alt=""
          referrerPolicy="no-referrer"
          onError={e => { e.currentTarget.style.display = 'none' }}
          style={{ display: 'block', width: '100%', maxHeight: 220, objectFit: 'cover', marginTop: 9 }}
        />
      )}

      <span style={{ display: 'block', padding: '10px 12px 12px' }}>
        <span style={{
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', fontSize: 14.5, fontWeight: 700,
          color: C.text, lineHeight: 1.35, wordBreak: 'break-word',
        }}>
          {headline}
        </span>

        {domain && (
          <span style={{
            display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginTop: 3, fontSize: 12.5, color: C.muted,
          }}>
            {domain}
          </span>
        )}

        {data === undefined && (
          <span style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: C.muted }}>
            Loading preview…
          </span>
        )}

        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 9,
          height: 26, padding: '0 10px', borderRadius: 8,
          background: hover ? C.blueHover : C.blueLight, color: C.blue,
          fontSize: 12.5, fontWeight: 700, transition: 'background .12s',
        }}>
          Open link →
        </span>
      </span>
    </a>
  )
}
