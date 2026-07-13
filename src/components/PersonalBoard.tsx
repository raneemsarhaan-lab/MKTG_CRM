import React, { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Task, Member } from '../types'
import { differenceInDays, parseISO, format, isToday } from 'date-fns'
import { getStageOwner, STAGE_MAP } from '../data/stages'

const UI = {
  ink:         '#1B1A13',
  muted:       '#8A8D91',
  line:        '#E5E8F1',
  lime:        '#C3F53D',
  coral:       '#F5334F',
  cyan:        '#5B93F5',
  mint:        '#3FA34D',
  violet:      '#B79CF5',
  dark:        '#111111',
  cardShadow:  '0 1px 2px rgba(26,28,30,.04), 0 10px 28px rgba(26,28,30,.06)',
}

const surface: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E5E8F1',
  boxShadow: '0 1px 2px rgba(26,28,30,.04), 0 10px 28px rgba(26,28,30,.06)',
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

const ACCESS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  admin:     { bg: '#C3F53D', color: '#111', label: 'Admin' },
  superuser: { bg: '#B79CF5', color: '#111', label: 'Super User' },
  user:      { bg: '#EDEDEA', color: '#6B6B6B', label: 'User' },
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

// ── SVG Icons ──────────────────────────────────────────────
const Sparkles = ({ size = 17, color = UI.lime }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>
  </svg>
)
const CalDays = ({ size = 17, color = UI.cyan }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>
  </svg>
)
const Users = ({ size = 17, color = UI.muted }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const AlertCircle = ({ size = 17, color = '#C03A3A' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
  </svg>
)
const Clock = ({ size = 17, color = '#B7791F' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>
)
const CheckCircle = ({ size = 17, color = '#2A3E78' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>
  </svg>
)
const AlertTriangle = ({ size = 17, color = '#9A6B14' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/>
    <path d="M12 9v4M12 17h.01"/>
  </svg>
)

// ── ProfileSection ─────────────────────────────────────────
function ProfileSection({ user, myHours, members }: { user: Member; myHours: number; members: Member[] }) {
  const CAP = user.capacity ?? 40
  const capPct = Math.min(100, Math.round((myHours / CAP) * 100))
  const capColor = capPct >= 90 ? UI.coral : capPct >= 70 ? '#E0A23F' : UI.mint
  const badge = ACCESS_BADGE[user.access]

  return (
    <div style={{ ...surface, borderRadius: 24, marginBottom: 20, overflow: 'hidden' }}>
      {/* Purple banner */}
      <div style={{
        height: 92,
        background: 'linear-gradient(135deg, #9F7FE8 0%, #B79CF5 55%, #C3B2F5 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 28% 50%, rgba(255,255,255,.28) 0%, transparent 62%)' }} />
      </div>

      {/* Body — overlapping the banner by 46px */}
      <div style={{ padding: '0 26px 24px', marginTop: -46, position: 'relative' }}>
        {/* Avatar */}
        <div style={{
          width: 104, height: 104, borderRadius: 24,
          background: avatarBg(user.name), border: '4px solid #fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 800, fontSize: 28,
          fontFamily: "'Montserrat','Inter',sans-serif",
          boxShadow: '0 4px 18px rgba(0,0,0,.16)',
        }}>
          {initials(user.name)}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginTop: 14 }}>
          {/* Identity */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 3 }}>
              <h2 className="mont" style={{ fontSize: 24, fontWeight: 800, color: UI.ink, margin: 0 }}>{user.name}</h2>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: badge.bg, color: badge.color }}>
                {badge.label}
              </span>
            </div>
            <p className="mont" style={{ fontSize: 14, fontWeight: 600, color: UI.muted, margin: '0 0 3px' }}>{user.role}</p>
            {user.email && <p style={{ fontSize: 12.5, color: '#A6A6A0', margin: 0 }}>{user.email}</p>}
            {user.nickname && (
              <span style={{ display: 'inline-block', marginTop: 7, fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 99, background: '#EFE7FD', color: '#6D4FD0' }}>
                {user.nickname}
              </span>
            )}
          </div>

          {/* Workload bar */}
          <div style={{ minWidth: 210, flex: '0 0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: UI.ink }}>This week's workload</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: UI.violet }}>{capPct}%</span>
            </div>
            <div style={{ height: 9, borderRadius: 99, background: '#EFEFEB', overflow: 'hidden' }}>
              <div style={{ width: `${capPct}%`, height: '100%', borderRadius: 99, background: capColor, transition: 'width .3s ease' }} />
            </div>
            <p style={{ fontSize: 11, color: UI.muted, margin: '4px 0 0' }}>{myHours}h of {CAP}h capacity</p>
          </div>
        </div>
      </div>

      {/* Team roster */}
      {members.length > 0 && (
        <div style={{ padding: '0 26px 24px', borderTop: '1px solid #F1F1EF', paddingTop: 20 }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#B9B9B2', margin: '0 0 14px' }}>
            Your team ({members.length})
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 1fr))', gap: 10 }}>
            {members.map(m => {
              const ab = ACCESS_BADGE[m.access]
              return (
                <div key={m.name} style={{ ...surface, borderRadius: 18, padding: 16, textAlign: 'center' }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%', margin: '0 auto 10px',
                    background: avatarBg(m.name), color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700,
                  }}>
                    {initials(m.name)}
                  </div>
                  <div className="mont" style={{ fontSize: 13, fontWeight: 800, color: UI.ink, marginBottom: 2 }}>{m.name.split(' ')[0]}</div>
                  <div style={{ fontSize: 11.5, color: UI.muted, marginBottom: 7 }}>{m.role}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: ab.bg, color: ab.color }}>
                    {ab.label}
                  </span>
                  {m.nickname && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#6D4FD0', marginTop: 5 }}>{m.nickname}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── BigStat ────────────────────────────────────────────────
function BigStat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: 'danger' | 'accent' | 'default' }) {
  const color = tone === 'danger' ? '#C03A3A' : tone === 'accent' ? UI.violet : UI.ink
  return (
    <div style={{ ...surface, borderRadius: 18, padding: '1rem 1.25rem', minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: UI.muted, marginBottom: 8 }}>{label}</div>
      <div className="mont" style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: UI.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

// ── MyTaskRow ──────────────────────────────────────────────
function MyTaskRow({ task }: { task: Task }) {
  const { selectTask } = useStore()
  const today = new Date()
  const d = parseISO(task.due)
  const diff = differenceInDays(d, today)
  const info = d < today
    ? { text: `${Math.abs(diff)}d late`, color: '#C03A3A' }
    : diff === 0
    ? { text: 'today', color: '#B96A00' }
    : { text: `in ${diff}d`, color: UI.muted }
  const bc = BRAND_COLORS[task.account] || '#94A3B8'

  return (
    <div
      onClick={() => selectTask(task.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        borderRadius: 14, padding: '0.65rem 0.9rem', marginBottom: 10,
        ...surface, cursor: 'pointer', transition: 'box-shadow .12s, transform .12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(26,28,30,.1)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = UI.cardShadow; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 99, background: PRIORITY_COLOR[task.priority], flexShrink: 0 }} />
      <span style={{ fontSize: 18, flexShrink: 0 }}>{CTYPE_EMOJI[task.ctype] || '📌'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: UI.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4, background: `${bc}14`, color: bc }}>{shortBrand(task.account)}</span>
          <span style={{ fontSize: 11.5, color: UI.muted }}>{STAGE_MAP[task.status]?.label ?? task.status}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: info.color }}>{info.text}</div>
        <div style={{ fontSize: 11, color: UI.muted, marginTop: 2 }}>{format(d, 'MMM d')}</div>
      </div>
    </div>
  )
}

// ── DigestCard / DigestRow ─────────────────────────────────
function DigestCard({ icon, theme, title, count, children }: {
  icon: React.ReactNode; theme: string; title: string; count: number; children: React.ReactNode
}) {
  return (
    <div style={{ ...surface, borderRadius: 18, padding: '1.1rem 1.2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        {icon}
        <span style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: theme }}>
          {title} ({count})
        </span>
      </div>
      {children}
    </div>
  )
}

function DigestRow({ tint, titleColor, name, sub, metric }: { tint: string; titleColor: string; name: string; sub: string; metric?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: 10, padding: '8px 12px', marginBottom: 6, background: tint }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: titleColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: 11.5, color: titleColor, opacity: 0.72, marginTop: 2 }}>{sub}</div>
      </div>
      {metric && <div style={{ fontSize: 12.5, fontWeight: 700, color: titleColor, whiteSpace: 'nowrap' }}>{metric}</div>}
    </div>
  )
}

function EmptyDigest({ message }: { message: string }) {
  return <div style={{ textAlign: 'center', padding: '1rem', color: '#C4C4BE', fontSize: 13 }}>{message}</div>
}

// ── MemberStatCard ─────────────────────────────────────────
function MemberStatCard({ member: m, onTurn, dueCount, overdueCount }: {
  member: Member; onTurn: number; dueCount: number; overdueCount: number
}) {
  return (
    <div style={{ borderRadius: 14, padding: 14, background: '#F6F6F3', border: '1px solid rgba(23,19,33,.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: avatarBg(m.name), color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>
          {initials(m.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: UI.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
          <div style={{ fontSize: 11, color: UI.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.role}</div>
        </div>
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid #EDF0F6', paddingTop: 10 }}>
        {[
          { val: onTurn,       label: 'On turn' },
          { val: dueCount,     label: 'Due today' },
          { val: overdueCount, label: 'Overdue', danger: true },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? '1px solid #ECECE7' : 'none', paddingLeft: i > 0 ? 8 : 0 }}>
            <div className="mont" style={{ fontSize: 19, fontWeight: 800, color: s.danger && s.val > 0 ? '#C03A3A' : UI.ink }}>{s.val}</div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: UI.muted }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PersonalBoard ──────────────────────────────────────────
const REVIEW_STAGES = ['c-final', 'c-check', 'd-check', 'final-check']

export function PersonalBoard() {
  const { currentUser, tasks, members, slaConfig, selectTask } = useStore()
  const [digestWindow, setDigestWindow] = useState<'daily' | 'weekly'>('weekly')

  const myTasks = useMemo(() => tasks.filter(t => {
    if (t.status === 'publish') return false
    const owner = getStageOwner(t, t.status)
    return t.assignee === currentUser?.name || owner === currentUser?.name || owner === currentUser?.role
  }), [tasks, currentUser])

  if (!currentUser) return null

  const today = new Date()
  const week7 = new Date(today); week7.setDate(today.getDate() + 7)
  const digestEnd = digestWindow === 'daily' ? today : week7

  const allActive = tasks.filter(t => t.status !== 'publish')

  const myHours    = myTasks.reduce((s, t) => s + t.hours, 0)
  const highCount  = myTasks.filter(t => t.priority === 'High').length
  const dueToday   = myTasks.filter(t => { const d = parseISO(t.due); return isToday(d) || d < today })
  const dueWeek    = myTasks.filter(t => { const d = parseISO(t.due); return d > today && d <= week7 })
  const CAP        = currentUser.capacity ?? 40
  const capPct     = Math.min(100, Math.round((myHours / CAP) * 100))

  // Brand breakdown for capacity bar
  const brandAgg: Record<string, { hours: number; count: number }> = {}
  myTasks.forEach(t => {
    if (!brandAgg[t.account]) brandAgg[t.account] = { hours: 0, count: 0 }
    brandAgg[t.account].hours += t.hours
    brandAgg[t.account].count++
  })
  const brandRows = Object.entries(brandAgg).sort((a, b) => b[1].hours - a[1].hours)

  // Digest data
  const pastPublish = allActive
    .filter(t => parseISO(t.due) < today)
    .map(t => ({ t, days: differenceInDays(today, parseISO(t.due)) }))
    .sort((a, b) => b.days - a.days)

  const awaiting = allActive
    .filter(t => REVIEW_STAGES.includes(t.status))
    .map(t => ({ t, days: differenceInDays(today, parseISO(t.stageDate)) }))
    .sort((a, b) => b.days - a.days)

  const publishing = allActive
    .filter(t => { const d = parseISO(t.due); return d >= today && d <= digestEnd })
    .map(t => ({ t, days: differenceInDays(parseISO(t.due), today) }))
    .sort((a, b) => a.days - b.days)

  const breached = allActive
    .map(t => { const sla = slaConfig[t.status] ?? 3; const biz = differenceInDays(today, parseISO(t.stageDate)); return { t, sla, biz } })
    .filter(x => x.biz > x.sla)
    .sort((a, b) => b.biz - a.biz)

  const firstName = currentUser.name.split(' ')[0]

  return (
    <div style={{ overflowY: 'auto', height: '100%', background: '#F6F6F4' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '1.5rem 1.5rem 3rem' }}>

        {/* Greeting */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 className="mont" style={{ fontSize: 26, fontWeight: 800, color: UI.ink, margin: 0, letterSpacing: '-0.01em' }}>
            {greeting()}, {firstName}
          </h2>
          <p style={{ color: UI.muted, fontSize: 14, margin: '0.3rem 0 0' }}>
            {format(today, 'EEEE, MMMM d, yyyy')} — your live campaign room
          </p>
        </div>

        {/* Profile hero + team roster */}
        <ProfileSection user={currentUser} myHours={myHours} members={members} />

        {/* BigStat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <BigStat label="Active tasks"    value={myTasks.length}  sub={`${highCount} high priority`} />
          <BigStat label="Due today"       value={dueToday.length} sub="incl. overdue" tone={dueToday.length > 0 ? 'danger' : 'default'} />
          <BigStat label="Due this week"   value={dueWeek.length}  sub="next 7 days" />
          <BigStat label="Hours allocated" value={`${myHours}h`}   sub={`of ${CAP}h capacity`} tone="accent" />
        </div>

        {/* Weekly capacity bar */}
        <div style={{ ...surface, borderRadius: 18, padding: '1.1rem 1.4rem', marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: UI.ink }}>Weekly capacity</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: UI.violet }}>{capPct}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 99, background: '#E7E7E3', overflow: 'hidden' }}>
            <div style={{ width: `${capPct}%`, height: '100%', borderRadius: 99, background: UI.dark, transition: 'width .3s ease' }} />
          </div>
          {brandRows.length > 0 && (
            <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
              {brandRows.map(([account, { hours, count }]) => {
                const bc = BRAND_COLORS[account] || '#94A3B8'
                return (
                  <div key={account} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: bc, display: 'inline-block' }} />
                    <span style={{ fontSize: 11.5, color: UI.muted }}>
                      <strong style={{ color: UI.ink }}>{shortBrand(account)}</strong> {hours}h · {count} tasks
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* My Day + Up Next */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, marginBottom: 36 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Sparkles />
              <span className="mont" style={{ fontWeight: 800, fontSize: 16, color: UI.ink }}>My Day</span>
              {dueToday.length > 0 && (
                <span style={{ background: '#F1F1EF', color: UI.violet, borderRadius: 99, padding: '2px 9px', fontSize: 12, fontWeight: 700 }}>
                  {dueToday.length}
                </span>
              )}
            </div>
            {dueToday.length > 0
              ? dueToday.map(t => <MyTaskRow key={t.id} task={t} />)
              : <div style={{ border: '1.5px dashed #C7CFE0', borderRadius: 14, padding: '1.5rem', textAlign: 'center', color: '#C4C4BE', fontSize: 13 }}>Nothing due today. Enjoy the calm.</div>
            }
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <CalDays />
              <span className="mont" style={{ fontWeight: 800, fontSize: 16, color: UI.ink }}>Up next this week</span>
              {dueWeek.length > 0 && (
                <span style={{ background: '#EDF6C6', color: '#4B7A12', borderRadius: 99, padding: '2px 9px', fontSize: 12, fontWeight: 700 }}>
                  {dueWeek.length}
                </span>
              )}
            </div>
            {dueWeek.length > 0
              ? dueWeek.map(t => <MyTaskRow key={t.id} task={t} />)
              : <div style={{ border: '1.5px dashed #C7CFE0', borderRadius: 14, padding: '1.5rem', textAlign: 'center', color: '#C4C4BE', fontSize: 13 }}>No upcoming deadlines this week</div>
            }
          </div>
        </div>

        {/* Team digest ──────────────────────────── */}
        <div style={{ borderTop: '1px solid #E6D9CB', paddingTop: 26, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Users size={18} />
              <span className="mont" style={{ fontSize: 16, fontWeight: 800, color: UI.ink }}>Team digest</span>
            </div>
            {/* Daily / weekly toggle */}
            <div style={{ display: 'inline-flex', borderRadius: 10, padding: 3, background: '#E7E7E3', gap: 2 }}>
              {(['daily', 'weekly'] as const).map(w => (
                <button
                  key={w}
                  onClick={() => setDigestWindow(w)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 7,
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                    background: digestWindow === w ? '#FFFCF7' : 'transparent',
                    color: digestWindow === w ? UI.ink : UI.muted,
                    boxShadow: digestWindow === w ? '0 1px 3px rgba(16,16,11,.1)' : 'none',
                    transition: 'background .15s, box-shadow .15s',
                  }}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Row 1: Overdue + Awaiting Review */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <DigestCard icon={<AlertCircle />} theme="#C03A3A" title="Past publish date" count={pastPublish.length}>
              {pastPublish.length > 0
                ? pastPublish.slice(0, 4).map(({ t, days }) => (
                    <div key={t.id} onClick={() => selectTask(t.id)} style={{ cursor: 'pointer' }}>
                      <DigestRow tint="#F7E3E3" titleColor="#8F2C2C" name={t.name} sub={`${shortBrand(t.account)} · ${STAGE_MAP[t.status]?.label}`} metric={`${days}d over`} />
                    </div>
                  ))
                : <EmptyDigest message="Nothing overdue 🎉" />
              }
            </DigestCard>
            <DigestCard icon={<Clock />} theme="#B7791F" title="Awaiting review" count={awaiting.length}>
              {awaiting.length > 0
                ? awaiting.slice(0, 4).map(({ t, days }) => (
                    <div key={t.id} onClick={() => selectTask(t.id)} style={{ cursor: 'pointer' }}>
                      <DigestRow tint="#FBF0D6" titleColor="#7A5A1E" name={t.name} sub={`${shortBrand(t.account)} · ${STAGE_MAP[t.status]?.label}`} metric={`${days}d waiting`} />
                    </div>
                  ))
                : <EmptyDigest message="No tasks in review" />
              }
            </DigestCard>
          </div>

          {/* Row 2: Publishing + SLA breached */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <DigestCard
              icon={<CheckCircle />}
              theme="#2A3E78"
              title={`Publishing ${digestWindow === 'daily' ? 'today' : 'this week'}`}
              count={publishing.length}
            >
              {publishing.length > 0
                ? publishing.slice(0, 4).map(({ t, days }) => (
                    <div key={t.id} onClick={() => selectTask(t.id)} style={{ cursor: 'pointer' }}>
                      <DigestRow tint="#EEF1F8" titleColor="#1B2C5C" name={t.name} sub={`${shortBrand(t.account)} · ${t.ctype}`} metric={days === 0 ? 'today' : `in ${days}d`} />
                    </div>
                  ))
                : <EmptyDigest message={`Nothing publishing ${digestWindow === 'daily' ? 'today' : 'this week'}`} />
              }
            </DigestCard>
            <DigestCard icon={<AlertTriangle />} theme="#9A6B14" title="SLA breached" count={breached.length}>
              {breached.length > 0
                ? breached.slice(0, 4).map(({ t, biz, sla }) => (
                    <div key={t.id} onClick={() => selectTask(t.id)} style={{ cursor: 'pointer' }}>
                      <DigestRow tint="#F4EDDC" titleColor="#7A5A1E" name={t.name} sub={`${shortBrand(t.account)} · ${STAGE_MAP[t.status]?.label}`} metric={`${biz}d / ${sla}d`} />
                    </div>
                  ))
                : <EmptyDigest message="All stages on time" />
              }
            </DigestCard>
          </div>
        </div>

        {/* Team overview ────────────────────────── */}
        <div style={{ ...surface, borderRadius: 18, padding: '1.25rem 1.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Users size={17} />
            <span style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: UI.muted }}>
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
              const dueTodayM  = memberTasks.filter(t => { const d = parseISO(t.due); return isToday(d) || d <= today }).length
              const overdueM   = memberTasks.filter(t => parseISO(t.due) < today).length
              return (
                <MemberStatCard
                  key={m.name}
                  member={m}
                  onTurn={onTurn}
                  dueCount={dueTodayM}
                  overdueCount={overdueM}
                />
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
