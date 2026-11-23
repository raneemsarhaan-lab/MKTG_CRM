# Contract: screens (022)

Each new screen needs its design file in `design/` approved first (constitution §IV). Design file: `design/task-methodology.html`.

| Where | What | Selectors for checks |
|---|---|---|
| Hand-off box (Ready For Design) | One row per needed board, each with a person picker (default: that Space's default assignee); Skip uses the defaults | `[data-handoff-board="design"]`, `[data-handoff-person]` |
| Design / Video board header | **Create task** (unlinked, at Ready For Design) | `[data-media-create]` |
| Link task (Content, Video, Digital Media sheets: Link task column; their calendars: a day) | Typing opens the list (or Ctrl+K): unlinked tasks from Design and Video, searched by the typed words, then Create task with Design / Video / Both; ⇄ change and × unlink beside a link, with Undo | `[data-media-link]`, `[data-media-pick]`, `[data-media-create]`, `[data-media-board]` |
| Media card | Linked: content task name, opens it; after D-Check "with Content", read-only. Unlinked: an "Unlinked" tag | `[data-media-card]`, `[data-media-linked]` |
| Content task card and panel | One chip per linked board with its stage; Unlink beside it, for everyone | `[data-media-chip="design"]`, `[data-media-unlink]` |
| Space settings › Stages | 11 original stages; under each its Space stages: rename, split (+), reorder, remove (not the last) | `[data-space-stage-row]`, `[data-space-stage-add]` |
| Space Board / List / Sheet | Columns and groups by Space stage; dragging or typing between Space stages of one original stage is a sub-stage move | `[data-space-stage]` |
| Settings › Spaces | Default assignee role per Space; the default kind control is gone | `[data-space-default-role]` |
| Settings › SLA & Workflow | Boards per content type (Design, Video, both) | `[data-type-boards]` |
| Sheets | Status cells use the Space's stages; the Related task field kind and picker title | `[data-status-word]` |
