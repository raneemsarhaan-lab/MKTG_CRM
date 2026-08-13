/**
 * The Momentum wordmark and its E symbol.
 *
 * Drawn rather than loaded. The mark is "momentum" set in the app's own
 * heading face with the E replaced by three stacked bars — blue, navy, lime —
 * which is a construction rather than a picture, so building it in SVG and
 * type keeps it crisp at every size, themeable, and free of a network request
 * the CSP would have to allow anyway.
 *
 * The three-bar E is the mark on its own: it is what goes in the collapsed
 * rail and the favicon, where the full wordmark would be illegible.
 *
 * ── If you have the original files ──────────────────────────────────────────
 * The colours below are read off the supplied artwork by eye, not sampled from
 * it, and the letterforms are Montserrat rather than the original face. Drop
 * the real SVGs into public/brand/ and swap the two components' innards for an
 * <img>; nothing else in the app needs to change, because every caller goes
 * through here.
 */

export const BRAND = {
  /** Wordmark navy — also the middle bar of the E. */
  navy: '#16223C',
  /** Top bar. The artwork runs a slight gradient; this is its mid-point. */
  blue: '#2C57F0',
  /** Bottom bar. */
  lime: '#C7E22E',
} as const

/**
 * The E symbol: three bars, unequal widths, top and bottom in colour.
 *
 * Sized from a 24-unit box so it drops into the same slots as the app's other
 * icons. The middle bar is shortest, which is what makes it read as an E
 * rather than as a hamburger menu.
 */
export function MomentumMark({
  size = 24,
  navy = BRAND.navy,
  title,
}: { size?: number; navy?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <rect x="2"   y="4.6"  width="20"   height="4.1" rx="2.05" fill={BRAND.blue} />
      <rect x="2"   y="10.4" width="15.5" height="4.1" rx="2.05" fill={navy} />
      <rect x="2"   y="16.2" width="20"   height="4.1" rx="2.05" fill={BRAND.lime} />
    </svg>
  )
}

/**
 * The full wordmark: momEntum, with the E as the symbol.
 *
 * The letters are type, not paths, so they inherit the loaded heading face and
 * stay legible when a browser substitutes. `fontSize` drives everything —
 * the bar block scales with the cap height so the mark never comes apart.
 */
export function MomentumWordmark({
  fontSize = 30,
  color = BRAND.navy,
  title = 'Momentum',
}: { fontSize?: number; color?: string; title?: string }) {
  // The E block sits on the same optical line as the lowercase x-height.
  const barW  = fontSize * 0.60
  const barH  = fontSize * 0.135
  const gap   = fontSize * 0.075
  const midW  = barW * 0.78

  const letter: React.CSSProperties = {
    fontFamily: 'var(--font-heading)',
    fontWeight: 700,
    fontSize,
    letterSpacing: '-0.035em',
    lineHeight: 1,
    color,
  }

  return (
    <span
      role="img"
      aria-label={title}
      style={{ display: 'inline-flex', alignItems: 'center', gap: fontSize * 0.045 }}
    >
      <span style={letter} aria-hidden="true">mom</span>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex', flexDirection: 'column',
          gap, marginInline: fontSize * 0.055,
          // Nudged to sit on the baseline of the surrounding lowercase.
          transform: `translateY(${fontSize * 0.015}px)`,
        }}
      >
        <i style={{ width: barW, height: barH, borderRadius: barH / 2, background: BRAND.blue,  display: 'block' }} />
        <i style={{ width: midW, height: barH, borderRadius: barH / 2, background: color,       display: 'block' }} />
        <i style={{ width: barW, height: barH, borderRadius: barH / 2, background: BRAND.lime,  display: 'block' }} />
      </span>
      <span style={letter} aria-hidden="true">ntum</span>
    </span>
  )
}
