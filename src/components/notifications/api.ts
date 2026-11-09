/**
 * The real NotifyApi: the notification actions and routes (spec 012
 * contracts/server.md). Kept apart from the screens so the lab can swap it.
 */
import {
  listNotifications, markNotification, markAllRead, openNotification, muteTaskNotifications,
  getFollow, setFollow, getNotificationSettings, saveNotificationSettings, setLocale, setGender,
} from '@/actions/notifications'
import type { NotifyApi, Pulse } from './types'

const fail = { success: false as const, error: 'generic' }

async function json<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init })
    if (!r.ok) return null
    return await r.json() as T
  } catch { return null }
}

export const notifyApi: NotifyApi = {
  pulse: active => json<Pulse>(`/api/notifications/pulse${active ? '?active=1' : ''}`),
  list: q => listNotifications(q).catch(() => fail),
  mark: (id, read) => markNotification(id, read).catch(() => fail),
  markAll: () => markAllRead().catch(() => fail),
  open: id => openNotification(id).catch(() => fail),
  mute: taskId => muteTaskNotifications(taskId).catch(() => fail),
  getFollow: taskId => getFollow(taskId).catch(() => fail),
  setFollow: (taskId, following) => setFollow(taskId, following).catch(() => fail),
  getSettings: () => getNotificationSettings().catch(() => fail),
  saveSettings: input => saveNotificationSettings(input).catch(() => fail),
  setLocale: locale => setLocale(locale).catch(() => fail),
  setGender: gender => setGender(gender).catch(() => fail),
  async pushKey() {
    const r = await json<{ publicKey: string | null }>('/api/notifications/push/key')
    return r?.publicKey ?? null
  },
  async pushSave(subscription) {
    const r = await json<{ success?: boolean }>('/api/notifications/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription }),
    })
    return !!r?.success
  },
  async pushDelete(endpoint) {
    const r = await json<{ success?: boolean }>('/api/notifications/push', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }),
    })
    return !!r?.success
  },
}
