import { NotificationsPage } from '@/components/notifications/NotificationsPage'

export const metadata = { title: 'Notifications' }

/** Every notification, with filters (spec 012 US9). The (app) layout signs in. */
export default function Page() {
  return <NotificationsPage />
}
