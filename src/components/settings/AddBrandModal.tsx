'use client'

import { useState, useTransition } from 'react'
import { BRAND_PALETTE, COLORS } from '@/lib/tokens'
import { createBrand } from '@/actions/settings'

interface AddBrandModalProps {
  onClose: () => void
}

export function AddBrandModal({ onClose }: AddBrandModalProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(BRAND_PALETTE[0])
  const [logoUrl, setLogoUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    if (!name.trim()) return
    startTransition(async () => {
      const result = await createBrand({ name, color, logo_url: logoUrl || undefined })
      if (!result.success) {
        setError(result.error ?? 'Failed to create brand')
      } else {
        onClose()
      }
    })
  }

  const inputStyle: React.CSSProperties = {
    fontSize: '0.82rem', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--line)', background: '#F6F6F4',
    color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(16,16,11,.5)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 400, background: '#fff',
          borderRadius: 20, padding: 24,
          boxShadow: '0 30px 80px rgba(0,0,0,.25)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink)', margin: 0 }}>Add brand</h3>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: '#F6F6F4', border: 'none', cursor: 'pointer',
              color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Preview swatch + name */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 18 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: color, border: '1px solid var(--line)', flexShrink: 0,
          }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              placeholder="Brand name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoFocus
              style={inputStyle}
            />
            <input
              placeholder="Logo URL (optional)"
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Color palette */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 10 }}>
            Brand color
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {BRAND_PALETTE.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: c, border: 'none', cursor: 'pointer',
                  outline: color === c ? `3px solid ${COLORS.ink}` : '3px solid transparent',
                  outlineOffset: 2,
                }}
                title={c}
              />
            ))}
          </div>
        </div>

        {error && (
          <div style={{ fontSize: '0.75rem', color: COLORS.coral, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!name.trim() || isPending}
          style={{
            width: '100%', padding: '0.72rem', borderRadius: 12,
            background: 'var(--ink)', color: COLORS.lime,
            border: 'none', fontSize: '0.87rem', fontWeight: 700,
            cursor: name.trim() && !isPending ? 'pointer' : 'default',
            opacity: name.trim() && !isPending ? 1 : 0.5,
            fontFamily: 'inherit',
          }}
        >
          {isPending ? 'Adding…' : 'Add brand'}
        </button>
      </div>
    </div>
  )
}
