'use client'

/**
 * Borders (spec 015 FR-011): Excel's 13 presets, a line style and a line
 * colour. The style and colour apply to the next preset picked, as in Excel.
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { BorderSide } from '@/types/index'
import { BORDER_PRESETS, STANDARD_COLORS, type BorderPreset } from '@/lib/sheet-format'
import { Pop, gridKeys } from './Pop'

const LINES: BorderSide['w'][] = ['thin', 'medium', 'thick', 'dashed', 'dotted', 'double']
const PX = { thin: 1, medium: 2, thick: 3, dashed: 1, dotted: 1, double: 3 } as const
const CSS = { thin: 'solid', medium: 'solid', thick: 'solid', dashed: 'dashed', dotted: 'dotted', double: 'double' } as const
const STD_KEYS = ['darkRed', 'red', 'orange', 'yellow', 'lightGreen', 'green', 'lightBlue', 'blue', 'darkBlue', 'purple'] as const

/** The preset's picture: the sides it draws on a dotted square. */
const SIDES: Record<BorderPreset, [number | 'd' | 0, number | 'd' | 0, number | 'd' | 0, number | 'd' | 0, boolean?]> = {
  bottom: [0, 0, 1, 0], top: [1, 0, 0, 0], left: [0, 0, 0, 1], right: [0, 1, 0, 0], none: [0, 0, 0, 0],
  all: [1, 1, 1, 1, true], outside: [1, 1, 1, 1], thickOut: [3, 3, 3, 3], dblBottom: [0, 0, 'd', 0],
  thickBottom: [0, 0, 3, 0], topBottom: [1, 0, 1, 0], topThick: [1, 0, 3, 0], inside: [0, 0, 0, 0, true],
}
export function PresetIcon({ preset }: { preset: BorderPreset }) {
  const [t, r, b, l, inner] = SIDES[preset]
  const w = (v: number | 'd' | 0) => (v === 3 ? 2.6 : 1.4)
  const line = (v: number | 'd' | 0, d: string) => !v ? null : v === 'd'
    ? <><path d={d} strokeWidth={1} /><path d="M3 18.6h18" strokeWidth={1} /></>
    : <path d={d} strokeWidth={w(v)} />
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" strokeDasharray="1.5 2" strokeWidth={1} opacity={0.45} />
      {line(t, 'M3 3h18')}{line(r, 'M21 3v18')}{line(b, 'M3 21h18')}{line(l, 'M3 3v18')}
      {inner && <path d="M12 3v18M3 12h18" strokeWidth={1.4} />}
    </svg>
  )
}

export function BorderPicker({ anchor, line, onLine, onPick, onClose }: {
  anchor: HTMLElement
  line: BorderSide
  onLine(l: BorderSide): void
  onPick(preset: BorderPreset): void
  onClose(): void
}) {
  const t = useTranslations('sheets.format')
  const [cur, setCur] = useState(line)
  const setLine = (l: BorderSide) => { setCur(l); onLine(l) }
  return (
    <Pop anchor={anchor} label={t('border.title')} onClose={onClose} attr="data-border-picker">
      <div className="fx-fmt-bp">
        <div className="fx-fmt-presets" role="group" aria-label={t('border.title')} onKeyDown={e => gridKeys(e, 2)}>
          {BORDER_PRESETS.map((p, i) => (
            <button key={p} type="button" data-border={p} {...(i === 0 ? { 'data-autofocus': '' } : {})} onClick={() => { onPick(p); onClose() }}>
              <PresetIcon preset={p} /><span>{t(`border.presets.${p}`)}</span>
            </button>
          ))}
        </div>
        <h5>{t('border.style')}</h5>
        <div className="fx-fmt-lines" role="group" aria-label={t('border.style')} onKeyDown={e => gridKeys(e, 6)}>
          {LINES.map(w => (
            <button key={w} type="button" data-line={w} aria-pressed={cur.w === w} aria-label={t(`border.lines.${w}`)} title={t(`border.lines.${w}`)}
                    onClick={() => setLine({ ...cur, w })}>
              <i style={{ borderTop: `${PX[w]}px ${CSS[w]} currentColor`, height: w === 'double' ? 3 : 0 }} />
            </button>
          ))}
        </div>
        <h5>{t('border.colour')}</h5>
        <div className="fx-fmt-swg" role="group" aria-label={t('border.colour')} onKeyDown={e => gridKeys(e, 10)}>
          {['#000000', ...STANDARD_COLORS.slice(0, 9)].map((c, i) => {
            const name = i === 0 ? t('color.auto') : t(`color.stdNames.${STD_KEYS[i - 1]}`)
            return <button key={c} type="button" className={`fx-fmt-sw${cur.c === c ? ' is-cur' : ''}`} style={{ background: c }} aria-label={name} title={name}
                           aria-pressed={cur.c === c} data-linec={c} onClick={() => setLine({ ...cur, c })} />
          })}
        </div>
      </div>
    </Pop>
  )
}
