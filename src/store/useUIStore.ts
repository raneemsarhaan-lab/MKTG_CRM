'use client'

import { create } from 'zustand'
import type { UIStore, CelebrationPayload } from '@/types/index'

// UI-only ephemeral state — no persistence (data lives in Postgres)
// constitution.md §VI, data-model.md §UI Store Shape
export const useUIStore = create<UIStore>((set) => ({
  celebration:    null,
  selectedTaskId: null,
  showTaskForm:   false,
  profileOpen:    false,
  pendingDeletes: {},
  celebrationsOn: false,

  // Celebrations are off unless the member turns them on: a new one is dropped while off.
  setCelebration:  (payload: CelebrationPayload | null) => set(s => (payload && !s.celebrationsOn ? s : { celebration: payload })),
  setCelebrationsOn: (on: boolean) => set(on ? { celebrationsOn: true } : { celebrationsOn: false, celebration: null }),
  selectTask:      (id: string | null) => set({ selectedTaskId: id }),
  setShowTaskForm: (show: boolean) => set({ showTaskForm: show }),
  setProfileOpen:  (open: boolean) => set({ profileOpen: open }),
  // Attachment deletes in their Undo window (spec 007). The timers live in
  // src/lib/pending-deletes.ts, never here: a timeout handle is not state.
  putPendingDelete:  entry => set(s => ({ pendingDeletes: { ...s.pendingDeletes, [entry.attachment.id]: entry } })),
  dropPendingDelete: id => set(s => {
    if (!(id in s.pendingDeletes)) return s
    const next = { ...s.pendingDeletes }
    delete next[id]
    return { pendingDeletes: next }
  }),
}))
