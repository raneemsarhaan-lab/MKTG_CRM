'use server'

import dns from 'node:dns/promises'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { hrefFor, isFetchableUrl, isPrivateAddress, hostOf } from '@/lib/links'

export interface LinkPreviewData {
  url:          string
  ok:           boolean
  title?:       string
  description?: string
  image_url?:   string
  site_name?:   string
  favicon?:     string
}

/** Long enough that a busy thread never refetches; short enough to notice a
 *  page that has since been retitled. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
/** A preview is worth a few seconds at most — nobody waits for a card. */
const TIMEOUT_MS = 6000
/** Metadata lives in <head>; a megabyte is far past where it can hide. */
const MAX_BYTES  = 512 * 1024
const MAX_HOPS   = 3

/**
 * What a pasted link points at — title, description, picture.
 *
 * The interesting part of this is not the parsing, it is the fetching. The URL
 * comes from whoever wrote the comment, and the request goes out from our
 * server, which can reach things a browser on the internet cannot: the private
 * network the app is deployed into, a cloud metadata endpoint, localhost. So
 * every address is checked before it is contacted, and again after every
 * redirect, because a public hostname is free to redirect to 127.0.0.1.
 *
 * Signed-in callers only, for the same reason: this is a fetcher pointed at
 * whatever it is handed, and it should not be one strangers can aim.
 */
export async function getLinkPreview(rawUrl: string): Promise<LinkPreviewData | null> {
  const member = await getSessionMember()
  if (!member) return null

  const url = normalize(rawUrl)
  if (!url) return null

  const cached = await prisma.linkPreview.findUnique({ where: { url } })
  if (cached && Date.now() - cached.fetched_at.getTime() < MAX_AGE_MS) {
    return {
      url,
      ok:          cached.ok,
      title:       cached.title       ?? undefined,
      description: cached.description ?? undefined,
      image_url:   cached.image_url   ?? undefined,
      site_name:   cached.site_name   ?? undefined,
      favicon:     cached.favicon     ?? undefined,
    }
  }

  const found = await look(url)
  const data: LinkPreviewData = { url, ...found }

  // Cached either way. A link that cannot be previewed — a private Drive
  // folder, a host we are not allowed to reach — must not be retried on every
  // render of every comment that mentions it.
  await prisma.linkPreview.upsert({
    where:  { url },
    create: {
      url, ok: data.ok,
      title: data.title, description: data.description,
      image_url: data.image_url, site_name: data.site_name, favicon: data.favicon,
    },
    update: {
      ok: data.ok, fetched_at: new Date(),
      title: data.title, description: data.description,
      image_url: data.image_url, site_name: data.site_name, favicon: data.favicon,
    },
  })

  return data
}

/** One canonical spelling per link, so the cache is not keyed twice over. */
function normalize(raw: string): string | null {
  if (!isFetchableUrl(raw)) return null
  try {
    const u = new URL(hrefFor(raw.trim()))
    u.hash = ''
    return u.toString()
  } catch { return null }
}

/** Every address this hostname resolves to must be a public one. */
async function hostIsPublic(hostname: string): Promise<boolean> {
  try {
    const addrs = await dns.lookup(hostname, { all: true })
    return addrs.length > 0 && addrs.every(a => !isPrivateAddress(a.address))
  } catch {
    return false
  }
}

/**
 * Fetch the page and read its metadata, following redirects by hand so each
 * hop can be checked before it is followed.
 */
async function look(url: string): Promise<Omit<LinkPreviewData, 'url'>> {
  const control = new AbortController()
  const timer   = setTimeout(() => control.abort(), TIMEOUT_MS)

  try {
    let current = url
    let html    = ''
    let final   = url

    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      if (!isFetchableUrl(current)) return { ok: false }
      const target = new URL(current)
      if (!await hostIsPublic(target.hostname)) return { ok: false }

      const res = await fetch(current, {
        redirect: 'manual',
        signal:   control.signal,
        headers: {
          // Asking as a link-preview bot is what makes sites hand over their
          // OpenGraph tags rather than an app shell.
          'user-agent': 'Mozilla/5.0 (compatible; MomentumBot/1.0; +link-preview)',
          'accept':     'text/html,application/xhtml+xml',
        },
      })

      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location')
        if (!next) return { ok: false }
        current = new URL(next, current).toString()
        continue
      }

      if (!res.ok) return { ok: false }
      const type = res.headers.get('content-type') ?? ''
      if (!type.includes('html')) {
        // Not a page — an image or a PDF someone linked directly. There is no
        // metadata to read, but the link is real and the card can say what it
        // is, so this still counts as a successful look.
        return { ok: true, site_name: hostOf(current), favicon: faviconFor(current) }
      }

      html  = await readCapped(res)
      final = current
      break
    }

    if (!html) return { ok: false }
    return { ok: true, ...parseMeta(html, final) }
  } catch {
    // A timeout, a refused connection, a network policy that does not allow
    // outbound requests. All the same to the reader: no card.
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}

/** Read at most MAX_BYTES of the body, then stop pulling. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return (await res.text()).slice(0, MAX_BYTES)

  const chunks: Uint8Array[] = []
  let size = 0
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  await reader.cancel().catch(() => {})

  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) { all.set(c.subarray(0, Math.min(c.length, size - at)), at); at += c.length }
  return new TextDecoder('utf-8').decode(all)
}

/* ── reading the head ─────────────────────────────────────────────────── */

/**
 * Every <meta> in the document, keyed by its property/name.
 *
 * Read as whole tags rather than hunted for one key at a time: a pattern
 * loose enough to cope with the attributes coming in either order is also
 * loose enough to match a completely different tag, which is exactly what an
 * earlier version of this did — it read GitHub's route-pattern meta and
 * called a repository "/:user_id/:repository".
 */
function metaMap(html: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0]
    const key = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase()
    const val = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1]
    if (key && val?.trim() && !out.has(key)) out.set(key, decodeEntities(val.trim()))
  }
  return out
}

function pick(meta: Map<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = meta.get(k)
    if (v) return v
  }
  return undefined
}

function parseMeta(html: string, base: string): Omit<LinkPreviewData, 'url' | 'ok'> {
  const head = html.slice(0, 200_000)
  const meta = metaMap(head)

  const title = (
    pick(meta, ['og:title', 'twitter:title'])
    ?? decodeEntities(head.match(/<title[^>]*>([^]*?)<\/title>/i)?.[1]?.trim() ?? '')
  ) || undefined

  const description = pick(meta, ['og:description', 'twitter:description', 'description'])
  const image       = pick(meta, ['og:image:secure_url', 'og:image', 'twitter:image'])
  const siteName    = pick(meta, ['og:site_name'])

  const iconHref = head.match(
    /<link[^>]+rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*>/i,
  )?.[0]?.match(/href\s*=\s*["']([^"']+)["']/i)?.[1]

  return {
    title:       title?.slice(0, 300),
    description: description?.slice(0, 600),
    image_url:   absolute(image, base),
    site_name:   siteName?.slice(0, 120) ?? hostOf(base),
    favicon:     absolute(iconHref, base) ?? faviconFor(base),
  }
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined
  try {
    const u = new URL(href, base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined
  } catch { return undefined }
}

function faviconFor(url: string): string | undefined {
  try { return new URL('/favicon.ico', url).toString() } catch { return undefined }
}

/** The handful of entities that actually turn up in a title. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
}
