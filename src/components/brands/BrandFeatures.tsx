'use client'

/**
 * A brand's feature switches (spec 021 US4, FR-019–FR-021). Admins only.
 *
 * Each switch shows whether it follows the workspace default or is set for
 * the brand, and saves at once. Switching off hides; it never clears a value.
 * The Islam Check switch applies to tasks created afterwards.
 *
 * Used three ways: inline per brand in Settings › Brands, inline for the
 * workspace defaults there, and in a panel from the brand page header.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { BrandFeatureKey, BrandFeatures } from '@/types/index'
import { BRAND_FEATURES } from '@/lib/brand-features'
import { setBrandFeatureDefaults, setBrandFeatures, setBrandNineStage } from '@/actions/brands'
import { PIPE } from '@/lib/pipeline-tokens'
import { Modal } from '@/components/sheets/Dialogs'

type Key = BrandFeatureKey | 'cCheck'

export interface BrandFeaturesTarget {
  id: string
  name: string
  /** The brand's own overrides only. */
  own: BrandFeatures
  nine_stage_default: boolean | null
}

export function BrandFeaturesButton(props: { brand: BrandFeaturesTarget; defaults: BrandFeatures; workspaceNineStage: boolean }) {
  const t = useTranslations('spaces.features')
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" data-brand-features-open onClick={() => setOpen(true)}
        style={{ border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 9, padding: '6px 11px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: PIPE.ink }}>
        {t('open')}
      </button>
      {open && (
        <Modal title={t('title', { brand: props.brand.name })} body={t('help')} onCancel={() => setOpen(false)} attr="data-brand-features" width={560}>
          <div style={{ maxHeight: 'min(60vh, 640px)', overflowY: 'auto', paddingInlineEnd: 4 }}>
            <BrandFeaturesList {...props} />
          </div>
          <div className="fx-sh-dialog-row">
            <button type="button" className="is-go" onClick={() => setOpen(false)}>{t('close')}</button>
          </div>
        </Modal>
      )}
    </>
  )
}

/** One brand's switches (with Islam Check), or the workspace defaults when `brand` is absent. */
export function BrandFeaturesList({ brand, defaults, workspaceNineStage }: { brand?: BrandFeaturesTarget; defaults: BrandFeatures; workspaceNineStage?: boolean }) {
  const t = useTranslations('spaces.features')
  const router = useRouter()
  const [, start] = useTransition()
  const [own, setOwn] = useState<BrandFeatures>(brand ? brand.own : defaults)
  const [nine, setNine] = useState<boolean | null>(brand?.nine_stage_default ?? null)
  const [error, setError] = useState<string | null>(null)

  const run = (call: () => Promise<{ success: boolean; error?: string }>, undo: () => void) => {
    setError(null)
    start(async () => {
      const r = await call().catch(() => ({ success: false, error: 'failed' }))
      if (r.success) { router.refresh(); return }
      undo()
      setError(r.error === 'not_authorized' ? t('notAllowed') : t('failed'))
    })
  }

  const dfltOf = (k: Key) => (k === 'cCheck' ? !!workspaceNineStage : defaults[k] !== false)
  const ownOf = (k: Key): boolean | null => (k === 'cCheck' ? nine : typeof own[k] === 'boolean' ? own[k]! : null)
  const valueOf = (k: Key) => ownOf(k) ?? dfltOf(k)

  function change(k: Key, v: boolean | null) {
    if (k === 'cCheck') {
      if (!brand) return
      const before = nine
      setNine(v)
      run(() => setBrandNineStage(brand.id, v), () => setNine(before))
      return
    }
    const before = own
    const next = { ...own }
    if (v === null) delete next[k]
    else next[k] = v
    setOwn(next)
    run(brand ? () => setBrandFeatures(brand.id, { [k]: v }) : () => setBrandFeatureDefaults(next), () => setOwn(before))
  }

  const keys: Key[] = brand ? [...BRAND_FEATURES, 'cCheck'] : [...BRAND_FEATURES]
  const scope = brand ? `brand:${brand.id}` : 'defaults'

  return (
    <div data-features-list={scope} style={{ display: 'grid', gap: 2 }}>
      {keys.map(k => {
        const on = valueOf(k)
        const mine = brand ? ownOf(k) !== null : false
        return (
          <div key={k} data-feature-row={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '5px 4px', borderTop: k === 'cCheck' ? `1px dashed ${PIPE.border}` : undefined, marginTop: k === 'cCheck' ? 6 : 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: PIPE.ink, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 }}>
                {t(`names.${k}`)}
                {brand && (
                <span style={{ fontSize: 11, fontWeight: 500, color: PIPE.textMuted, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <span data-feature-source={mine ? 'own' : 'default'}>{mine ? t('ownSetting') : t('followsDefault', { state: dfltOf(k) ? t('on') : t('off') })}</span>
                  {mine && (
                    <button type="button" data-feature-reset={k} onClick={() => change(k, null)}
                      style={{ border: 'none', background: 'none', padding: 0, fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: PIPE.ink, textDecoration: 'underline', cursor: 'pointer' }}>
                      {t('useDefault')}
                    </button>
                  )}
                </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: PIPE.textMuted }}>{t(`hints.${k}`)}</div>
            </div>
            <button type="button" role="switch" aria-checked={on} aria-label={t(`names.${k}`)} data-feature-switch={k}
              onClick={() => change(k, !on)}
              style={{ position: 'relative', width: 42, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', flex: 'none',
                background: on ? PIPE.ink : 'color-mix(in srgb, #8A8F98 35%, transparent)', transition: 'background .15s' }}>
              <span aria-hidden="true" style={{ position: 'absolute', top: 3, insetInlineStart: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#FFFFFF', transition: 'inset-inline-start .15s', boxShadow: '0 1px 2px rgba(0,0,0,.25)' }} />
              <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{on ? t('on') : t('off')}</span>
            </button>
          </div>
        )
      })}
      <p data-features-msg role="status" aria-live="polite" style={{ minHeight: 16, margin: '6px 0 0', fontSize: 12, fontWeight: 600, color: '#C2353A' }}>{error ?? ''}</p>
    </div>
  )
}
