'use client'

/**
 * Simple sheet header (user, 25 Nov 2026): the breadcrumb's small icons, a brand's mark (its logo from
 * Brand settings, else its letter on its colour), and ☆ — this page in the member's favourites.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toggleFavourite } from '@/actions/favourites'
import type { Favourite } from '@/types/index'

const svg = (d: React.ReactNode) => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="fx-sh1-icon-svg">{d}</svg>
)
/** Spaces: four squares. */
export const SpacesIcon = () => svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>)
/** A Space: a folder. */
export const SpaceIcon = () => svg(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />)
/** Brands: a tag. */
export const BrandsIcon = () => svg(<><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>)

/** A brand's mark: its logo, else its first letter on its colour. */
export function BrandMark({ brand }: { brand: { name: string; color?: string | null; logo_url?: string | null } }) {
  return brand.logo_url
    ? <img src={brand.logo_url} alt="" className="fx-sh1-brand" />
    : <span aria-hidden="true" className="fx-sh1-brand" style={{ background: brand.color || '#5E6166' }}>{brand.name.trim()[0]?.toUpperCase()}</span>
}

/** ☆ for this page: on when it's in the member's favourites; a click adds it or takes it off. */
export function useFavourite(page: Favourite, initial: Favourite[] | undefined) {
  const router = useRouter()
  const [on, setOn] = useState(() => !!initial?.some(f => f.href === page.href))
  return {
    on,
    toggle: () => {
      setOn(v => !v)
      void toggleFavourite(page).then(r => { if (r.success) { setOn(r.on); router.refresh() } else setOn(v => !v) }).catch(() => setOn(v => !v))
    },
  }
}
