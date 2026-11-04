# Contract: Brief Markdown storage

The stored format of `tasks.description`. Two readers depend on it: the editor (Tiptap + `tiptap-markdown`) and the read view (`src/components/shared/Brief.tsx`: react-markdown + remark-gfm + rehype-raw + rehype-sanitize). For every row, the editor writes exactly the "Stored text", and the read view renders it as listed.

| Block / mark | Stored text | Read view renders | Editor parses back to |
|---|---|---|---|
| Heading 1–3 | `# Title`, `## Title`, `### Title` | heading with slug id | heading |
| Bullet / numbered list | `- item` / `1. item` | list, tight spacing (FR-081) | list |
| Task item | `- [ ] todo` / `- [x] done` | checkbox list | taskList / taskItem |
| Quote | `> text` | blockquote | blockquote |
| Divider | `---` | `<hr>` | horizontalRule |
| Table | GFM pipe table with header row | table (scrolls if wide) | table |
| Resized table (F2) | `<table data-widths="30,15,55" data-width="70" data-offset="10">…</table>` (HTML; all percentages; `data-width`/`data-offset` omitted at 100/0) | table at that width and position with those column widths (**requires the three `data-*` attributes in the sanitize allow-list**, FR-068) | table with `colwidth`s, `width`, `offset` |
| Image | `![alt](https://…)` on its own line | `<img>` | image (block) |
| Toggle | `<details>\n<summary>Title</summary>\n\nbody\n\n</details>` | collapsible | toggle `{ summary }` |
| YouTube (**new node**) | `<https://www.youtube.com/watch?v=ID>` on its own line | 16:9 embed (existing `youtubeId` rule) | youtube `{ src }` |
| Table of contents (**new node**) | `[[toc]]` on its own line | heading list (existing `expandToc`) | toc |
| Bold / italic / strike / code | `**b**` `*i*` `~~s~~` `` `c` `` | same | marks |
| Underline | `<u>text</u>` | underlined (**requires `u` in the sanitize allow-list**, FR-080) | underline mark |
| Link | `[text](https://…)`; `<https://…>` when text equals href | link, provider chip if alone in a paragraph | link mark |

## Rules

1. **No new syntax** apart from the `data-*` size attributes on resized tables. Every other stored form above already exists in briefs today or is plain CommonMark/GFM. The two new nodes reuse forms the read view already understands. A table nobody resized stays a pipe table.
2. **Legacy input is accepted and preserved.** Bare YouTube URLs, `[[toc]]` paragraphs, relative links, and toggles titled "Toggle title" open without change. Saving an untouched brief yields the same text, modulo whitespace normalisation `tiptap-markdown` already applies today.
3. **Uploads never appear half-done.** Only completed image nodes are written; placeholders are decorations.
4. **Escaping.** `[[toc]]` is written by the toc node's serializer, so the editor's current `\[\[toc\]\]` un-escape workaround is removed.
