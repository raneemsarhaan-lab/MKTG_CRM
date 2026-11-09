/**
 * What the hours screens need from the server (spec 014 contracts/server.md),
 * as one object. The app passes the real actions (`api.ts`); the lab passes a
 * stub, so every screen can be checked without a database.
 */
import type { HoursStatus, HoursWeekReport, WorkDayEntry } from '@/types/index'

export type Fail = { success: false; error: string }
export type LineFail = { success: false; error: 'invalid'; lines: { date: string; error: string }[] }
export type Line = { date: string; hours: number | null; off: boolean }

export interface HoursApi {
  hoursStatus(localDate: string): Promise<({ success: true } & HoursStatus) | Fail>
  myHours(from: string, to: string): Promise<{ success: true; entries: WorkDayEntry[] } | Fail>
  saveDays(entries: Line[], opts?: { memberId?: string }): Promise<{ success: true; saved: WorkDayEntry[] } | LineFail | Fail>
  dismissReminder(localDate: string): Promise<{ success: true } | Fail>
  teamHours(weekStart: string, localDate?: string): Promise<({ success: true } & HoursWeekReport) | Fail>
}
