'use client'

import { useRef, useState } from 'react'
import { ImageWithFallback } from './ImageWithFallback'

/**
 * Pick an image from this computer.
 *
 * There is no file storage behind this app — no S3, no disk that survives a
 * redeploy, no credentials to add one. So the picture is resized in the
 * browser and stored as a data URL in the same text column that has always
 * held a link. That means it lives in Postgres, comes back with the row, and
 * survives every deploy, which a file written to the container's disk would
 * not.
 *
 * The resize is not cosmetic — it is what makes the approach viable. An
 * untouched phone photo is several megabytes, and a few of those in a table
 * that every page reads would slow the whole app down. Everything is scaled to
 * fit `max` pixels and re-encoded, which brings a typical photo under 60 kB.
 *
 * A URL can still be typed instead; both end up in the same field.
 */

interface Props {
  value:    string | null
  onChange: (value: string | null) => void
  label?:   string
  /** Longest edge, in pixels. Logos need less than avatars need less than covers. */
  max?:     number
  round?:   boolean
  disabled?: boolean
}

const LIMIT_BYTES = 8 * 1024 * 1024   // refuse before reading something absurd

async function shrink(file: File, max: number): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale  = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot process images')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  // PNG keeps transparency, which logos need; everything else is far smaller
  // as JPEG. Quality 0.82 is where the artefacts stop being visible at these
  // sizes.
  const type = file.type === 'image/png' || file.type === 'image/svg+xml' ? 'image/png' : 'image/jpeg'
  return canvas.toDataURL(type, 0.82)
}

export function ImageUpload({ value, onChange, label, max = 256, round, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pick(file: File | undefined) {
    if (!file) return
    setError('')

    if (!file.type.startsWith('image/')) {
      setError('That is not an image.')
      return
    }
    if (file.size > LIMIT_BYTES) {
      setError('That image is very large — please pick one under 8 MB.')
      return
    }

    setBusy(true)
    try {
      onChange(await shrink(file, max))
    } catch (e: unknown) {
      setError(`Could not read that image. ${String(e).slice(0, 80)}`)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''   // so the same file can be picked twice
    }
  }

  const size = round ? 52 : 56

  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {label && <span style={LABEL}>{label}</span>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          width: size, height: size, borderRadius: round ? '50%' : 12, overflow: 'hidden',
          border: '1px solid var(--line)', background: '#F6F6F4', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ImageWithFallback
            src={value ?? undefined}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fallback={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B9B9B0"
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            }
          />
        </span>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || busy}
            style={{ ...BTN, opacity: disabled || busy ? 0.5 : 1 }}
          >
            {busy ? 'Reading…' : value ? 'Replace' : 'Upload image'}
          </button>
          {value && (
            <button type="button" onClick={() => onChange(null)} disabled={disabled}
                    style={{ ...BTN, background: 'transparent', border: 'none', color: '#C0453E' }}>
              Remove
            </button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={e => void pick(e.target.files?.[0])}
          style={{ display: 'none' }}
          aria-label={label ?? 'Upload an image'}
        />
      </div>

      {error && <span style={{ fontSize: '0.72rem', color: '#C0453E' }}>{error}</span>}

      {/* The link route stays, because a brand's artwork often already lives
          somewhere and re-uploading it is busywork. */}
      <input
        value={value?.startsWith('data:') ? '' : value ?? ''}
        placeholder={value?.startsWith('data:') ? 'Uploaded from this computer' : '…or paste a link'}
        onChange={e => onChange(e.target.value.trim() || null)}
        disabled={disabled || value?.startsWith('data:')}
        style={{
          fontSize: '0.75rem', padding: '6px 9px', borderRadius: 8,
          border: '1px solid var(--line)', background: value?.startsWith('data:') ? '#F6F6F4' : '#FCFCFB',
          color: 'var(--muted)', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

const LABEL: React.CSSProperties = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '.06em', color: 'var(--muted)',
}
const BTN: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 700, padding: '7px 14px', borderRadius: 9,
  border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
