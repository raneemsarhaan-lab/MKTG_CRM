'use client'

/**
 * A brand's Settings tab (spec 025 §3). Admins only; the tab isn't shown to
 * anyone else, and every action checks for itself.
 *   - C-Check on or off for new tasks, and the fields switched off for this
 *     brand (hidden, never deleted): the switches built in spec 021/023.
 *   - The priority new tasks for the brand start with.
 *   - The short name the sidebar shows.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Brand, BrandFeatures, TaskFieldDef } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import { PRIORITIES } from '@/lib/priorities'
import { setBrandBasics } from '@/actions/brands'
import { BrandFeaturesList } from './BrandFeatures'

export function BrandSettingsTab({ brand, defaults, workspaceNineStage, fields }: {
  brand: Brand; defaults: BrandFeatures; workspaceNineStage: boolean; fields: TaskFieldDef[]
}) {
  const t = useTranslations('brandSettings')
  const router = useRouter()
  const [, start] = useTransition()
  const [priority, setPriority] = useState(brand.default_priority ?? '')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const save = (patch: Parameters<typeof setBrandBasics>[1], undo?: () => void) => {
    setNote(null)
    start(async () => {
      const r = await setBrandBasics(brand.id, patch).catch(() => ({ success: false as const, error: 'failed' }))
      if (r.success) { setNote({ ok: true, text: t('saved') }); router.refresh() } else { undo?.(); setNote({ ok: false, text: t('failed') }) }
    })
  }
  const card: React.CSSProperties = { border: `1px solid ${PIPE.border}`, borderRadius: 14, padding: '14px 16px', background: '#FFFFFF', display: 'grid', gap: 10 }
  const label: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 700, color: PIPE.ink, maxWidth: 320 }
  const field: React.CSSProperties = { border: `1px solid ${PIPE.border}`, borderRadius: 8, padding: '6px 9px', fontFamily: 'inherit', fontSize: 13, background: '#FFFFFF', color: PIPE.ink, fontWeight: 500 }
  const h: React.CSSProperties = { margin: 0, fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 800, color: PIPE.ink }
  const hint: React.CSSProperties = { margin: 0, fontSize: 12.5, color: PIPE.textMuted }
  return (
    <div data-brand-settings="" style={{ padding: '14px 26px 30px 38px', display: 'grid', gap: 14, maxWidth: 720 }}>
      <section style={card} aria-labelledby="bs-new">
        <h2 id="bs-new" style={h}>{t('newTasks')}</h2>
        <label style={label}>{t('defaultPriority')}
          <select value={priority} data-brand-priority="" style={field}
            onChange={e => { const before = priority; setPriority(e.target.value); save({ default_priority: e.target.value || null }, () => setPriority(before)) }}>
            <option value="">{t('priorityDefault')}</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p === 'None' ? t('noPriority') : p}</option>)}
          </select>
        </label>
        <p style={hint}>{t('newOnly')}</p>
      </section>
      <section style={card} aria-labelledby="bs-switches">
        <h2 id="bs-switches" style={h}>{t('switches')}</h2>
        <p style={hint}>{t('switchesHelp')}</p>
        <div data-brand-features="">
        <BrandFeaturesList brand={{ id: brand.id, name: brand.name, own: brand.own_features ?? {}, nine_stage_default: brand.nine_stage_default ?? null }}
          defaults={defaults} workspaceNineStage={workspaceNineStage} fields={fields} />
        </div>
      </section>
      <section style={card} aria-labelledby="bs-name">
        <h2 id="bs-name" style={h}>{t('sidebar')}</h2>
        <label style={label}>{t('shortName')}
          <input defaultValue={brand.short_name ?? ''} maxLength={24} placeholder={brand.name} data-brand-short="" style={field}
            onBlur={e => { const v = e.target.value.trim(); if (v !== (brand.short_name ?? '')) save({ short_name: v || null }) }} />
        </label>
        <p style={hint}>{t('shortNameHint')}</p>
      </section>
      <p role="status" aria-live="polite" data-brand-settings-msg="" style={{ minHeight: 18, margin: 0, fontSize: 12.5, fontWeight: 600, color: note?.ok === false ? '#C2353A' : PIPE.textMuted }}>{note?.text ?? ''}</p>
    </div>
  )
}
