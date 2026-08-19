# Momentum Marketing CRM — Project Handover

**Owner:** Raneem Sarhan · Forefront Consulting
**Last updated:** 13 August 2026
**Purpose:** Complete record of everything built and every decision agreed, so the project can be restarted in a fresh repository with nothing lost.

> **The product was called Fluxo until 13 August 2026.** The name changed to
> Momentum; the session cookie, locale cookie and browser-storage keys kept
> their `fluxo` prefixes on purpose, because renaming them would have signed
> everyone out and reset their preferences in exchange for a string nobody
> sees. Expect to meet both names.

---

## 1. What Momentum is

An internal marketing operations CRM for Forefront Consulting. It tracks creative content — posts, videos, reels, designs, emails — through a staged production pipeline from idea to publication, with per-stage ownership, SLA tracking, and team capacity visibility.

**Six screens:**

| Screen | Route | Who sees it | Purpose |
|---|---|---|---|
| Overview | `/overview` | Everyone | Personal command centre — my tasks, my workload, team digest |
| Board | `/board` | Everyone | The Kanban pipeline, all tasks, all stages |
| Projects | `/projects` | Everyone reads; admins shape | The Aspiring / Focus plan, and the admin-only **Workload** tab |
| Team | `/team` | Everyone (own work only) | A person's planned steps, month by month |
| Capacity | `/capacity` | Admin only | Per-member workload bars across the team |
| Settings | `/settings` | Admin only | Team & access, brands, SLA, workload assumptions |

**Two models of work, deliberately separate.** A **Task** is a deliverable
moving through the staged pipeline with an SLA. A **Project** is a plan made of
steps measured in days. They meet at `ProjectStep.task_id`, when a planned step
is pushed onto the board.

---

## 2. Current status

Live on Cranl at `mktg-crm-ef1r6x.cranl.net`, deployed from `main`.

| Area | Status |
|---|---|
| Core pipeline build | ✅ Complete |
| Supabase → Prisma migration | ✅ Complete |
| **NextAuth → custom HMAC session** | ✅ Complete — see §6. NextAuth is gone. |
| Projects / Aspiring–Focus plan | ✅ Complete |
| Workload panel (per person, per brand) | ✅ Complete — `specs/004-projects-workload` |
| Paste-a-list bulk task creation | ✅ Complete |
| Deployed and running | ✅ Live |

Work is specified under `specs/` using Spec Kit — `spec.md` → `plan.md` →
`tasks.md`, with the decisions and their rationale recorded in each. Spec 004
is the fullest example and the best place to see how a feature here is
expected to be argued for.

---

## 3. Why we left Supabase

The app was deployed to Cranl and hung on an infinite loading spinner — the page never rendered.

**Root cause:** `src/middleware.ts` called `supabase.auth.getUser()` on every request. The environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` were never set, so the client had no host to reach and the call never resolved or rejected. Middleware blocked forever, so no response was ever produced.

**The decision:** rather than provision Supabase, drop it entirely. There is no Supabase account, and Cranl ships its own PostgreSQL database. Using it removes an external dependency, a second bill, and a second set of credentials.

**What that cost us:** Supabase Realtime is gone. Celebrations no longer sync across browser tabs — they fire locally for the person who advanced the stage. This is acceptable and arguably more correct (see §7). Row Level Security is also gone; authorization now lives in the application layer (see §6 — this is the one real regression, and it is deliberate).

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) | Server components + server actions |
| Language | TypeScript 5.8 | `npm run typecheck` must pass before any commit |
| Database | PostgreSQL | Cranl-hosted |
| ORM | **Prisma v5** | ⚠️ Must be v5 — see warning below |
| Auth | **Custom HMAC session** | `src/lib/session.ts` — NextAuth was removed, see §6 |
| Password hashing | bcryptjs | 10 rounds |
| Drag & drop | @dnd-kit | Within-column reorder only |
| State | Zustand | `useUIStore` |
| i18n | next-intl | Arabic + English, full RTL |
| Styling | Tailwind v4 + CSS variables | Tokens in `src/lib/tokens.ts` |

> ### ⚠️ Pin Prisma to v5
>
> Prisma **v7 breaks this project.** It removed the `url` field from
> `datasource db` in `schema.prisma`, requiring connection strings to move to a
> separate `prisma.config.ts`. Installing v7 fails schema validation at build
> time with:
>
> ```
> datasource property url is no longer supported in schema files.
> Move connection URLs for Migrate to prisma.config.ts
> ```
>
> Keep `"prisma": "^5.22.0"` and `"@prisma/client": "^5.22.0"` in
> `package.json`. This was discovered the hard way — do not "helpfully" upgrade.

---

## 5. Database schema

Nine models in `prisma/schema.prisma`. Table names are snake_case via `@@map`, preserved from the original Supabase migrations so no application code had to change.

### Member → `members`
The team. Doubles as the auth table.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | string | |
| `email` | string | **unique** — the login identifier |
| `role` | string | Job role, e.g. `Marketing Manager`. Drives stage ownership |
| `access` | string | `admin` \| `superuser` \| `user`, default `user` |
| `capacity_hrs_wk` | int | Default 40 |
| `status` | string | `Available` \| `Busy`, default `Available` |
| `color`, `avatar_url` | string? | Optional |
| `password_hash` | string? | bcrypt. Nullable — a member with no hash cannot log in |

### Task → `tasks`
The central entity.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | string | |
| `brand_id` | uuid? | → Brand |
| `content_type_label` | string? | → ContentType. Drives the SLA lookup |
| `platform`, `campaign` | string? | Optional metadata |
| `task_owner_id` | uuid | → Member. **Fixed at creation, never changes** |
| `initiator_role` | string | Role that created it |
| `nine_stage` | bool | **Immutable after creation.** See §8 |
| `status` | string | → Stage. The current pipeline stage |
| `stage_date` | date | When it entered the current stage — SLA clock starts here |
| `due_date` | date | |
| `hours_estimate` | decimal(5,1) | |
| `cover_image_url` | string? | |
| `priority` | string | Default `Medium` |
| `created_by` | uuid? | → Member |

### Stage → `stages`
Pipeline definition. String IDs (`todo`, `c-prog`, …), not UUIDs, so they read clearly in queries and URLs.

`id` · `label_en` · `label_ar` · `phase` · `owner_role` · `terminal_flag` · `sort_order`

### SlaConfig → `sla_config`
Composite PK on `[stage_id, content_type_label]`. Holds `max_business_days`. This is the SLA matrix rendered in Settings → Workflow.

### WorkspaceSettings → `workspace_settings`
Single row, `id = 1`. Holds `capacity_hrs_per_wk` and `nine_stage_default`.

### Also
**Brand** → `brands` (name unique, colour, logo) · **ContentType** → `content_types` (label unique) · **TaskComment** → `task_comments` (cascade delete with task) · **TaskAttachment** → `task_attachments` (cascade delete with task)

---

## 6. Authentication and permissions

### Login: email + password only

**No Google OAuth.** Deliberately dropped — real setup work for an internal
tool with seven users, and it would tie logins to Google accounts we don't
control.

**No public signup.** Accounts exist only when an admin creates them, at
Settings → Team & Access → Add member. Passwords are bcrypt-hashed before they
touch the database, and each row has a **Reset** and a **Generate** control.

### NextAuth was removed. Read this before touching auth.

The app used NextAuth v4 with the Credentials provider. It could not be made to
work and was ripped out.

**The failure:** sign-in silently did nothing. No error, no cookie, no server
log — and `signIn()` returned `{ error: null, ok: true }`, reporting success.
Four plausible diagnoses were wrong before `/api/session-check` found it.
NextAuth's `core/index.js` contains:

```js
if (provider.type === "credentials" && !csrfTokenVerified)
  return { redirect: signin?csrf=true }
```

It bails *before* `authorize()` ever runs. The CSRF token and its cookie were
arriving unpaired behind the deployment's proxy, so every attempt was rejected
at a point that produced no evidence of itself.

**What replaced it —** `src/lib/session.ts`:

- One cookie, one fixed name: `fluxo_session` (kept through the rename — see
  the note at the top of this file).
- HMAC-SHA256 over the payload via Web Crypto (`crypto.subtle`), so edge
  middleware and the Node server use the *same* verifier. Signed by
  `NEXTAUTH_SECRET`, which kept its name to avoid a redeploy dance.
- `secure` is derived from `x-forwarded-proto` — the actual connection — never
  from an environment variable someone can forget to set.
- `src/app/api/login/route.ts` is a plain POST with no CSRF dance. It logs
  every outcome server-side under `[fluxo:auth]` while telling the browser one
  generic message, so a failure is diagnosable without being enumerable.
- `src/app/api/logout/route.ts` answers both GET and POST, so a stuck session
  can be cleared from the address bar.
- `src/app/api/session-check/route.ts` is deliberately public. It reports
  cookie *names* (never values), config flags and a plain-English diagnosis.
  It is what cracked the original bug; leave it in place.

**Route protection:** `src/middleware.ts` verifies that same cookie with that
same function.

```ts
matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth|api/login|api/logout|api/session-check|login).*)']
```

**Break-glass:** `scripts/reset-admin.ts` resets or creates an admin from
`ADMIN_RESET_EMAIL` and `ADMIN_RESET_PASSWORD`. Inert unless both are set. It
runs *before* the ClickUp import on purpose — the import refuses to start
without an admin, and `set -e` would abort the script before the reset ran,
which is precisely the situation it exists for. **Unset both once you are back
in,** or the password silently resets on every restart.

### The three access tiers

| Tier | Can do |
|---|---|
| `admin` | Everything — Capacity, Settings, team management, SLA config |
| `superuser` | Move tasks through stages they own; full board access |
| `user` | Own tasks and their own stages |

> ### ⚠️ Known regression: authorization moved to the application layer
>
> The original build enforced these tiers with PostgreSQL **Row Level Security
> policies** — the database itself rejected unauthorized reads and writes, and
> `supabase/verify-rls.sql` proved it.
>
> Prisma connects as a single database user, so RLS no longer applies. All
> permission checks now run in server actions and page-level guards in
> application code.
>
> **What this means in practice:** for an internal tool where every user is a
> known employee, this is a reasonable trade. But it is genuinely weaker than
> what we had. Anyone who obtains the `DATABASE_URL` has unrestricted access to
> every row, and a missing check in a server action is no longer caught by a
> second line of defence.
>
> **If you want the guarantee back:** create a restricted Postgres role for the
> app, re-add RLS policies, and set the session user per request. This is real
> work and was consciously deferred — not overlooked.

---

## 7. Pipeline and core behaviours

### The nine stages

| # | ID | English | Arabic | Phase | Owner role |
|---|---|---|---|---|---|
| 0 | `todo` | To Do | افكار للتنفيذ | Intake | — |
| 1 | `c-prog` | Writing | كتابة المحتوى | Content | — |
| 2 | `c-final` | Content Review | مراجعة المحتوى | Content | Marketing Manager |
| 3 | `c-check` | Islam Check | موافقة نهائية على المحتوى | Content | Managing Director |
| 4 | `r-design` | Ready to Design | جاهز للتصميم | Design | — |
| 5 | `d-prog` | Designing | تصميم | Design | — |
| 6 | `d-check` | Design Review | مراجعة التصميم | Design | Brand Director |
| 7 | `final-check` | Final Check | المراجعة النهائية | Ship | Marketing Manager |
| 8 | `publish` | Published | تم النشر | Ship | — (terminal) |

### Ownership is by role, never by name

Stage ownership resolves through `stages.owner_role` matched against `members.role`. There is **no person-name string matching** anywhere. If the Brand Director changes, you update that member's `role` and every Design Review task follows automatically.

Two distinct concepts, easy to confuse:

- **Task owner** — `tasks.task_owner_id`. Set at creation, fixed for the life of the task. Who is accountable end to end.
- **Current stage owner** — derived at render time from `STAGE_META[status].owner_role`. Changes as the task advances. Never stored.

### Published is terminal

`publish` has `terminal_flag = true`. Once a task is published it cannot move out — for any tier, by any route. No drag, no action, no admin override.

### Celebrations fire for one person

When someone advances a task out of a stage they own, a confetti overlay plus sound fires — **only for that person**, never broadcast to the team. Implemented as a direct Zustand call (`setCelebration(payload)`) in `TaskModal.handleAdvance`.

This was previously broadcast over Supabase Realtime so it appeared in other tabs. That code is removed. The current behaviour matches the original intent more closely than the Realtime version did.

### Drag and drop is reorder-only

@dnd-kit allows reordering **within** a column. Cross-column drags are rejected — `handleDragEnd` returns early when the source and target stages differ. Stage changes happen only through the task modal's explicit Advance action, so they always pass through the permission check.

### SLA and alert status

Business days elapsed since `stage_date` are compared against `sla_config.max_business_days` for the task's `(stage, content_type)` pair. Logic in `src/lib/alert-status.ts`, badge colours in `src/lib/tokens.ts`.

---

## 8. The Islam Check toggle (9-stage vs 8-stage)

Stage 3, `c-check` — Managing Director sign-off on content — is optional.

**Single source of truth:** `workspace_settings.nine_stage_default` (boolean, one row, `id = 1`). Toggled by an admin in Settings → Workflow. It is **not** hardcoded and **not** duplicated across pipeline code.

**Applies to new tasks only.** `createTask` reads the flag and stamps it onto the task's own `nine_stage` column at creation. That per-task value is then **immutable** — flipping the workspace toggle never rewrites tasks already in flight, which would silently move work backwards or skip a required approval.

---

## 9. Internationalisation

Arabic and English via `next-intl`. Message catalogues at `messages/ar.json` and `messages/en.json`.

RTL is handled at the **layout and component level** — the `dir` attribute is set on the document root and layout primitives respond to it. It is not bolted onto individual screens. Language toggle lives in the sidebar (`src/components/shared/LangToggle.tsx`).

---

## 10. File structure

```
prisma/
  schema.prisma          9 models, snake_case @@map to original table names
  seed.ts                Stages, brands, content types, SLA matrix, members, settings
scripts/
  migrate.sh             db push → seed → reset-admin → ClickUp import → plan import
  reset-admin.ts         Break-glass admin reset (§6). Inert unless armed
  import-clickup.ts      Tasks from data/clickup-export.csv. Creates only
  import-plan.ts         Projects/steps from data/projects-plan.json. Creates only
  check-workload.ts      Reconciliation harness for lib/workload.ts. Run with tsx
messages/
  en.json  ar.json       next-intl catalogues
src/
  middleware.ts          Verifies the session cookie — same function that issues it
  lib/
    prisma.ts            Singleton client (avoids dev hot-reload connection leak)
    session.ts           signSession / verifySession / cookieOptions — §6
    authz.ts             getSessionMember, requireAdmin, requireMember
    workload.ts          Plan priced by person and brand. No React, no Prisma
    projects.ts          Plan maths shared by both planning boards
    paste-list.ts        Turns a pasted list into task names
    mappers.ts           Prisma types → app types. See note below
    stage-meta.ts        STAGE_META, ALL_STAGES
    tokens.ts            COLORS, STAGE_COLORS, ACCESS_BADGE, STAT_CARD_TINTS
    alert-status.ts      SLA breach computation
    celebration-audio.ts
    utils.ts
  types/
    index.ts             App-level types
    next-auth.d.ts       Session.user.id + JWT.id augmentation
  actions/
    tasks.ts             moveTask, createTask, addComment
    members.ts           addMember, updateMember, removeMember, resetMemberPassword
    settings.ts          updateSLA, updateWeeklyCapacity, updateNineStageDefault
  app/
    layout.tsx           Wraps children in <Providers> (SessionProvider)
    api/login/route.ts     Sign in — plain POST, no CSRF dance
    api/logout/route.ts    Sign out — GET or POST
    api/session-check/route.ts  Public diagnostic; reports names, never values
    (auth)/login/page.tsx
    (app)/
      layout.tsx         getServerSession guard → redirect('/login')
      overview/  board/  capacity/  settings/
  components/
    shared/              AppShell, Providers, TaskForm, CelebrationOverlay, LangToggle
    kanban/              KanbanBoard, KanbanColumn, TaskCard, TaskModal, StatStrip
    overview/            PersonalBoard, BigStat, ProfileStrip, TaskPanel, TaskRow, ...
    capacity/            CapacityDashboard, MemberCapacityCard
    settings/            SettingsView, TeamSettings, WorkflowSettings, AddBrandModal
specs/
  001-personal-board-genz/
  002-fluxo-crm-core/    spec.md, plan.md, tasks.md, data-model.md, VALIDATION.md
```

### Why `src/lib/mappers.ts` exists

Prisma returns `Date` objects and `Decimal` instances. The components were written against plain `string` and `number`. Rather than rewrite every component, all Prisma results pass through mapper functions:

```ts
hours_estimate: Number(t.hours_estimate)        // Decimal → number
due_date:       d.toISOString().split('T')[0]   // Date → 'YYYY-MM-DD'
```

Exports: `mapMember`, `mapBrand`, `mapContentType`, `mapTask`, `mapComment`, `mapAttachment`, `mapSlaConfig`.

**Rule:** any new Prisma query feeding a component must go through a mapper. Passing raw Prisma results into a client component will fail serialization or produce wrong types at runtime.

---

## 11. Deployment — Cranl

**App URL:** https://marketing-crm-ikdtpr.cranl.net/

### Environment variables

Cranl's Raw editor expects `KEY=VALUE`, one per line. A previous attempt pasted bare values with no key names, which is why nothing was picked up — the app saw no `DATABASE_URL` at all.

```
DATABASE_URL=postgresql://marketing-crm:<PASSWORD>@marketing-crm-xarvoh:5432/marketing-crm
NEXTAUTH_SECRET=<A LONG RANDOM STRING>
```

#### File storage

Uploaded files live in the Cranl bucket rather than in Postgres. Five values,
set the same way, in the same Raw editor:

```
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_BUCKET=cranl-<id>-mktg-crm-tool
S3_ACCESS_KEY_ID=<FROM THE STORAGE PAGE>
S3_SECRET_ACCESS_KEY=<FROM THE STORAGE PAGE>
S3_PUBLIC_URL=https://storage-mktg-crm-tool.cranl.net
```

The first two and the last are on the storage service's Connection Info panel.
The two keys are issued separately — they are credentials, so they belong here
and nowhere else, and never in this file.

`S3_REGION` is optional and defaults to `auto`, which is what R2 wants.

Until all five are set the app keeps storing uploads in the database the old
way, so setting them is not a deadline — it is a switch. Settings →
Diagnostics reports whether storage is configured and names any value that is
missing (names only, never values). Once they are set, the next deploy also
moves the older database-stored uploads into the bucket; that step is optional
and idempotent, so it is safe if it is interrupted.

> ### ⚠️ The real values used to be printed here
>
> They were removed on 13 August 2026. Both had been committed to this file and
> pasted into chat transcripts, which is why §14 lists rotating them as **High**
> priority — that item is not hypothetical, and it is not yet done.
>
> Generate a secret with `openssl rand -base64 32`. It signs the session
> cookie: change it and everyone is signed out once, which is the intended
> effect of rotating it.

`NEXTAUTH_URL` is **no longer required**. The custom session derives `secure`
from the request's own `x-forwarded-proto` rather than from a variable someone
can forget to set — that variable being missing is what hung the very first
deployment.


> ### ⚠️ Use the INTERNAL database URL
>
> Cranl gives two connection strings. Use the **internal** one — hostname
> `marketing-crm-xarvoh`, port `5432`.
>
> The external one (`38.54.59.226:40011` / `:40012`) is **not reachable from
> outside Cranl's network.** Every attempt from a development environment
> failed with `P1001: Can't reach database server`. This is why the migration
> cannot be run from a laptop or a cloud IDE and must run inside the Cranl
> build — see below.

> ### 🔐 Rotate these credentials
>
> The database password and `NEXTAUTH_SECRET` above have been shared in chat
> transcripts. Once the app is confirmed working, change the password in Cranl,
> update `DATABASE_URL`, and generate a fresh `NEXTAUTH_SECRET` with
> `openssl rand -base64 32`. Changing `NEXTAUTH_SECRET` invalidates all active
> sessions — everyone logs in again once. Keep this file out of any public
> repository.

### Build command

```
npm run deploy
```

`npm run deploy` is just `next build`. The database work runs at **container start**, not at build: `npm start` is `bash scripts/migrate.sh && next start`, which pushes the schema, seeds, and imports. It lives there because the container is the only context with network access to the database.

### First login

```
Email:    raneem.sarhaan@forefront.consulting
Password: Momentum-rSpNJNGb9c7prM
```

This is what `prisma/seed.ts` actually creates. Earlier revisions of this file
documented `raneem@forefront.consulting` / `FluxoAdmin2026!` — that address
does not exist and that password belongs to the other six seeded accounts,
which is a fast way to conclude the login is broken when it isn't.

The seed upserts with `update: {}`, so it only applies these on a **first**
creation. If the account already exists, whatever password it currently holds
is the live one and re-seeding will not change it.

### Locked out

Every way to set a password is behind a sign-in, and the database is reachable
only from inside the deployment's network — so a broken admin account cannot be
repaired from outside. `scripts/reset-admin.ts` runs at container start and is
inert unless both of these are set:

```
ADMIN_RESET_EMAIL=you@forefront.consulting
ADMIN_RESET_PASSWORD=something-long-enough
```

Set them, redeploy, sign in, then **delete both**. While they are set the
password is reapplied on every restart, so a later change made in the app
silently reverts. The script creates the account if the address is unknown, and
forces `access: 'admin'` either way.

### Seeded team

| Name | Email | Role | Access |
|---|---|---|---|
| Raneem | raneem.sarhaan@forefront.consulting | Marketing Manager | admin |
| Islam | islam@forefront.consulting | Managing Director | superuser |
| Brand Director | brand@forefront.consulting | Brand Director | superuser |
| Digital Marketing Specialist | dms@forefront.consulting | Digital Marketing Specialist | superuser |
| Content Creator | content@forefront.consulting | Content Creator | user |
| Graphic Designer | design@forefront.consulting | Graphic Designer | user |
| Video Editor | video@forefront.consulting | Video Editor | user |

Also seeded: 4 brands (Forefront Consulting, Omnisight, The Strategy Community, Islam Personal Branding), 8 content types (Post, Video, Reel, Design, Email, Story, Deck, Other), the full 9×8 SLA matrix, and `workspace_settings` row 1.

The seed uses `upsert` throughout, so re-running it is safe and non-destructive.

---

## 12. Why we are starting a new repository

The work lived in `aleymahmoud-ff/Marketing-CRM`. Two things broke:

1. That repository now returns **404** from the GitHub API — it was renamed, transferred, deleted, or had access revoked. It is no longer reachable.
2. The development session was scoped to that one repository, so it could not push anywhere else, and lacked permission to create a new repository (`403 Resource not accessible by integration`).

The GitHub token authenticates correctly as **`raneemsarhaan-lab`** — the account is right, the permissions were just narrow. A session created against a repository owned by that account will have full access.

### Setup steps

**1 — Create the repository**
https://github.com/new → name it (e.g. `fluxo-marketing-crm`) → **Private** → do **not** initialise with a README.

**2 — Import the code**

The two migration commits were exported as a git bundle (`fluxo-prisma.bundle`), delivered alongside this document. With full history it imports into an empty repository directly:

```bash
git clone <bundle-path> fluxo-marketing-crm
cd fluxo-marketing-crm
git remote set-url origin https://github.com/raneemsarhaan-lab/fluxo-marketing-crm.git
git push -u origin main
```

**3 — Create a development session against the new repository**
Everything above stays true. Point Cranl at the new repo, set the three environment variables from §11, set the build command to `npm run deploy`, and redeploy.

---

## 13. Verification checklist

Run through this after the first successful deploy.

**Deploy log**
- [ ] Shows `▶ Pushing Prisma schema to database...`
- [ ] Shows `▶ Seeding reference data and default users...`
- [ ] Shows `✅ Database migration complete.`

**Auth**
- [ ] Visiting the app URL redirects to `/login`
- [ ] `raneem.sarhaan@forefront.consulting` / `Momentum-rSpNJNGb9c7prM` lands on `/overview`
- [ ] A wrong password is rejected without hanging
- [ ] Signing out returns to `/login`

**Access tiers**
- [ ] Admin sees Capacity and Settings in the sidebar
- [ ] A `user`-tier member does not, and direct URL access is refused

**Tasks**
- [ ] "+ New task" creates a task in the correct column
- [ ] Advancing a stage fires the celebration, for that person only
- [ ] Reordering within a column works; dragging across columns does nothing
- [ ] A task in Published cannot be moved out
- [ ] Comments save and appear

**Settings**
- [ ] Adding a member with a password lets that member log in
- [ ] Reset password works, and the old password stops working
- [ ] Editing the SLA matrix persists after reload
- [ ] Islam Check toggle changes the pipeline for new tasks only; tasks already in flight keep their original stage count

**i18n**
- [ ] Switching to Arabic flips the layout to RTL and localises all labels

---

## 14. Open items

| Item | Priority | Notes |
|---|---|---|
| Rotate the DB password and `NEXTAUTH_SECRET` | **High** | Both exposed in chat transcripts |
| Set passwords for the nine accounts that have none | **High** | Created by the ClickUp import; they hold work but cannot sign in. Settings flags them "No sign-in" |
| Replace the shared `FluxoAdmin2026!` on seeded accounts | **High** | Still the default for anyone not yet rotated |
| Assign brands to the seven unbranded projects | Medium | They group under "No brand" on the Projects board |
| `d-check` ownership → Islam | Medium | Currently Brand Director in `stage-meta.ts`, `seed.ts` and the constitution. Needs a constitution amendment beside it, and a `once()` migration to reach the live database — §5 |
| Amend the constitution to 3.0.0 | Medium | It still describes Supabase, RLS and Zustand, none of which exist here. Every plan re-litigates this |
| Replace the reconstructed logo with the real artwork | Medium | `src/components/shared/Logo.tsx` draws it; colours were eyeballed, letterforms are Montserrat. Drop the SVGs in and swap that one file |
| Decide whether the Workload panel stays admin-only | Medium | An assumed default, never a decision |
| Restore database-level authorization | Medium | RLS lost in the migration — §6 |
| File upload for attachments | Low | Model exists; images are stored as data URLs, other files as URLs |
| Cross-tab celebration sync | Low | Removed with Realtime; current behaviour is arguably correct |

---

## 15. Ground rules for future work

1. **Never upgrade Prisma past v5** without migrating to `prisma.config.ts` first — §4.
2. **Run `npm run typecheck` before every commit.** It has caught every regression so far.
3. **All Prisma results feeding components go through `src/lib/mappers.ts`** — §10.
4. **Ownership is by role, never by name** — §7.
5. **Published is terminal.** Do not add an escape hatch.
6. **The nine-stage choice lives in exactly one place** — `workspace_settings.nine_stage_default`, immutable per-task after creation — §8.
7. **Stage changes go through the modal's Advance action,** never through drag — that is where the permission check lives.
8. **The reference UI files are the source of truth** for layout and design. Do not invent layout decisions that contradict them.
9. **Every server action carries its own permission check.** There is no RLS
   behind it — that call is the entire gate, and a missing one is a privilege
   escalation, not a style problem.
10. **The seed creates things and then leaves them alone.** Anything that
    changes an existing row goes through `once()` in `prisma/seed.ts`, guarded
    by a marker. This is not stylistic: brands, SLA and stages used to
    re-assert themselves on every deploy and silently threw away admin edits,
    and seeding by email once created a ghost account carrying the shared
    default password — §5.
11. **The importers never overwrite what already exists,** and deletions are
    recorded as tombstones so a re-import cannot resurrect them — §5.
12. **All planning arithmetic lives in `src/lib/workload.ts` and
    `src/lib/projects.ts`,** which import neither React nor Prisma. Deriving a
    figure twice is how two screens start telling the same person different
    things.
13. **Plan days reconcile; effort days do not.** Utilisation is measured on
    effort, reconciliation is asserted on plan. Never assert that effort sums
    to the portfolio total — it is not meant to.
