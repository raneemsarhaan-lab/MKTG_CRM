import React, { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { Task } from '../types'
import { differenceInDays, parseISO, format, isToday } from 'date-fns'
import { getStageOwner, STAGE_MAP } from '../data/stages'

const UI = {
  ink: '#1B1A13',
  muted: '#8A8D91',
  soft: '#F7F7F7',
  line: '#E1E1E0',
  lime: '#C3F53D',
  dark: '#111111',
  violet: '#B79CF5',
  mint: '#3FA34D',
  coral: '#F5334F',
  cardShadow: '0 1px 2px rgba(26,28,30,.04), 0 4px 12px rgba(26,28,30,.06)',
}

const BRAND_COLORS: Record<string, string> = {
  'Islam Personal Branding':  '#1E293B',
  'The Strategy Community':   '#7A5A2E',
  'Omnisight':                '#0E7C7B',
  'Forefront':                '#B4322F',
}

const PRIORITY_COLOR: Record<string, string> = {
  High: '#D57D6F', Medium: '#E0A23F', Low: '#7C8288',
}

const CTYPE_EMOJI: Record<string, string> = {
  Post: '📝', Video: '🎬', Reel: '🎞️', Design: '🎨',
  Email: '📧', Story: '📖', Deck: '📊', Other: '📌',
}

const SHORT_BRAND: Record<string, string> = {
  'Forefront Consulting':    'Forefront',
  'Omnisight':               'Omnisight',
  'The Strategy Community':  'Strategy',
  'Islam Personal Branding': 'Islam',
}
const shortBrand = (a: string) => SHORT_BRAND[a] || a.split(' ')[0]

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function BigStat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: 'danger' | 'accent' | 'default' }) {
  const color = tone === 'danger' ? '#C03A3A' : tone === 'accent' ? UI.violet : UI.ink
  return (
    <div style={{
      background: '#FFFFFF', border: `1px solid ${UI.line}`, borderRadius: 18,
      padding: '1.1rem 1.25rem', flex: 1, minWidth: 0,
      boxShadow: UI.cardShadow,
    }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: UI.muted, marginBottom: '0.5rem' }}>{label}</div>
      <div className="mont" style={{ fontSize: '2.2rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: UI.muted, marginTop: '0.35rem' }}>{sub}</div>}
    </div>
  )
}

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
        borderRadius: 14, padding: '0.7rem 0.9rem', marginBottom: 8,
        background: '#FFFFFF', border: `1px solid ${UI.line}`,
        boxShadow: '0 1px 2px rgba(26,28,30,.06)', cursor: 'pointer',
        transition: 'box-shadow 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(26,28,30,.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 2px rgba(26,28,30,.06)'}
    >
      <span style={{ width: 8, height: 8, borderRadius: 99, background: PRIORITY_COLOR[task.priority], flexShrink: 0 }} />
      <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{CTYPE_EMOJI[task.ctype] || '📌'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.83rem', fontWeight: 700, color: UI.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, background: `${bc}14`, color: bc, fontWeight: 600 }}>{shortBrand(task.account)}</span>
          <span style={{ fontSize: '0.68rem', color: UI.muted }}>{STAGE_MAP[task.status]?.label ?? task.status}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: info.color }}>{info.text}</div>
        <div style={{ fontSize: '0.65rem', color: UI.muted, marginTop: 2 }}>{format(d, 'MMM d')}</div>
      </div>
    </div>
  )
}

function DigestCard({ theme, emoji, title, count, children }: { theme: string; emoji: string; title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${UI.line}`, borderRadius: 18, padding: '1rem 1.1rem', boxShadow: UI.cardShadow }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: '1rem' }}>{emoji}</span>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: theme }}>{title} ({count})</span>
      </div>
      {children}
    </div>
  )
}

function DigestRow({ tint, titleColor, name, sub, metric }: { tint: string; titleColor: string; name: string; sub: string; metric?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: 10, padding: '8px 12px', marginBottom: 6, background: tint }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: titleColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: '0.68rem', color: titleColor, opacity: 0.72, marginTop: 2 }}>{sub}</div>
      </div>
      {metric && <div style={{ fontSize: '0.75rem', fontWeight: 700, color: titleColor, whiteSpace: 'nowrap' }}>{metric}</div>}
    </div>
  )
}

function EmptyDigest({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '1rem', color: '#C4C4BE', fontSize: '0.75rem' }}>
      {message}
    </div>
  )
}

export function PersonalBoard() {
  const { currentUser, tasks, slaConfig, selectTask } = useStore()
  if (!currentUser) return null

  const today = new Date()

  const myTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.status === 'publish') return false
      const owner = getStageOwner(t, t.status)
      return t.assignee === currentUser.name || owner === currentUser.name || owner === currentUser.role
    })
  }, [tasks, currentUser])

  const allActive = tasks.filter(t => t.status !== 'publish')
  const WEEKLY_CAP = 40

  const myHours = myTasks.reduce((s, t) => s + t.hours, 0)
  const capPct = Math.min(100, Math.round((myHours / WEEKLY_CAP) * 100))
  const capBar = capPct >= 90 ? UI.coral : capPct >= 70 ? '#E0A23F' : UI.mint
  const highCount = myTasks.filter(t => t.priority === 'High').length

  const week7 = new Date(today); week7.setDate(week7.getDate() + 7)
  const dueToday = myTasks.filter(t => { const d = parseISO(t.due); return isToday(d) || d < today })
  const dueWeek  = myTasks.filter(t => { const d = parseISO(t.due); return d > today && d <= week7 })

  // Digest: overdue across all active tasks
  const pastPublish = allActive.filter(t => parseISO(t.due) < today).map(t => ({
    t, days: differenceInDays(today, parseISO(t.due)),
  })).sort((a, b) => b.days - a.days)

  // Digest: awaiting review
  const REVIEW_STAGES = ['c-final', 'c-check', 'd-check', 'final-check']
  const awaiting = allActive.filter(t => REVIEW_STAGES.includes(t.status)).map(t => ({
    t, days: differenceInDays(today, parseISO(t.stageDate)),
  })).sort((a, b) => b.days - a.days)

  // Digest: publishing soon (this week)
  const publishing = allActive.filter(t => {
    const d = parseISO(t.due)
    return d >= today && d <= week7
  }).map(t => ({
    t, days: differenceInDays(parseISO(t.due), today),
  })).sort((a, b) => a.days - b.days)

  // Digest: SLA breached
  const breached = allActive.map(t => {
    const sla = slaConfig[t.status] ?? 3
    const biz = differenceInDays(today, parseISO(t.stageDate))
    return { t, sla, biz, days: differenceInDays(today, parseISO(t.stageDate)) }
  }).filter(x => x.biz > x.sla).sort((a, b) => b.days - a.days)

  const brandAgg: Record<string, { hours: number; count: number }> = {}
  myTasks.forEach(t => {
    if (!brandAgg[t.account]) brandAgg[t.account] = { hours: 0, count: 0 }
    brandAgg[t.account].hours += t.hours
    brandAgg[t.account].count++
  })
  const brandRows = Object.entries(brandAgg).sort((a, b) => b[1].hours - a[1].hours)

  const firstName = currentUser.name.split(' ')[0]
  const dateStr = format(today, "EEEE, MMM d, yyyy")

  return (
    <div style={{ overflowY: 'auto', height: '100%', background: '#F6F6F4' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '1.25rem 1.5rem 3rem' }}>

        {/* Greeting */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h2 className="mont" style={{ fontSize: '1.6rem', fontWeight: 800, color: UI.ink, margin: 0, letterSpacing: '-0.02em' }}>
            {greeting()}, {firstName}
          </h2>
          <p style={{ color: UI.muted, fontSize: '0.82rem', margin: '0.25rem 0 0' }}>
            {dateStr} — your live campaign room
          </p>
        </div>

        {/* BigStat cards */}
        <div style={{ display: 'flex', gap: 12, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <BigStat label="Active Tasks"    value={myTasks.length}      sub={`${highCount} high priority`} />
          <BigStat label="Due Today"       value={dueToday.length}     sub="incl. overdue" tone={dueToday.length > 0 ? 'danger' : 'default'} />
          <BigStat label="Due This Week"   value={dueWeek.length}      sub="next 7 days" />
          <BigStat label="Hours"           value={`${myHours}h`}       sub={`of ${WEEKLY_CAP}h capacity`} tone="accent" />
        </div>

        {/* Capacity bar */}
        <div style={{ background: '#FFFFFF', border: `1px solid ${UI.line}`, borderRadius: 18, padding: '1rem 1.25rem', marginBottom: '1.25rem', boxShadow: UI.cardShadow }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: UI.ink }}>This week's workload</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: UI.ink }}>{myHours}h <span style={{ color: '#C4C4BE' }}>/ {WEEKLY_CAP}h</span></span>
          </div>
          <div style={{ height: 9, borderRadius: 99, background: '#EFEFEB', overflow: 'hidden' }}>
            <div style={{ width: `${capPct}%`, height: '100%', borderRadius: 99, background: capBar, transition: 'width .4s ease' }} />
          </div>
          {brandRows.length > 0 && (
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {brandRows.map(([account, { hours, count }]) => {
                const bc = BRAND_COLORS[account] || '#94A3B8'
                return (
                  <div key={account} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: bc, display: 'inline-block' }} />
                    <span style={{ fontSize: '0.68rem', color: UI.muted }}><strong style={{ color: UI.ink }}>{shortBrand(account)}</strong> {hours}h · {count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* My Day + Up Next grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: '0.9rem' }}>☀️</span>
              <span className="mont" style={{ fontWeight: 700, fontSize: '0.85rem', color: UI.ink }}>My Day</span>
              {dueToday.length > 0 && (
                <span style={{ background: '#F8E7E5', color: '#C03A3A', borderRadius: 99, padding: '1px 8px', fontSize: '0.68rem', fontWeight: 700 }}>
                  {dueToday.length}
                </span>
              )}
            </div>
            {dueToday.length > 0
              ? dueToday.map(t => <MyTaskRow key={t.id} task={t} />)
              : <div style={{ border: '1px dashed #E0E0DC', borderRadius: 14, padding: '1.25rem', textAlign: 'center', color: '#C4C4BE', fontSize: '0.75rem' }}>Nothing due today 🎉</div>
            }
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: '0.9rem' }}>📅</span>
              <span className="mont" style={{ fontWeight: 700, fontSize: '0.85rem', color: UI.ink }}>Up Next This Week</span>
              {dueWeek.length > 0 && (
                <span style={{ background: '#EDF6C6', color: '#4B7A12', borderRadius: 99, padding: '1px 8px', fontSize: '0.68rem', fontWeight: 700 }}>
                  {dueWeek.length}
                </span>
              )}
            </div>
            {dueWeek.length > 0
              ? dueWeek.map(t => <MyTaskRow key={t.id} task={t} />)
              : <div style={{ border: '1px dashed #E0E0DC', borderRadius: 14, padding: '1.25rem', textAlign: 'center', color: '#C4C4BE', fontSize: '0.75rem' }}>No upcoming deadlines</div>
            }
          </div>
        </div>

        {/* Digest cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: '1.25rem' }}>
          <DigestCard theme="#C03A3A" emoji="🔴" title="Overdue" count={pastPublish.length}>
            {pastPublish.length > 0
              ? pastPublish.slice(0, 4).map(({ t, days }) => (
                  <div key={t.id} onClick={() => selectTask(t.id)} style={{ cursor: 'pointer' }}>
                    <DigestRow tint="#FDF2F2" titleColor="#7F1D1D" name={t.name} sub={`${shortBrand(t.account)} · ${STAGE_MAP[t.status]?.label}`} metric={`${days}d over`} />
                  </div>
                ))
              : <EmptyDigest message="Nothing overdue 🎉" />
            }
          </DigestCard>

          <DigestCard theme="#A9791F" emoji="⏳" title="Awaiting Review" count={awaiting.length}>
            {awaiting.length > 0
              ? awaiting.slice(0, 4).map(({ t, days }) => (
                  <div key={t.id} onClick={() => selectTask(t.id)} style={{ cursor: 'pointer' }}>
                    <DigestRow tint="#FDF7ED" titleColor="#7A5A0C" name={t.name} sub={`${shortBrand(t.account)} · ${STAGE_MAP[t.status]?.label}`} metric={`${days}d waiting`} />
                  </div>
                ))
              : <EmptyDigest message="No tasks in review" />
            }
          </DigestCard>

          <DigestCard theme="#4B7A12" emoji="🚀" title="Publishing This Week" count={publishing.length}>
            {publishing.length > 0
              ? publishing.slice(0, 4).map(({ t, days }) => (
                  <div key={t.id} onClick={() => selectTask(t.id)} style={{ cursor: 'pointer' }}>
                    <DigestRow tint="#F1F9E6" titleColor="#2F5A0A" name={t.name} sub={`${shortBrand(t.account)} · ${t.ctype}`} metric={days === 0 ? 'today' : `in ${days}d`} />
                  </div>
                ))
              : <EmptyDigest message="Nothing shipping this week" />
            }
          </DigestCard>

          <DigestCard theme="#C0453E" emoji="⚠️" title="SLA Breached" count={breached.length}>
            {breached.length > 0
              ? breached.slice(0, 4).map(({ t, biz, sla }) => (
                  <div key={t.id} onClick={() => selectTask(t.id)} style={{ cursor: 'pointer' }}>
                    <DigestRow tint="#FBF0EF" titleColor="#8A2020" name={t.name} sub={`${shortBrand(t.account)} · ${STAGE_MAP[t.status]?.label}`} metric={`${biz}d / ${sla}d`} />
                  </div>
                ))
              : <EmptyDigest message="All stages on time" />
            }
          </DigestCard>
        </div>

      </div>
    </div>
  )
}
