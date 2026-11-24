import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Spec 026 (§1): there is no Sheets section. Its old address leads to the Content Space's sheet. */
export default function SheetsPage() {
  redirect('/spaces/content?view=sheet')
}
