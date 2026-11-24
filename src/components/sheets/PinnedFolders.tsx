'use client'

/**
 * The pinned folders under Sheets in the sidebar (spec 013 FR-072,
 * contracts/ui.md §1): a link each, and a ⋯ menu with Unpin, plus Rename and
 * Delete for team folders. Changes refresh the layout, which reloads the pins.
 */
import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { PinnedFolder } from '@/types/index'
import { validateFolderName, FOLDER_NAME_MAX } from '@/lib/sheet-names'
import { sheetsApi as api } from './api'
import { PopMenu, type PopItem } from './PopMenu'
import { ConfirmDialog } from './Dialogs'

export function PinnedFolders({ pins, pathname }: { pins: PinnedFolder[]; pathname: string }) {
  const t = useTranslations('sheets')
  const router = useRouter()
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: PopItem[]; anchor: HTMLElement } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<PinnedFolder | null>(null)
  /** Why an unpin or a delete didn't go through (they used to fail without a word). */
  const [fail, setFail] = useState<string | null>(null)
  const saving = useRef(false)
  const cancelled = useRef(false)
  const nameOf = (f: PinnedFolder) => (f.kind === 'content' ? t('folder.content') : f.kind === 'video' ? t('folder.video') : f.name ?? '')
  const errText = (e: string) => (t.has(`err.${e}`) ? t(`err.${e}`, { max: FOLDER_NAME_MAX }) : t('err.generic'))

  async function unpin(f: PinnedFolder) {
    setFail(null)
    const res = await api.setPins(pins.filter(p => p.id !== f.id).map(p => p.id))
    if (res.success) router.refresh()
    else setFail(errText(res.error))
  }
  async function rename(f: PinnedFolder) {
    if (saving.current) return
    const v = validateFolderName(draft, [])
    if (!v.ok) { setErr(errText(v.error)); return }
    saving.current = true
    const res = await api.renameFolder(f.id, v.name)
    saving.current = false
    if (!res.success) { setErr(errText(res.error)); return }
    setRenaming(null); setErr(null)
    router.refresh()
  }
  /** Leaving the box keeps what was typed: it saves, unless nothing changed. */
  function leave(f: PinnedFolder) {
    if (cancelled.current || saving.current) return
    if (draft.trim() === (f.name ?? '').trim()) { setRenaming(null); setErr(null); return }
    void rename(f)
  }
  async function remove(f: PinnedFolder) {
    setDeleting(null)
    setFail(null)
    const res = await api.deleteFolder(f.id)
    if (!res.success) { setFail(errText(res.error)); return }
    if (pathname.startsWith(`/sheets/${f.id}`)) router.push('/sheets')
    router.refresh()
  }

  function open(f: PinnedFolder, anchor: HTMLElement) {
    const b = anchor.getBoundingClientRect()
    const team = f.kind === 'team'
    setMenu({
      at: { x: b.left, y: b.bottom }, anchor,
      items: [
        { key: 'unpin', label: t('folder.unpin'), onSelect: () => void unpin(f) },
        { key: 'rename', label: t('folder.rename'), ...(team ? {} : { disabled: true, why: t('folder.linkedNoRename') }), onSelect: () => { setDraft(f.name ?? ''); setErr(null); cancelled.current = false; setRenaming(f.id) } },
        { key: 'delete', label: t('folder.delete'), danger: true, ...(team ? {} : { disabled: true, why: t('folder.linkedNoDelete') }), onSelect: () => setDeleting(f) },
      ],
    })
  }

  return (
    <div className="fx-sh-pins" role="group" aria-label={t('pinned')}>
      {pins.map(f => {
        const href = `/sheets/${f.id}`
        const active = pathname.startsWith(href)
        if (renaming === f.id) return (
          <form key={f.id} className="fx-sh-pin is-renaming" onSubmit={e => { e.preventDefault(); void rename(f) }}>
            <input autoFocus value={draft} aria-label={t('home.folderName')} maxLength={80} aria-invalid={!!err || undefined}
                   name="folder-name" autoComplete="off" aria-describedby={err ? `fx-pin-err-${f.id}` : undefined}
                   onChange={e => { setDraft(e.target.value); setErr(null) }}
                   onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; setRenaming(null); setErr(null) } }}
                   onBlur={() => leave(f)} />
            {err && <span className="fx-sh-err" id={`fx-pin-err-${f.id}`} role="alert">{err}</span>}
          </form>
        )
        return (
          <div key={f.id} className={`fx-sh-pin${active ? ' is-active' : ''}`} data-pinned-folder={f.id}>
            <Link href={href} aria-current={active ? 'page' : undefined}>{nameOf(f)}</Link>
            <button type="button" className="fx-sh-pin-more" aria-label={`${t('folder.menu')}: ${nameOf(f)}`} aria-haspopup="menu"
                    onClick={e => open(f, e.currentTarget)}>⋯</button>
          </div>
        )
      })}
      {fail && <p className="fx-sh-err" role="alert" data-pin-error="">{fail}</p>}
      {menu && <PopMenu at={menu.at} items={menu.items} label={t('folder.menu')} returnTo={menu.anchor} attr="data-pin-menu" onClose={() => setMenu(null)} />}
      {deleting && (
        <ConfirmDialog danger title={`${t('folder.delete')}: ${nameOf(deleting)}`} body={t('folder.deleteNoteNow', { n: deleting.sheetCount })}
                       ok={t('deleteSheet.ok')} cancel={t('deleteSheet.cancel')} onCancel={() => setDeleting(null)} onOk={() => void remove(deleting)} />
      )}
    </div>
  )
}
