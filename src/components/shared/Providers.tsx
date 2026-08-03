/**
 * Nothing to provide any more.
 *
 * This wrapped next-auth's SessionProvider, which polled /api/auth/session to
 * keep a client-side copy of the session. Nothing in the app ever read it —
 * every page and every action reads the session on the server — so it was a
 * background request that could only fail loudly or mislead quietly. Sessions
 * are now a signed cookie the server verifies on each request.
 *
 * Kept as a component rather than deleted, so the root layout stays unchanged
 * and there is an obvious place for a real provider when one is needed.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
