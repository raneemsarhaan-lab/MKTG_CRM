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

  setCelebration:  (payload: CelebrationPayload | null) => set({ celebration: payload }),
  selectTask:      (id: string | null) => set({ selectedTaskId: id }),
  setShowTaskForm: (show: boolean) => set({ showTaskForm: show }),
  setProfileOpen:  (open: boolean) => set({ profileOpen: open }),
}))
