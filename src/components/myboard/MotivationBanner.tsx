/**
 * Motivation banner — developer handoff §8.
 *
 * Wholly decorative and static. The hand-drawn SVGs (mug, steam, arrow) are
 * brand voice per the non-negotiables, not decoration to be dropped.
 *
 * Both quote lines are white-space: nowrap; if the copy is ever changed, keep
 * the two lines to a combined 34 characters or they overflow at 1280px.
 */
export function MotivationBanner() {
  return (
    <div
      aria-hidden="true"
      style={{
        background:   'linear-gradient(100deg, #4A3BB0, #8B7CF0)',
        borderRadius: 18,
        padding:      '26px 40px',
        display:      'flex',
        alignItems:   'center',
        gap:          26,
        color:        '#fff',
      }}
    >
      {/* Straight glyph, matching the reference — not a typographic quote */}
      <span style={{ fontFamily: 'Georgia, serif', fontSize: 46, opacity: 0.85, lineHeight: 1 }}>
        {'"'}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-heading)', fontWeight: 800,
          fontSize: 21, whiteSpace: 'nowrap',
        }}>
          Small progress
        </div>
        <div style={{
          fontFamily: 'var(--font-heading)', fontWeight: 800,
          fontSize: 21, whiteSpace: 'nowrap',
        }}>
          every day <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>adds-up</span>
        </div>
      </div>

      {/* 70×70 mug lockup with steam curls */}
      <div style={{
        position: 'relative', width: 70, height: 70, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg viewBox="0 0 40 20" style={{ position: 'absolute', top: -14, left: 6, width: 34, height: 18 }}>
          <g stroke="#E9E45E" strokeWidth="2" strokeLinecap="round">
            <path d="M6 18 C 4 12, 8 10, 6 4" fill="none" />
            <path d="M18 18 C 16 10, 20 8, 18 2" fill="none" />
            <path d="M30 18 C 28 12, 32 10, 30 4" fill="none" />
          </g>
        </svg>
        <svg viewBox="0 0 56 50" style={{ width: 56, height: 50 }}>
          <path d="M4 10 H44 V32 C44 40 37 46 24 46 C11 46 4 40 4 32 Z" fill="#241C5C" />
          <path d="M44 16 C 54 16 54 34 44 34" fill="none" stroke="#241C5C" strokeWidth="4" />
          <text x="24" y="32" fontFamily="var(--font-heading), Montserrat, sans-serif"
                fontWeight="900" fontStyle="italic" fontSize="18" fill="#fff" textAnchor="middle">
            F
          </text>
        </svg>
      </div>

      <svg viewBox="0 0 40 24" style={{ width: 36, height: 22, flexShrink: 0, opacity: 0.8 }}>
        <path d="M2 20 C 14 22, 24 8, 36 4" fill="none" stroke="#fff"
              strokeWidth="1.5" strokeLinecap="round" />
        <path d="M28 3 L36 4 L34 11" fill="none" stroke="#fff"
              strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      {/* Sticky note — deliberately square-ish 3px radius, rotated -2deg */}
      <div style={{
        background: 'var(--sticky-note)', color: 'var(--ink-800)',
        padding: '10px 16px', borderRadius: 3,
        fontFamily: 'var(--font-accent)', fontWeight: 700, fontSize: 15,
        transform: 'rotate(-2deg)', flexShrink: 0, whiteSpace: 'nowrap',
      }}>
        one step<br />at a time 🙂
      </div>
    </div>
  )
}
