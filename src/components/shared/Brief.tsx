'use client'

import { createContext, useContext } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import GithubSlugger from 'github-slugger'

/**
 * The task brief renderer.
 *
 * Shared by the panel and the editor's preview so what you see while writing
 * is what the task shows — a second, subtly different renderer is how the two
 * drift apart.
 *
 * Four things go beyond plain Markdown, matching the Insert menu:
 *
 *  · toggle lists   raw <details>/<summary>, allowed through a sanitiser
 *  · table of contents  a [[toc]] marker expanded from the document's headings
 *  · YouTube        a bare video link on its own line becomes a player
 *  · task list      GFM checkboxes that can actually be ticked
 *
 * Raw HTML is enabled for the toggle list, so it goes through rehype-sanitize.
 * Briefs are written by signed-in staff, but "our own users" is not a security
 * model — a pasted brief is still untrusted input.
 */

const SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'id'],
    details: ['open'],
  },
}

export const TOC_MARKER = '[[toc]]'

/** youtu.be/ID, watch?v=ID, /embed/ID, /shorts/ID → ID */
export function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  )
  return m ? m[1] : null
}

/**
 * Replace the [[toc]] marker with a list of the document's own headings.
 *
 * Built here rather than in a rehype plugin because the anchors have to agree
 * with the ids rehype-slug will assign, and the simplest way to guarantee that
 * is to run the same slugger over the same heading text.
 */
export function expandToc(markdown: string): string {
  if (!markdown.includes(TOC_MARKER)) return markdown

  const slugger = new GithubSlugger()
  const items: string[] = []
  let inFence = false

  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!m) continue
    const depth = m[1].length
    const text  = m[2].replace(/[*_`~]/g, '').trim()
    items.push(`${'  '.repeat(Math.max(0, depth - 1))}- [${text}](#${slugger.slug(text)})`)
  }

  const toc = items.length
    ? items.join('\n')
    : '_No headings yet — add one and the contents will fill in._'

  return markdown.split(TOC_MARKER).join(`\n${toc}\n`)
}

/** The ordinal of the task item a checkbox belongs to, set by its list item. */
const TaskIndexContext = createContext<number>(-1)

function TaskCheckbox({ checked, onToggle }: {
  checked: boolean
  onToggle?: (index: number) => void
}) {
  const index = useContext(TaskIndexContext)
  const live  = Boolean(onToggle) && index >= 0
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={!live}
      onChange={() => onToggle?.(index)}
      style={{ cursor: live ? 'pointer' : 'default' }}
    />
  )
}

interface BriefProps {
  markdown: string
  /** Called with the rewritten source when a checkbox is ticked. Omit for read-only. */
  onToggleTask?: (nextMarkdown: string) => void
}

/** Flip the nth `[ ]`/`[x]` in the source, leaving everything else alone. */
export function toggleTaskAt(markdown: string, index: number): string {
  let seen = -1
  return markdown.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/gm, (whole, lead, mark) => {
    seen++
    if (seen !== index) return whole
    return `${lead}[${mark === ' ' ? 'x' : ' '}]`
  })
}

export function Brief({ markdown, onToggleTask }: BriefProps) {
  const source = expandToc(markdown)

  /**
   * Which checkbox is which.
   *
   * Counting inputs as they render looks simpler and is wrong: React invokes
   * every component twice in development, so a shared counter advances two
   * places per box and the first checkbox ends up addressing the second. The
   * list item carries its own source line, so the ordinal is read off that
   * instead — the same answer on every render, in any mode.
   *
   * Line numbers are taken from the expanded source, but expandToc only ever
   * inserts plain links, so a checkbox's *ordinal* is identical in both and
   * the toggle can be applied to the unexpanded markdown that gets saved.
   */
  const taskLines: number[] = []
  source.split('\n').forEach((l, i) => {
    if (/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(l)) taskLines.push(i + 1)
  })

  return (
    <div className="fx-brief">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, SCHEMA], rehypeSlug]}
        components={{
          li({ node, children, ...rest }) {
            const line = node?.position?.start?.line
            const idx  = line == null ? -1 : taskLines.indexOf(line)
            return (
              <TaskIndexContext.Provider value={idx}>
                <li {...rest}>{children}</li>
              </TaskIndexContext.Provider>
            )
          },

          input({ type, checked, ...rest }) {
            if (type !== 'checkbox') return <input type={type} {...rest} />
            return (
              <TaskCheckbox
                checked={Boolean(checked)}
                onToggle={onToggleTask
                  ? index => onToggleTask(toggleTaskAt(markdown, index))
                  : undefined}
              />
            )
          },

          p({ children, ...rest }) {
            // A paragraph that is nothing but a YouTube link becomes the video.
            const only = Array.isArray(children) ? children.filter(c => c !== '\n') : [children]
            if (only.length === 1) {
              const node = only[0] as { props?: { href?: string; children?: unknown } } | string
              const href = typeof node === 'object' && node?.props?.href
              if (typeof href === 'string') {
                const id = youtubeId(href)
                if (id) {
                  return (
                    <span className="fx-embed">
                      <iframe
                        src={`https://www.youtube.com/embed/${id}`}
                        title="YouTube video"
                        loading="lazy"
                        allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                        allowFullScreen
                      />
                    </span>
                  )
                }
              }
            }
            return <p {...rest}>{children}</p>
          },

          a({ href, children, ...rest }) {
            const external = href?.startsWith('http')
            return (
              <a
                href={href}
                {...rest}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
