/**
 * Working Hours loading state: the greeting line and the Today's hours card,
 * the same shapes as the real page so nothing moves when it arrives.
 */
function Shimmer({ width, height, radius = 6 }: { width: number | string; height: number; radius?: number }) {
  return <div style={{ width, height, borderRadius: radius, background: 'rgba(28,24,54,.08)' }} />
}

export default function Loading() {
  return (
    <div className="fx-myboard" style={{ padding: '36px 44px 44px' }} aria-busy="true">
      <div style={{ marginBottom: 26, display: 'grid', gap: 10 }}>
        <Shimmer width={320} height={40} radius={10} />
        <Shimmer width={180} height={14} />
      </div>
      <div className="fx-hr-card" style={{ minHeight: 230 }}>
        <Shimmer width={220} height={20} />
        <div style={{ display: 'flex', gap: 8 }}>
          {[96, 54, 54, 54, 54, 72].map((w, i) => <Shimmer key={i} width={w} height={40} radius={999} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8 }}>
          {Array.from({ length: 7 }, (_, i) => <Shimmer key={i} width="100%" height={58} radius={10} />)}
        </div>
      </div>
    </div>
  )
}
