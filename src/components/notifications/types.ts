/**
 * What the notification screens need from the server (spec 012
 * contracts/server.md), as one object. The app passes the real actions
 * (`api.ts`); the lab passes a stub, so every screen can be checked without
 * a database.
 */
import type { AppNotification, EmailMode, NotificationKind } from '@/types/index'
import type { KindSettings } from '@/lib/notify/settings'

type Fail = { success: false; error: string }

export interface NotificationActor { id: string; name: string; avatar_url: string | null; gender: string | null }

export interface Pulse {
  unread: number
  latest: { id: string; last_event_at: string }[]
  dnd: boolean
}

export interface ListQuery {
  tab?: 'all' | 'unread'
  before?: string | null
  limit?: number
  kinds?: NotificationKind[]
  from?: string | null
  to?: string | null
}

export interface ListPage {
  success: true
  items: AppNotification[]
  next: string | null
  actors: NotificationActor[]
  /** Reply comment id → the author of the comment it answers. */
  parents: Record<string, string>
}

export type OpenTarget = { taskId: string; commentId?: string; section?: 'attachments' }

export interface SettingsView {
  success: true
  kinds: KindSettings
  emailMode: EmailMode
  dnd: boolean
  emailReady: boolean
  devices: { id: string; label: string; created_at: string }[]
  locale: 'en' | 'ar'
  gender: 'f' | 'm' | null
}

export interface NotifyApi {
  pulse(active: boolean): Promise<Pulse | null>
  list(q: ListQuery): Promise<ListPage | Fail>
  mark(id: string, read: boolean): Promise<{ success: true; unread: number } | Fail>
  markAll(): Promise<{ success: true; unread: 0 } | Fail>
  /** `href` (spec 015): a sheet comment, opened at its cell. */
  open(id: string): Promise<{ success: true; target: OpenTarget | null; href?: string } | Fail>
  mute(taskId: string): Promise<{ success: true } | Fail>
  getFollow(taskId: string): Promise<{ success: true; following: boolean } | Fail>
  setFollow(taskId: string, following: boolean): Promise<{ success: true; following: boolean } | Fail>
  getSettings(): Promise<SettingsView | Fail>
  saveSettings(input: { kinds?: KindSettings; emailMode?: EmailMode; dnd?: boolean }): Promise<{ success: true } | Fail>
  setLocale(locale: 'en' | 'ar'): Promise<{ success: true } | Fail>
  setGender(gender: 'f' | 'm' | null): Promise<{ success: true } | Fail>
  /** The public key for phone alerts, or null when they aren't set up. */
  pushKey(): Promise<string | null>
  pushSave(subscription: PushSubscriptionJSON): Promise<boolean>
  pushDelete(endpoint: string): Promise<boolean>
}
