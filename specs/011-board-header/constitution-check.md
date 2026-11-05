# Constitution Check: spec 011 (for the PR description)

| Principle | How this PR meets it |
|---|---|
| **§I Design System Fidelity** | The colours are new `--hd-*` CSS variables that mirror `PIPE` and `INBOX_UI` in `src/lib/pipeline-tokens.ts` and `src/lib/tokens.ts`: lime for New task, purple and soft purple for the selected tab and pairs, urgent orange for the badge. Montserrat is used for the title, the tabs and New task, Inter for the rest. The look follows `design/board-header.html`, which is drawn from the user's reference image. |
| **§II Workflow Pipeline Integrity** | Nothing about stages, moves, SLAs or celebrations changes. The pipeline columns and cards are untouched. |
| **§III Role-Based Feature Access** | The gates are unchanged. + New task shows only for members who may create tasks (`access !== 'user'`). The Content bar keeps its own gates (+ Theme for admins). The avatar opens the same account menu as the sidebar. |
| **§IV Design-Driven Development** | `design/board-header.html` was published as a clickable preview and committed before the UI work. It covers desktop, phone, Arabic, the Inbox states and the member switch. Plain HTML, as in specs 005–010. |
| **§V Cultural UX** | A new `header` namespace exists in English and Arabic, checked for parity. Before this, the header's English was hard-coded ("Only me", "Filter", the search text). The header mirrors in Arabic: logical properties, mirrored ticks, and menus that open from the start side. The greeting stays on My Day. |
| **§VI State Architecture** | No new persisted state. `BoardTab` was added to `src/types/index.ts` first; it is derived from `BoardView`. The last pipeline view and the phone search's open state are kept in memory only. |
| **Tech Stack** | No new dependency. |
| **Schema** | No change. |

**Recorded supersession.** Spec 006 FR-012a required the Inbox to be a filled purple button, at least as tall as + New task. Spec 011 FR-012 replaces it with a compact button: an icon, the word "Inbox", and a count badge, with the summary in the tooltip and the accessible name. The rest of spec 006 stands:
- the urgent colour;
- "All clear";
- the new-items ring;
- the panel and pinning.

**One behaviour added.** The header's search now also narrows the Sheet and Content views, by title, keeping each match's parent row (research R6). Before this, those views had no search box.
