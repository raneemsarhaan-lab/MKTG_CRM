'use client'

/**
 * Stage 3's menus and dialogs (spec 015 US5, design: Stage 3 tools):
 * - Cell Styles ▾ and Format as Table ▾ galleries (FR-030, FR-031);
 * - the filter menu on a heading (FR-046);
 * - Sort, New rule and Manage rules dialogs (FR-032, FR-045).
 * The sheets carry out what they send over the format bus.
 */
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { CellStyle, ColFilter, ConditionalRule, FilterOp, RuleArgs, RuleKind, SortKey } from '@/types/index'
import { RULE_KINDS } from '@/types/index'
import { toCss } from '@/lib/sheet-format'
import { BAR_COLORS, CELL_STYLES, DEFAULT_BAR, FILTER_OPS, RULE_LOOKS, SCALES, SORT_COLOR, TABLE_LEVELS, TABLE_STYLES, barCss, tableLook } from '@/lib/sheet-rules'
import { Modal } from '../Dialogs'
import { Pop, gridKeys } from './Pop'
import { sendFormat, type FormatSource, type FormatState } from './bus'

const cssOf = (s: CellStyle | null) => { const c = toCss(s); return { ...c.cell, ...(c.border ?? {}) } }

// ─── Cell Styles ▾ ───────────────────────────────────────────────────────────

export function CellStylesMenu({ anchor, target, onClose }: { anchor: HTMLElement; target: FormatSource; onClose(): void }) {
  const t = useTranslations('sheets.format.st3')
  return (
    <Pop anchor={anchor} label={t('cellStyles')} onClose={onClose} attr="data-cell-styles" role="menu">
      <div className="fx-st-gallery is-styles" onKeyDown={e => gridKeys(e, 3)}>
        {CELL_STYLES.map((s, i) => (
          <button key={s.key} type="button" role="menuitem" className="fx-st-cell" data-cell-style={s.key} data-autofocus={i === 0 ? '' : undefined}
                  style={{ ...cssOf({ ...s.style, size: undefined }) }}
                  onClick={() => { sendFormat(target, { kind: 'cellStyle', key: s.key }); onClose() }}>
            {t(`styles.${s.key}`)}
          </button>
        ))}
      </div>
    </Pop>
  )
}

// ─── Format as Table ▾ ───────────────────────────────────────────────────────

export function TableMenu({ anchor, target, state, onClose }: { anchor: HTMLElement; target: FormatSource; state: FormatState | null; onClose(): void }) {
  const t = useTranslations('sheets.format.st3')
  const off = state?.tableOff ?? null
  return (
    <Pop anchor={anchor} label={t('table')} onClose={onClose} attr="data-table-menu">
      {off && <p className="fx-st-why">{off}</p>}
      {TABLE_LEVELS.map(level => (
        <div key={level}>
          <h5 className="fx-st-h">{t(`levels.${level}`)}</h5>
          <div className="fx-st-gallery is-tables" onKeyDown={e => gridKeys(e, 6)}>
            {TABLE_STYLES.filter(s => s.level === level).map((s, i) => (
              <button key={s.key} type="button" className={`fx-st-table${state?.table?.style === s.key ? ' is-cur' : ''}`} data-table-style={s.key}
                      aria-label={`${t(`levels.${level}`)} ${i + 1}`} aria-disabled={off ? true : undefined}
                      data-autofocus={level === 'light' && i === 0 ? '' : undefined}
                      onClick={() => { if (off) return; sendFormat(target, { kind: 'table', style: s.key }); onClose() }}>
                {[0, 1, 2, 3].map(r => <i key={r} style={{ background: tableLook({ style: s.key, header: true, banded: true }, r, 0, 4)?.fill ?? 'var(--inbox-panel)' }} />)}
              </button>
            ))}
          </div>
        </div>
      ))}
      {state?.table && !off && (
        <button type="button" className="fx-st-row" data-table-off="" onClick={() => { sendFormat(target, { kind: 'tableOff' }); onClose() }}>{t('toRange')}</button>
      )}
    </Pop>
  )
}

// ─── the filter menu on a heading (FR-046) ───────────────────────────────────

export interface FilterMenuProps {
  anchor: HTMLElement
  title: string
  values: { value: string; n: number }[]
  fills: string[]
  current?: ColFilter
  onSort(dir: 'asc' | 'desc'): void
  onApply(f: ColFilter | null): void
  onClose(): void
}

export function FilterMenu(p: FilterMenuProps) {
  const t = useTranslations('sheets.format.st3')
  const all = p.values.map(v => v.value)
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(p.current?.values ?? all))
  const [search, setSearch] = useState('')
  const [color, setColor] = useState<string | undefined>(p.current?.color)
  const [op, setOp] = useState<FilterOp | ''>(p.current?.cond?.op ?? '')
  const [a, setA] = useState(p.current?.cond?.a ?? '')
  const [b, setB] = useState(p.current?.cond?.b ?? '')
  const shown = useMemo(() => p.values.filter(v => !search || (v.value || t('blanks')).toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice(0, 500), [p.values, search, t])
  const allOn = shown.every(v => ticked.has(v.value))
  function ok() {
    const f: ColFilter = {}
    if (ticked.size < all.length) f.values = all.filter(v => ticked.has(v))
    if (color !== undefined) { f.color = color; f.on = 'fill' }
    if (op) f.cond = { op, a, b }
    p.onApply(Object.keys(f).length ? f : null)
  }
  const needsA = op && op !== 'blank' && op !== 'notBlank'
  return (
    <Pop anchor={p.anchor} label={t('filterOf', { col: p.title })} onClose={p.onClose} attr="data-filter-menu">
      <div className="fx-flt">
        <button type="button" className="fx-st-row" data-flt-sort="asc" data-autofocus="" onClick={() => p.onSort('asc')}>{t('sortAZ')}</button>
        <button type="button" className="fx-st-row" data-flt-sort="desc" onClick={() => p.onSort('desc')}>{t('sortZA')}</button>
        <hr />
        {p.fills.length > 0 && (
          <div className="fx-flt-colors" role="group" aria-label={t('byColor')}>
            <span>{t('byColor')}</span>
            {p.fills.slice(0, 12).map(c => (
              <button key={c} type="button" className={`fx-flt-sw${color === c ? ' is-cur' : ''}`} style={{ background: c }} data-flt-color={c}
                      aria-pressed={color === c} aria-label={`${t('byColor')} ${c}`} onClick={() => setColor(x => (x === c ? undefined : c))} />
            ))}
          </div>
        )}
        <label className="fx-fc-fld"><span>{t('condition')}</span>
          <select value={op} data-flt-op="" onChange={e => setOp(e.target.value as FilterOp | '')}>
            <option value="">{t('ops.none')}</option>
            {FILTER_OPS.map(o => <option key={o} value={o}>{t(`ops.${o}`)}</option>)}
          </select>
        </label>
        {needsA && <input type="text" className="fx-flt-in" value={a} data-flt-a="" dir="auto" aria-label={t('value')} onChange={e => setA(e.target.value)} />}
        {op === 'between' && <input type="text" className="fx-flt-in" value={b} data-flt-b="" dir="auto" aria-label={t('and')} onChange={e => setB(e.target.value)} />}
        <hr />
        <input type="search" className="fx-flt-in" value={search} placeholder={t('search')} aria-label={t('search')} onChange={e => setSearch(e.target.value)} />
        <div className="fx-flt-list">
          <label className="fx-fc-chk"><input type="checkbox" checked={allOn} data-flt-all=""
                 onChange={() => setTicked(s => { const n = new Set(s); for (const v of shown) { if (allOn) n.delete(v.value); else n.add(v.value) } return n })} />{t('selectAll')}</label>
          {shown.map(v => (
            <label key={v.value} className="fx-fc-chk"><input type="checkbox" checked={ticked.has(v.value)} data-flt-value={v.value}
                   onChange={() => setTicked(s => { const n = new Set(s); if (n.has(v.value)) n.delete(v.value); else n.add(v.value); return n })} />
              <span dir="auto">{v.value || t('blanks')}</span> <small>({v.n})</small></label>
          ))}
        </div>
        <div className="fx-flt-foot">
          <button type="button" data-flt-clear="" onClick={() => p.onApply(null)}>{t('clearFrom', { col: p.title })}</button>
          <button type="button" className="is-go" data-flt-ok="" onClick={ok}>{t('ok')}</button>
        </div>
      </div>
    </Pop>
  )
}

// ─── Sort (FR-045) ───────────────────────────────────────────────────────────

export function SortDialog({ state, target, onClose }: { state: FormatState; target: FormatSource; onClose(): void }) {
  const t = useTranslations('sheets.format.st3')
  const cols = state.sortCols ?? []
  const [levels, setLevels] = useState<SortKey[]>([{ col: cols.find(c => c.key === state.colKey)?.key ?? cols[0]?.key ?? '', dir: 'asc' }])
  const [header, setHeader] = useState(state.sortHeader ?? false)
  const set = (i: number, patch: Partial<SortKey>) => setLevels(l => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <Modal title={t('sortTitle')} onCancel={onClose} attr="data-sort-dialog">
      <div className="fx-sort-grid">
        {levels.map((k, i) => (
          <div key={i} className="fx-sort-row" data-sort-level={i}>
            <span className="fx-sort-lab">{i === 0 ? t('sortBy') : t('thenBy')}</span>
            <label className="fx-fc-fld"><span className="sr-only">{t('column')}</span>
              <select value={k.col} data-sort-col={i} onChange={e => set(i, { col: e.target.value })}>
                {cols.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select></label>
            <label className="fx-fc-fld"><span className="sr-only">{t('sortOn')}</span>
              <select value={k.on ?? 'value'} data-sort-on={i} onChange={e => set(i, { on: e.target.value as SortKey['on'], color: e.target.value === 'value' ? undefined : k.color ?? SORT_COLOR })}>
                <option value="value">{t('onValue')}</option><option value="fill">{t('onFill')}</option><option value="color">{t('onColor')}</option>
              </select></label>
            {k.on && k.on !== 'value'
              ? <label className="fx-fc-fld"><span className="sr-only">{t('colour')}</span><input type="color" value={k.color ?? SORT_COLOR} onChange={e => set(i, { color: e.target.value.toUpperCase() })} /></label>
              : null}
            <label className="fx-fc-fld"><span className="sr-only">{t('order')}</span>
              <select value={k.dir} data-sort-dir={i} onChange={e => set(i, { dir: e.target.value as 'asc' | 'desc' })}>
                <option value="asc">{k.on && k.on !== 'value' ? t('onTop') : t('az')}</option>
                <option value="desc">{k.on && k.on !== 'value' ? t('onBottom') : t('za')}</option>
              </select></label>
            {i > 0 && <button type="button" className="fx-cmt-ico" aria-label={t('delLevel')} title={t('delLevel')} onClick={() => setLevels(l => l.filter((_, j) => j !== i))}>✕</button>}
          </div>
        ))}
      </div>
      <div className="fx-sh-dialog-row is-split">
        <span>
          <button type="button" data-sort-add="" disabled={levels.length >= 5} onClick={() => setLevels(l => [...l, { col: cols[0]?.key ?? '', dir: 'asc' }])}>{t('addLevel')}</button>
          <label className="fx-fc-chk"><input type="checkbox" checked={header} data-sort-header="" onChange={e => setHeader(e.target.checked)} />{t('hasHeader')}</label>
        </span>
        <span>
          <button type="button" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="is-go" data-ok="" onClick={() => { sendFormat(target, { kind: 'sort', keys: levels.filter(l => l.col), header }); onClose() }}>{t('ok')}</button>
        </span>
      </div>
    </Modal>
  )
}

// ─── conditional formatting (FR-032) ─────────────────────────────────────────

const lookKey = (s: CellStyle | null) => RULE_LOOKS.find(l => JSON.stringify(l.style) === JSON.stringify(s))?.key ?? 'red'

/** A rule in a few words: "Greater than 100", "Data bar". */
export function useRuleName() {
  const t = useTranslations('sheets.format.st3')
  return (r: Pick<ConditionalRule, 'kind' | 'args'>) => {
    const a = r.args ?? {}
    switch (r.kind) {
      case 'between': return t('names.between', { a: a.a ?? '', b: a.b ?? '' })
      case 'date': return t('names.date', { when: t(`when.${a.when ?? 'past'}`) })
      case 'top': case 'bottom': return t(`names.${r.kind}`, { n: a.n ?? 10, pct: a.percent ? '%' : '' })
      case 'dup': case 'unique': case 'bar': case 'scale': return t(`names.${r.kind}`)
      default: return t(`names.${r.kind}`, { a: a.a ?? '' })
    }
  }
}

/** A rule's look as a small sample. */
export function RuleSample({ rule }: { rule: Pick<ConditionalRule, 'kind' | 'args' | 'style'> }) {
  if (rule.kind === 'bar') return <span className="fx-rule-sample" style={barCss({ pct: 0.6, color: rule.args.colors?.[0] || DEFAULT_BAR }, false)}>AaBbCc</span>
  if (rule.kind === 'scale') { const [x, y, z] = rule.args.colors ?? SCALES[0].colors; return <span className="fx-rule-sample" style={{ background: `linear-gradient(90deg, ${x}, ${y || x}, ${z})` }}>AaBbCc</span> }
  return <span className="fx-rule-sample" style={cssOf(rule.style)}>AaBbCc</span>
}

export function RuleDialog({ state, target, start, edit, onSave, onClose }: {
  state: FormatState
  target: FormatSource
  /** The kind picked from Conditional Formatting ▾. */
  start?: RuleKind
  /** Editing a rule from Manage rules: Save hands it back instead of adding a new one. */
  edit?: ConditionalRule
  onSave?(rule: ConditionalRule): void
  onClose(): void
}) {
  const t = useTranslations('sheets.format.st3')
  const name = useRuleName()
  const [kind, setKind] = useState<RuleKind>(edit?.kind ?? start ?? 'gt')
  const [args, setArgs] = useState<RuleArgs>(edit?.args ?? { a: '', when: 'past', n: 10, colors: [] })
  const [look, setLook] = useState(lookKey(edit?.style ?? null))
  const [scale, setScale] = useState(SCALES.find(s => JSON.stringify(s.colors) === JSON.stringify(edit?.args.colors))?.key ?? 'gyr')
  const [bar, setBar] = useState(edit?.kind === 'bar' ? edit.args.colors?.[0] ?? DEFAULT_BAR : DEFAULT_BAR)
  const set = (patch: Partial<RuleArgs>) => setArgs(a => ({ ...a, ...patch }))
  const style = kind === 'bar' || kind === 'scale' ? null : RULE_LOOKS.find(l => l.key === look)!.style
  const final: RuleArgs = kind === 'bar' ? { colors: [bar] } : kind === 'scale' ? { colors: SCALES.find(s => s.key === scale)!.colors }
    : kind === 'between' ? { a: args.a ?? '', b: args.b ?? '' } : kind === 'date' ? { when: args.when ?? 'past' }
    : kind === 'top' || kind === 'bottom' ? { n: args.n ?? 10, ...(args.percent ? { percent: true } : {}) }
    : kind === 'dup' || kind === 'unique' ? {} : { a: args.a ?? '' }
  const ready = !['gt', 'lt', 'eq', 'contains'].includes(kind) || !!final.a?.trim()
  function save() {
    if (!ready) return
    if (edit && onSave) onSave({ ...edit, kind, args: final, style })
    else sendFormat(target, { kind: 'ruleNew', rule: { kind, args: final, style } })
    onClose()
  }
  return (
    <Modal title={edit ? t('editRule') : t('newRule')} onCancel={onClose} attr="data-rule-dialog">
      <div className="fx-rule">
        <div className="fx-fc-fld"><span>{t('ruleKind')}</span>
          <div className="fx-fc-lb" role="listbox" aria-label={t('ruleKind')}>
            {RULE_KINDS.map(k => (
              <button key={k} type="button" role="option" aria-selected={kind === k} data-rule-kind={k} onClick={() => setKind(k)}>{t(`kinds.${k}`)}</button>
            ))}
          </div>
        </div>
        <div className="fx-rule-side">
          {['gt', 'lt', 'eq', 'contains', 'between'].includes(kind) && (
            <label className="fx-fc-fld"><span>{kind === 'between' ? t('from') : t('value')}</span><input type="text" value={args.a ?? ''} data-rule-a="" dir="auto" onChange={e => set({ a: e.target.value })} /></label>
          )}
          {kind === 'between' && <label className="fx-fc-fld"><span>{t('and')}</span><input type="text" value={args.b ?? ''} data-rule-b="" dir="auto" onChange={e => set({ b: e.target.value })} /></label>}
          {kind === 'date' && (
            <label className="fx-fc-fld"><span>{t('dateIs')}</span>
              <select value={args.when ?? 'past'} data-rule-when="" onChange={e => set({ when: e.target.value as RuleArgs['when'] })}>
                {(['past', 'today', 'future', 'yesterday', 'tomorrow', 'last7', 'next7'] as const).map(w => <option key={w} value={w}>{t(`when.${w}`)}</option>)}
              </select></label>
          )}
          {(kind === 'top' || kind === 'bottom') && (
            <div className="fx-fc-two">
              <label className="fx-fc-fld"><span>{t('howMany')}</span><input type="number" min={1} max={1000} value={args.n ?? 10} data-rule-n="" onChange={e => set({ n: Number(e.target.value) || 1 })} /></label>
              <label className="fx-fc-chk"><input type="checkbox" checked={!!args.percent} onChange={e => set({ percent: e.target.checked })} />{t('percent')}</label>
            </div>
          )}
          {kind === 'bar' && (
            <div className="fx-fc-fld"><span>{t('barColour')}</span>
              <div className="fx-rule-swatches">{BAR_COLORS.map(c => <button key={c} type="button" className={`fx-flt-sw${bar === c ? ' is-cur' : ''}`} style={{ background: c }} aria-pressed={bar === c} aria-label={c} onClick={() => setBar(c)} />)}</div>
            </div>
          )}
          {kind === 'scale' && (
            <label className="fx-fc-fld"><span>{t('scaleColours')}</span>
              <select value={scale} data-rule-scale="" onChange={e => setScale(e.target.value)}>
                {SCALES.map(s => <option key={s.key} value={s.key}>{t(`scales.${s.key}`)}</option>)}
              </select></label>
          )}
          {style !== null && (
            <label className="fx-fc-fld"><span>{t('look')}</span>
              <select value={look} data-rule-look="" onChange={e => setLook(e.target.value)}>
                {RULE_LOOKS.map(l => <option key={l.key} value={l.key}>{t(`looks.${l.key}`)}</option>)}
              </select></label>
          )}
          <p className="fx-fc-hint">{t('appliesTo')}: <b dir="auto">{edit ? (edit as ConditionalRule & { where?: string }).where ?? '' : state.cell}</b></p>
          <div className="fx-fc-sample"><small>{t('preview')}</small><div className="fx-rule-prev"><RuleSample rule={{ kind, args: final, style }} /> <span>{name({ kind, args: final })}</span></div></div>
        </div>
      </div>
      <div className="fx-sh-dialog-row">
        <button type="button" onClick={onClose}>{t('cancel')}</button>
        <button type="button" className="is-go" data-ok="" disabled={!ready} onClick={save}>{t('ok')}</button>
      </div>
    </Modal>
  )
}

export function ManageRulesDialog({ state, target, onNew, onClose }: { state: FormatState; target: FormatSource; onNew(): void; onClose(): void }) {
  const t = useTranslations('sheets.format.st3')
  const name = useRuleName()
  const [list, setList] = useState<(ConditionalRule & { where: string })[]>(state.rules ?? [])
  const [sel, setSel] = useState(0)
  const [editing, setEditing] = useState<(ConditionalRule & { where: string }) | null>(null)
  const move = (d: -1 | 1) => setList(l => {
    const j = sel + d
    if (j < 0 || j >= l.length) return l
    const n = l.slice();[n[sel], n[j]] = [n[j], n[sel]]
    setSel(j)
    return n
  })
  function ok() {
    sendFormat(target, { kind: 'rulesSet', rules: list.map(({ where: _w, ...r }, i) => ({ ...r, priority: i })) })
    onClose()
  }
  if (editing) {
    return <RuleDialog state={state} target={target} edit={editing}
                       onSave={r => setList(l => l.map(x => (x.id === r.id ? { ...r, where: x.where } : x)))} onClose={() => setEditing(null)} />
  }
  return (
    <Modal title={t('manage')} onCancel={onClose} attr="data-rules-dialog">
      <div className="fx-sh-dialog-row is-start">
        <button type="button" data-rules-new="" onClick={() => { onClose(); onNew() }}>{t('newRule')}</button>
        <button type="button" data-rules-edit="" disabled={!list[sel]} onClick={() => setEditing(list[sel])}>{t('edit')}</button>
        <button type="button" data-rules-del="" disabled={!list[sel]} onClick={() => { setList(l => l.filter((_, i) => i !== sel)); setSel(s => Math.max(0, s - 1)) }}>{t('del')}</button>
        <button type="button" data-rules-up="" aria-label={t('up')} title={t('up')} disabled={sel <= 0} onClick={() => move(-1)}>↑</button>
        <button type="button" data-rules-down="" aria-label={t('down')} title={t('down')} disabled={sel >= list.length - 1} onClick={() => move(1)}>↓</button>
      </div>
      {list.length === 0 ? <p className="fx-fc-hint">{t('noRules')}</p> : (
        <div className="fx-rules-wrap">
          <table className="fx-rules">
            <thead><tr><th scope="col">{t('ruleCol')}</th><th scope="col">{t('look')}</th><th scope="col">{t('appliesTo')}</th></tr></thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={r.id} aria-selected={i === sel} className={i === sel ? 'is-sel' : ''} data-rule-row={i} tabIndex={0}
                    onClick={() => setSel(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(i) } }}>
                  <td>{name(r)}</td><td><RuleSample rule={r} /></td><td dir="auto">{r.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="fx-sh-dialog-row">
        <button type="button" onClick={onClose}>{t('cancel')}</button>
        <button type="button" className="is-go" data-ok="" onClick={ok}>{t('ok')}</button>
      </div>
    </Modal>
  )
}
