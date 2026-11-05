'use client'

/**
 * The brand filter as one dropdown (spec 011 US2, FR-031), in place of the
 * row of brand logos that pushed the toolbar onto a second line.
 *
 * An empty selection means every brand, as everywhere else that reads
 * `brandIds`. From "All brands", picking a brand shows only that brand;
 * further picks add to it, and picking a checked brand takes it away. Picking
 * every brand, or taking the last one away, goes back to empty: both are the
 * same board as "All brands".
 */
import { useTranslations } from 'next-intl'
import type { Brand } from '@/types/index'
import { HeaderMenu, ChevronIcon } from './HeaderMenu'

/** A brand's mark: its logo when it has one, else its initial on its colour. */
export function BrandMark({ brand, size = 22 }: { brand: Brand; size?: number }) {
  const initial = brand.name.trim()[0]?.toUpperCase() ?? '?'
  return (
    <span className="fx-hd-mark" style={{ width: size, height: size, background: brand.color, fontSize: size * 0.48 }}>
      {brand.logo_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={brand.logo_url} alt="" />
        : initial}
    </span>
  )
}

/** The next selection after picking `id` (or "all" when id is null). */
export function pickBrand(selected: string[], id: string | null, total: number): string[] {
  if (id === null) return []
  const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
  return next.length === total ? [] : next
}

export function BrandMenu({ brands, selected, onChange }: {
  brands: Brand[]
  selected: string[]
  onChange(ids: string[]): void
}) {
  const t = useTranslations('header')
  const one = selected.length === 1 ? brands.find(b => b.id === selected[0]) : undefined
  const trigger = selected.length === 0
    ? <span className="fx-hd-lbl-keep">{t('allBrands')}</span>
    : one
      ? <><BrandMark brand={one} size={20} /><span className="fx-hd-lbl-keep fx-hd-brand-name" title={one.name}>{one.name}</span></>
      : <span className="fx-hd-lbl-keep">{t('nBrands', { n: selected.length })}</span>

  return (
    <HeaderMenu label={t('brandsLabel')} data="data-brand-menu" width={290} className="is-brands"
                trigger={<>{trigger}<ChevronIcon /></>}>
      <button type="button" className="fx-hd-opt" data-brand-option="all" aria-pressed={selected.length === 0}
              onClick={() => onChange([])}>
        <span className="fx-hd-opt-txt">{t('allBrands')}</span>
        {selected.length === 0 && <span className="fx-hd-check" aria-hidden="true">✓</span>}
      </button>
      <div className="fx-hd-sep" role="separator" />
      {brands.map(b => {
        const on = selected.includes(b.id)
        return (
          <button key={b.id} type="button" className="fx-hd-opt" data-brand-option={b.id} aria-pressed={on}
                  onClick={() => onChange(pickBrand(selected, b.id, brands.length))}>
            <BrandMark brand={b} size={22} />
            <span className="fx-hd-opt-txt">{b.name}</span>
            {on && <span className="fx-hd-check" aria-hidden="true">✓</span>}
          </button>
        )
      })}
    </HeaderMenu>
  )
}
