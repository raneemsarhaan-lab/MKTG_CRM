'use client'

/**
 * The text and fill colour picker (spec 015 FR-010, design: Colour & borders):
 * Automatic or No fill, Excel's ten theme colours with five shades each, the
 * standard colours, recent colours (this device), and More colours.
 */
import { useTranslations } from 'next-intl'
import { STANDARD_COLORS, THEME_COLORS, themeShades, tint } from '@/lib/sheet-format'
import { Pop, gridKeys } from './Pop'

const THEME_KEYS = ['white', 'black', 'grey', 'blueGrey', 'blue', 'orange', 'grey2', 'gold', 'blue2', 'green'] as const
const STD_KEYS = ['darkRed', 'red', 'orange', 'yellow', 'lightGreen', 'green', 'lightBlue', 'blue', 'darkBlue', 'purple'] as const
const RECENT_KEY = 'momentum.sheets.recentColors'

export function readRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string' && /^#[0-9A-F]{6}$/i.test(x)).slice(0, 8) : [] } catch { return [] }
}
export function rememberColor(c: string) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([c, ...readRecent().filter(x => x !== c)].slice(0, 8))) } catch { /* private mode */ }
}

export function ColorPicker({ anchor, kind, current, onPick, onClose }: {
  anchor: HTMLElement
  kind: 'color' | 'fill'
  current: string | null
  /** null = Automatic (text) or No fill. */
  onPick(c: string | null): void
  onClose(): void
}) {
  const t = useTranslations('sheets.format')
  const recent = readRecent()
  const pick = (c: string | null) => { if (c) rememberColor(c); onPick(c); onClose() }
  const sw = (c: string, name: string) => (
    <button key={name + c} type="button" className={`fx-fmt-sw${current === c ? ' is-cur' : ''}`} style={{ background: c }}
            aria-label={name} title={name} aria-pressed={current === c} data-pick={c} onClick={() => pick(c)} />
  )
  const label = kind === 'fill' ? t('ctl.fill') : t('ctl.textColor')
  return (
    <Pop anchor={anchor} label={label} onClose={onClose} attr="data-color-picker">
      <div className="fx-fmt-cp">
        <button type="button" className="fx-fmt-auto" data-pick="" data-autofocus="" onClick={() => pick(null)}>
          <i className={kind === 'fill' ? 'is-none' : 'is-auto'} aria-hidden="true" />{kind === 'fill' ? t('color.noFill') : t('color.auto')}
        </button>
        <h5>{t('color.theme')}</h5>
        <div className="fx-fmt-swg" role="group" aria-label={t('color.theme')} onKeyDown={e => gridKeys(e, 10)}>
          {THEME_COLORS.map((c, i) => sw(c, t(`color.themeNames.${THEME_KEYS[i]}`)))}
          {[0, 1, 2, 3, 4].flatMap(row => THEME_COLORS.map((c, i) => {
            const f = themeShades(i)[row], x = tint(c, f)
            const name = t(f >= 0 ? 'color.lighter' : 'color.darker', { name: t(`color.themeNames.${THEME_KEYS[i]}`), n: Math.round(Math.abs(f) * 100) })
            return sw(x, name)
          }))}
        </div>
        <h5>{t('color.standard')}</h5>
        <div className="fx-fmt-swg" role="group" aria-label={t('color.standard')} onKeyDown={e => gridKeys(e, 10)}>
          {STANDARD_COLORS.map((c, i) => sw(c, t(`color.stdNames.${STD_KEYS[i]}`)))}
        </div>
        {recent.length > 0 && (
          <>
            <h5>{t('color.recent')}</h5>
            <div className="fx-fmt-swg" role="group" aria-label={t('color.recent')} onKeyDown={e => gridKeys(e, 10)}>
              {recent.map(c => sw(c, c))}
            </div>
          </>
        )}
        <label className="fx-fmt-more">
          <input type="color" defaultValue={current ?? (kind === 'fill' ? '#FFC000' : '#C00000')} aria-label={t('color.more')}
                 onChange={e => { const c = e.target.value.toUpperCase(); rememberColor(c); onPick(c) }} />
          {t('color.more')}
        </label>
      </div>
    </Pop>
  )
}
