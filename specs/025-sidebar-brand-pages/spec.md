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

Recorded here as they are made.
