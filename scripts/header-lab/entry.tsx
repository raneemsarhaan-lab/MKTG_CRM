/**
 * Header lab (spec 011 T002): mounts the real BoardHeader, BoardToolbar,
 * BrandMenu, FiltersButton, ViewMenu and the compact InboxButton with a stub
 * host that mirrors KanbanBoard's wiring (tab ↔ view, the last pipeline view,
 * search, scope, brands, filters, display options). The sheets' own bars are
 * covered by the sheet lab; here the Sheet and Content rows are stand-ins.
 *
 * Hash options:
 *   locale  en | ar           me     admin | user
 *   inbox   urgent | normal | clear
 *   view    board | sheet | content
 *   brands  4 | 12            week   1 (Show your week on)
 * Records the host's state and calls on window.__header.
 */
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import ar from '../../messages/ar.json'
import type { BoardView, Brand, Member, Task } from '@/types/index'
import type { InboxCounts } from '@/lib/inbox'
import { BoardHeader } from '@/components/board/BoardHeader'
import { BoardToolbar } from '@/components/board/BoardToolbar'
import { ViewPair } from '@/components/board/ViewPair'
import { FiltersButton, EMPTY_FILTERS, activeFilterCount, type BoardFilterState } from '@/components/kanban/BoardFilters'
import { InboxButton } from '@/components/inbox/InboxButton'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { ViewMenu } from '@/components/inbox/ViewMenu'

const params = new URLSearchParams(location.hash.slice(1))
const locale = params.get('locale') === 'ar' ? 'ar' : 'en'
document.documentElement.lang = locale
document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'

const BRANDS4: Brand[] = [
  { id: 'ff', name: 'Forefront Consulting', color: '#B4322F' },
  { id: 'ip', name: 'Islam Personal Branding', color: '#1E293B' },
  { id: 'om', name: 'Omnisight', color: '#0E7C7B' },
  { id: 'sc', name: 'The Strategy Community', color: '#7A5A2E' },
]
const BRANDS: Brand[] = params.get('brands') === '12'
  ? [...BRANDS4, ...Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, name: `Client brand number ${i + 5}`, color: '#334155' }))]
  : BRANDS4

const member = (id: string, name: string, role: string, access: Member['access']): Member => ({
  id, name, email: `${id}@forefront.consulting`, role, access, capacity_hrs_wk: 40, status: 'Available',
})
const MEMBERS = [member('raneem', 'Raneem Sarhaan', 'Brand Director', 'admin'), member('cc', 'Content Creator', 'Content Creator', 'user')]
const me = params.get('me') === 'user' ? MEMBERS[1] : MEMBERS[0]

const COUNTS: Record<string, InboxCounts> = {
  urgent: { reviews: 2, yours: 5, late: 1, today: 1, undated: 0, todo: 7, total: 7, urgent: true },
  normal: { reviews: 2, yours: 1, late: 0, today: 0, undated: 1, todo: 3, total: 3, urgent: false },
  clear: { reviews: 0, yours: 0, late: 0, today: 0, undated: 0, todo: 0, total: 0, urgent: false },
}
const counts = COUNTS[params.get('inbox') ?? 'urgent'] ?? COUNTS.urgent

const task = (id: string, name: string, brand: string, project: string | null): Task => ({
  id, name, brand_id: brand, project_id: project, task_owner_id: 'raneem', assignee_id: null, status: 'todo',
  content_type_label: 'Post', priority: 'Medium', stage_date: '2026-11-01', created_at: '2026-11-01', updated_at: '2026-11-01',
} as unknown as Task)
const TASKS: Task[] = [
  task('t1', 'Founder Interview', 'ff', null), task('t2', 'Strategy Is a Daily Habit', 'ff', null),
  task('t3', 'AI Pillar SM Campaign – Post 2', 'ff', 'p1'), task('t4', 'Weekly market note', 'om', 'p2'),
]

type Lab = {
  view: BoardView; search: string; scope: 'me' | 'team'; brandIds: string[]; filters: BoardFilterState
  showWeek: boolean; upstream: boolean; inboxOpen: boolean; newTask: number
}
declare global { interface Window { __header: Lab } }
const initialView = (['board', 'sheet', 'content'] as const).find(v => v === params.get('view')) ?? 'board'
window.__header = {
  view: initialView, search: '', scope: 'me', brandIds: [], filters: EMPTY_FILTERS,
  showWeek: params.get('week') === '1', upstream: true, inboxOpen: false, newTask: 0,
}

function Host() {
  const [view, setView] = useState<BoardView>(initialView)
  const [last, setLast] = useState<'board' | 'sheet'>(initialView === 'sheet' ? 'sheet' : 'board')
  const [filters, setFilters] = useState<BoardFilterState>(EMPTY_FILTERS)
  const [scope, setScope] = useState<'me' | 'team'>('me')
  const [showWeek, setShowWeek] = useState(window.__header.showWeek)
  const [upstream, setUpstream] = useState(true)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [, bump] = useState(0)
  Object.assign(window.__header, { view, search: filters.search, scope, brandIds: filters.brandIds, filters, showWeek, upstream, inboxOpen })

  const go = (v: BoardView) => { setView(v); if (v !== 'content') setLast(v) }
  const noProject = filters.brandIds.length === 1 ? TASKS.filter(t => t.brand_id === filters.brandIds[0] && !t.project_id).length : null

  return (
    <div data-lab-ready="">
      <div className="fx-hd-wrap">
        <BoardHeader
          tab={view === 'content' ? 'content' : 'pipeline'}
          onTab={tab => go(tab === 'content' ? 'content' : last)}
          search={filters.search}
          onSearch={q => setFilters(f => ({ ...f, search: q }))}
          inbox={<><NotificationBell /><InboxButton variant="compact" counts={counts} ringKeys={[]} open={inboxOpen} onToggle={() => setInboxOpen(o => !o)} /></>}
          account={<button type="button" className="fx-hd-avatar" data-account="" aria-label={`${me.name}, ${me.role}`} title={`${me.name} · ${me.role}`}>
            <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', border: '2.5px solid #A855F7', background: '#C2410C', color: '#fff', display: 'grid', placeItems: 'center', font: '700 13px Inter, sans-serif' }}><i className="fx-hd-initials" data-initials="RS" /></span>
          </button>}
          canCreate={me.access !== 'user'}
          onNewTask={() => { window.__header.newTask++; bump(n => n + 1) }}
        />
        {view === 'board' && (
          <BoardToolbar
            scope={scope} onScope={setScope}
            brands={BRANDS} brandIds={filters.brandIds} onBrandIds={ids => setFilters(f => ({ ...f, brandIds: ids }))}
            noProject={noProject}
            filters={<FiltersButton filters={filters} onChange={setFilters} tasks={TASKS} members={MEMBERS} />}
            view="board" onView={go}
            display={<ViewMenu showWeek={showWeek} onShowWeek={setShowWeek} upstream={upstream} onUpstream={setUpstream} />}
          />
        )}
        {view === 'sheet' && (
          <div className="fx-sheet-bar" data-toolbar="" data-sheet-bar="">
            <span className="fx-sheet-bar-gap" /><button type="button" className="fx-sheet-btn">Paste clips</button>
            <span className="fx-hd-vr" aria-hidden="true" /><ViewPair view="sheet" onView={go} />
          </div>
        )}
        {view === 'content' && (
          <div className="fx-sheet-bar" data-toolbar="" data-content-bar="">
            <span className="fx-sheet-bar-gap" /><button type="button" className="fx-sheet-btn">Paste plan</button>
          </div>
        )}
        {view === 'board' && activeFilterCount(filters) > 0 && <div className="fx-hd-showing" data-showing="">{filters.search ? 'filtered' : ''}</div>}
      </div>
      {showWeek && view === 'board' && <div className="lab-week" data-week="">Your week</div>}
      {view === 'board' && (
        <div className="lab-board fx-board-cols" data-board="">
          {['To do', 'C-In progress', 'C-Review', 'D-In progress', 'Ready to publish'].map(c => <div key={c} className="lab-col">{c}</div>)}
        </div>
      )}
      {inboxOpen && <div data-inbox-panel-stub="" role="dialog" aria-label="Inbox">Inbox panel</div>}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <NextIntlClientProvider locale={locale} messages={locale === 'ar' ? ar : en} timeZone="Africa/Cairo"
                          onError={e => console.error(String(e.code ?? ''), e.message)}>
    <Host />
  </NextIntlClientProvider>,
)
