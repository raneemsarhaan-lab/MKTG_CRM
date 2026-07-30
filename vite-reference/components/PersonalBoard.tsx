import React, { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { Task, Member } from '../types'
import { differenceInDays, parseISO, format, isToday } from 'date-fns'
import { getStageOwner, STAGE_MAP } from '../data/stages'

// ── Tokens ────────────────────────────────────────────────
const INK    = '#1C1836'
const MUTED  = '#6B6584'
const DIM    = '#A8A3C4'
const BORDER = '#ECEAF8'
const DIVIDER= '#F1EFFA'
const PURPLE = '#6E5BE6'
const DEEP   = '#4A3BB0'
const card: React.CSSProperties = {
  background: '#fff', borderRadius: 16, border: `1px solid ${BORDER}`,
  boxShadow: '0 1px 3px rgba(28,24,54,.04)',
}

const STAGE_COLOR: Record<string, string> = {
  'todo':         '#64748B',
  'c-prog':       '#3B82F6',
  'c-final':      '#2E6FB0',
  'c-check':      '#1F5A94',
  'r-design':     '#8B5CF6',
  'd-prog':       '#7C3AED',
  'd-check':      '#5B3FB5',
  'final-check':  '#F59E0B',
  'publish':      '#22C55E',
}

const BRAND_COLORS: Record<string, string> = {
  'Islam Personal Branding': '#1E293B',
  'The Strategy Community':  '#7A5A2E',
  'Omnisight':               '#0E7C7B',
  'Forefront':               '#B4322F',
}
const SHORT_BRAND: Record<string, string> = {
  'Forefront':               'Forefront',
  'Omnisight':               'Omnisight',
  'The Strategy Community':  'Strategy',
  'Islam Personal Branding': 'Islam',
}
const shortBrand = (a: string) => SHORT_BRAND[a] || a.split(' ')[0]

const PRIORITY_COLOR: Record<string, string> = { High: '#D57D6F', Medium: '#E0A23F', Low: '#7C8288' }
const CTYPE_EMOJI: Record<string, string> = {
  Post: '📝', Video: '🎬', Reel: '🎞️', Design: '🎨',
  Email: '📧', Story: '📖', Deck: '📊', Other: '📌',
}

const AVATAR_PALETTE = ['#1B1D1F', '#6E5BE6', '#3FA34D', '#5B93F5', '#E0736A', '#5B6066', '#B4863F']
function avatarBg(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]
}
function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}
function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

// ── Decorative SVGs ───────────────────────────────────────
const SparklinePurple = () => (
  <svg width="108" height="28" viewBox="0 0 108 28" fill="none" style={{ position: 'absolute', bottom: 12, left: 12, opacity: 0.85 }}>
    <polyline points="0,22 28,14 42,18 78,6 108,10" stroke="#4A3BB0" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="42" cy="18" r="3" fill="#4A3BB0"/>
    <circle cx="78" cy="6" r="3" fill="#4A3BB0"/>
    <circle cx="108" cy="10" r="3" fill="#4A3BB0"/>
  </svg>
)
const BarsAmber = () => (
  <svg width="92" height="28" viewBox="0 0 92 28" fill="none" style={{ position: 'absolute', bottom: 12, left: 12, opacity: 0.8 }}>
    <rect x="0"  y="14" width="14" height="14" rx="3" fill="#F0B03A"/>
    <rect x="18" y="8"  width="14" height="20" rx="3" fill="#EDA52B"/>
    <rect x="36" y="18" width="14" height="10" rx="3" fill="#F0B03A"/>
    <rect x="54" y="4"  width="14" height="24" rx="3" fill="#E8A422"/>
    <rect x="72" y="10" width="14" height="18" rx="3" fill="#EDA52B"/>
  </svg>
)
const WaveRed = () => (
  <svg width="108" height="28" viewBox="0 0 108 28" fill="none" style={{ position: 'absolute', bottom: 12, left: 12, opacity: 0.75 }}>
    <path d="M0 20 Q18 8 36 16 Q54 24 72 10 Q90 0 108 14" stroke="#D6362C" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
  </svg>
)
const SparklineGreen = () => (
  <svg width="108" height="28" viewBox="0 0 108 28" fill="none" style={{ position: 'absolute', bottom: 12, left: 12, opacity: 0.85 }}>
    <polyline points="0,20 40,10 80,16 108,6" stroke="#279247" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="40"  cy="10" r="3" fill="#279247"/>
    <circle cx="108" cy="6"  r="3" fill="#279247"/>
  </svg>
)

// ── Stat Card ─────────────────────────────────────────────
interface StatCardProps {
  label: string
  icon: string
  value: number | string
  sub: string
  bg: string
  labelColor: string
  numColor: string
  decoration: React.ReactNode
}
function StatCard({ label, icon, value, sub, bg, labelColor, numColor, decoration }: StatCardProps) {
  return (
    <div style={{ borderRadius: 16, padding: '18px 20px', background: bg, position: 'relative', overflow: 'hidden', minHeight: 148 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: labelColor }}>{icon} {label}</div>
      <div className="mont" style={{ fontSize: 38, fontWeight: 800, color: numColor, margin: '14px 0 2px', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: labelColor }}>{sub}</div>
      {decoration}
    </div>
  )
}

// ── Task Row (inside panel) ───────────────────────────────
function TaskRow({ task, accent }: { task: Task; accent: { badgeBg: string; badgeColor: string } }) {
  const { selectTask } = useStore()
  const today = new Date()
  const d = parseISO(task.due)
  const diff = differenceInDays(d, today)
  const status = d < today
    ? { text: `${Math.abs(diff)}d late`, color: '#F5334F' }
    : diff === 0
    ? { text: 'Today', color: INK }
    : { text: `in ${diff}d`, color: INK }
  const dotColor = STAGE_COLOR[task.status] || '#94A3B8'
  const stageLabel = STAGE_MAP[task.status]?.label ?? task.status

  return (
    <div
      onClick={() => selectTask(task.id)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderTop: `1px solid ${DIVIDER}`, cursor: 'pointer' }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <span style={{ fontSize: 17, flexShrink: 0 }}>{CTYPE_EMOJI[task.ctype] || '📌'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.name}</div>
        <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11.5, fontWeight: 700, color: accent.badgeColor, background: accent.badgeBg, padding: '2px 9px', borderRadius: 6 }}>
          {stageLabel}
        </span>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, width: 64 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: status.color }}>{status.text}</div>
        <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{format(d, 'MMM d')}</div>
      </div>
    </div>
  )
}

// ── Task Panel ─────────────────────────────────────────────
function TaskPanel({ title, icon, accentColor, tasks, badgeBg, badgeColor, linkColor }: {
  title: string; icon: string; accentColor: string;
  tasks: Task[]; badgeBg: string; badgeColor: string; linkColor: string;
}) {
  const { setShowTaskForm } = useStore()
  return (
    <div style={{ ...card, padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span className="mont" style={{ fontWeight: 800, fontSize: 16, color: INK }}>{icon} {title}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: accentColor, cursor: 'pointer' }}>View all</span>
      </div>
      {tasks.length === 0
        ? <div style={{ padding: '24px 0', textAlign: 'center', color: DIM, fontSize: 13, borderTop: `1px solid ${DIVIDER}`, marginTop: 8 }}>
            Nothing here 🎉
          </div>
        : tasks.slice(0, 5).map(t => (
            <TaskRow key={t.id} task={t} accent={{ badgeBg, badgeColor }} />
          ))
      }
      <div
        onClick={() => setShowTaskForm(true)}
        style={{ fontSize: 13.5, fontWeight: 700, color: linkColor, marginTop: 14, cursor: 'pointer' }}
      >
        + Add task
      </div>
    </div>
  )
}

// ── SLA Table ──────────────────────────────────────────────
function SLATable({ rows, onSelect }: {
  rows: { t: Task; biz: number; sla: number }[]
  onSelect: (id: number) => void
}) {
  const COLS = '2fr 1fr 1fr 0.7fr 1fr'
  const headerStyle: React.CSSProperties = {
    fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.05em', color: DIM,
  }
  return (
    <div style={{ ...card, padding: '22px 24px', marginBottom: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <span className="mont" style={{ fontWeight: 800, fontSize: 16, color: '#C0392B' }}>⚠️ SLA Breached</span>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <span style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 15, color: INK, lineHeight: 1.2, display: 'block' }}>
            Let's fix these!
          </span>
          <svg width="32" height="14" viewBox="0 0 32 14" fill="none" style={{ marginTop: 2, opacity: 0.6 }}>
            <path d="M2 2 Q16 14 30 4" stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            <path d="M30 4 L26 2 M30 4 L28 8" stroke={INK} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#C0392B', cursor: 'pointer' }}>View all</span>
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: COLS, paddingBottom: 10 }}>
        {['Task / Item', 'Owner', 'Due Date', 'SLA', 'Breached By'].map(h => (
          <span key={h} style={headerStyle}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      {rows.length === 0
        ? <div style={{ textAlign: 'center', padding: '20px 0', color: DIM, fontSize: 13, borderTop: `1px solid ${DIVIDER}` }}>
            All stages on time 🎉
          </div>
        : rows.slice(0, 6).map(({ t, biz, sla }) => (
            <div
              key={t.id}
              onClick={() => onSelect(t.id)}
              style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${DIVIDER}`, cursor: 'pointer' }}
            >
              {/* Task */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E24C4C', flexShrink: 0 }} />
                <span style={{ fontSize: 14, flexShrink: 0 }}>{CTYPE_EMOJI[t.ctype] || '📌'}</span>
                <span style={{ fontWeight: 600, fontSize: 13.5, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.name}
                  <span style={{ color: DIM, fontWeight: 400, marginLeft: 4 }}>{shortBrand(t.account)}</span>
                </span>
              </div>
              {/* Owner */}
              <span style={{ fontSize: 12, fontWeight: 700, color: '#5B4CBE', background: '#ECE9FA', padding: '3px 9px', borderRadius: 6, display: 'inline-block', width: 'fit-content' }}>
                {t.assignee.split(' ')[0]}
              </span>
              {/* Due Date */}
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E24C4C' }}>{format(parseISO(t.due), 'MMM d, yyyy')}</span>
              {/* SLA */}
              <span style={{ fontSize: 13, color: MUTED }}>{sla}d</span>
              {/* Breached By */}
              <span style={{ fontSize: 13, fontWeight: 700, color: '#E24C4C' }}>{biz - sla} {biz - sla === 1 ? 'day' : 'days'}</span>
            </div>
          ))
      }

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: '#E24C4C', cursor: 'pointer' }}>View all breached items →</span>
        <span style={{ fontSize: 22 }}>😣</span>
      </div>
    </div>
  )
}

// ── Motivational Banner ────────────────────────────────────
function MotivationalBanner() {
  return (
    <div style={{
      background: 'linear-gradient(100deg, #4A3BB0, #8B7CF0)',
      borderRadius: 18, padding: '26px 40px',
      display: 'flex', alignItems: 'center', gap: 26,
    }}>
      <span style={{ fontFamily: 'Georgia, serif', fontSize: 46, color: '#fff', opacity: 0.85, lineHeight: 1, flexShrink: 0 }}>"</span>
      <div style={{ flex: 1 }}>
        <div className="mont" style={{ fontWeight: 800, fontSize: 21, color: '#fff', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
          Small progress
        </div>
        <div className="mont" style={{ fontWeight: 800, fontSize: 21, color: '#fff', lineHeight: 1.3 }}>
          every{' '}
          <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>day</span>{' '}
          adds up
        </div>
      </div>
      {/* Trophy */}
      <div style={{ flexShrink: 0, position: 'relative', width: 56, height: 56, borderRadius: 14, background: '#241C5C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="mont" style={{ fontWeight: 900, fontSize: 20, color: '#fff', fontStyle: 'italic' }}>F</span>
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" style={{ position: 'absolute', top: -12 }}>
          <path d="M2 8 Q7 0 12 8" stroke="#E9E45E" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <circle cx="2"  cy="8" r="1.5" fill="#E9E45E"/>
          <circle cx="12" cy="8" r="1.5" fill="#E9E45E"/>
        </svg>
      </div>
      {/* Arrow */}
      <svg width="36" height="22" viewBox="0 0 36 22" fill="none" style={{ opacity: 0.8, flexShrink: 0 }}>
        <path d="M2 11 Q14 3 30 11" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
        <path d="M30 11 L24 7 M30 11 L26 16" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
      {/* Sticky note */}
      <div style={{
        background: '#FFE45E', color: INK, padding: '10px 16px', borderRadius: 3,
        fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 15,
        transform: 'rotate(-2deg)', flexShrink: 0, whiteSpace: 'nowrap',
        boxShadow: '2px 3px 8px rgba(0,0,0,.12)',
      }}>
        one step<br/>at a time 🙂
      </div>
    </div>
  )
}

// ── MemberStatCard (kept) ─────────────────────────────────
function MemberStatCard({ member: m, onTurn, dueCount, overdueCount }: {
  member: Member; onTurn: number; dueCount: number; overdueCount: number
}) {
  return (
    <div style={{ borderRadius: 14, padding: 14, background: '#F6F6F3', border: '1px solid rgba(23,19,33,.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: avatarBg(m.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {initials(m.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1B1A13', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
          <div style={{ fontSize: 11, color: '#8A8D91', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.role}</div>
        </div>
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid #EDF0F6', paddingTop: 10 }}>
        {[
          { val: onTurn,       label: 'On turn' },
          { val: dueCount,     label: 'Due today' },
          { val: overdueCount, label: 'Overdue', danger: true },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? '1px solid #ECECE7' : 'none', paddingLeft: i > 0 ? 8 : 0 }}>
            <div className="mont" style={{ fontSize: 19, fontWeight: 800, color: s.danger && s.val > 0 ? '#C03A3A' : '#1B1A13' }}>{s.val}</div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#8A8D91' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Export ───────────────────────────────────────────
const REVIEW_STAGES = ['c-final', 'c-check', 'd-check', 'final-check']

export function PersonalBoard() {
  const { currentUser, tasks, members, slaConfig, selectTask } = useStore()

  const myTasks = useMemo(() => tasks.filter(t => {
    if (t.status === 'publish') return false
    const owner = getStageOwner(t, t.status)
    return t.assignee === currentUser?.name || owner === currentUser?.name || owner === currentUser?.role
  }), [tasks, currentUser])

  if (!currentUser) return null

  const today   = new Date()
  const week7   = new Date(today); week7.setDate(today.getDate() + 7)
  const allActive = tasks.filter(t => t.status !== 'publish')
  const CAP       = currentUser.capacity ?? 40

  const dueToday  = myTasks.filter(t => { const d = parseISO(t.due); return isToday(d) || d < today })
  const dueWeek   = myTasks.filter(t => { const d = parseISO(t.due); return d > today && d <= week7 })
  const completed = tasks.filter(t => t.status === 'publish').length
  const myHours   = myTasks.reduce((s, t) => s + t.hours, 0)
  const capPct    = Math.min(100, Math.round((myHours / CAP) * 100))
  const capColor  = capPct >= 90 ? '#F5334F' : capPct >= 70 ? '#E0A23F' : '#3FA34D'

  const breached = allActive
    .map(t => { const sla = slaConfig[t.status] ?? 3; const biz = differenceInDays(today, parseISO(t.stageDate)); return { t, sla, biz } })
    .filter(x => x.biz > x.sla)
    .sort((a, b) => (b.biz - b.sla) - (a.biz - a.sla))

  // Brand breakdown for capacity
  const brandAgg: Record<string, { hours: number; count: number }> = {}
  myTasks.forEach(t => {
    if (!brandAgg[t.account]) brandAgg[t.account] = { hours: 0, count: 0 }
    brandAgg[t.account].hours += t.hours
    brandAgg[t.account].count++
  })
  const brandRows = Object.entries(brandAgg).sort((a, b) => b[1].hours - a[1].hours)

  const firstName = currentUser.name.split(' ')[0]

  return (
    <div style={{ overflowY: 'auto', height: '100%', background: '#F6F6F4' }}>
      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '36px 44px 48px' }}>

        {/* ── Greeting ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 26 }}>
          <div>
            <h1 className="mont" style={{ fontWeight: 800, fontSize: 27, color: '#1B1A13', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              {greeting()}, {firstName} 👋
            </h1>
            <p style={{ fontSize: 14.5, color: MUTED, margin: '8px 0 0' }}>
              Let's make{' '}
              <span style={{ background: 'linear-gradient(0deg, #E9E45E 40%, transparent 40%)', fontWeight: 700, color: INK }}>
                today
              </span>{' '}
              count.
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 24 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid #E1E1E0`, borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 600, color: '#1B1A13' }}>
              📅 {format(today, 'MMMM d, yyyy')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
              <svg width="38" height="15" viewBox="0 0 38 15" fill="none" style={{ opacity: 0.55 }}>
                <path d="M2 13 Q10 2 20 8 Q30 14 36 4" stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
              </svg>
              <span style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: 16, color: INK }}>
                you got this! 💜
              </span>
            </div>
          </div>
        </div>

        {/* ── 4 Stat Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 22 }}>
          <StatCard
            label="My Day" icon="☀️" value={dueToday.length} sub="Tasks"
            bg="#E9E5FB" labelColor="#5B4CBE" numColor="#4A3BB0"
            decoration={<SparklinePurple />}
          />
          <StatCard
            label="This Week" icon="📅" value={dueWeek.length} sub="Tasks"
            bg="#FCEFD9" labelColor="#B9821A" numColor="#D18A15"
            decoration={<BarsAmber />}
          />
          <StatCard
            label="SLA Breached" icon="⚠️" value={breached.length} sub="Items"
            bg="#FCE4E1" labelColor="#C0392B" numColor="#D6362C"
            decoration={<WaveRed />}
          />
          <StatCard
            label="Completed" icon="✅" value={completed} sub="This Week"
            bg="#E1F5E6" labelColor="#2E8B4F" numColor="#279247"
            decoration={<SparklineGreen />}
          />
        </div>

        {/* ── Weekly Capacity (kept) ── */}
        <div style={{ background: '#fff', border: '1px solid #E5E8F1', boxShadow: '0 1px 2px rgba(26,28,30,.04), 0 10px 28px rgba(26,28,30,.06)', borderRadius: 18, padding: '1.1rem 1.4rem', marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1B1A13' }}>Weekly capacity</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#B79CF5' }}>{capPct}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 99, background: '#E7E7E3', overflow: 'hidden' }}>
            <div style={{ width: `${capPct}%`, height: '100%', borderRadius: 99, background: capColor, transition: 'width .3s ease' }} />
          </div>
          {brandRows.length > 0 && (
            <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
              {brandRows.map(([account, { hours, count }]) => {
                const bc = BRAND_COLORS[account] || '#94A3B8'
                return (
                  <div key={account} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: bc, display: 'inline-block' }} />
                    <span style={{ fontSize: 11.5, color: '#8A8D91' }}>
                      <strong style={{ color: '#1B1A13' }}>{shortBrand(account)}</strong> {hours}h · {count} tasks
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── My Day + This Week panels ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
          <TaskPanel
            title="My Day" icon="☀️" accentColor={PURPLE}
            tasks={dueToday}
            badgeBg="#ECE9FA" badgeColor="#5B4CBE" linkColor={PURPLE}
          />
          <TaskPanel
            title="This Week" icon="📅" accentColor="#E8A422"
            tasks={dueWeek}
            badgeBg="#FBE9D0" badgeColor="#B9821A" linkColor="#E8A422"
          />
        </div>

        {/* ── SLA Breached Table ── */}
        <SLATable rows={breached} onSelect={selectTask} />

        {/* ── Team Overview (kept) ── */}
        <div style={{ background: '#fff', border: '1px solid #E5E8F1', boxShadow: '0 1px 2px rgba(26,28,30,.04), 0 10px 28px rgba(26,28,30,.06)', borderRadius: 18, padding: '1.25rem 1.4rem', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8A8D91" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#8A8D91' }}>
              Team overview ({members.length})
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(196px, 1fr))', gap: 12 }}>
            {members.map(m => {
              const memberTasks = allActive.filter(t => {
                const owner = getStageOwner(t, t.status)
                return t.assignee === m.name || owner === m.name || owner === m.role
              })
              const onTurn = allActive.filter(t => {
                const owner = getStageOwner(t, t.status)
                if (REVIEW_STAGES.includes(t.status)) return owner === m.name || owner === m.role
                return t.assignee === m.name && !REVIEW_STAGES.includes(t.status)
              }).length
              const dueTodayM = memberTasks.filter(t => { const d = parseISO(t.due); return isToday(d) || d <= today }).length
              const overdueM  = memberTasks.filter(t => parseISO(t.due) < today).length
              return <MemberStatCard key={m.name} member={m} onTurn={onTurn} dueCount={dueTodayM} overdueCount={overdueM} />
            })}
          </div>
        </div>

        {/* ── Motivational Banner ── */}
        <MotivationalBanner />

      </div>
    </div>
  )
}
