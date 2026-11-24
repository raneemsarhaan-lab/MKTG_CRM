'use client'

/**
 * The sidebar's My work / Spaces / Brands sections (spec 021, restructured in
 * spec 025).
 *
 * - My work: My tasks and the Inbox.
 * - Spaces: the team Spaces the member can see, each with one folder per brand.
 *   A Space's name opens all its tasks; its arrow only opens or closes its
 *   folder list; a folder opens that Space's tasks for that brand.
 * - Brands: each brand's page. Its views live in the page, not under it.
 *
 * A number is open tasks, with the overdue count in red beside it (25 · 3). Only My tasks and Inbox
 * carry one (user, 24 Nov 2026); Spaces, folders and brands show their names alone.
 * Used by the desktop sidebar and by the phone's More sheet. Collapsed
 * sections and open Spaces are per-device preferences, read after mount.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { NavTree as NavTreeData, PinnedFolder } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import { spaceLabel } from './labels'

const KEY = 'momentum.sidebar.collapsed'
const OPEN_KEY = 'momentum.sidebar.spaces'

type Section = 'mywork' | 'spaces' | 'brands'
const SECTIONS: Section[] = ['mywork', 'spaces', 'brands']

export function NavTree({ tree, pathname, phone = false }: { tree: NavTreeData; pins?: PinnedFolder[]; pathname: string; phone?: boolean }) {
  const t = useTranslations('spaces')
  const [collapsed, setCollapsed] = useState<Section[]>([])
  const [openSpaces, setOpenSpaces] = useState<string[]>([])

  // The Space in the address is open.
  const routeSpace = pathname.startsWith('/spaces/') ? pathname.split('/')[2] ?? null : null
  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
      if (Array.isArray(v)) setCollapsed(v.filter((x): x is Section => SECTIONS.includes(x)))
      const o = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? 'null')
      if (Array.isArray(o)) setOpenSpaces(o.filter((x): x is string => typeof x === 'string'))
    } catch { /* a preference, never required */ }
  }, [])
  useEffect(() => { if (routeSpace) setOpenSpaces(prev => (prev.includes(routeSpace) ? prev : [...prev, routeSpace])) }, [routeSpace])

  function toggle(s: Section) {
    setCollapsed(prev => {
      const next = prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
      try { window.localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  function toggleSpace(key: string) {
    setOpenSpaces(prev => {
      const next = prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]
      try { window.localStorage.setItem(OPEN_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const row = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, minHeight: phone ? 44 : 28,
    padding: '0 8px', borderRadius: 9, textDecoration: 'none',
    background: active ? '#F4FBD6' : 'transparent', color: active ? PIPE.ink : PIPE.textSecondary,
    fontSize: 13, fontWeight: active ? 700 : 500, minWidth: 0,
  })
  /** Open tasks, with the overdue count in red beside it. */
  const count = (open: number, overdue = 0) => (open > 0 || overdue > 0 ? (
    <span data-count={`${open}:${overdue}`} style={{ marginInlineStart: 'auto', paddingInlineStart: 4, fontSize: 11, color: PIPE.textMuted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>
      <span aria-label={t('openN', { n: open })}>{open}</span>
      {overdue > 0 && <> · <span data-overdue aria-label={t('overdueN', { n: overdue })} title={t('overdueN', { n: overdue })} style={{ color: '#D22040', fontWeight: 800 }}>{overdue}</span></>}
    </span>
  ) : null)
  const dot = (color: string) => <span aria-hidden="true" data-dot style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
  const name = (s: string, title?: string) => <span title={title} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
  const icon = (d: React.ReactNode) => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>{d}</svg>
  )

  function header(s: Section, label: string) {
    const open = !collapsed.includes(s)
    return (
      <button
        type="button"
        data-section={s}
        aria-expanded={open}
        onClick={() => toggle(s)}
        title={open ? t('collapse', { name: label }) : t('expand', { name: label })}
        style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: '9px 8px 3px', fontFamily: 'inherit',
          fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: PIPE.textMuted,
        }}
      >
        <span>{label}</span>
      </button>
    )
  }

  const isOn = (href: string, exact = false) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`))

  return (
    <div data-nav-tree style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {header('mywork', t('myWork'))}
      {!collapsed.includes('mywork') && (
        <>
          <Link href="/my-tasks" data-node="my-tasks" style={row(isOn('/my-tasks'))} aria-current={isOn('/my-tasks') ? 'page' : undefined}>
            {icon(<><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>)}
            {name(t('myTasks'))}
            {tree.myTasks && count(tree.myTasks.open, tree.myTasks.overdue)}
          </Link>
          <Link href="/notifications" data-node="inbox" style={row(isOn('/notifications'))} aria-current={isOn('/notifications') ? 'page' : undefined}>
            {icon(<><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" /></>)}
            {name(t('inbox'))}
            {(tree.inboxUnread ?? 0) > 0 && (
              <span data-unread aria-label={t('unreadN', { n: tree.inboxUnread ?? 0 })} style={{ marginInlineStart: 'auto', fontSize: 11, fontWeight: 700, color: PIPE.ink, background: PIPE.limePrimary, borderRadius: 999, padding: '1px 7px', fontVariantNumeric: 'tabular-nums' }}>{tree.inboxUnread}</span>
            )}
          </Link>
        </>
      )}

      {tree.spaces.length > 0 && header('spaces', t('teams'))}
      {tree.spaces.length > 0 && !collapsed.includes('spaces') && tree.spaces.map(s => {
        const href = `/spaces/${s.key}`
        const label = spaceLabel(s, t)
        const open = openSpaces.includes(s.key)
        const folders = s.folders ?? []
        return (
          <div key={s.id} data-space={s.key}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {/* The arrow only opens or closes the folder list. */}
              <button
                type="button"
                data-space-toggle={s.key}
                aria-expanded={open}
                aria-label={open ? t('collapse', { name: label }) : t('expand', { name: label })}
                onClick={() => toggleSpace(s.key)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: PIPE.textMuted, padding: phone ? 12 : '6px 2px', lineHeight: 0, flexShrink: 0 }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}>
                  <path d="M8 5l9 7-9 7z" />
                </svg>
              </button>
              <Link href={href} data-node={`space:${s.key}`} style={{ ...row(isOn(href, true)), flex: 1, paddingInlineStart: 4 }} aria-current={isOn(href, true) ? 'page' : undefined}>
                {dot(s.color)}{name(label)}
              </Link>
            </div>
            {open && folders.map(f => {
              const fh = `${href}/${f.id}`
              return (
                <Link key={f.id} href={fh} data-node={`space:${s.key}:${f.id}`} style={{ ...row(isOn(fh)), paddingInlineStart: 30, minHeight: phone ? 44 : 26 }} aria-current={isOn(fh) ? 'page' : undefined}>
                  {dot(f.color)}{name(f.name)}
                </Link>
              )
            })}
          </div>
        )
      })}

      {header('brands', t('brands'))}
      {!collapsed.includes('brands') && (
        <>
          {[...tree.brands.map(b => ({ ...b, slug: b.id })), ...(tree.noBrandOpen > 0 ? [{ id: 'none', slug: 'none', name: t('noBrand'), full_name: t('noBrand'), color: PIPE.textFaint, open: tree.noBrandOpen, overdue: tree.noBrandOverdue ?? 0 }] : [])].map(b => {
            const href = `/brands/${b.slug}`
            return (
              <Link key={b.id} href={href} data-node={`brand:${b.slug}`} style={row(isOn(href))} aria-current={isOn(href) ? 'page' : undefined}>
                {dot(b.color)}{name(b.name, b.full_name)}
              </Link>
            )
          })}
        </>
      )}
    </div>
  )
}
