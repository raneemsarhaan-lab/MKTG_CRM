import React, { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'

interface Particle {
  x: number; y: number; vx: number; vy: number
  size: number; color: string; life: number; maxLife: number
  rotation: number; rotSpeed: number
}

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#f472b6','#34d399']

function rand(a: number, b: number) { return a + Math.random() * (b - a) }

export function CelebrationOverlay() {
  const { celebration, clearCelebration } = useStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    if (!celebration) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: Particle[] = Array.from({ length: 180 }, () => ({
      x: rand(canvas.width * 0.2, canvas.width * 0.8),
      y: rand(-30, canvas.height * 0.3),
      vx: rand(-4, 4), vy: rand(2, 8),
      size: rand(6, 14), color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 0, maxLife: rand(80, 160),
      rotation: Math.random() * Math.PI * 2, rotSpeed: rand(-0.15, 0.15),
    }))

    function draw() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = false
      for (const p of particles) {
        if (p.life >= p.maxLife) continue
        alive = true
        p.life++; p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.rotation += p.rotSpeed
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = 1 - p.life / p.maxLife
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (alive) animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    const timer = setTimeout(clearCelebration, 4500)
    return () => { cancelAnimationFrame(animRef.current); clearTimeout(timer) }
  }, [celebration, clearCelebration])

  if (!celebration) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div style={{
        position: 'relative', backgroundColor: '#fff',
        border: '1px solid #e2e8f0', borderRadius: 24,
        padding: '2rem 2.5rem', textAlign: 'center',
        boxShadow: '0 25px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(99,102,241,0.2)',
        animation: 'celebPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        pointerEvents: 'auto', maxWidth: 380, width: '90%',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🚀</div>
        <div style={{ color: '#6366f1', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Task Shipped!</div>
        <div style={{ color: '#0f172a', fontSize: '1rem', fontWeight: 700, lineHeight: 1.35, marginBottom: '0.25rem' }}>{celebration.taskName}</div>
        <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>moved to <span style={{ color: '#16a34a', fontWeight: 600 }}>{celebration.stageLabel}</span></div>
      </div>
      <style>{`@keyframes celebPop { from { opacity:0; transform:scale(0.7) } to { opacity:1; transform:scale(1) } }`}</style>
    </div>
  )
}
