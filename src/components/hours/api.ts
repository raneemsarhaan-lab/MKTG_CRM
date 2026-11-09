/**
 * The real HoursApi: the actions in src/actions/hours.ts. A thrown error (the
 * network, a deploy) becomes `{ success: false, error: 'network' }`.
 */
import * as A from '@/actions/hours'
import type { HoursApi } from './types'

const net = { success: false as const, error: 'network' }
const safe = <T extends unknown[], R>(fn: (...a: T) => Promise<R>) => (...a: T) => fn(...a).catch(() => net)

export const hoursApi: HoursApi = {
  hoursStatus: safe(A.hoursStatus),
  myHours: safe(A.myHours),
  saveDays: safe(A.saveDays),
  dismissReminder: safe(A.dismissReminder),
  teamHours: safe(A.teamHours),
} as HoursApi
