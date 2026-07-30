import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Task, Member, StageId, SLAConfig, TaskComment } from '../types'
import { MEMBERS, SEED_TASKS } from '../data/seed'
import { SLA_DEFAULTS } from '../data/stages'
import { supabase } from '../lib/supabase'

interface FluxoStore {
  // Data
  tasks: Task[]
  members: Member[]
  slaConfig: SLAConfig

  // Auth
  currentUser: Member | null

  // UI state
  celebration: { taskName: string; stageLabel: string } | null
  selectedTaskId: number | null
  showTaskForm: boolean
  activeBrand: string | null
  searchQuery: string
  profileOpen: boolean

  // Actions
  login: (member: Member) => void
  logout: () => void

  addTask: (task: Omit<Task, 'id' | 'stageDate'>) => void
  updateTask: (id: number, patch: Partial<Task>) => void
  deleteTask: (id: number) => void
  moveTask: (id: number, toStage: StageId) => void

  addMember: (member: Member) => void
  updateMember: (name: string, patch: Partial<Member>) => void
  removeMember: (name: string) => void

  updateSLA: (config: Partial<SLAConfig>) => void

  selectTask: (id: number | null) => void
  setShowTaskForm: (show: boolean) => void
  setActiveBrand: (brand: string | null) => void
  setSearchQuery: (q: string) => void
  clearCelebration: () => void
  setProfileOpen: (open: boolean) => void

  addComment: (taskId: number, comment: TaskComment) => void
  addAttachment: (taskId: number, names: string[]) => void
  removeAttachment: (taskId: number, idx: number) => void
}

export const useStore = create<FluxoStore>()(
  persist(
    (set, get) => ({
      tasks: SEED_TASKS,
      members: MEMBERS,
      slaConfig: SLA_DEFAULTS,
      currentUser: null,
      celebration: null,
      selectedTaskId: null,
      showTaskForm: false,
      activeBrand: null,
      searchQuery: '',
      profileOpen: false,

      login: (member) => set({ currentUser: member }),
      logout: () => { supabase.auth.signOut(); set({ currentUser: null }) },

      addTask: (taskData) => {
        const tasks = get().tasks
        const newId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1
        const today = new Date().toISOString().slice(0, 10)
        const newTask: Task = {
          ...taskData,
          id: newId,
          stageDate: today,
          comments: [],
          attachments: [],
        }
        set({ tasks: [...tasks, newTask] })
      },

      updateTask: (id, patch) => {
        set(state => ({
          tasks: state.tasks.map(t => t.id === id ? { ...t, ...patch } : t),
        }))
      },

      deleteTask: (id) => {
        set(state => ({
          tasks: state.tasks.filter(t => t.id !== id),
          selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
        }))
      },

      moveTask: (id, toStage) => {
        const today = new Date().toISOString().slice(0, 10)
        const task = get().tasks.find(t => t.id === id)
        if (!task) return

        set(state => ({
          tasks: state.tasks.map(t =>
            t.id === id ? { ...t, status: toStage, stageDate: today } : t
          ),
        }))
      },

      addMember: (member) => {
        set(state => ({ members: [...state.members, member] }))
      },

      updateMember: (name, patch) => {
        set(state => ({
          members: state.members.map(m => m.name === name ? { ...m, ...patch } : m),
        }))
      },

      removeMember: (name) => {
        set(state => ({ members: state.members.filter(m => m.name !== name) }))
      },

      updateSLA: (config) => {
        set(state => ({ slaConfig: { ...state.slaConfig, ...config } }))
      },

      selectTask: (id) => set({ selectedTaskId: id }),
      setShowTaskForm: (show) => set({ showTaskForm: show }),
      setActiveBrand: (brand) => set({ activeBrand: brand }),
      setSearchQuery: (q) => set({ searchQuery: q }),
      clearCelebration: () => set({ celebration: null }),
      setProfileOpen: (open) => set({ profileOpen: open }),

      addComment: (taskId, comment) => {
        set(state => ({
          tasks: state.tasks.map(t =>
            t.id === taskId ? { ...t, comments: [...(t.comments || []), comment] } : t
          ),
        }))
      },

      addAttachment: (taskId, names) => {
        set(state => ({
          tasks: state.tasks.map(t =>
            t.id === taskId ? { ...t, attachments: [...(t.attachments || []), ...names] } : t
          ),
        }))
      },

      removeAttachment: (taskId, idx) => {
        set(state => ({
          tasks: state.tasks.map(t =>
            t.id === taskId ? { ...t, attachments: (t.attachments || []).filter((_, i) => i !== idx) } : t
          ),
        }))
      },
    }),
    {
      name: 'fluxo-storage',
      partialize: (state) => ({
        tasks: state.tasks,
        members: state.members,
        slaConfig: state.slaConfig,
      }),
    }
  )
)
