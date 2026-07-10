import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { playZaghrota, playTasqeef, playMabhour, playTabla } from '../lib/sounds'

const REACTIONS = [
  {
    key: 'zaghrota', label: 'زغروطة', emoji: '🎉', color: '#D4537E',
    particleColors: ['#D4537E', '#F4C0D1', '#993556', '#FBEAF0'],
    messages: ['زغرووووطة عليكيييي!', 'الزغروطة دي من القلب!', 'يلعن ابو التاسك، خلصت!'],
    subs: ['وحياة اللي بتحبيه انت شاطر', 'ربنا يكرمك', 'ايوه كده، كمّل على الآخر'],
    play: playZaghrota,
  },
  {
    key: 'tasqeef', label: 'تسقيف', emoji: '👏', color: '#378ADD',
    particleColors: ['#378ADD', '#B5D4F4', '#185FA5', '#E6F1FB'],
    messages: ['تسقيف حار عليك!', 'ايدينا وجعت من التصفيق!', 'يستاهل تصفيق على المسرح!'],
    subs: ['شغل كده كل يوم', 'انت نجم الشغل النهارده', 'الفريق بيصفق معاك'],
    play: playTasqeef,
  },
  {
    key: 'mabhour', label: 'انا مبهور', emoji: '⭐', color: '#EF9F27',
    particleColors: ['#EF9F27', '#FAC775', '#BA7517', '#FAEEDA'],
    messages: ['انا مبهور بيا!!', 'يا نجم يا واد يا نجم!', 'ايه اللي انت بتعمله ده؟'],
    subs: ['والله انت مش طبيعي', 'ربنا يزيدك من فضله', 'الشغل ده بيتعمل ازاي؟!'],
    play: playMabhour,
  },
  {
    key: 'tabla', label: 'طبلة', emoji: '🥁', color: '#534AB7',
    particleColors: ['#534AB7', '#CECBF6', '#3C3489', '#EEEDFE'],
    messages: ['طبلة عالتاسك ده!', 'دق الطبل واحتفل!', 'يستاهل طبلة وزمر!'],
    subs: ['احتفال مستحق يا باشا', 'الإنجاز ده يستاهل أكتر', 'اوعى تقف، في تاسكات'],
    play: playTabla,
  },
]

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function Confetti({ colors, burst }: { colors: string[]; burst: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx2d = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1

    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const W = () => window.innerWidth
    const H = () => window.innerHeight

    const parts = Array.from({ length: 150 }, () => ({
      x: W() / 2 + (Math.random() - 0.5) * W() * 0.5,
      y: H() * 0.35 + (Math.random() - 0.5) * 80,
      vx: (Math.random() - 0.5) * 12,
      vy: Math.random() * -14 - 4,
      g: 0.28 + Math.random() * 0.15,
      size: 5 + Math.random() * 7,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 0,
      max: 90 + Math.random() * 45,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    }))

    let raf: number
    let done = false

    const draw = () => {
      ctx2d.clearRect(0, 0, W(), H())
      let alive = false
      parts.forEach(p => {
        if (p.life > p.max) return
        alive = true
        p.life++; p.vy += p.g; p.x += p.vx; p.y += p.vy
        p.vx *= 0.99; p.rot += p.vr
        const alpha = Math.max(0, 1 - p.life / p.max)
        ctx2d.save()
        ctx2d.globalAlpha = alpha
        ctx2d.translate(p.x, p.y)
        ctx2d.rotate(p.rot)
        ctx2d.fillStyle = p.color
        if (p.shape === 'rect') ctx2d.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        else { ctx2d.beginPath(); ctx2d.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx2d.fill() }
        ctx2d.restore()
      })
      if (alive && !done) raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      done = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [colors, burst])

  return (
    <canvas ref={ref} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 60 }} />
  )
}

export function CelebrationOverlay() {
  const { celebration, clearCelebration } = useStore()
  const [activeKey, setActiveKey] = useState('zaghrota')
  const [copy, setCopy] = useState({ message: '', sub: '' })
  const [burst, setBurst] = useState(0)

  useEffect(() => {
    if (!celebration) return
    const r = rand(REACTIONS)
    fire(r.key)
    const timer = setTimeout(clearCelebration, 6000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebration])

  function fire(key: string) {
    const r = REACTIONS.find(x => x.key === key)!
    setActiveKey(key)
    setCopy({ message: rand(r.messages), sub: rand(r.subs) })
    setBurst(b => b + 1)
    try { r.play() } catch { /* audio not ready */ }
  }

  if (!celebration) return null
  const active = REACTIONS.find(r => r.key === activeKey)!

  return (
    <div
      onClick={clearCelebration}
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem', zIndex: 55,
        background: 'rgba(15,16,22,0.55)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <Confetti colors={active.particleColors} burst={burst} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 420,
          borderRadius: 22, overflow: 'hidden',
          background: '#FFFFFF',
          boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
          zIndex: 62,
          animation: 'pop .35s cubic-bezier(.2,1.3,.5,1)',
          fontFamily: "'Montserrat','Inter',system-ui,sans-serif",
        }}
      >
        <div style={{ height: 6, background: active.color }} />
        <button
          onClick={clearCelebration}
          style={{
            position: 'absolute', top: 14, right: 14,
            width: 28, height: 28, borderRadius: '50%',
            background: '#F1F1F3', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.85rem', color: '#5A5A66',
          }}
        >✕</button>

        <div style={{ padding: '1.75rem 1.75rem 1.25rem', textAlign: 'center' }}>
          <div style={{ fontSize: 56, lineHeight: 1, animation: 'bob 1.4s ease-in-out infinite' }}>
            {active.emoji}
          </div>
          <div dir="rtl" style={{ marginTop: '0.75rem', fontWeight: 800, fontSize: '1.5rem', color: active.color }}>
            {copy.message}
          </div>
          <div dir="rtl" style={{ marginTop: '0.4rem', fontSize: '0.9rem', color: '#4B4B57' }}>
            {copy.sub}
          </div>
          <div style={{
            marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.35rem 0.85rem', borderRadius: 99,
            background: '#F4F4F6', color: '#3A3A44', fontSize: '0.72rem', fontWeight: 600,
          }}>
            ✓ {celebration.taskName}
          </div>
        </div>

        <div style={{ padding: '0 1.25rem 1.5rem' }}>
          <div style={{
            fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em',
            textAlign: 'center', marginBottom: '0.6rem', color: '#8A93B2',
          }}>
            هنّي زميلك — pick a reaction
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
            {REACTIONS.map(r => (
              <button
                key={r.key}
                onClick={() => fire(r.key)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
                  padding: '0.65rem 0.25rem', borderRadius: 14,
                  border: 'none', cursor: 'pointer',
                  background: r.key === activeKey ? r.color : '#F6F6F8',
                  color: r.key === activeKey ? '#fff' : '#3A3A44',
                  transform: r.key === activeKey ? 'translateY(-2px)' : 'none',
                  boxShadow: r.key === activeKey ? `0 6px 14px ${r.color}55` : 'none',
                  transition: 'all 0.15s',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: '1.35rem' }}>{r.emoji}</span>
                <span dir="rtl" style={{ fontSize: '0.62rem', fontWeight: 700, lineHeight: 1.2 }}>{r.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
