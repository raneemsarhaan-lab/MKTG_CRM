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
  line:  '#E8EAED',
  text:  '#292D34',
  faint: '#7C828D',
  hover: '#F7F8F9',
}

export function LinkCard({ url }: { url: string }) {
  const href = hrefFor(url)
  const [data, setData] = useState<LinkPreviewData | null | undefined>(() => seen.get(href))

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
  const blurb    = rich?.description && !same(rich.description, headline) && !same(rich.description, site)
    ? rich.description
    : (headline !== path ? path : '')

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      style={{
        display: 'flex', marginTop: 8, border: `1px solid ${C.line}`, borderRadius: 10,
        overflow: 'hidden', textDecoration: 'none', color: 'inherit', background: '#fff',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = C.hover }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
    >
      {rich?.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={rich.image_url}
          alt=""
          referrerPolicy="no-referrer"
          onError={e => { e.currentTarget.style.display = 'none' }}
          style={{
            width: 86, height: 86, objectFit: 'cover', flexShrink: 0,
            borderInlineEnd: `1px solid ${C.line}`, background: C.hover,
          }}
        />
      )}

      <span style={{ minWidth: 0, flex: 1, padding: '9px 11px', display: 'block' }}>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
          color: C.faint, fontWeight: 600,
        }}>
          {rich?.favicon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rich.favicon} alt="" width={13} height={13}
                 referrerPolicy="no-referrer"
                 onError={e => { e.currentTarget.style.display = 'none' }}
                 style={{ borderRadius: 3, flexShrink: 0 }} />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {site}
          </span>
        </span>

        <span style={{
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', marginTop: 3, fontSize: 13.5, fontWeight: 600,
          color: C.text, lineHeight: 1.35, wordBreak: 'break-word',
        }}>
          {headline}
        </span>

        {blurb && (
          <span style={{
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', marginTop: 3, fontSize: 12.5, color: C.faint,
            lineHeight: 1.4, wordBreak: 'break-word',
          }}>
            {blurb}
          </span>
        )}

        {data === undefined && (
          <span style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: C.faint }}>
            Loading preview…
          </span>
        )}
      </span>
    </a>
  )
}
