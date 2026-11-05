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

  setCelebration:  (payload: CelebrationPayload | null) => set({ celebration: payload }),
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
