/**
 * My Board loading state — developer handoff §9.2.
 *
 * "Skeletons in place — stat cards keep their tinted background with a
 * shimmering 38×28 block where the numeral goes; task rows render 3 grey
 * placeholder lines at row height. No spinners, no layout shift."
 *
 * Dimensions mirror the real components so nothing moves on hydration.
 */

const SURFACES = [
  'var(--violet-surface)',
  'var(--amber-surface)',
  'var(--red-surface)',
  'var(--green-surface)',
]

function Shimmer({ width, height, radius = 6 }: { width: number | string; height: number; radius?: number }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'rgba(28,24,54,.08)',
    }} />
  )
}

function PanelSkeleton() {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 16,
      border: '1px solid var(--border-card)', padding: '20px 22px',
      boxShadow: '0 1px 3px rgba(28,24,54,.04)',
    }}>
      <div style={{ marginBottom: 12 }}><Shimmer width={120} height={16} /></div>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '13px 0', borderTop: '1px solid var(--border-row)',
        }}>
          <Shimmer width={7} height={7} radius={50} />
          <Shimmer width="60%" height={14} />
        </div>
      ))}
      <div style={{ marginTop: 16 }}><Shimmer width={80} height={13} /></div>
    </div>
  )
}

export default function Loading() {
  return (
    <div className="fx-myboard" style={{ padding: '36px 44px 44px' }} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your board</span>

      <div style={{ marginBottom: 26 }}>
        <Shimmer width={280} height={27} />
        <div style={{ marginTop: 8 }}><Shimmer width={180} height={14} /></div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))',
        gap: 16, marginBottom: 22,
      }}>
        {SURFACES.map((bg, i) => (
          <div key={i} style={{
            background: bg, borderRadius: 16, padding: '18px 20px',
            minHeight: 148, boxSizing: 'border-box',
          }}>
            <Shimmer width={90} height={13} />
            <div style={{ margin: '14px 0 2px' }}><Shimmer width={38} height={28} /></div>
            <Shimmer width={50} height={13} />
          </div>
        ))}
      </div>

      <div className="fx-panel-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
        gap: 16, marginBottom: 18,
      }}>
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
    </div>
  )
}
