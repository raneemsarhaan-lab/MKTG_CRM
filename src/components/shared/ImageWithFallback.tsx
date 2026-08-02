'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * An <img> that shows something else when it cannot load.
 *
 * `onError` alone is not enough here. The board is server-rendered, so the
 * browser starts fetching every cover from the SSR HTML and a broken one can
 * finish failing *before* React hydrates — the error event fires with no
 * listener attached and the card is left with a broken-image glyph forever.
 * Measured on the imported ClickUp attachments: 20 of 20 failed covers stayed
 * broken with an onError handler alone.
 *
 * So the element is also inspected after render: `complete` with a
 * `naturalWidth` of 0 is the browser's way of saying it already gave up.
 */

interface Props {
  src:       string | null | undefined
  alt:       string
  fallback:  React.ReactNode
  style?:    React.CSSProperties
  loading?:  'lazy' | 'eager'
  className?: string
}

export function ImageWithFallback({ src, alt, fallback, style, loading, className }: Props) {
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLImageElement>(null)

  // A new src deserves a fresh attempt — the panel reuses one element across
  // tasks, and a failure on one must not suppress the next.
  useEffect(() => { setFailed(false) }, [src])

  // No dependency list on purpose: this has to run after every render, because
  // the only signal for an already-failed image is its state at paint time.
  useEffect(() => {
    const el = ref.current
    if (el && el.complete && el.naturalWidth === 0) setFailed(true)
  })

  if (!src || failed) return <>{fallback}</>

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading={loading}
      className={className}
      style={style}
      onError={() => setFailed(true)}
    />
  )
}
