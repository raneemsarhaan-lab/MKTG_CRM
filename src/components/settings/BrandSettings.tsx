'use client'

import { useState, useTransition } from 'react'
import type { Brand } from '@/types/index'
import { COLORS } from '@/lib/tokens'
import { ImageWithFallback } from '@/components/shared/ImageWithFallback'
import { AddBrandModal } from './AddBrandModal'
import {
  updateBrand, removeBrand, addBrandAsset, removeBrandAsset,
} from '@/actions/settings'

/**
 * Brand settings — rename, recolour, change the logo, and keep reference
 * material against each brand.
 *
 * Logos and assets are URLs. There is no upload backend in this product, so
 * everything points at artwork hosted elsewhere; the same is true of task
 * attachments, which were imported as ClickUp links.
 */

export interface BrandAsset {
  id:       string
  filename: string
  url:      string
}

export type BrandWithAssets = Brand & { assets?: BrandAsset[] }

interface Props {
  brands: BrandWithAssets[]
}

const input: React.CSSProperties = {
  fontSize: '0.8rem', padding: '7px 10px', borderRadius: 8,
  border: '1px solid var(--line)', background: '#F6F6F4',
  color: 'var(--ink)', outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box',
}

export function BrandSettings({ brands }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError]   = useState('')

  return (
    <div>
      <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 18px', maxWidth: 680 }}>
        A brand&apos;s name and logo appear on every card and filter chip. Assets are
        reference material for the team — logos, guidelines, templates — stored as
        links, since there is no file upload here yet.
      </p>

      {error && (
        <p role="alert" style={{ fontSize: '0.78rem', color: COLORS.coral, margin: '0 0 12px' }}>
          {error}
        </p>
      )}

      <div style={{
        borderRadius: 16, overflow: 'hidden', border: '1px solid var(--line)', background: '#fff',
      }}>
        {brands.map((b, i) => (
          <BrandRow
            key={b.id}
            brand={b}
            first={i === 0}
            open={openId === b.id}
            onToggle={() => setOpenId(openId === b.id ? null : b.id)}
            onError={setError}
          />
        ))}
        {brands.length === 0 && (
          <div style={{ padding: 18, fontSize: '0.8rem', color: 'var(--muted)' }}>No brands yet.</div>
        )}
      </div>

      <button
        onClick={() => setAdding(true)}
        style={{
          marginTop: 14, fontSize: '0.78rem', fontWeight: 700, padding: '8px 14px',
          borderRadius: 9, border: '1px dashed var(--line)', background: '#fff',
          color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        + Add brand
      </button>

      {adding && <AddBrandModal onClose={() => setAdding(false)} />}
    </div>
  )
}

function BrandRow({ brand: b, first, open, onToggle, onError }: {
  brand:    BrandWithAssets
  first:    boolean
  open:     boolean
  onToggle: () => void
  onError:  (msg: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [assetName, setAssetName] = useState('')
  const [assetUrl, setAssetUrl]   = useState('')
  const [confirmDelete, setConfirm] = useState(false)

  const assets = b.assets ?? []

  function patch(next: Parameters<typeof updateBrand>[1]) {
    onError('')
    startTransition(async () => {
      const res = await updateBrand(b.id, next)
      if (!res.success) onError(res.error ?? 'Could not save that change')
    })
  }

  function addAsset() {
    const url = assetUrl.trim()
    if (!url) return
    onError('')
    startTransition(async () => {
      const res = await addBrandAsset(b.id, { filename: assetName, url })
      if (res.success) { setAssetName(''); setAssetUrl('') }
      else onError(res.error ?? 'Could not attach that asset')
    })
  }

  return (
    <div style={{ borderTop: first ? 'none' : '1px solid #F6F6F4', opacity: isPending ? 0.65 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
        <span style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          background: b.color, color: '#fff', fontSize: '0.72rem', fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ImageWithFallback
            src={b.logo_url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fallback={<>{b.name.trim()[0]?.toUpperCase() ?? '?'}</>}
          />
        </span>

        <input
          defaultValue={b.name}
          aria-label={`Name of ${b.name}`}
          onBlur={e => {
            const v = e.target.value.trim()
            if (v && v !== b.name) patch({ name: v })
            else e.target.value = b.name
          }}
          style={{
            ...input, background: 'transparent', border: '1px solid transparent',
            fontWeight: 700, fontSize: '0.87rem', flex: 1, minWidth: 0,
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--line)')}
        />

        <input
          type="color"
          defaultValue={b.color}
          aria-label={`Colour of ${b.name}`}
          onBlur={e => { if (e.target.value !== b.color) patch({ color: e.target.value }) }}
          style={{
            width: 34, height: 30, padding: 2, borderRadius: 7,
            border: '1px solid var(--line)', background: '#fff', cursor: 'pointer', flexShrink: 0,
          }}
        />

        <button
          onClick={onToggle}
          aria-expanded={open}
          style={{
            fontSize: '0.72rem', fontWeight: 700, padding: '6px 12px', borderRadius: 8,
            border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)',
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {open ? 'Done' : `Edit${assets.length ? ` · ${assets.length}` : ''}`}
        </button>

        {confirmDelete ? (
          <>
            <button
              onClick={() => startTransition(async () => {
                const res = await removeBrand(b.id)
                if (!res.success) onError(res.error ?? 'Could not remove that brand')
              })}
              style={{
                fontSize: '0.72rem', fontWeight: 700, padding: '6px 10px', borderRadius: 8,
                border: 'none', background: COLORS.coral, color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              Delete?
            </button>
            <button
              onClick={() => setConfirm(false)}
              style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.72rem' }}
            >
              No
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            title={`Remove ${b.name}`}
            style={{
              border: 'none', background: 'transparent', color: COLORS.coral,
              fontSize: '0.82rem', padding: 6, cursor: 'pointer', flexShrink: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <div style={{ padding: '0 18px 18px 62px', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={LABEL}>Logo URL</label>
            <input
              defaultValue={b.logo_url ?? ''}
              placeholder="https://… or /brands/name.png"
              onBlur={e => {
                const v = e.target.value.trim()
                if (v !== (b.logo_url ?? '')) patch({ logo_url: v || null })
              }}
              style={{ ...input, width: '100%' }}
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={LABEL}>Description</label>
            <input
              defaultValue={b.description ?? ''}
              placeholder="What this brand is for"
              onBlur={e => {
                const v = e.target.value.trim()
                if (v !== (b.description ?? '')) patch({ description: v || null })
              }}
              style={{ ...input, width: '100%' }}
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={LABEL}>Assets ({assets.length})</label>

            {assets.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
                {assets.map(a => (
                  <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={a.url}
                      style={{
                        flex: 1, minWidth: 0, fontSize: '0.78rem', color: '#6E5BE6',
                        textDecoration: 'none', padding: '6px 8px', borderRadius: 7,
                        border: '1px solid var(--line)', background: '#FCFCFB',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {a.filename}
                    </a>
                    <button
                      onClick={() => startTransition(async () => {
                        const res = await removeBrandAsset(a.id)
                        if (!res.success) onError(res.error ?? 'Could not remove that asset')
                      })}
                      title={`Remove ${a.filename}`}
                      style={{
                        border: 'none', background: 'transparent', color: COLORS.coral,
                        cursor: 'pointer', fontSize: '0.78rem', padding: 4,
                      }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input
                value={assetName}
                onChange={e => setAssetName(e.target.value)}
                placeholder="Label (optional)"
                style={{ ...input, width: 170 }}
              />
              <input
                value={assetUrl}
                onChange={e => setAssetUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addAsset() }}
                placeholder="https://…"
                style={{ ...input, flex: 1, minWidth: 200 }}
              />
              <button
                onClick={addAsset}
                disabled={!assetUrl.trim()}
                style={{
                  fontSize: '0.75rem', fontWeight: 700, padding: '7px 14px', borderRadius: 8,
                  border: 'none', background: 'var(--ink)', color: '#fff',
                  cursor: assetUrl.trim() ? 'pointer' : 'default',
                  opacity: assetUrl.trim() ? 1 : 0.4, fontFamily: 'inherit',
                }}
              >
                Attach
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const LABEL: React.CSSProperties = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '.06em', color: 'var(--muted)',
}
