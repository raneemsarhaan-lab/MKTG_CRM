'use client'

import { useState } from 'react'
import type { Member, Brand, ContentType, SLAConfig } from '@/types/index'
import { TeamSettings } from './TeamSettings'
import { WorkflowSettings } from './WorkflowSettings'

type Tab = 'team' | 'workflow'

interface SettingsViewProps {
  members: Member[]
  currentUserId: string
  brands: Brand[]
  contentTypes: ContentType[]
  slaConfig: SLAConfig
}

export function SettingsView({ members, currentUserId, brands, contentTypes, slaConfig }: SettingsViewProps) {
  const [tab, setTab] = useState<Tab>('team')

  const tabBtn = (active: boolean): React.CSSProperties => ({
    fontSize: '0.82rem', fontWeight: 700, padding: '8px 18px',
    borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    background: active ? '#fff' : 'transparent',
    color: active ? 'var(--ink)' : 'var(--muted)',
    boxShadow: active ? '0 1px 3px rgba(16,16,11,.12)' : 'none',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ overflowY: 'auto', height: '100%', background: '#F6F6F4' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 40px 60px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontWeight: 700, fontSize: '0.62rem', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 8px' }}>
            Admin
          </p>
          <div style={{ height: 2, width: 32, background: '#C8F24E', borderRadius: 2, marginBottom: 14 }} />
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--ink)', margin: 0 }}>
            Settings
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '6px 0 0' }}>
            Controls for your team and workflow.
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'inline-flex', borderRadius: 10, padding: 4,
          background: '#EBEBEB', marginBottom: 28, gap: 2,
        }}>
          <button style={tabBtn(tab === 'team')} onClick={() => setTab('team')}>
            Team &amp; Access
          </button>
          <button style={tabBtn(tab === 'workflow')} onClick={() => setTab('workflow')}>
            SLA &amp; Workflow
          </button>
        </div>

        {/* Tab content */}
        {tab === 'team' ? (
          <TeamSettings
            members={members}
            currentUserId={currentUserId}
          />
        ) : (
          <WorkflowSettings
            brands={brands}
            contentTypes={contentTypes}
            slaConfig={slaConfig}
          />
        )}
      </div>
    </div>
  )
}
