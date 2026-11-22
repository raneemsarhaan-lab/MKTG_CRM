# Contract: pages, addresses and the sidebar

## Addresses

| Address | Page | Notes |
|---|---|---|
| `/board` | Everything, Board | **Unchanged.** `?view=sheet` and `?view=content` still open the Video and Content sheets (FR-012). |
| `/sheets`, `/sheets/[folderId]` | Sheets home and workbooks | **Unchanged.** Brand blank-tab folders (`kind='brand'`) are hidden from the home list. |
| `/team` | Plan | **Unchanged address**; the nav label becomes "Plan" (FR-012a). |
| `/me?view=sheet\|calendar\|board&show=all\|assigned\|handed` | My tasks | **New.** Defaults to Sheet and All mine. |
| `/spaces/[key]?view=<viewId or type>` | A team Space | **New.** The Content Space's Sheet tab renders today's Content sheet, and the Video Space's today's Video sheet (FR-012). |
| `/brands/[brandId]` | The brand: every task in it | **New.** |
| `/brands/[brandId]/calendar` | The brand's Calendar Folder | **New.** `?campaign=<projectId>` filters the calendar. |
| `/brands/[brandId]/assets` | The Assets Folder | **New.** Files and Asset requests. |
| `/brands/[brandId]/sheet` | The Sheet Folder | **New.** Tabs: the Content and Video sheets filtered to the brand, then the brand's blank tabs. |
| `/brands/[brandId]/library` | The Library Folder | **New.** Gallery and Sheet. |
| `/brands/none/...` | The "No brand" brand | **New.** Tasks with no brand. |

Unknown Space keys and brand ids return the app's 404. A Space the member isn't in, and isn't an admin for, returns 404 too, so it can't be guessed.

## The sidebar (`Sidebar.tsx`)

1. **The nav, as today**: Overview, Board, Sheets, **Plan** (was Team) and Settings (admins).
2. **Me**:
   - My tasks, with a count of open tasks;
   - the member's pinned folders, which move here from under Sheets. Unpin, Rename and Delete stay as today (FR-013c).
3. **Teams**: the Spaces the member belongs to (all of them for admins), in `sort_order`, each with its open-task count.
4. **Brands**: each brand, in brand colour, then its four Folders (Calendar, Assets, Sheet, Library), and "No brand" last when it holds tasks.

- Sections collapse; the choice is per device (`momentum.sidebar.collapsed`).
- On phones the whole sidebar is a drawer.

## View tabs on a node

| Node | Default tabs (when no saved views) |
|---|---|
| Team Space | List · Board · Sheet · Calendar · Workload |
| Brand | List · Board · Sheet · Calendar · Workload |
| Brand › Calendar | Calendar · List · Board · Sheet |
| Brand › Assets | Files · Asset requests |
| Brand › Sheet | the workbook (sheet tabs at the bottom) |
| Brand › Library | Gallery · Sheet |
| Me › My tasks | Sheet · Calendar · Board |

"+ View" adds a saved view of any type for the node. Gantt and Doc are listed as later (disabled).

## Labels renamed (messages only)

| Key | Was | Now |
|---|---|---|
| `nav.team` | Team | Plan |
| `header.mine` | My tasks | Mine |
| `header.team` | Team tasks | Everyone |

Arabic labels change to match; a native speaker should review them (HANDOVER §14 practice).
