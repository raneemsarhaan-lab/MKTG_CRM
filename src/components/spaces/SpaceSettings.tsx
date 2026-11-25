'use client'

/**
 * Space settings (spec 024): how one Space works — basics, flow, new tasks,
 * task panel sections, views, linking and hand-off, rules and alerts. Opened
 * from the Space header by admins and superusers. Every control saves as it
 * changes; a flow that doesn't hold together is refused with what is wrong.
 */
import { BUILT_IN_CUSTOM, fieldOnIn, type CatalogKind } from '@/lib/field-catalog'
import { FieldGlyph } from '@/components/sheet/AddColumnPanel'
import { setFieldOrder, setFieldStandard } from '@/actions/fields'
import type { TaskFieldDef, TaskTypeFieldLink } from '@/types/index'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { StageId, TeamSpace } from '@/types/index'
import { ALL_STAGES } from '@/lib/stage-meta'
import { PIPE } from '@/lib/pipeline-tokens'
import { PRIORITIES } from '@/lib/priorities'
import { BUILT_INS } from '@/lib/sheet-columns'
import { originalName, stagesForSpace } from '@/lib/space-stages'
import { PANEL_SECTIONS, fieldRule, ownsStage, rangeOf, validateFlow, type PanelSection, type SpaceSettings } from '@/lib/space-settings'
import { setSpaceMembers, updateSpace, updateSpaceSettings } from '@/actions/spaces'
import { Modal } from '@/components/sheets/Dialogs'
import { SpaceStagesPanel } from './SpaceStages'
import type { BoardData } from '@/components/views/types'

const SECTIONS = ['basics', 'flow', 'newTasks', 'panel', 'views', 'linking', 'rules'] as const
type Section = typeof SECTIONS[number]
const REVIEW: StageId[] = ['c-final', 'c-check', 'd-check', 'final-check']

/** Spec 026: a Space's sheet is the sheet of rows; these are its own columns (Title always shows; Archive is its row control). */
const ROW_COLUMNS = BUILT_INS.content.filter(c => c.key !== 'archive')

export function SpaceSettingsButton({ space, data }: { space: TeamSpace; data: BoardData }) {
  const t = useTranslations('spaces.config')
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" data-space-settings-open onClick={() => setOpen(true)}
        style={{ border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 9, padding: '6px 11px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: PIPE.ink }}>
        {t('open')}
      </button>
      {open && <SpaceSettingsPanel space={space} data={data} onClose={() => setOpen(false)} />}
    </>
  )
}

export function SpaceSettingsPanel({ space, data, onClose }: { space: TeamSpace; data: BoardData; onClose(): void }) {
  const t = useTranslations('spaces.config')
  const locale = useLocale()
  const router = useRouter()
  const [busy, start] = useTransition()
  const [tab, setTab] = useState<Section>('basics')
  const [s, setS] = useState<SpaceSettings>(space.settings)
  const [name, setName] = useState(space.name)
  const [color, setColor] = useState(space.color)
  const [role, setRole] = useState(space.default_assignee_role ?? '')
  const [memberIds, setMemberIds] = useState(() => data.spaceMembers.filter(r => r.space_id === space.id).map(r => r.member_id))
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [stagesOpen, setStagesOpen] = useState(false)

  const stageName = (id: string) => originalName(id, locale)
  const entries = useMemo(() => stagesForSpace(space.id, data.spaceStages, locale), [space.id, data.spaceStages, locale])
  const ownName = (id: string) => entries.filter(e => e.stage_id === id).map(e => e.name).join(' / ') || stageName(id)
  const roles = useMemo(() => [...new Set(data.members.map(m => m.role).filter(Boolean))].sort(), [data.members])
  const others = data.spaces.filter(x => x.id !== space.id)
  const types = data.contentTypes.map(c => c.label)
  const inTypes = s.allowed_types.length ? s.allowed_types : types
  // Fields (25 Nov 2026): every custom field, ready-made and from the library, in this Space's order.
  const tfs = useTranslations('fieldSystem')
  const promoted = data.standardFields
  const lead = data.currentUser.access === 'admin' || data.currentUser.access === 'superuser'
  const fieldRows = useMemo(() => {
    const rows = [
      ...BUILT_IN_CUSTOM.map(b => ({ key: b.key, en: b.en, name: locale === 'ar' ? b.ar : b.en, kind: b.kind as CatalogKind, field: null as TaskFieldDef | null, link: null as TaskTypeFieldLink | null })),
      ...data.taskFields.filter(f => !f.retired).map(f => {
        const l = data.typeFields.find(x => x.field_id === f.id && inTypes.includes(x.type_label))
        return { key: `f:${f.id}`, en: f.name_en, name: locale === 'ar' && f.name_ar ? f.name_ar : f.name_en, kind: f.kind as CatalogKind, field: f as TaskFieldDef | null,
          link: (l ?? { type_label: '', field_id: f.id, required_from: null, default_value: null, position: f.position }) as TaskTypeFieldLink | null }
      }),
    ]
    const order = s.field_order
    const rank = (k: string, i: number) => { const j = order.indexOf(k); return j < 0 ? 1000 + i : j }
    return rows.map((r, i) => ({ r, n: rank(r.key, i) })).sort((a, b) => a.n - b.n).map(x => x.r)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.taskFields, data.typeFields, s.field_order, locale, inTypes.join('|')])

  const done = (r: { success: boolean; error?: string; problems?: string[] }) => {
    if (r.success) { setNote({ ok: true, text: t('saved') }); router.refresh(); return true }
    const p = r.problems?.[0]
    setNote({ ok: false, text: p ? t(`flowProblem.${p}`) : r.error === 'not_authorized' ? t('notAllowed') : t('failed') })
    return false
  }
  /** Save part of the settings; the screen keeps the change only when the server takes it. */
  function save(patch: Parameters<typeof updateSpaceSettings>[1], next: SpaceSettings) {
    const before = s
    setS(next)
    setNote(null)
    start(async () => {
      const r = await updateSpaceSettings(space.id, patch).catch(() => ({ success: false as const, error: 'generic' }))
      if (!done(r)) setS(before)
    })
  }
  const run = (fn: () => Promise<{ success: boolean; error?: string }>) => { setNote(null); start(async () => { done(await fn().catch(() => ({ success: false, error: 'generic' }))) }) }
  const set = <K extends keyof SpaceSettings>(k: K, v: SpaceSettings[K]) => save({ [k]: v } as Parameters<typeof updateSpaceSettings>[1], { ...s, [k]: v })
  const setFlow = (patch: Partial<SpaceSettings['flow']>) => {
    const flow = { ...s.flow, ...patch }
    const problems = validateFlow(flow)
    if (problems.length) { setS({ ...s, flow }); setNote({ ok: false, text: t(`flowProblem.${problems[0]}`) }); return }
    save({ flow }, { ...s, flow })
  }
  const toggle = (list: string[], v: string, on: boolean) => (on ? [...new Set([...list, v])] : list.filter(x => x !== v))

  const label: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 700, color: PIPE.ink }
  const input: React.CSSProperties = { border: `1px solid ${PIPE.border}`, borderRadius: 8, padding: '6px 9px', fontFamily: 'inherit', fontSize: 13, background: '#FFFFFF', color: PIPE.ink, fontWeight: 500 }
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }
  const hint: React.CSSProperties = { fontSize: 12.5, color: PIPE.textMuted, margin: 0, fontWeight: 400 }
  const check: React.CSSProperties = { display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 500 }
  const th: React.CSSProperties = { textAlign: 'start', fontSize: 12, fontWeight: 700, color: PIPE.textMuted, padding: '4px 6px' }
  const td: React.CSSProperties = { padding: '4px 6px', fontSize: 13, verticalAlign: 'middle' }

  const stageSelect = (value: string | null, onChange: (v: StageId | null) => void, opts: { none?: string; attr: string; ariaLabel: string }) => (
    <select value={value ?? ''} style={input} aria-label={opts.ariaLabel} {...{ [opts.attr]: '' }} onChange={e => onChange((e.target.value || null) as StageId | null)}>
      {opts.none !== undefined && <option value="">{opts.none}</option>}
      {ALL_STAGES.map(id => <option key={id} value={id}>{stageName(id)}</option>)}
    </select>
  )
  const roleChecks = (list: string[], onChange: (next: string[]) => void, attr: string) => (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
      {roles.map(r => (
        <label key={r} style={check}><input type="checkbox" checked={list.includes(r)} {...{ [attr]: r }} onChange={e => onChange(toggle(list, r, e.target.checked))} />{r}</label>
      ))}
    </span>
  )

  const range = rangeOf(s.flow)

  return (
    <Modal title={t('title', { space: space.name })} onCancel={onClose} attr="data-space-settings" width={860}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 170px) minmax(0, 1fr)', gap: 16, minHeight: 380 }}>
        <div role="tablist" aria-orientation="vertical" aria-label={t('sections')} style={{ display: 'grid', gap: 2, alignContent: 'start' }}>
          {SECTIONS.map(k => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} data-space-settings-tab={k} onClick={() => { setTab(k); setNote(null) }}
              style={{ textAlign: 'start', border: 'none', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontSize: 13, fontWeight: tab === k ? 800 : 600, cursor: 'pointer', background: tab === k ? PIPE.surface : 'transparent', color: PIPE.ink }}>
              {t(`tab.${k}`)}
            </button>
          ))}
        </div>
        <div role="tabpanel" data-space-settings-panel={tab} style={{ display: 'grid', gap: 14, alignContent: 'start', maxHeight: 'min(62vh, 640px)', overflowY: 'auto', paddingInlineEnd: 6 }}>
          {tab === 'basics' && <>
            <div style={grid2}>
              <label style={label}>{t('name')}
                <input style={input} value={name} maxLength={60} data-space-name onChange={e => setName(e.target.value)}
                  onBlur={() => name.trim() && name.trim() !== space.name && run(() => updateSpace(space.id, { name }))} />
              </label>
              <label style={label}>{t('nameAr')}
                <input style={input} dir="rtl" defaultValue={s.name_ar ?? ''} maxLength={60} data-space-name-ar
                  onBlur={e => (e.target.value.trim() || null) !== s.name_ar && set('name_ar', e.target.value.trim() || null)} />
              </label>
              <label style={label}>{t('icon')}
                <input style={{ ...input, width: 80 }} defaultValue={s.icon ?? ''} maxLength={8} data-space-icon
                  onBlur={e => (e.target.value.trim() || null) !== s.icon && set('icon', e.target.value.trim() || null)} />
              </label>
              <label style={label}>{t('color')}
                <input type="color" value={color} data-space-color style={{ width: 44, height: 32, border: 'none', background: 'none', padding: 0 }}
                  onChange={e => setColor(e.target.value)} onBlur={() => color !== space.color && run(() => updateSpace(space.id, { color }))} />
              </label>
            </div>
            <label style={label}>{t('owner')}
              <select style={{ ...input, maxWidth: 320 }} value={s.owner_id ?? ''} data-space-owner
                onChange={e => { const v = e.target.value || null; if (v && !memberIds.includes(v)) setMemberIds([...memberIds, v]); set('owner_id', v) }}>
                <option value="">{t('ownerNone')}</option>
                {data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <span style={{ color: PIPE.textMuted, fontSize: 12, fontWeight: 500 }}>{t('ownerHint')}</span>
            </label>
            <label style={label}>{t('visibility')}
              <select style={{ ...input, maxWidth: 320 }} value={s.visibility} data-space-visibility onChange={e => set('visibility', e.target.value as SpaceSettings['visibility'])}>
                <option value="members">{t('visibleMembers')}</option>
                <option value="everyone">{t('visibleEveryone')}</option>
              </select>
            </label>
            <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              <legend style={{ ...label, padding: 0 }}>{t('members', { n: memberIds.length })}</legend>
              <span style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 4 }}>
                {data.members.map(m => (
                  <label key={m.id} style={check}>
                    <input type="checkbox" checked={memberIds.includes(m.id)} data-space-member={m.id}
                      onChange={e => { const next = toggle(memberIds, m.id, e.target.checked); setMemberIds(next); run(() => setSpaceMembers(space.id, next)) }} />
                    {m.name} <span style={{ color: PIPE.textMuted, fontSize: 12 }}>{m.role}</span>
                  </label>
                ))}
              </span>
            </fieldset>
          </>}

          {tab === 'flow' && <>
            <p style={hint}>{t('flowHelp')}</p>
            <div style={grid2}>
              <label style={label}>{t('startsAt')}{stageSelect(s.flow.start, v => v && setFlow({ start: v }), { attr: 'data-flow-start', ariaLabel: t('startsAt') })}</label>
              <label style={label}>{t('endsAt')}{stageSelect(s.flow.end, v => v && setFlow({ end: v }), { attr: 'data-flow-end', ariaLabel: t('endsAt') })}</label>
              <label style={label}>{t('handsOffAt')}{stageSelect(s.flow.handoff, v => setFlow(v ? { handoff: v } : { handoff: null, handoff_to: [], return: null }), { none: t('never'), attr: 'data-flow-handoff', ariaLabel: t('handsOffAt') })}</label>
              <label style={label}>{t('returnsAt')}{stageSelect(s.flow.return, v => setFlow({ return: v }), { none: t('doesNotReturn'), attr: 'data-flow-return', ariaLabel: t('returnsAt') })}</label>
            </div>
            {s.flow.handoff && (
              <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                <legend style={{ ...label, padding: 0 }}>{t('goesTo')}</legend>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                  {others.map(o => (
                    <label key={o.id} style={check}><input type="checkbox" checked={s.flow.handoff_to.includes(o.key)} data-flow-to={o.key}
                      onChange={e => setFlow({ handoff_to: toggle(s.flow.handoff_to, o.key, e.target.checked) })} />{o.name}</label>
                  ))}
                </span>
              </fieldset>
            )}
            <div style={{ borderInlineStart: `3px solid ${PIPE.border}`, paddingInlineStart: 10, display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>{t('shows')}</span>
              <span data-flow-range style={{ fontSize: 13 }}>{range.map(ownName).join(' → ')}</span>
              <span style={hint}>{t('slaStarts', { stage: ownName(s.flow.start) })}</span>
            </div>
            <div>
              <button type="button" data-space-stages-open onClick={() => setStagesOpen(true)}
                style={{ border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 9, padding: '6px 11px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: PIPE.ink }}>
                {t('stageNames')}
              </button>
            </div>
          </>}

          {tab === 'newTasks' && <>
            <div style={grid2}>
              <label style={label}>{t('newLabel')}
                <input style={input} defaultValue={s.new_label?.en ?? ''} maxLength={40} placeholder={t('newLabelDefault')} data-new-label
                  onBlur={e => { const en = e.target.value.trim(); if (en !== (s.new_label?.en ?? '')) set('new_label', en ? { en, ar: s.new_label?.ar || en } : null) }} />
              </label>
              <label style={label}>{t('newLabelAr')}
                <input style={input} dir="rtl" defaultValue={s.new_label?.ar ?? ''} maxLength={40} data-new-label-ar disabled={!s.new_label}
                  onBlur={e => { const ar = e.target.value.trim(); if (s.new_label && ar && ar !== s.new_label.ar) set('new_label', { ...s.new_label, ar }) }} />
              </label>
            </div>
            <p style={hint}>{t('newLabelHint')}</p>
            <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              <legend style={{ ...label, padding: 0 }}>{t('allowedTypes')}</legend>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                {types.map(ty => (
                  <label key={ty} style={check}><input type="checkbox" checked={inTypes.includes(ty)} data-allowed-type={ty}
                    onChange={e => { const next = toggle(inTypes, ty, e.target.checked); set('allowed_types', next.length === types.length ? [] : next) }} />{ty}</label>
                ))}
              </span>
            </fieldset>
            <div style={grid2}>
              <label style={label}>{t('defaultType')}
                <select style={input} value={s.default_type ?? ''} data-default-type onChange={e => set('default_type', e.target.value || null)}>
                  <option value="">{t('none')}</option>
                  {inTypes.map(ty => <option key={ty} value={ty}>{ty}</option>)}
                </select>
              </label>
              <label style={label}>{t('defaultAssignee')}
                <select style={input} value={role} data-default-role onChange={e => { setRole(e.target.value); run(() => updateSpace(space.id, { default_assignee_role: e.target.value || null })) }}>
                  <option value="">{t('none')}</option>
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label style={label}>{t('defaultPriority')}
                <select style={input} value={s.default_priority ?? ''} data-default-priority onChange={e => set('default_priority', e.target.value || null)}>
                  <option value="">{t('typeDefault')}</option>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p === 'None' ? t('noPriority') : p}</option>)}
                </select>
              </label>
              <label style={label}>{t('creators')}
                <select style={input} value={s.creators} data-creators onChange={e => set('creators', e.target.value as SpaceSettings['creators'])}>
                  <option value="everyone">{t('creatorsEveryone')}</option>
                  <option value="members">{t('creatorsMembers')}</option>
                  <option value="leads">{t('creatorsLeads')}</option>
                </select>
              </label>
            </div>
            <p style={hint}>{t('newOnly')}</p>
            <label style={check}><input type="checkbox" checked={s.child_rows} data-child-rows onChange={e => set('child_rows', e.target.checked)} />{t('childRows')}</label>
          </>}

          {tab === 'panel' && <>
            <p style={hint}>{t('panelHelp')}</p>
            {/* Fields (25 Nov 2026): every custom field — on or off in this Space, required here, its order in the panel; admins promote one to Standard. */}
            <table style={{ borderCollapse: 'collapse', width: '100%' }} data-space-fields>
              <thead><tr><th style={th}>{t('field')}</th><th style={th}>{tfs('onHereCol')}</th><th style={th}>{t('required')}</th><th style={th}>{t('requiredBefore')}</th><th style={th}><span className="fx-sheet-sr">{tfs('orderCol')}</span></th></tr></thead>
              <tbody>
                {fieldRows.map((row, i) => {
                  const promotedHere = promoted.includes(row.key)
                  const libField = row.field
                  const link = row.link
                  const rule = libField ? s.fields[libField.id] ?? {} : s.fields[row.key] ?? {}
                  const on = fieldOnIn(row.key, s.fields, promoted, libField)
                  const eff = link ? fieldRule(s, link) : { shown: on, before: null }
                  const mode = rule.required === true ? 'yes' : rule.required === false ? 'no' : 'type'
                  const setRule = (patch: typeof rule) => {
                    const next = { ...rule, ...patch }
                    const fields = { ...s.fields, [libField ? libField.id : row.key]: next }
                    save({ fields } as Parameters<typeof updateSpaceSettings>[1], { ...s, fields })
                  }
                  const move = (by: number) => {
                    const keys = fieldRows.map(r => r.key)
                    const j = i + by
                    if (j < 0 || j >= keys.length) return
                    ;[keys[i], keys[j]] = [keys[j], keys[i]]
                    setS({ ...s, field_order: keys })
                    run(() => setFieldOrder(space.id, keys))
                  }
                  return (
                    <tr key={row.key} data-space-field={row.en} style={{ borderTop: `1px solid ${PIPE.border}` }}>
                      <td style={{ ...td, fontWeight: 600 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <FieldGlyph kind={row.kind} tone={promotedHere ? 'standard' : 'custom'} />{row.name}
                        </span>
                        {lead && (
                          <button type="button" data-field-standard={promotedHere ? 'on' : 'off'} disabled={data.currentUser.access !== 'admin'}
                            onClick={() => run(() => setFieldStandard(row.key, !promotedHere))}
                            style={{ display: 'block', marginTop: 4, border: 'none', background: 'none', padding: 0, color: '#5B21D6', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {promotedHere ? tfs('makeCustom') : tfs('makeStandard')}
                          </button>
                        )}
                      </td>
                      <td style={td}>
                        {promotedHere
                          ? <span data-field-is-standard="" style={{ fontSize: 12, color: PIPE.textMuted }}>{tfs('standard')}</span>
                          : <input type="checkbox" aria-label={t('shownFor', { field: row.name })} checked={on} data-field-shown
                              onChange={e => { const v = e.target.checked; setRule({ shown: v }); }} />}
                      </td>
                      <td style={td}>
                        {libField ? (
                          <select style={input} aria-label={t('requiredFor', { field: row.name })} value={mode} data-field-required disabled={!on}
                            onChange={e => setRule({ required: (e.target.value === 'type' ? null : e.target.value === 'yes') as boolean | undefined, ...(e.target.value === 'yes' && rule.before === undefined && !link?.required_from ? { before: s.flow.start } : {}) })}>
                            <option value="type">{link?.required_from ? t('typeRequired') : t('typeOptional')}</option>
                            <option value="yes">{t('requiredYes')}</option>
                            <option value="no">{t('requiredNo')}</option>
                          </select>
                        ) : <span style={{ color: PIPE.textMuted }}>—</span>}
                      </td>
                      <td style={td}>
                        {libField && on && eff.before
                          ? <span style={{ display: 'grid', gap: 2 }}>
                              {stageSelect(eff.before, v => v && setRule({ before: v }), { attr: 'data-field-before', ariaLabel: t('beforeFor', { field: row.name }) })}
                              {ALL_STAGES.indexOf(eff.before) < ALL_STAGES.indexOf(s.flow.start) && <span data-field-never style={{ fontSize: 12, color: PIPE.textMuted }}>{t('neverAsked', { stage: ownName(s.flow.start) })}</span>}
                            </span>
                          : <span style={{ color: PIPE.textMuted }}>—</span>}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <button type="button" aria-label={t('moveUp', { name: row.name })} disabled={i === 0} data-field-up onClick={() => move(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>↑</button>
                        <button type="button" aria-label={t('moveDown', { name: row.name })} disabled={i === fieldRows.length - 1} data-field-down onClick={() => move(1)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>↓</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              <legend style={{ ...label, padding: 0 }}>{t('sectionOrder')}</legend>
              <ol style={{ margin: 0, paddingInlineStart: 0, listStyle: 'none', display: 'grid', gap: 3, maxWidth: 360 }}>
                {s.section_order.map((sec, i) => {
                  const move = (by: number) => { const next = [...s.section_order]; const j = i + by; if (j < 0 || j >= next.length) return; [next[i], next[j]] = [next[j], next[i]]; set('section_order', next as PanelSection[]) }
                  return (
                    <li key={sec} data-section={sec} style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${PIPE.border}`, borderRadius: 8, padding: '4px 8px', fontSize: 13 }}>
                      <span style={{ flex: 1 }}>{t(`section.${sec}`)}</span>
                      <button type="button" aria-label={t('moveUp', { name: t(`section.${sec}`) })} disabled={i === 0} data-section-up onClick={() => move(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>↑</button>
                      <button type="button" aria-label={t('moveDown', { name: t(`section.${sec}`) })} disabled={i === PANEL_SECTIONS.length - 1} data-section-down onClick={() => move(1)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>↓</button>
                    </li>
                  )
                })}
              </ol>
            </fieldset>
          </>}

          {tab === 'views' && <>
            <div style={grid2}>
              <label style={label}>{t('defaultView')}
                <select style={input} value={s.views.default} data-default-view onChange={e => { const views = { ...s.views, default: e.target.value as SpaceSettings['views']['default'] }; save({ views }, { ...s, views }) }}>
                  {(['board', 'sheet', 'calendar'] as const).map(v => <option key={v} value={v}>{t(`view.${v}`)}</option>)}
                </select>
              </label>
              <label style={label}>{t('defaultSort')}
                <select style={input} value={s.views.sort} data-default-sort onChange={e => { const views = { ...s.views, sort: e.target.value as SpaceSettings['views']['sort'] }; save({ views }, { ...s, views }) }}>
                  {(['due', 'publish', 'priority', 'name', 'created', 'updated'] as const).map(v => <option key={v} value={v}>{t(`sort.${v}`)}</option>)}
                </select>
              </label>
              <label style={label}>{t('defaultGroup')}
                <select style={input} value={s.views.group} data-default-group onChange={e => { const views = { ...s.views, group: e.target.value as SpaceSettings['views']['group'] }; save({ views }, { ...s, views }) }}>
                  {(['none', 'stage', 'brand', 'statusGroup'] as const).map(v => <option key={v} value={v}>{t(`group.${v}`)}</option>)}
                </select>
              </label>
            </div>
            <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              <legend style={{ ...label, padding: 0 }}>{t('defaultColumns')}</legend>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                {ROW_COLUMNS.map(c => {
                  // Keys saved for the task sheet these columns used to describe aren't this sheet's: ignored.
                  const picked = s.views.columns.filter(k => ROW_COLUMNS.some(x => x.key === k))
                  const on = !picked.length || picked.includes(c.key)
                  return (
                    <label key={c.key} style={check}><input type="checkbox" checked={on} disabled={c.key === 'title'} data-default-column={c.key}
                      onChange={e => { const all = ROW_COLUMNS.map(x => x.key); const cur = picked.length ? picked : all; const next = toggle(cur, c.key, e.target.checked); const views = { ...s.views, columns: next.length === all.length ? [] : all.filter(k => next.includes(k)) }; save({ views }, { ...s, views }) }} />{c.en}</label>
                  )
                })}
              </span>
              <span style={hint}>{t('columnsHint')}</span>
            </fieldset>
          </>}

          {tab === 'linking' && <>
            <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              <legend style={{ ...label, padding: 0 }}>{t('linkRoles')}</legend>
              {roleChecks(s.linking.roles, next => { const linking = { ...s.linking, roles: next }; save({ linking }, { ...s, linking }) }, 'data-link-role')}
              <span style={hint}>{t('linkRolesHint')}</span>
            </fieldset>
            <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              <legend style={{ ...label, padding: 0 }}>{t('atHandoff')}</legend>
              {(['ask', 'default'] as const).map(v => (
                <label key={v} style={check}><input type="radio" name="handoff-ask" checked={s.linking.handoff === v} data-handoff-ask={v}
                  onChange={() => { const linking = { ...s.linking, handoff: v }; save({ linking }, { ...s, linking }) }} />{t(`handoff.${v}`)}</label>
              ))}
            </fieldset>
          </>}

          {tab === 'rules' && <>
            <p style={hint}>{t('rulesHelp')}</p>
            <table style={{ borderCollapse: 'collapse', width: '100%' }} data-space-rules>
              <thead><tr><th style={th}>{t('stage')}</th><th style={th}>{t('holder')}</th><th style={th}>{t('sla')}</th></tr></thead>
              <tbody>
                {range.filter(id => ownsStage(s.flow, id) && id !== 'publish').map(id => {
                  const review = REVIEW.includes(id)
                  const key = review ? 'approvers' : 'owners'
                  const cur = s.rules[key][id] ?? ''
                  return (
                    <tr key={id} data-rule-stage={id} style={{ borderTop: `1px solid ${PIPE.border}` }}>
                      <td style={{ ...td, fontWeight: 600 }}>{ownName(id)}</td>
                      <td style={td}>
                        <select style={input} value={cur} data-rule-role aria-label={t(review ? 'approverFor' : 'ownerFor', { stage: ownName(id) })}
                          onChange={e => { const map = { ...s.rules[key] }; if (e.target.value) map[id] = e.target.value; else delete map[id]; const rules = { ...s.rules, [key]: map }; save({ rules: { [key]: { ...Object.fromEntries(ALL_STAGES.map(x => [x, null])), ...map } } } as never, { ...s, rules }) }}>
                          <option value="">{review ? t('builtInApprover') : t('assigneeHolds')}</option>
                          {roles.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td style={td}>
                        <input type="number" min={0} max={60} style={{ ...input, width: 84 }} defaultValue={s.rules.sla[id] ?? ''} placeholder={t('typeSla')} data-rule-sla aria-label={t('slaFor', { stage: ownName(id) })}
                          onBlur={e => { const v = e.target.value === '' ? null : Math.round(Number(e.target.value)); if ((v ?? null) === (s.rules.sla[id] ?? null)) return; const map = { ...s.rules.sla }; if (v === null || Number.isNaN(v)) delete map[id]; else map[id] = v; const rules = { ...s.rules, sla: map }; save({ rules: { sla: { ...Object.fromEntries(ALL_STAGES.map(x => [x, null])), ...map } } } as never, { ...s, rules }) }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <span style={hint}>{t('slaHint')}</span>
            {(['enter', 'overdue', 'back'] as const).map(k => (
              <fieldset key={k} style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                <legend style={{ ...label, padding: 0 }}>{t(`notify.${k}`)}</legend>
                {roleChecks(s.rules.notify[k], next => { const notify = { ...s.rules.notify, [k]: next }; const rules = { ...s.rules, notify }; save({ rules: { notify } } as never, { ...s, rules }) }, `data-notify-${k}`)}
              </fieldset>
            ))}
            <span style={hint}>{t('notifyHint')}</span>
          </>}
        </div>
      </div>
      <p data-space-settings-msg role="status" aria-live="polite" style={{ minHeight: 18, margin: '10px 0 0', fontSize: 12.5, fontWeight: 600, color: note?.ok === false ? '#C2353A' : PIPE.textMuted }}>{busy ? t('saving') : note?.text ?? ''}</p>
      <div className="fx-sh-dialog-row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="is-go" data-space-settings-close onClick={onClose}>{t('done')}</button>
      </div>
      {stagesOpen && <SpaceStagesPanel space={space} rows={data.spaceStages.filter(r => r.space_id === space.id)} onClose={() => setStagesOpen(false)} />}
    </Modal>
  )
}
