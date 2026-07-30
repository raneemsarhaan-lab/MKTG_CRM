'use client'

import { useState, useTransition } from 'react'
import type { Brand, ContentType, SLAConfig, WorkspaceSettings } from '@/types/index'
import { COLORS, STAGE_COLORS } from '@/lib/tokens'
import { updateSLA, createContentType, removeContentType, removeBrand, updateWeeklyCapacity, updateNineStageDefault } from '@/actions/settings'
import { AddBrandModal } from './AddBrandModal'

const SLA_STAGES: { id: string; label: string }[] = [
  { id: 'c-prog',      label: 'C-In Progress' },
  { id: 'c-final',     label: 'C-Review' },
  { id: 'c-check',     label: 'C-Check' },
  { id: 'd-prog',      label: 'D-In Progress' },
  { id: 'd-check',     label: 'D-Check' },
  { id: 'final-check', label: 'F-Check' },
]

interface WorkflowSettingsProps {
  brands: Brand[]
  contentTypes: ContentType[]
  slaConfig: SLAConfig
  workspaceSettings: WorkspaceSettings
}

export function WorkflowSettings({ brands, contentTypes, slaConfig, workspaceSettings }: WorkflowSettingsProps) {
  const [addBrandOpen, setAddBrandOpen] = useState(false)
  const [newType, setNewType] = useState('')
  const [typeError, setTypeError] = useState<string | null>(null)
  const [capacityHrs, setCapacityHrs] = useState(workspaceSettings.capacity_hrs_per_wk)
  const [nineStage, setNineStage] = useState(workspaceSettings.nine_stage_default)
  const [isPending, startTransition] = useTransition()

  function handleCapacityBlur() {
    if (capacityHrs !== workspaceSettings.capacity_hrs_per_wk && capacityHrs >= 1) {
      startTransition(async () => { await updateWeeklyCapacity(capacityHrs) })
    }
  }

  function handleNineStageToggle() {
    const next = !nineStage
    setNineStage(next)
    startTransition(async () => { await updateNineStageDefault(next) })
  }

  function handleAddType() {
    setTypeError(null)
    if (!newType.trim()) return
    startTransition(async () => {
      const result = await createContentType(newType.trim())
      if (!result.success) {
        setTypeError(result.error ?? 'Failed to add content type')
      } else {
        setNewType('')
      }
    })
  }

  function handleRemoveType(label: string) {
    startTransition(async () => { await removeContentType(label) })
  }

  function handleRemoveBrand(brandId: string) {
    startTransition(async () => { await removeBrand(brandId) })
  }

  const inputStyle: React.CSSProperties = {
    fontSize: '0.8rem', padding: '7px 10px', borderRadius: 8,
    border: '1px solid var(--line)', background: '#F6F6F4',
    color: 'var(--ink)', outline: 'none', fontFamily: 'inherit',
  }

  const cardStyle: React.CSSProperties = {
    borderRadius: 14, padding: 20,
    background: '#fff', border: '1px solid var(--line)',
    boxShadow: '0 1px 3px rgba(16,16,11,.05)',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 14,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Brands */}
      <div style={cardStyle}>
        <div style={labelStyle}>Brands</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {brands.map(b => (
            <span key={b.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '5px 8px 5px 8px', borderRadius: 10,
              border: '1px solid var(--line)', background: '#F6F6F4',
            }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: b.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink)' }}>{b.name}</span>
              <button
                onClick={() => handleRemoveBrand(b.id)}
                disabled={isPending}
                title={`Remove ${b.name}`}
                style={{
                  border: 'none', background: 'transparent',
                  cursor: 'pointer', color: 'var(--muted)',
                  fontSize: '0.7rem', padding: '0 2px', lineHeight: 1,
                }}
              >
                ✕
              </button>
            </span>
          ))}
          {brands.length === 0 && (
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>No brands yet.</span>
          )}
        </div>
        <button
          onClick={() => setAddBrandOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: '0.82rem', fontWeight: 700, color: COLORS.lime,
            padding: '8px 14px', borderRadius: 8, border: 'none',
            cursor: 'pointer', background: 'var(--ink)', fontFamily: 'inherit',
          }}
        >
          + Add brand
        </button>
      </div>

      {/* Content types */}
      <div style={cardStyle}>
        <div style={labelStyle}>Content types</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {contentTypes.map(ct => (
            <span key={ct.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 99, background: '#F1F1EF',
            }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink)' }}>{ct.label}</span>
              <button
                onClick={() => handleRemoveType(ct.label)}
                disabled={isPending}
                style={{
                  border: 'none', background: 'transparent',
                  cursor: 'pointer', color: 'var(--muted)', fontSize: '0.65rem', padding: 0, lineHeight: 1,
                }}
              >
                ✕
              </button>
            </span>
          ))}
          {contentTypes.length === 0 && (
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>No content types yet.</span>
          )}
        </div>
        {/* Add type */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="New content type"
            value={newType}
            onChange={e => setNewType(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddType()}
            style={{ ...inputStyle, flex: '1 1 160px' }}
          />
          <button
            onClick={handleAddType}
            disabled={!newType.trim() || isPending}
            style={{
              ...inputStyle,
              background: 'var(--ink)', color: COLORS.lime, border: 'none',
              fontWeight: 700, cursor: newType.trim() ? 'pointer' : 'default',
              opacity: newType.trim() && !isPending ? 1 : 0.4, paddingInline: 16,
            }}
          >
            + Add
          </button>
        </div>
        {typeError && (
          <div style={{ marginTop: 6, fontSize: '0.75rem', color: COLORS.coral }}>{typeError}</div>
        )}
      </div>

      {/* Weekly capacity */}
      <div style={cardStyle}>
        <div style={labelStyle}>Weekly Capacity</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="number"
            min={1}
            max={168}
            value={capacityHrs}
            onChange={e => setCapacityHrs(parseInt(e.target.value, 10) || 40)}
            onBlur={handleCapacityBlur}
            disabled={isPending}
            style={{
              ...inputStyle,
              width: '72px',
              textAlign: 'center',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          />
          <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>hours per person / week</span>
        </div>
      </div>

      {/* Islam Check toggle */}
      <div style={cardStyle}>
        <div style={labelStyle}>Islam Check Stage (9-Stage Workflow)</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '0.82rem', color: 'var(--ink)', fontWeight: 600, margin: '0 0 2px' }}>
              Enable C-Check stage for new tasks
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
              New tasks will include the C-Check (Islam approval) stage between C-Review and Ready For Design.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={nineStage}
            onClick={handleNineStageToggle}
            disabled={isPending}
            style={{
              flexShrink: 0,
              width: '44px',
              height: '24px',
              borderRadius: '99px',
              border: 'none',
              cursor: 'pointer',
              background: nineStage ? COLORS.lime : 'var(--line)',
              position: 'relative',
              transition: 'background 0.2s',
              marginLeft: '20px',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: '3px',
                left: nineStage ? '23px' : '3px',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: nineStage ? COLORS.ink : '#fff',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              }}
            />
          </button>
        </div>
      </div>

      {/* SLA matrix */}
      <div style={cardStyle}>
        <div style={labelStyle}>SLA per stage</div>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.55 }}>
          Maximum business days a task can sit in each stage before being flagged as &quot;Stuck&quot;.
        </p>
        {contentTypes.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Add a content type to configure SLA.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 12px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    Stage
                  </th>
                  {contentTypes.map(ct => (
                    <th key={ct.id} style={{ textAlign: 'center', padding: '6px 12px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {ct.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SLA_STAGES.map((stage, i) => (
                  <tr key={stage.id} style={{ background: i % 2 === 0 ? '#fff' : '#F6F6F4' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: STAGE_COLORS[stage.id], display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                          {stage.label}
                        </span>
                      </div>
                    </td>
                    {contentTypes.map(ct => {
                      const val = slaConfig[stage.id]?.[ct.label] ?? 2
                      return (
                        <td key={ct.id} style={{ textAlign: 'center', padding: '6px 8px' }}>
                          <SLACell
                            stageId={stage.id}
                            contentTypeLabel={ct.label}
                            initialDays={val}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addBrandOpen && <AddBrandModal onClose={() => setAddBrandOpen(false)} />}
    </div>
  )
}

interface SLACellProps {
  stageId: string
  contentTypeLabel: string
  initialDays: number
}

function SLACell({ stageId, contentTypeLabel, initialDays }: SLACellProps) {
  const [isPending, startTransition] = useTransition()

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val >= 1 && val !== initialDays) {
      startTransition(async () => {
        await updateSLA(stageId, contentTypeLabel, val)
      })
    }
  }

  return (
    <input
      type="number"
      min={1}
      max={30}
      defaultValue={initialDays}
      onBlur={handleBlur}
      disabled={isPending}
      style={{
        width: 52, textAlign: 'center',
        fontSize: '0.82rem', fontWeight: 700,
        padding: '5px 6px', borderRadius: 7,
        border: '1px solid var(--line)', background: '#fff',
        color: 'var(--ink)', outline: 'none', fontFamily: 'inherit',
        opacity: isPending ? 0.5 : 1,
      }}
    />
  )
}
