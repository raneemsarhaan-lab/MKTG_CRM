/**
 * Runs once when the server starts (Next.js instrumentation hook). Starts the
 * notification scheduler (spec 012 R9) on the Node runtime only; the edge
 * runtime and the build never run it. NOTIFY_SCHEDULER=0 turns it off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startNotifyScheduler } = await import('@/lib/notify/scheduler')
  startNotifyScheduler()
}
