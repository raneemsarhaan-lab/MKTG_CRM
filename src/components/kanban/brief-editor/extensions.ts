import { Extension, Node, type Editor } from '@tiptap/core'
import type { MarkdownStorage } from 'tiptap-markdown'
import TiptapImage from '@tiptap/extension-image'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { exitSuggestion, type SuggestionProps } from '@tiptap/suggestion'
import { youtubeId } from '@/lib/links'

// tiptap-markdown predates Tiptap v3's stricter Storage typing and doesn't
// declare this itself — without it, `editor.storage.markdown` has no type.
declare module '@tiptap/core' {
  interface Storage {
    markdown: MarkdownStorage
  }
}

/**
 * A collapsible `<details>/<summary>` block.
 *
 * Tiptap has no built-in node for this, and without one, ProseMirror's HTML
 * parser drops the tags it doesn't recognise and keeps only their text —
 * a brief already using Insert ▸ Toggle list would lose the toggle entirely,
 * flattened to plain paragraphs the moment it was reopened. `contentElement`
 * excludes the `<summary>` from the parsed body so its title doesn't also
 * turn up duplicated as the toggle's first line; `addStorage().markdown`
 * re-emits the exact same two tags on save, so existing content round-trips
 * unchanged.
 */
export const Toggle = Node.create<{ titleHint: string; defaultTitle: string }>({
  name: 'toggle',
  group: 'block',
  content: 'block+',
  defining: true,
  addOptions() { return { titleHint: 'Toggle title', defaultTitle: 'Details' } },
  addAttributes() {
    return {
      summary: {
        default: 'Toggle title',
        parseHTML: (el: HTMLElement) => el.querySelector('summary')?.textContent || 'Toggle title',
      },
    }
  },
  parseHTML() {
    return [{
      tag: 'details',
      contentElement: (el: HTMLElement) => {
        const clone = el.cloneNode(true) as HTMLElement
        clone.querySelector('summary')?.remove()
        return clone
      },
    }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['details', HTMLAttributes, ['summary', {}, node.attrs.summary], ['div', { 'data-toggle-body': '' }, 0]]
  },
  addNodeView() {
    // A plain renderHTML NodeView would make the <summary> itself part of
    // the editable document, which is exactly the duplication contentElement
    // guards against on the way in. Rendering it by hand keeps the title an
    // independent, directly-editable field instead.
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('details')
      dom.open = true
      const summary = document.createElement('summary')
      summary.contentEditable = 'true'
      // An empty title shows a grey hint rather than filler text to delete (FR-065).
      summary.setAttribute('data-placeholder', this.options.titleHint)
      summary.textContent = node.attrs.summary
      summary.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault() })
      summary.addEventListener('blur', () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos == null) return
        editor.commands.command(({ tr }) => {
          tr.setNodeAttribute(pos, 'summary', summary.textContent ?? '')
          return true
        })
      })
      const body = document.createElement('div')
      body.setAttribute('data-toggle-body', '')
      dom.append(summary, body)
      return {
        dom,
        contentDOM: body,
        update: (updated) => {
          if (updated.type.name !== 'toggle') return false
          if (document.activeElement !== summary) summary.textContent = updated.attrs.summary
          return true
        },
      }
    }
  },
  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prosemirror-markdown's serializer state isn't re-exported by tiptap-markdown
        serialize(this: { options: { defaultTitle: string } }, state: any, node: any) {
          // A toggle left untitled is saved with a neutral title, so the read
          // view never shows a blank row.
          const title = String(node.attrs.summary ?? '').trim() || this.options.defaultTitle
          state.write(`<details>\n<summary>${title}</summary>\n\n`)
          state.renderContent(node)
          state.ensureNewLine()
          state.write('</details>')
          state.closeBlock(node)
        },
      },
    }
  },
})

/** The `[[toc]]` marker, as literal text — expanded to a real table of
 *  contents at render time by `Brief`'s own `expandToc`, same as before.
 *  The Markdown serializer escapes bare brackets it doesn't recognise as a
 *  link or image (`\[\[toc\]\]`), so that has to be undone before saving or
 *  `expandToc`'s literal-string match would stop finding it. */
export function getMarkdown(editor: Editor): string {
  return editor.storage.markdown.getMarkdown().replace(/\\\[\\\[toc\\\]\\\]/g, '[[toc]]')
}

/**
 * Mod+K opens the link box (FR-024). The tooltip promised it before, but
 * nothing was bound (audit E8). `open` is read through a ref by the caller,
 * because extensions are created once with the editor.
 */
export const LinkShortcut = Extension.create<{ open: () => void }>({
  name: 'briefLinkShortcut',
  addOptions() { return { open: () => {} } },
  addKeyboardShortcuts() {
    return { 'Mod-k': () => { this.options.open(); return true } }
  },
})

/**
 * Images are blocks: each on its own line in the brief.
 *
 * The stock serializer writes an image inline and never closes the block, so
 * an image followed by a table was saved as `![…](…)| Shot | Length |`, and
 * the table stopped being a table (found by the lab's round-trip fixtures,
 * research R4). Closing the block keeps the next block on its own line.
 */
export const BriefImage = TiptapImage.extend({
  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prosemirror-markdown's serializer state isn't re-exported by tiptap-markdown
        serialize(state: any, node: any) {
          const alt = state.esc(node.attrs.alt || '')
          const src = String(node.attrs.src || '').replace(/[()]/g, '\\$&')
          const title = node.attrs.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : ''
          state.write(`![${alt}](${src}${title})`)
          if (!node.type.isInline) state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

/** What the "/" menu component is told by the suggestion plugin. */
export interface SlashState {
  items: import('./blocks').BlockItem[]
  rect: DOMRect | null
  select: (item: import('./blocks').BlockItem) => void
}
export interface SlashBridge {
  items: (query: string) => import('./blocks').BlockItem[]
  run: (item: import('./blocks').BlockItem) => void
  show: (s: SlashState | null) => void
  /** Arrow keys and Enter while the menu is open; true when handled. */
  key: (event: KeyboardEvent) => boolean
}

export const slashKey = new PluginKey('briefSlash')

/**
 * Type "/" at the start of a line or after a space for a menu of every text
 * style and block (FR-040–042, research R6). Typing narrows it; arrows,
 * Enter and Esc work it. A "/" inside a word ("and/or", "4/11") opens
 * nothing, because the character before it must be a space or nothing.
 */
export const SlashCommand = Extension.create<{ bridge: { current: SlashBridge } | null }>({
  name: 'briefSlash',
  addOptions() { return { bridge: null } },
  addProseMirrorPlugins() {
    const bridge = this.options.bridge
    return [Suggestion({
      editor: this.editor,
      pluginKey: slashKey,
      char: '/',
      allowSpaces: false,
      allowedPrefixes: [' ', ' '],
      items: ({ query }) => bridge?.current.items(query) ?? [],
      command: ({ editor, range, props }) => {
        editor.chain().focus().deleteRange(range).run()
        bridge?.current.run(props as import('./blocks').BlockItem)
      },
      render: () => {
        let last: SuggestionProps | null = null
        const push = (p: SuggestionProps) => {
          last = p
          bridge?.current.show({
            items: p.items as import('./blocks').BlockItem[],
            rect: p.clientRect?.() ?? null,
            select: item => p.command(item),
          })
        }
        return {
          onStart: push,
          onUpdate: push,
          onKeyDown: ({ event }) => (last ? bridge?.current.key(event) ?? false : false),
          onExit: () => { last = null; bridge?.current.show(null) },
        }
      },
    })]
  },
})

/** Close the "/" menu and leave the typed "/" where it is (Esc). */
export function dismissSlash(editor: Editor) {
  exitSuggestion(editor.view, slashKey)
}

/**
 * A YouTube video as a block (FR-060, FR-061, research R8): a thumbnail, a
 * play badge and the address, selectable and deletable as one unit.
 *
 * It reads and writes the form the read view already turns into an embed —
 * a paragraph holding nothing but a YouTube link — so nothing new is stored.
 * Existing briefs with a bare YouTube address on its own line become this
 * block too, and keep their bare form when saved (`bare`), so an untouched
 * brief saves unchanged (FR-100).
 */
export const Youtube = Node.create<{ label: string }>({
  name: 'youtube',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addOptions() { return { label: 'YouTube video' } },
  addAttributes() {
    return { src: { default: '' }, bare: { default: false } }
  },
  parseHTML() {
    return [
      { tag: 'div[data-youtube]', getAttrs: el => ({ src: (el as HTMLElement).getAttribute('data-youtube') ?? '' }) },
      {
        tag: 'p',
        priority: 60,
        getAttrs: el => {
          const kids = [...(el as HTMLElement).childNodes].filter(n => !(n.nodeType === 3 && !n.textContent?.trim()))
          if (kids.length !== 1) return false
          const only = kids[0]
          if (only.nodeName === 'A') {
            const href = (only as HTMLElement).getAttribute('href') ?? ''
            return youtubeId(href) && (only.textContent ?? '').trim() === href ? { src: href, bare: false } : false
          }
          const text = (only.textContent ?? '').trim()
          return only.nodeType === 3 && /^\S+$/.test(text) && youtubeId(text) ? { src: text, bare: true } : false
        },
      },
    ]
  },
  renderHTML({ node }) {
    return ['div', { 'data-youtube': node.attrs.src }]
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div')
      dom.className = 'fx-yt'
      dom.setAttribute('data-youtube', node.attrs.src)
      dom.contentEditable = 'false'
      const thumb = document.createElement('span')
      thumb.className = 'fx-yt-thumb'
      const id = youtubeId(node.attrs.src)
      if (id) thumb.style.backgroundImage = `url("https://i.ytimg.com/vi/${id}/hqdefault.jpg")`
      const play = document.createElement('i')
      play.setAttribute('aria-hidden', 'true')
      thumb.append(play)
      const meta = document.createElement('span')
      meta.className = 'fx-yt-meta'
      const b = document.createElement('b')
      b.textContent = this.options.label
      const url = document.createElement('span')
      url.textContent = node.attrs.src.replace(/^https?:\/\/(www\.)?/, '')
      meta.append(b, url)
      dom.append(thumb, meta)
      return { dom }
    }
  },
  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prosemirror-markdown's serializer state isn't re-exported by tiptap-markdown
        serialize(state: any, node: any) {
          state.write(node.attrs.bare ? node.attrs.src : `<${node.attrs.src}>`)
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

/**
 * The table of contents as a labelled block (FR-066, research R12), listing
 * the brief's headings live. Stored as the same `[[toc]]` line the read view
 * already expands, so nothing new is stored.
 */
export const Toc = Node.create<{ label: string; empty: string }>({
  name: 'toc',
  group: 'block',
  atom: true,
  selectable: true,
  addOptions() { return { label: 'Table of contents', empty: '' } },
  parseHTML() {
    return [
      { tag: 'div[data-toc]' },
      { tag: 'p', priority: 60, getAttrs: el => ((el as HTMLElement).textContent?.trim() === '[[toc]]' ? {} : false) },
    ]
  },
  renderHTML() { return ['div', { 'data-toc': '' }] },
  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement('div')
      dom.className = 'fx-toc'
      dom.setAttribute('data-toc', '')
      dom.contentEditable = 'false'
      const title = document.createElement('div')
      title.className = 'fx-toc-label'
      title.textContent = this.options.label
      const list = document.createElement('ol')
      dom.append(title, list)
      const refresh = () => {
        const heads: string[] = []
        editor.state.doc.descendants(n => { if (n.type.name === 'heading' && n.textContent.trim()) heads.push(n.textContent.trim()); return n.type.name !== 'heading' })
        list.replaceChildren(...(heads.length ? heads : [this.options.empty]).map(h => {
          const li = document.createElement('li'); li.textContent = h; return li
        }))
        list.classList.toggle('is-empty', !heads.length)
      }
      refresh()
      editor.on('update', refresh)
      return { dom, update: n => n.type.name === 'toc', destroy: () => { editor.off('update', refresh) } }
    }
  },
  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prosemirror-markdown's serializer state isn't re-exported by tiptap-markdown
        serialize(state: any, node: any) { state.write('[[toc]]'); state.closeBlock(node) },
        parse: {},
      },
    }
  },
})
