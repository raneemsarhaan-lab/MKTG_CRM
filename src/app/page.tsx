import { redirect } from 'next/navigation'

// Root / redirects to /overview (middleware handles unauth → /login)
export default function RootPage() {
  redirect('/overview')
}
