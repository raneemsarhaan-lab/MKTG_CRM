'use client'

/**
 * Attachment deletes with a 5-second Undo that survives closing the panel
 * (spec 007 FR-030–FR-035, research R4, data-model PendingDelete).
 *
 * The entries are ephemeral UI state in the Zustand store (Constitution §VI).
 * The timers live here, keyed by attachment id, because a timeout handle is
 * not state. Nothing is removed from the server until a window ends: Undo
 * never has to bring bytes back, because they were never deleted.
 *
 * The server delete is injected (`configurePendingDeletes`) rather than
 * imported, so this module carries no server action and the attachments lab
 * can drive it with a fake.
 */
import { useUIStore } from '@/store/useUIStore'
import type { PendingDelete, TaskAttachment } from '@/types/index'

export const UNDO_MS = 5_000
/** After the panel closes, the bottom message offers Undo for at least this long. */
export const AFTER_CLOSE_MS = 6_000

type Remove = (attachmentId: string) => Promise<{ success: boolean; error?: string }>
type Listener = {
  /** A file came back: Undo, or a delete the server refused. */
  restored?: (a: TaskAttachment) => void
  /** A file went away for another reason: the new half of an undone Replace. */
  removed?: (attachmentId: string) => void
}

let remove: Remove | null = null
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const listeners = new Map<string, Set<Listener>>()

const store = () => useUIStore.getState()

/** Wire the real server delete (the app) or a fake (the lab). Safe to call again. */
export function configurePendingDeletes(fn: Remove) {
  remove = fn
  if (typeof window !== 'undefined' && !installed) {
    installed = true
    window.addEventListener('pagehide', flushOnPageHide)
  }
}
let installed = false

function emit(taskId: string, ev: 'restored' | 'removed', arg: TaskAttachment | string) {
  for (const l of listeners.get(taskId) ?? []) {
    if (ev === 'restored') l.restored?.(arg as TaskAttachment)
    else l.removed?.(arg as string)
  }
}

/** Listen for restores and removals on one task's files. Returns the unsubscribe. */
export function subscribePendingDeletes(taskId: string, l: Listener): () => void {
  const set = listeners.get(taskId) ?? new Set<Listener>()
  set.add(l)
  listeners.set(taskId, set)
  return () => { set.delete(l) }
}

function schedule(id: string, ms: number) {
  clearTimeout(timers.get(id))
  timers.set(id, setTimeout(() => { void commitDelete(id) }, ms))
}

/** Start a 5-second Undo window. Any earlier pending delete is committed first (FR-035). */
export function requestDelete(
  a: TaskAttachment,
  opts: { label?: PendingDelete['label']; pairedNewId?: string } = {},
) {
  for (const id of Object.keys(store().pendingDeletes)) if (id !== a.id) void commitDelete(id)
  store().putPendingDelete({
    attachment: a, taskId: a.task_id, deadline: Date.now() + UNDO_MS,
    phase: 'in-panel', label: opts.label ?? 'deleted', pairedNewId: opts.pairedNewId,
  })
  schedule(a.id, UNDO_MS)
}

/** The window ended: send the delete. If the server refuses, the file comes back. */
export async function commitDelete(id: string) {
  const e = store().pendingDeletes[id]
  clearTimeout(timers.get(id)); timers.delete(id)
  if (!e) return
  store().dropPendingDelete(id)
  let ok = false
  try { ok = (await remove?.(id))?.success ?? false } catch { ok = false }
  if (!ok) emit(e.taskId, 'restored', e.attachment)
}

/**
 * Undo: the file returns as it was. For "Replace it", the new file is deleted
 * so the task is back as it was (FR-056). Returns the restored attachment.
 */
export function undoDelete(id: string): TaskAttachment | null {
  const e = store().pendingDeletes[id]
  if (!e) return null
  clearTimeout(timers.get(id)); timers.delete(id)
  store().dropPendingDelete(id)
  // The new half of an undone Replace goes first, so a refresh triggered by the
  // restore already knows to leave it out.
  if (e.pairedNewId) {
    const newId = e.pairedNewId
    emit(e.taskId, 'removed', newId)
    void remove?.(newId)
  }
  emit(e.taskId, 'restored', e.attachment)
  return e.attachment
}

/**
 * The panel for `taskId` is closing: its pending deletes move to the bottom
 * message, with at least AFTER_CLOSE_MS left to undo (FR-034).
 */
export function panelClosed(taskId: string) {
  const now = Date.now()
  for (const e of Object.values(store().pendingDeletes)) {
    if (e.taskId !== taskId || e.phase !== 'in-panel') continue
    const deadline = Math.max(e.deadline, now + AFTER_CLOSE_MS)
    store().putPendingDelete({ ...e, phase: 'after-close', deadline })
    schedule(e.attachment.id, deadline - now)
  }
}

/**
 * The page is going away: send every pending delete now, with `keepalive` so
 * the request outlives the page. If it can't be sent, the file stays — the
 * safe way round (spec edge case).
 */
function flushOnPageHide() {
  for (const e of Object.values(store().pendingDeletes)) {
    clearTimeout(timers.get(e.attachment.id)); timers.delete(e.attachment.id)
    try {
      void fetch(`/api/attachments/${e.attachment.id}`, { method: 'DELETE', keepalive: true, credentials: 'same-origin' })
    } catch { /* the file stays */ }
    store().dropPendingDelete(e.attachment.id)
  }
}

/** The section's view of pending deletes (contracts/attachments-section.md). */
export function usePendingDelete() {
  const pending = useUIStore(s => s.pendingDeletes)
  return {
    pending,
    isPending: (id: string) => id in pending,
    request: requestDelete,
    undo: undoDelete,
    panelClosed,
    subscribe: subscribePendingDeletes,
  }
}
