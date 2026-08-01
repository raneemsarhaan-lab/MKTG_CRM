'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useUIStore } from '@/store/useUIStore'
import { COLORS } from '@/lib/tokens'
import { playCelebrationSound } from '@/lib/celebration-audio'
import { randomCelebration, type Reaction, type ReactionMessage, type ConfettiShape } from '@/lib/celebrations'

// ─── Canvas confetti ───────────────────────────────────────────────────────────

type ParticleShape = ConfettiShape

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

// ─── Overlay ───────────────────────────────────────────────────────────────────

export function CelebrationOverlay() {
  const celebration    = useUIStore(s => s.celebration)
  const setCelebration = useUIStore(s => s.setCelebration)

  // The sheet's heading is "Random on Task Completion" — the reaction and the
  // message line are chosen when the overlay opens, not picked by the user.
  const [pickedReaction, setPickedReaction] = useState<Reaction | null>(null)
  const [pickedLine, setPickedLine]         = useState<ReactionMessage | null>(null)

  const dismiss = useCallback(() => setCelebration(null), [setCelebration])

  useEffect(() => {
    if (!celebration) { setPickedReaction(null); setPickedLine(null); return }
    const { reaction, line } = randomCelebration()
    setPickedReaction(reaction)
    setPickedLine(line)
    playCelebrationSound(reaction.key)
  }, [celebration])

  const panelRef = useRef<HTMLDivElement>(null)

  // Dismiss on Escape + focus-trap inside overlay while open
  useEffect(() => {
    if (!celebration) return

    const prevFocus = document.activeElement as HTMLElement | null
    // Move focus into the panel on open
    panelRef.current?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { dismiss(); return }
      if (e.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusable.length === 0) { e.preventDefault(); return }

      const first = focusable[0]
      const last  = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus() }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      prevFocus?.focus()
    }
  }, [celebration, dismiss])

  if (!celebration || !pickedReaction || !pickedLine) return null

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
      <ConfettiCanvas shape={pickedReaction.shape} />

      {/* Panel */}
      <div
        ref={panelRef}
        onClick={e => e.stopPropagation()}
        tabIndex={-1}
        style={{
          position: 'relative', zIndex: 2,
          width: '100%', maxWidth: 420,
          background: '#fff', borderRadius: 24,
          padding: '32px 28px 28px',
          boxShadow: '0 40px 100px rgba(0,0,0,.35)',
          textAlign: 'center',
          outline: 'none',
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

        {/* Reaction emoji on its own tint */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: `${pickedReaction.color}1F`,
          border: `2px solid ${pickedReaction.color}55`,
          margin: '0 auto 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.9rem',
        }}>
          <span aria-hidden="true">{pickedReaction.emoji}</span>
        </div>

        {/* Message + sub-line, verbatim from the labels sheet */}
        <div dir="rtl" style={{ marginBottom: 18 }}>
          <h2 style={{
            fontFamily: 'var(--font-heading)', fontWeight: 800,
            fontSize: '1.3rem', color: pickedReaction.color,
            margin: '0 0 6px', lineHeight: 1.35,
          }}>
            {pickedLine.message}
          </h2>
          <div style={{ fontSize: '0.95rem', color: 'var(--ink)', lineHeight: 1.5 }}>
            {pickedLine.subline}
          </div>
        </div>

        {/* Which task moved where */}
        <div style={{
          fontSize: '0.82rem', color: 'var(--muted)',
          borderTop: '1px solid var(--line)', paddingTop: 14, marginBottom: 14,
        }}>
          <strong style={{ color: 'var(--ink)' }}>{celebration.taskName}</strong>
          {' → '}
          {celebration.stageLabel}
        </div>

        {/* Replay — the reaction is random, so this repeats the same one */}
        <button
          onClick={() => playCelebrationSound(pickedReaction.key)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 999,
            background: `${pickedReaction.color}18`,
            border: `1.5px solid ${pickedReaction.color}44`,
            color: pickedReaction.color, fontWeight: 700, fontSize: '0.78rem',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span aria-hidden="true">🔊</span>
          <span dir="rtl">{pickedReaction.labelAr}</span>
        </button>
      </div>
    </div>
  )
}
