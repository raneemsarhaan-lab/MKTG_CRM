/**
 * Sign out by deleting the cookie, then load /login as a real navigation.
 *
 * Shared because there are two ways out of the product now — the account menu
 * in the sidebar, and the More sheet on a phone — and two copies of the way
 * you sign out is one copy that will quietly stop matching the other.
 *
 * The navigation is deliberate: a client-side route change would leave the
 * old session's data sitting in React's cache. A full load starts clean.
 * Errors are swallowed on purpose — if the request fails the cookie may still
 * be gone, and leaving someone on a page they believe they have left is the
 * worse outcome of the two.
 */
export async function logout(): Promise<void> {
  try {
    await fetch('/api/logout', { method: 'POST', cache: 'no-store', credentials: 'same-origin' })
  } catch { /* navigate regardless */ }
  window.location.assign('/login')
}
