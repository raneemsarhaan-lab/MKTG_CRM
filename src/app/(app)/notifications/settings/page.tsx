import { NotificationSettings } from '@/components/notifications/NotificationSettings'

export const metadata = { title: 'Notification settings' }

/** What each member is told about, and how (spec 012 US8). The (app) layout signs in. */
export default function Page() {
  return <NotificationSettings />
}
