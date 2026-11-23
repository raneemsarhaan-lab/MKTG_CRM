'use client'

/**
 * The sidebar's Me / Teams / Brands sections (spec 021, contracts/routes.md,
 * design/teams-brands.html).
 *
 * - Me: My tasks, then the member's pinned Sheets folders (moved here from
 *   under Sheets; Unpin / Rename / Delete behave as before).
 * - Teams: the team Spaces the member belongs to (every Space for admins).
 * - Brands: each brand, and under the open one its four Folders.
 *
 * Used by the desktop sidebar and by the phone's More sheet, which is the
 * drawer form. Collapsed sections are a per-device preference
 * (`momentum.sidebar.collapsed`), read after mount.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { NavTree as NavTreeData, PinnedFolder } from '@/types/index'
import { PinnedFolders } from '@/components/sheets/PinnedFolders'
import { PIPE } from '@/lib/pipeline-tokens'
import { spaceLabel } from './labels'

const KEY = 'momentum.sidebar.collapsed'
const FOLDERS = ['calendar', 'assets', 'sheet', 'library'] as const
const FOLDER_KEY = { calendar: 'cal', assets: 'assets', sheet: 'sheet', library: 'lib' } as const

type Section = 'me' | 'teams' | 'brands'

export function NavTree({ tree, pins, pathname, phone = false }: { tree: NavTreeData; pins: PinnedFolder[]; pathname: string; phone?: boolean }) {
  const t = useTranslations('spaces')
  const [collapsed, setCollapsed] = useState<Section[]>([])
  const [openBrand, setOpenBrand] = useState<string | null>(null)

  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
      if (Array.isArray(v)) setCollapsed(v.filter((x): x is Section => x === 'me' || x === 'teams' || x === 'brands'))
    } catch { /* a preference, never required */ }
  }, [])

  // The brand in the address is the open one.
  const routeBrand = pathname.startsWith('/brands/') ? pathname.split('/')[2] ?? null : null
  useEffect(() => { if (routeBrand) setOpenBrand(routeBrand) }, [routeBrand])

  function toggle(s: Section) {
    setCollapsed(prev => {
      const next = prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
      try { window.localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const row = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, minHeight: phone ? 44 : 30,
    padding: '0 8px', borderRadius: 10, textDecoration: 'none',
    background: active ? '#F4FBD6' : 'transparent', color: active ? PIPE.ink : PIPE.textSecondary,
    fontSize: 13, fontWeight: active ? 700 : 500, minWidth: 0,
  })
  const count = (n: number) => (n > 0 ? <span data-count style={{ marginInlineStart: 'auto', fontSize: 11, color: PIPE.textMuted, fontVariantNumeric: 'tabular-nums' }}>{n}</span> : null)
  const square = (color: string, letter: string) => (
    <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 5, background: color, color: '#FFFFFF', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>{letter}</span>
  )
  const name = (s: string) => <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>

  function header(s: Section, label: string, hint?: string) {
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
          background: 'none', border: 'none', cursor: 'pointer', padding: '10px 8px 4px', fontFamily: 'inherit',
          fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: PIPE.textMuted,
        }}
      >
        <span>{label}</span>
        {hint && phone && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500, fontSize: 10 }}>{hint}</span>}
      </button>
    )
  }

  const isOn = (href: string, exact = false) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`))

  return (
    <div data-nav-tree style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {header('me', t('me'))}
      {!collapsed.includes('me') && (
        <>
          {/* My tasks moved to the top of the sidebar (user, 2026-11-23); its board and sheet views stay at /me. */}
          <Link href="/sheets" data-node="my-sheets" style={row(isOn('/sheets'))} aria-current={isOn('/sheets') ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" x2="21" y1="9" y2="9" /><line x1="3" x2="21" y1="15" y2="15" /><line x1="9" x2="9" y1="3" y2="21" />
            </svg>
            {name(t('mySheets'))}
          </Link>
          {pins.length > 0 && <PinnedFolders pins={pins} pathname={pathname} />}
        </>
      )}

      {tree.spaces.length > 0 && header('teams', t('teams'), t('teamsHint'))}
      {tree.spaces.length > 0 && !collapsed.includes('teams') && tree.spaces.map(s => {
        const href = `/spaces/${s.key}`
        const label = spaceLabel(s, t)
        return (
          <Link key={s.id} href={href} data-node={`space:${s.key}`} style={row(isOn(href))} aria-current={isOn(href) ? 'page' : undefined}>
            {square(s.color, label[0] ?? '·')}{name(label)}{count(s.open)}
          </Link>
        )
      })}

      {header('brands', t('brands'), t('brandsHint'))}
      {!collapsed.includes('brands') && (
        <>
          {[...tree.brands.map(b => ({ ...b, slug: b.id })), ...(tree.noBrandOpen > 0 ? [{ id: 'none', slug: 'none', name: t('noBrand'), color: PIPE.textFaint, open: tree.noBrandOpen }] : [])].map(b => {
            const href = `/brands/${b.slug}`
            const expanded = openBrand === b.slug
            return (
              <div key={b.id}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Link href={href} data-node={`brand:${b.slug}`} style={{ ...row(isOn(href, true)), flex: 1 }} aria-current={isOn(href, true) ? 'page' : undefined}>
                    {square(b.color, b.name[0] ?? '·')}{name(b.name)}{count(b.open)}
                  </Link>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={expanded ? t('collapse', { name: b.name }) : t('expand', { name: b.name })}
                    onClick={() => setOpenBrand(expanded ? null : b.slug)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: PIPE.textMuted, padding: phone ? 12 : 4, lineHeight: 0 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"
                         style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}>
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>
                {expanded && FOLDERS.map(f => {
                  const fh = `${href}/${f}`
                  return (
                    <Link key={f} href={fh} data-node={`brand:${b.slug}:${f}`} style={{ ...row(isOn(fh)), paddingInlineStart: 30 }} aria-current={isOn(fh) ? 'page' : undefined}>
                      {name(t(`folders.${FOLDER_KEY[f]}`))}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
