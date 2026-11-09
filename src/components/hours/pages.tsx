'use client'

/**
 * The hours screens with the real actions (`hoursApi`). Server pages and the
 * app shell can't hand functions to the client, so they render these; the lab
 * renders the screens with a stub.
 */
import type { HoursStatus } from '@/types/index'
import { hoursApi } from './api'
import { TodayHours } from './TodayHours'
import { HoursReminder } from './HoursReminder'

export const TodayHoursApp = ({ initial }: { initial: HoursStatus | null }) => <TodayHours api={hoursApi} initial={initial} />
export const HoursReminderApp = () => <HoursReminder api={hoursApi} />
