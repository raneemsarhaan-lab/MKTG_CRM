import { Extension, Node, type Editor } from '@tiptap/core'
import type { MarkdownStorage } from 'tiptap-markdown'
import TiptapImage from '@tiptap/extension-image'

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
export const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'block+',
  defining: true,
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
      summary.textContent = node.attrs.summary
      summary.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault() })
      summary.addEventListener('blur', () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos == null) return
        editor.commands.command(({ tr }) => {
          tr.setNodeAttribute(pos, 'summary', summary.textContent || 'Toggle title')
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
        serialize(state: any, node: any) {
          state.write(`<details>\n<summary>${node.attrs.summary}</summary>\n\n`)
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
