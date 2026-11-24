# Spec 025: Sidebar and brand pages

**Asked for**: 24 Nov 2026 (user). **Branch**: `claude/wonderful-dirac-k1wflu`.
The user's text is the specification; this file records it with the decisions made while building.

## 1. Sidebar

```
MY WORK
  My tasks
  Inbox

SPACES
▾ Content
    Forefront
    Islam Saadany
    Omnisight
    TSC
▸ Design
▸ Video
▸ Planning

BRANDS
  Forefront
  Islam Saadany
  Omnisight
  TSC
```

- "Teams" is renamed "Spaces".
- Each Space has one folder per brand under it.
- A Space's name opens all its tasks across brands; its arrow only opens or closes its folder list.
- A brand folder inside a Space opens only that Space's tasks for that brand.
- The Calendar, Assets, Sheet and Library rows under each brand are removed; views move into the pages.
- Every Space and brand keeps its colour dot. Short brand names, so nothing is cut off.
- Numbers mean the same everywhere: open tasks, with the overdue count in red beside it (25 · 3).

## 2. Space pages and Space › Brand folders

- Views: Board · Sheet · Calendar.
- Stage names: that Space's own (renames and splits).
- On the Space page (all brands), each card shows its brand colour dot; "Group by brand" and a brand filter.
- The page remembers the last view used, per Space and per folder.

## 3. Brand page

Three tabs:

- **Brand**: all the brand's tasks from every Space; the original 11 stage names; all views (Board, Sheet, Calendar, plus the other task views); the Sheet has a Space column; the brand's publishing calendar is this tab's Calendar view.
- **Assets**: a sheet-style table of the brand's files (logos, templates, photos, finished designs). Columns: Name, Preview, Type, Linked task, Added by, Date added. Sort, filter and search as in the task sheets. Upload with a button or by dragging files onto the table.
- **Settings** (admins only): C-Check on/off for new tasks; fields switched off for this brand; default priority for new tasks. Non-admins don't see the tab.

## 4. Library

The Library row leaves the sidebar. The request says "Move its contents into Assets / Confirm before removing".

## 5. Check

- Content shows tasks from every brand; Content › Forefront shows only Forefront's Content tasks.
- The same task appears in the Space, the Space › Brand folder and the Brand page; an edit in one shows in all three.
- The sidebar fits on screen without scrolling.

## Decisions made while building

- **Short brand names** are a field on the brand (`short_name`), set once for the three long names
  (Forefront, Islam Saadany, TSC) and editable in the brand's Settings section. The full name shows
  as a tooltip and on the brand's page.
- **Inbox** in the sidebar opens the notifications page and shows the unread count.
- **The other pages** (Working Hours, Plan, Task types, Settings) are a row of icons at the bottom of
  the sidebar, so the tree fits without scrolling. The "Focus. Flow. Finish." card is removed.
- **My sheets** is no longer in the sidebar; `/sheets` still opens by address. Spec 026 removes the
  Sheets section for good.
- **Counts** are worked out the way each page lists tasks: a Space counts its Shows in tasks, on its
  board or not linked media, inside its range; a brand counts every open task of the brand with linked
  media seen through its content task.
- **The arrow** remembers which Spaces are open, per device; the Space in the address is opened.
- **Space pages** have Board, Sheet and Calendar. List and Workload stay on the brand's Brand
  section ("any other task views the app has").
- **Group by brand** groups the cards inside each stage column under their brand's name. The brand
  filter is a row of brand chips above the views and applies to all three views. Both are remembered
  per Space, per device.
- **The view used last** is remembered per member and per page (Space, Space › Brand folder, brand),
  after a home view the member has set.
- **The old brand folder addresses**: `/calendar` and `/sheet` lead to the brand's Calendar and Sheet
  views. The brand's Content and Video sheets are now the Sheet view of Content › Brand and Video › Brand.
- **Assets**: anyone signed in can add a file or a link and change what they added; admins and
  superusers can change or delete any. A file's type is guessed from its name and can be changed.
  Files on the brand's tasks that reached F-Check or later are listed as finished designs, read-only,
  with their task. With no file storage configured, a file is kept in the database within the same
  size limit as a task attachment; with storage, up to 25 MB.
- **Library**: its sidebar row is gone and nothing was deleted. Its content (published work) is
  covered in Assets by the finished designs; the page itself still opens at `/brands/<id>/library`.
  Removing that page waits for the user's confirmation.
- **Brand Settings** also holds the short name. The brand's default priority comes after a Space's
  default priority and before the task type's.

## Changed on 24 Nov 2026 (user)

- **Sidebar numbers**: only My tasks and Inbox carry one. Spaces, folders and brands show their names
  alone. (The counts are still worked out with the page, in case they are wanted back.)
- **The Space page's brand filter** is removed: a Space's brand folders in the sidebar are the
  filter. "Group by brand" stays.

