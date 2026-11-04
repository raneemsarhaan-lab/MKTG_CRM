# Contract: Keyboard and accessibility

## Shortcuts

`Mod` is ⌘ on Mac and Ctrl elsewhere. Labels are shown per platform.

| Keys | Where | Action |
|---|---|---|
| `Mod+B` / `Mod+I` / `Mod+U` / `Mod+Shift+X` / `Mod+E` | editor | bold / italic / underline / strike / inline code |
| `Mod+K` | editor | open the link box; pre-filled if the selection is a link (FR-024) |
| `Mod+Z` / `Mod+Shift+Z` | editor | undo / redo, same as the toolbar buttons (FR-013) |
| `Enter` / `Space` | focused read brief (`TaskModal`) | start editing (FR-014) |
| `Mod+Enter` | editor (`TaskModal` only) | leave editing, through the unsaved-changes bar if needed |
| click outside the brief | editor (`TaskModal` only) | same as `Esc` (FR-016) |
| `/` | at start of block or after whitespace | open the "/" menu (FR-040) |
| `Esc` | anywhere in the editor | close the top overlay; with none open, leave editing (FR-010) |
| `Arrow` keys, `Home`, `End` | in a menu | move highlight; typeahead by letter (FR-044) |
| `Enter` / `Space` | in a menu | choose |
| `Tab` / `Shift+Tab` | in a menu | close the menu and move focus on |
| `Arrow Left` / `Arrow Right` | in the toolbar | move between buttons (reversed in RTL) |
| `Tab` | in a table | next cell; adds a row at the end (existing) |

## Esc layering (FR-010, FR-011)

1. If an overlay is open, close the top one and return focus to its opener; stop. Overlays are: a menu, the "/" menu, the link-card edit, the value prompt, the table menu, the confirm bar.
2. Else if the save state is `error`, show the confirm bar ("Your last changes aren't saved. Stay · Leave anyway"); stop.
3. Else call `onDone` (leave editing; there is no Done button).

## Roles and names (FR-045–047)

| Element | Role / attributes |
|---|---|
| Toolbar | `role="toolbar"`, `aria-label` = t('briefEditor.toolbar') ("Formatting"), roving `tabIndex` |
| Toggle buttons (B, I, S, code, lists, quote) | `aria-pressed` |
| Menu triggers (Style, Insert, ⋯) | `aria-haspopup="menu"`, `aria-expanded` |
| Menus | `role="menu"`; items `menuitem`; Text-style items `menuitemradio` + `aria-checked` |
| "/" menu | `role="listbox"` with `aria-activedescendant` on the editor; items `option` |
| Writing area | `aria-label` = t('briefEditor.label') ("Brief"), `aria-multiline="true"` |
| Save status | `role="status"` (`aria-live="polite"`) with visible or visually hidden text |
| Link card | `role="dialog"`, `aria-label` = link host; buttons Open / Edit / Remove |
| Upload placeholder | `aria-live="polite"` text "Uploading <filename>…" |
| Read brief (`TaskModal`) | `role="button"`, `tabIndex=0`, `aria-label` = t('briefEditor.clickToEdit') |
| Column / table-edge resize handle | `role="separator"`, `aria-orientation="vertical"`, label "Drag to resize columns" or "Drag to resize the table"; keyboard alternatives are Equal widths and Full width (FR-069) |

## Direction

All placement uses logical properties. Floating UI (menus, cards, "/" menu) reads `dir` from the editor element and mirrors in RTL.
