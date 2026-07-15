'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useUIStore } from '@/store/useUIStore'
import { COLORS, REACTION_COLORS } from '@/lib/tokens'
import { playCelebrationSound } from '@/lib/celebration-audio'

// ─── Canvas confetti ───────────────────────────────────────────────────────────

type ParticleShape = 'streamer' | 'circle' | 'star' | 'drop'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  rotation: number
  rotationSpeed: number
  size: number
  opacity: number
  shape: ParticleShape
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rotation: number) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotation)
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2
    const b = (i * 4 * Math.PI) / 5 + Math.PI / 5 - Math.PI / 2
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    ctx.lineTo(Math.cos(b) * (r * 0.4), Math.sin(b) * (r * 0.4))
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawDrop(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rotation: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  ctx.beginPath()
  ctx.moveTo(0, -r)
  ctx.bezierCurveTo(r, -r * 0.5, r, r * 0.5, 0, r)
  ctx.bezierCurveTo(-r, r * 0.5, -r, -r * 0.5, 0, -r)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

const PALETTE = [COLORS.lime, COLORS.coral, COLORS.violet, COLORS.cyan, '#F59E0B', '#EC4899']

function spawnParticles(shape: ParticleShape, count: number, w: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: -10 - Math.random() * 40,
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 4,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.2,
    size: 4 + Math.random() * 8,
    opacity: 1,
    shape,
  }))
}

function ConfettiCanvas({ shape }: { shape: ParticleShape }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)
  const particles = useRef<Particle[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Store in refs so tick closure can access non-null
    const c: HTMLCanvasElement = canvas
    const x: CanvasRenderingContext2D = ctx

    c.width  = window.innerWidth
    c.height = window.innerHeight

    particles.current = spawnParticles(shape, 90, c.width)

    const gravity = 0.12

    function tick() {
      x.clearRect(0, 0, c.width, c.height)
      particles.current = particles.current.filter(p => p.opacity > 0.01 && p.y < c.height + 20)

      particles.current.forEach(p => {
        p.x  += p.vx
        p.y  += p.vy
        p.vy += gravity
        p.vx *= 0.99
        p.rotation += p.rotationSpeed
        if (p.y > c.height * 0.7) p.opacity *= 0.97

        x.globalAlpha = p.opacity
        x.fillStyle   = p.color

        if (shape === 'streamer') {
          x.save()
          x.translate(p.x, p.y)
          x.rotate(p.rotation)
          x.fillRect(-p.size * 0.5, -p.size * 2.5, p.size, p.size * 5)
          x.restore()
        } else if (shape === 'circle') {
          x.beginPath()
          x.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          x.fill()
        } else if (shape === 'star') {
          drawStar(x, p.x, p.y, p.size, p.rotation)
        } else if (shape === 'drop') {
          drawDrop(x, p.x, p.y, p.size, p.rotation)
        }
      })

      x.globalAlpha = 1
      if (particles.current.length > 0) rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [shape])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
    />
  )
}

// ─── Reaction config ───────────────────────────────────────────────────────────

const REACTIONS: { id: 'zaghrota' | 'tasqeef' | 'mabhour' | 'tabla'; ar: string; emoji: string; shape: ParticleShape }[] = [
  { id: 'zaghrota', ar: 'زغروطة',          emoji: '🎉', shape: 'streamer' },
  { id: 'tasqeef',  ar: 'تسقيف',           emoji: '👏', shape: 'circle'   },
  { id: 'mabhour',  ar: 'انا مبهور بيا',   emoji: '🤩', shape: 'star'     },
  { id: 'tabla',    ar: 'طبلة',            emoji: '🥁', shape: 'drop'     },
]

// ─── Overlay ───────────────────────────────────────────────────────────────────

export function CelebrationOverlay() {
  const celebration    = useUIStore(s => s.celebration)
  const setCelebration = useUIStore(s => s.setCelebration)

  const confettiShape = useRef<ParticleShape>('circle')
  const dismiss = useCallback(() => setCelebration(null), [setCelebration])

  // Dismiss on Escape
  useEffect(() => {
    if (!celebration) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [celebration, dismiss])

  if (!celebration) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Stage celebration"
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(16,16,11,.72)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <ConfettiCanvas shape={confettiShape.current} />

      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', zIndex: 2,
          width: '100%', maxWidth: 420,
          background: '#fff', borderRadius: 24,
          padding: '32px 28px 28px',
          boxShadow: '0 40px 100px rgba(0,0,0,.35)',
          textAlign: 'center',
        }}
      >
        {/* Dismiss */}
        <button
          onClick={dismiss}
          aria-label="Dismiss celebration"
          style={{
            position: 'absolute', top: 14, right: 14,
            width: 30, height: 30, borderRadius: '50%',
            background: '#F6F6F4', border: 'none',
            cursor: 'pointer', color: 'var(--muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.82rem',
          }}
        >
          ✕
        </button>

        {/* Lime pulse circle */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: COLORS.lime, margin: '0 auto 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.8rem',
        }}>
          🚀
        </div>

        <h2 style={{
          fontFamily: 'var(--font-heading)', fontWeight: 800,
          fontSize: '1.25rem', color: 'var(--ink)',
          margin: '0 0 6px', lineHeight: 1.2,
        }}>
          {celebration.taskName}
        </h2>

        <div style={{ fontSize: '0.87rem', color: 'var(--muted)', marginBottom: 6 }}>
          Moved to <strong style={{ color: 'var(--ink)' }}>{celebration.stageLabel}</strong>
        </div>

        {/* Arabic subheader */}
        <div style={{
          fontFamily: 'var(--font-accent)',
          fontSize: '1.2rem', color: COLORS.violet,
          direction: 'rtl', textAlign: 'center',
          marginBottom: 24, letterSpacing: '0.03em',
        }}>
          مبروك! أحسنت ✨
        </div>

        {/* Reaction buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          {REACTIONS.map(r => (
            <button
              key={r.id}
              aria-label={r.ar}
              onClick={() => {
                confettiShape.current = r.shape
                playCelebrationSound(r.id)
              }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '10px 12px', borderRadius: 14,
                background: `${REACTION_COLORS[r.id]}18`,
                border: `1.5px solid ${REACTION_COLORS[r.id]}44`,
                cursor: 'pointer', transition: 'transform 0.1s, background 0.12s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{r.emoji}</span>
              <span style={{
                fontFamily: 'var(--font-accent)',
                fontSize: '0.62rem', color: REACTION_COLORS[r.id],
                fontWeight: 700, direction: 'rtl', whiteSpace: 'nowrap',
              }}>
                {r.ar}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
