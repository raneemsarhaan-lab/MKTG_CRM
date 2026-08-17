/**
 * Links in text — finding them, and deciding which are safe to go and look at.
 *
 * Both halves are here so the client and the server agree on what counts as a
 * link: the composer draws what this finds, and the preview fetcher refuses
 * anything this rejects.
 */

/**
 * Matches a bare http(s) URL, and a www. one without the scheme.
 *
 * Deliberately conservative about the tail: trailing punctuation is left out
 * of the match, because "see https://example.com/x." ends a sentence far more
 * often than it names a file called "x.".
 */
export const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()[\]{}"']+/gi

/** Strip the punctuation a sentence leaves stuck to the end of a URL. */
export function trimUrl(raw: string): string {
  let url = raw
  while (url.length && '.,;:!?'.includes(url[url.length - 1])) url = url.slice(0, -1)
  // A closing bracket only comes off when nothing inside the URL opened it —
  // "(see https://x.com/a)" ends a parenthesis, "https://x.com/a_(b)" does not.
  for (const [open, close] of [['(', ')'], ['[', ']']] as const) {
    while (url.endsWith(close)
      && url.split(open).length < url.split(close).length) url = url.slice(0, -1)
  }
  return url
}

/** What a matched link points at — "www.x.com" needs a scheme bolted on. */
export function hrefFor(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

/** "drive.google.com/…/folders/1Fo6…" → "drive.google.com" */
export function hostOf(url: string): string {
  try { return new URL(hrefFor(url)).hostname.replace(/^www\./, '') } catch { return '' }
}

/**
 * The path, shortened for display.
 *
 * A Drive folder id is forty characters of noise; the reader wants to know it
 * is a Drive folder, not which one.
 */
export function prettyPath(url: string): string {
  try {
    const u = new URL(hrefFor(url))
    const path = (u.pathname + u.search).replace(/\/$/, '')
    return path === '' || path === '/' ? '' : path
  } catch { return '' }
}

/**
 * Is this an address the server may fetch on a user's behalf?
 *
 * A preview means our server makes a request to a URL a user typed, which is
 * the classic way to talk a server into knocking on doors only it can reach —
 * a metadata endpoint, a database on the same private network, something bound
 * to localhost. So: http(s) only, no credentials in the URL, no default ports
 * other than the standard ones, and no host that is or resolves to a private,
 * loopback, link-local or otherwise internal address.
 *
 * The DNS half lives in the action, because it needs Node's resolver; this is
 * the part that can also run in the browser.
 */
export function isFetchableUrl(raw: string): boolean {
  let u: URL
  try { u = new URL(hrefFor(raw)) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  if (u.username || u.password) return false
  if (u.port && u.port !== '80' && u.port !== '443') return false
  return !isPrivateHost(u.hostname)
}

/** Hostnames and literal addresses that must never be fetched. */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa')) return true
  if (!h.includes('.') && !h.includes(':')) return true          // a bare hostname is internal
  return isPrivateAddress(h)
}

/** True for a literal IP that belongs to a private or otherwise special range. */
export function isPrivateAddress(addr: string): boolean {
  const a = addr.toLowerCase().replace(/^\[|\]$/g, '')

  // Every IPv6 literal is refused, and that is the whole rule.
  //
  // Not because they are all private — because deciding which are is a game
  // this does not need to play. ::ffff:10.0.0.1 is a private IPv4 wearing a
  // costume, and WHATWG normalisation rewrites it to ::ffff:a00:1 before any
  // check sees it, so a pattern that reads the dotted form misses it. Nobody
  // pastes a raw IPv6 address into a comment; a preview is not worth the hole.
  if (a.includes(':')) return true

  const p = a.split('.').map(Number)
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [x, y] = p
  if (x === 0 || x === 10 || x === 127) return true
  if (x === 169 && y === 254) return true                        // link-local, incl. cloud metadata
  if (x === 172 && y >= 16 && y <= 31) return true
  if (x === 192 && y === 168) return true
  if (x === 100 && y >= 64 && y <= 127) return true              // carrier-grade NAT
  if (x >= 224) return true                                      // multicast and reserved
  return false
}
