'use client'

/**
 * The Sheets home (spec 013 US8, FR-070–FR-078, contracts/ui.md §2): the two
 * folders linked to the board, then the team's folders, each a card with its
 * sheet count and who last edited it. A card's ⋯ menu pins it to the sidebar,
 * and renames or deletes a team folder. A delete waits 10 seconds with Undo
 * before it reaches the server.
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import type { FolderSummary } from '@/types/index'
import { validateFolderName, FOLDER_NAME_MAX } from '@/lib/sheet-names'
import type { SheetsApi } from './types'
import { PopMenu, type PopItem } from './PopMenu'

export const UNDO_FOLDER_MS = 10_000

export function SheetsHome({ api, initialFolders, initialPins, now: nowIso }: {
  api: SheetsApi
  initialFolders: FolderSummary[]
  initialPins: string[]
  /** The server's time, so the first render matches. */
  now: string
}) {
  const t = useTranslations('sheets')
  const format = useFormatter()
  const router = useRouter()
  const [folders, setFolders] = useState(initialFolders)
  const [pins, setPins] = useState(initialPins)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: PopItem[]; anchor: HTMLElement } | null>(null)
  const [pending, setPending] = useState<{ folder: FolderSummary; index: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const now = new Date(nowIso)

  const linked = folders.filter(f => f.kind !== 'team')
  const team = folders.filter(f => f.kind === 'team').sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }))
  const nameOf = (f: FolderSummary) => (f.kind === 'content' ? t('folder.content') : f.kind === 'video' ? t('folder.video') : f.name ?? '')
  const errText = (e: string) => (t.has(`err.${e}`) ? t(`err.${e}`, { max: FOLDER_NAME_MAX }) : t('err.generic'))
  const say = (s: string) => { setToast(s); window.setTimeout(() => setToast(x => (x === s ? null : x)), 6000) }

  // The delete goes through when the window ends, or when the page is left.
  const commitDelete = async () => {
    const p = pendingRef.current
    if (!p) return
    window.clearTimeout(timer.current)
    setPending(null)
    const res = await api.deleteFolder(p.folder.id)
    if (!res.success) {
      setFolders(list => { const n = [...list]; n.splice(Math.min(p.index, n.length), 0, p.folder); return n })
      say(errText(res.error))
    } else router.refresh()
  }
  useEffect(() => {
    const leave = () => { void commitDelete() }
    window.addEventListener('pagehide', leave)
    return () => { window.removeEventListener('pagehide', leave); void commitDelete() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function startDelete(f: FolderSummary) {
    if (pendingRef.current) void commitDelete()
    const index = folders.findIndex(x => x.id === f.id)
    setFolders(list => list.filter(x => x.id !== f.id))
    setPending({ folder: f, index })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void commitDelete(), UNDO_FOLDER_MS)
  }
  function undoDelete() {
    const p = pendingRef.current
    if (!p) return
    window.clearTimeout(timer.current)
    setPending(null)
    setFolders(list => { const n = [...list]; n.splice(Math.min(p.index, n.length), 0, p.folder); return n })
  }

  async function togglePin(f: FolderSummary) {
    const next = pins.includes(f.id) ? pins.filter(id => id !== f.id) : [...pins, f.id]
    const prev = pins
    setPins(next)
    const res = await api.setPins(next)
    if (!res.success) { setPins(prev); say(errText(res.error)) } else router.refresh()
  }

  async function create(name: string): Promise<string | null> {
    const v = validateFolderName(name, folders.filter(f => f.kind === 'team').map(f => f.name ?? ''))
    if (!v.ok) return errText(v.error)
    const res = await api.createFolder(v.name, { sheetPattern: t.raw('sheet.defaultName') as string })
    if (!res.success) return errText(res.error)
    setCreating(false)
    router.push(`/sheets/${res.folderId}`)
    return null
  }
  async function rename(f: FolderSummary, name: string): Promise<string | null> {
    if (name.trim() === f.name) { setRenaming(null); return null }
    const v = validateFolderName(name, folders.filter(x => x.kind === 'team' && x.id !== f.id).map(x => x.name ?? ''))
    if (!v.ok) return errText(v.error)
    setFolders(list => list.map(x => (x.id === f.id ? { ...x, name: v.name } : x)))
    setRenaming(null)
    const res = await api.renameFolder(f.id, v.name)
    if (!res.success) { setFolders(list => list.map(x => (x.id === f.id ? f : x))); say(errText(res.error)) } else router.refresh()
    return null
  }

  function openMenu(f: FolderSummary, anchor: HTMLElement, at?: { x: number; y: number }) {
    const b = anchor.getBoundingClientRect()
    const isLinked = f.kind !== 'team'
    setMenu({
      at: at ?? { x: b.left, y: b.bottom }, anchor,
      items: [
        { key: 'pin', label: pins.includes(f.id) ? t('folder.unpin') : t('folder.pin'), onSelect: () => void togglePin(f) },
        { key: 'rename', label: t('folder.rename'), ...(isLinked ? { disabled: true, why: t('folder.linkedNoRename') } : {}), onSelect: () => setRenaming(f.id) },
        { key: 'delete', label: t('folder.delete'), danger: true, ...(isLinked ? { disabled: true, why: t('folder.linkedNoDelete') } : {}), onSelect: () => startDelete(f) },
      ],
    })
  }

  const edited = (f: FolderSummary) => {
    const time = format.relativeTime(new Date(f.updatedAt), now)
    return f.updatedBy ? t('home.edited', { time, name: f.updatedBy }) : t('home.editedNoName', { time })
  }

  const card = (f: FolderSummary) => (
    <div key={f.id} className={`fx-sh-card${f.kind !== 'team' ? ' is-linked' : ''}`} data-folder={f.id}
         onContextMenu={e => { e.preventDefault(); openMenu(f, e.currentTarget, { x: e.clientX, y: e.clientY }) }}>
      {renaming === f.id
        ? <NameInput label={t('home.folderName')} initial={f.name ?? ''} ok={t('home.create')} cancel={t('home.cancel')}
                     onDone={v => (v === null ? (setRenaming(null), Promise.resolve(null)) : rename(f, v))} />
        : (
          <a className="fx-sh-card-link" href={`/sheets/${f.id}`} onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); router.push(`/sheets/${f.id}`) }}>
            <span className={`fx-sh-card-ic is-${f.kind}`} aria-hidden="true">{f.kind === 'content' ? '✎' : f.kind === 'video' ? '▶' : '▦'}</span>
            <span className="fx-sh-card-body">
              <b>{nameOf(f)}{f.kind !== 'team' && <span className="fx-sh-linked"> 🔗 {t('home.linkedBadge')}</span>}</b>
              <small>{t('home.sheets', { n: f.sheetCount })} · {edited(f)}</small>
            </span>
          </a>
        )}
      {renaming !== f.id && (
        <button type="button" className="fx-sh-card-menu" aria-label={`${t('folder.menu')}: ${nameOf(f)}`} aria-haspopup="menu" data-folder-menu={f.id}
                onClick={e => openMenu(f, e.currentTarget)}>⋯</button>
      )}
      {pins.includes(f.id) && <span className="fx-sh-pinned" aria-label={t('pinned')} title={t('pinned')}>📌</span>}
    </div>
  )

  return (
    <div className="fx-sh-home" data-sheets-home="">
      <div className="fx-sh-home-head">
        <h1>{t('home.title')}</h1>
        <button type="button" className="fx-sh-cta" data-new-folder="" onClick={() => setCreating(true)}>+ {t('home.newFolder')}</button>
      </div>
      <section aria-labelledby="fx-sh-linked-h">
        <h2 id="fx-sh-linked-h">{t('home.linked')}</h2>
        <div className="fx-sh-cards">{linked.map(card)}</div>
      </section>
      <section aria-labelledby="fx-sh-team-h">
        <h2 id="fx-sh-team-h">{t('home.team')}</h2>
        {!team.length && !creating && <p className="fx-sh-muted">{t('home.empty')}</p>}
        <div className="fx-sh-cards">
          {team.map(card)}
          {creating
            ? (
              <div className="fx-sh-card is-new" data-folder-new="">
                <NameInput label={t('home.folderName')} initial="" ok={t('home.create')} cancel={t('home.cancel')}
                           onDone={v => (v === null ? (setCreating(false), Promise.resolve(null)) : create(v))} />
              </div>
            )
            : <button type="button" className="fx-sh-card is-add" onClick={() => setCreating(true)}>+ {t('home.newFolder')}</button>}
        </div>
      </section>
      {menu && <PopMenu at={menu.at} items={menu.items} label={t('folder.menu')} returnTo={menu.anchor} attr="data-folder-actions" onClose={() => setMenu(null)} />}
      {pending && (
        <div className="fx-sh-toast is-undo" role="status" data-folder-undo="">
          <span>{t('folder.deleted', { name: nameOf(pending.folder) })}</span>
          <button type="button" onClick={undoDelete}>{t('folder.undo')}</button>
        </div>
      )}
      {toast && !pending && <div className="fx-sh-toast" role="status">{toast}</div>}
    </div>
  )
}

/** A folder name typed in place: Enter or the button saves, Esc cancels, a bad name says why. */
function NameInput({ label, initial, ok, cancel, onDone }: {
  label: string; initial: string; ok: string; cancel: string
  onDone(v: string | null): Promise<string | null>
}) {
  const [v, setV] = useState(initial)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  const save = async () => {
    if (busy) return
    setBusy(true)
    const e = await onDone(v)
    setBusy(false)
    if (e) { setErr(e); ref.current?.focus() }
  }
  return (
    <form className="fx-sh-namein" onSubmit={e => { e.preventDefault(); void save() }}>
      <input ref={ref} value={v} aria-label={label} placeholder={label} maxLength={80} data-folder-name=""
             aria-invalid={!!err || undefined} aria-describedby={err ? 'fx-sh-namein-err' : undefined}
             onChange={e => { setV(e.target.value); setErr(null) }}
             onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); void onDone(null) } }} />
      {err && <span id="fx-sh-namein-err" className="fx-sh-err" role="alert">{err}</span>}
      <span className="fx-sh-namein-row">
        <button type="button" onClick={() => void onDone(null)}>{cancel}</button>
        <button type="submit" className="is-go" disabled={busy}>{ok}</button>
      </span>
    </form>
  )
}
