<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 2.0.0
Type of bump: MAJOR — framework migration from Vite/React to Next.js 15 App Router;
  multiple principle updates to align with accepted plan.md decisions

Modified principles:
  - §II: English stage labels corrected to canonical full names (To Do, Writing,
    Content Review, Islam Check, Ready to Design, Designing, Design Review,
    Final Check, Published) — previously used abbreviated internal codes
  - §III: Admin-only mutation gate changed from Zustand store to Postgres RLS;
    UI gating now correctly described as presentation-only
  - §V: Celebration trigger scope corrected — fires on any personally-owned
    stage advance (not only on publish transition); shouldCelebrate from moveTask
    Server Action is authoritative
  - §VI: Zustand persisted keys removed — all app data lives in Postgres;
    slaConfig persistence moved from Zustand to sla_config table;
    currentUser re-resolution updated from getSession()+MEMBERS seed to
    server-side Supabase cookie session;
    onAuthStateChange Zustand coupling removed
  - Tech Stack: Framework updated React 19+Vite → Next.js 15 App Router;
    Deployment updated GitHub Pages → Vercel; Auth/DB expanded to include
    Postgres+Realtime+Storage; next-intl and @dnd-kit added;
    Zustand persist middleware removed
  - Source layout updated to reflect App Router structure

Templates:
  ✅ .specify/templates/plan-template.md — no changes needed
  ✅ .specify/templates/spec-template.md — no changes needed
  ✅ .specify/templates/tasks-template.md — no changes needed

Follow-up TODOs:
  - None; all amendments resolve /speckit-analyze findings C2, H4, H2, H1, H3.
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
| `c-prog`      | Writing         | كتابة المحتوى                | Content | `#3B82F6` |
| `c-final`     | Content Review  | مراجعة المحتوى               | Content | `#2E6FB0` |
| `c-check`     | Islam Check     | موافقة نهائية على المحتوى   | Content | `#1F5A94` |
| `r-design`    | Ready to Design | جاهز للتصميم                | Design  | `#8B5CF6` |
| `d-prog`      | Designing       | تصميم                        | Design  | `#7C3AED` |
| `d-check`     | Design Review   | مراجعة التصميم              | Design  | `#5B3FB5` |
| `final-check` | Final Check     | المراجعة النهائية           | Ship    | `#F59E0B` |
| `publish`     | Published       | تم النشر                     | Ship    | `#22C55E` |

**SLA enforcement:**
- Every stage MUST carry an SLA threshold per content type
  (Post, Video, Reel, Design, Email, Story, Deck, Other).
- SLA breach detection MUST be computed on render (not stored).
  A task is breached when `businessDaysBetween(stageDate, today) > sla[stage][ctype]`.
- The SLA matrix defaults live in `src/data/stages.ts` as `SLA_DEFAULTS`.
- Admins may override per-stage SLA via the Settings view; overrides persist
  in the `sla_config` Postgres table (not Zustand). SLA reads are always
  server-side at render time via the `updateSLA` Server Action.

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
  enforced at the database level via Postgres RLS. UI gating (hiding controls
  from non-admins) is presentation only; DB-level enforcement via RLS is the
  authoritative security gate.
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
- Celebrations MUST trigger when a user advances a stage they personally own:
  working stages (`todo`, `c-prog`, `r-design`, `d-prog`) fire for the task
  owner; review stages (`c-final`, `c-check`, `d-check`, `final-check`) fire
  for the member whose role matches the stage's `owner_role`. Admin or superuser
  advances that do not match stage ownership MUST NOT trigger a celebration.
  The `moveTask` Server Action returns `shouldCelebrate: boolean` to signal this.
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

**Zustand store (`src/store/useUIStore.ts`):**
- Persisted keys: NONE. All application data (tasks, members, brands,
  slaConfig) lives in Postgres and is fetched server-side via Server Components
  and Server Actions. No localStorage persistence.
- Ephemeral UI state only: `celebration`, `selectedTaskId`, `showTaskForm`,
  `profileOpen`.
- `currentUser` is resolved server-side on every request from the Supabase
  session cookie; it is NOT stored in Zustand.

**Type system (`src/types.ts`):**
- `StageId`, `ContentType`, `Brand`, `Priority`, `Platform`, `AccessLevel`
  MUST be exhaustive TypeScript union types.
- Adding a new value to any union MUST update `src/types.ts` first;
  no string literals elsewhere.

**Supabase auth:**
- Only `@forefront.consulting` email domain is accepted; enforced in
  `/auth/callback/route.ts` — sign out and redirect to `/login?error=domain`
  if the email domain does not match.
- Session is managed via server-side cookies using `@supabase/ssr`.
- `logout()` MUST call `supabase.auth.signOut()`. No Zustand state to clear
  (currentUser lives only in the server session).

**Rationale**: Separating ephemeral UI state from persisted data prevents
stale state bugs across sessions and keeps the auth layer clean.

## Tech Stack

These are the canonical dependencies for Fluxo. Adding or swapping a major
dependency requires a constitution amendment.

| Layer        | Choice                                                    |
|--------------|-----------------------------------------------------------|
| Framework    | Next.js 15 (App Router) + TypeScript (strict)             |
| Build tool   | Next.js built-in (no separate Vite)                       |
| Styling      | Tailwind CSS v4 (inline + `@theme`)                       |
| State        | Zustand v5, no `persist` — UI ephemera only               |
| Auth/DB      | Supabase (Auth + Postgres + Realtime + Storage)           |
| i18n         | next-intl (cookie-based locale, no URL segment)           |
| Drag-and-drop| @dnd-kit/core (within-column reorder only)                |
| Icons        | Lucide React                                              |
| Fonts        | Google Fonts (Montserrat, Inter, Caveat)                  |
| Deployment   | Vercel                                                    |
| Testing      | (none mandated yet — see Governance)                      |

**Source layout:**

```
src/
├── middleware.ts         Auth guard (cookie check, redirect to /login)
├── app/                  Next.js App Router pages, layouts, route handlers
├── actions/              Server Actions (tasks.ts, members.ts, settings.ts)
├── components/           React components organized by view
├── lib/                  Supabase helpers, stage-meta.ts, alert-status.ts
├── store/                useUIStore.ts (Zustand, UI ephemera only)
├── types/                index.ts — shared TypeScript union types
└── app/globals.css       CSS token variables, base reset, RTL logical props
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

**Version**: 2.0.0 | **Ratified**: 2026-07-15 | **Last Amended**: 2026-07-15
