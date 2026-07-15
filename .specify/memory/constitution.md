<!--
SYNC IMPACT REPORT
==================
Version change: (template) → 1.0.0
Type of bump: MINOR — initial concrete ratification from template

Modified principles: N/A (first fill)
Added sections:
  - I. Design System Fidelity
  - II. Workflow Pipeline Integrity
  - III. Role-Based Feature Access
  - IV. Design-Driven Development
  - V. Cultural UX & Celebration System
  - VI. State Architecture & Persistence
  - Tech Stack
  - Governance

Templates:
  ✅ .specify/templates/plan-template.md — Constitution Check gate already present; no changes needed
  ✅ .specify/templates/spec-template.md — generic; no Fluxo-specific conflicts
  ✅ .specify/templates/tasks-template.md — generic; no Fluxo-specific conflicts

Follow-up TODOs:
  - None; all fields resolved from design files and codebase context.
-->

# Fluxo Creative Ops Constitution

## Core Principles

### I. Design System Fidelity

All UI code MUST use the established Fluxo design token map. Ad-hoc color
literals are forbidden outside the token map.

**Color tokens (canonical):**

| Token    | Hex       | Role                          |
|----------|-----------|-------------------------------|
| `ink`    | `#1B1A13` | Primary text                  |
| `rail`   | `#17181A` | Sidebar / dark surface        |
| `lime`   | `#C8F24E` | Primary accent / CTA          |
| `coral`  | `#F5334F` | Danger / error / overdue      |
| `violet` | `#B79CF5` | Secondary accent / super-user |
| `cyan`   | `#5B93F5` | Informational blue            |
| `mint`   | `#3FA34D` | Success / available           |
| `muted`  | `#8A8D91` | Placeholder / secondary text  |
| `soft`   | `#F7F7F7` | Soft fill / backgrounds       |
| `panel`  | `#FFFFFF` | Card / modal surface          |
| `line`   | `#E1E1E0` | Borders / dividers            |

**Typography rules (non-negotiable):**
- Headings, stat numbers, wordmark: Montserrat, weight 700–900,
  letter-spacing −0.01em to −0.03em.
- Body, labels, inputs: Inter, weight 300–700.
- Cursive accent text only: Caveat, weight 600–700.
- Font sizes: 10px (micro chips) → 38px (BigStat headline).
- No system fonts for branded text. Google Fonts import MUST include all
  three families at the declared weights.

**Rationale**: A consistent visual language is what makes Fluxo feel like a
product, not a prototype. Diverging from tokens breaks the unified feel
across views and makes redesigns expensive.

### II. Workflow Pipeline Integrity

The 9-stage content pipeline is the core model of the system and MUST NOT be
altered without a constitution amendment.

**Canonical stages (in order):**

| ID            | English Label    | Arabic Label                 | Phase   | Color     |
|---------------|-----------------|------------------------------|---------|-----------|
| `todo`        | To Do           | افكار للتنفيذ                | Intake  | `#64748B` |
| `c-prog`      | C-In Progress   | كتابة المحتوى                | Content | `#3B82F6` |
| `c-final`     | C-Review        | مراجعة المحتوى               | Content | `#2E6FB0` |
| `c-check`     | C-Check         | موافقة نهائية على المحتوى   | Content | `#1F5A94` |
| `r-design`    | Ready For Design| جاهز للتصميم                | Design  | `#8B5CF6` |
| `d-prog`      | D-In Progress   | تصميم                        | Design  | `#7C3AED` |
| `d-check`     | D-Check         | مراجعة التصميم              | Design  | `#5B3FB5` |
| `final-check` | F-Check         | المراجعة النهائية           | Ship    | `#F59E0B` |
| `publish`     | Published       | تم النشر                     | Ship    | `#22C55E` |

**SLA enforcement:**
- Every stage MUST carry an SLA threshold per content type
  (Post, Video, Reel, Design, Email, Story, Deck, Other).
- SLA breach detection MUST be computed on render (not stored).
  A task is breached when `businessDaysBetween(stageDate, today) > sla[stage][ctype]`.
- The SLA matrix defaults live in `src/data/stages.ts` as `SLA_DEFAULTS`.
- Admins may override per-stage SLA via the Settings view; overrides persist
  in Zustand under `slaConfig`.

**Review stage ownership (immutable unless amended):**

| Stage         | Owner role            |
|---------------|-----------------------|
| `c-final`     | Marketing Manager     |
| `c-check`     | Managing Director     |
| `d-check`     | Brand Director        |
| `final-check` | Marketing Manager     |

Working stages (`todo`, `c-prog`, `r-design`, `d-prog`) are owned by the
task's assignee.

**Rationale**: The 9-stage model encodes the agency's real approval chain.
Changing it without an amendment risks corrupting existing task data and
breaking downstream SLA calculations.

### III. Role-Based Feature Access

Three access tiers MUST be enforced at the component level. No feature gate
may be left to a runtime API check alone; the UI MUST also conditionally
render.

| Tier       | Badge color               | Capabilities                                        |
|------------|---------------------------|-----------------------------------------------------|
| `admin`    | lime `#C3F53D` / `#111`   | Full access; Capacity view; Settings; member mgmt   |
| `superuser`| violet `#B79CF5` / `#111` | Full pipeline; cannot access Settings or Capacity   |
| `user`     | neutral `#EDEDEA` / `#6B` | Own tasks only; no admin views                      |

Rules:
- Capacity view and Settings nav items MUST be hidden from non-admins.
- Admin-only mutations (addMember, removeMember, updateSLA) MUST be
  gated in the store: calling them as a non-admin MUST be a no-op or throw.
- `currentUser.access` is the single source of truth; derive it from the
  `MEMBERS` seed + Supabase auth email match.

**Rationale**: The tool is used by both senior stakeholders and junior
executors. Over-privileged access creates risk of accidental data corruption.

### IV. Design-Driven Development

Every new view or major component MUST be preceded by a standalone HTML
design file (the bundled prototype format used in this project). The design
file is the source of truth for:
- Layout structure and responsive breakpoints
- Component hierarchy and naming
- Color usage (mapping to tokens above)
- Interaction patterns (hover states, transitions, animations)
- Copy / microcopy (including Arabic labels)

Implementation MUST match the design file to pixel-level fidelity before
shipping. Deviations require explicit sign-off and a note in the PR.

When a design file is provided, an agent MUST:
1. Decompress and read the bundled JS component (gzip+base64 manifest entry
   with `createContext` + `useStore` in the source).
2. Extract design tokens, layout, and component names.
3. Re-implement in the codebase's React/TypeScript architecture—never
   copy-paste the standalone JS directly.

**Rationale**: Standalone HTML prototypes are the team's design handoff
format. Treating them as the spec eliminates interpretation gaps.

### V. Cultural UX & Celebration System

The Arabic celebration system is a first-class product feature, not an
easter egg. It MUST be preserved in every refactor.

**Four reactions (non-negotiable):**

| Key        | Arabic label      | Emoji | Accent color |
|------------|-------------------|-------|--------------|
| `zaghrota` | زغروطة            | 🎉    | `#D4537E`    |
| `tasqeef`  | تسقيف             | 👏    | `#378ADD`    |
| `mabhour`  | انا مبهور بيا     | ⭐    | `#EF9F27`    |
| `tabla`    | طبلة              | 🥁    | `#534AB7`    |

**Rules:**
- Celebrations MUST trigger on task transition to `publish` stage.
- Audio synthesis MUST use the Web Audio API (no external audio CDN
  dependency). The four synthesis patterns (LFO sine / bandpass noise /
  sawtooth arpeggio / dum-tak tabla) are canonical and MUST not be replaced
  with generic sounds.
- Particle colors per reaction are defined in `src/lib/sounds.ts` / the
  REACTIONS constant and MUST match the design.
- Arabic text (stage labels, reaction copy, celebration messages) MUST be
  treated as content data, not hardcoded strings, to allow future i18n.

**Rationale**: The celebration system is a cultural expression of the team's
identity and a key differentiator that makes task completion feel rewarding.

### VI. State Architecture & Persistence

App state MUST follow the Zustand + Supabase dual-layer pattern.

**Zustand store (`src/store/useStore.ts`):**
- Persisted keys (localStorage `fluxo-storage`): `tasks`, `members`,
  `slaConfig`.
- NOT persisted: `currentUser`, `selectedTaskId`, `showTaskForm`,
  `celebration`, `activeBrand`, `searchQuery`, `profileOpen`.
- `currentUser` MUST be re-resolved on every page load from
  `supabase.auth.getSession()` → email lookup in `MEMBERS` seed.

**Type system (`src/types.ts`):**
- `StageId`, `ContentType`, `Brand`, `Priority`, `Platform`, `AccessLevel`
  MUST be exhaustive TypeScript union types.
- Adding a new value to any union MUST update `src/types.ts` first;
  no string literals elsewhere.

**Supabase auth:**
- Only `@forefront.consulting` email domain is accepted.
- Auth state changes (login / logout) MUST update Zustand `currentUser`
  synchronously via `onAuthStateChange`.
- `logout()` MUST call `supabase.auth.signOut()` before clearing store state.

**Rationale**: Separating ephemeral UI state from persisted data prevents
stale state bugs across sessions and keeps the auth layer clean.

## Tech Stack

These are the canonical dependencies for Fluxo. Adding or swapping a major
dependency requires a constitution amendment.

| Layer        | Choice                                  |
|--------------|-----------------------------------------|
| Framework    | React 19 + TypeScript (strict)          |
| Build tool   | Vite                                    |
| Styling      | Tailwind CSS v4 (inline + `@theme`)     |
| State        | Zustand v5 with `persist` middleware    |
| Auth/DB      | Supabase (auth only; no DB queries yet) |
| Icons        | Lucide React                            |
| Fonts        | Google Fonts (Montserrat, Inter, Caveat)|
| Deployment   | GitHub Pages via GitHub Actions         |
| Testing      | (none mandated yet — see Governance)    |

**Source layout:**

```
src/
├── components/   React components (one file per view/component)
├── data/         seed.ts, stages.ts (static reference data)
├── lib/          supabase.ts, sounds.ts (infrastructure)
├── store/        useStore.ts (Zustand)
├── types.ts      shared TypeScript types
└── index.css     global styles + @theme tokens
```

## Governance

- This constitution supersedes all other practices. When implementation
  conflicts with a principle, the implementation MUST change.
- Amendments require: documented rationale, version bump, and update to any
  affected templates or skill files.
- Version bump rules:
  - **MAJOR**: principle removed or fundamentally redefined.
  - **MINOR**: new principle or section added.
  - **PATCH**: wording, clarity, or typo fixes.
- All PRs introducing new views, components, or state shape changes MUST
  include a "Constitution Check" comment referencing the relevant principle.
- Use `.specify/memory/constitution.md` as the runtime governance reference.
  Spec Kit skills (`/speckit-plan`, `/speckit-specify`, etc.) read this file
  to enforce compliance gates.

**Version**: 1.0.0 | **Ratified**: 2026-07-15 | **Last Amended**: 2026-07-15
