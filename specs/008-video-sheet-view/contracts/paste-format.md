# Contract: Paste format

**Feature**: spec 008 FR-032–FR-034 · **Module**: `src/components/sheet/parse-clips.ts` (pure), `src/lib/clip-file-name.ts` (shared with the server)

## Input

A paste anywhere in the sheet's grid (when no cell is being edited) or in the **Paste clips** box. The clipboard is read in this order:

1. **`text/html`**: each `<tr>` is a row, and each `<td>`/`<th>` a cell. A cell's value is its trimmed text, and its link is the first `<a href>` inside it. Google Sheets' `<google-sheets-html-origin>` wrapper and `<style>` blocks are ignored.
2. **`text/plain`**: rows split on `\r?\n`, cells on `\t`. A cell that is a bare `http(s)://` URL is that row's link.

A single cell with no tab or newline, pasted into a Files cell, is a link (FR-040). Anywhere else, it is treated as a one-row paste.

## Clip file name

```text
FILE_RE = /^(\d+)_(.+)_(\d+)m(\d+(?:\.\d+)?)s-(\d+)m(\d+(?:\.\d+)?)s\.(mp4|mov|m4v)$/i
           clip_no source  in_min in_sec            out_min out_sec          ext
```

| Example | clip_no | source | in | out | length |
|---|---|---|---|---|---|
| `04_IMG_0293_2m20.2s-3m49.0s.mp4` | 4 | IMG_0293 | 2:20.2 | 3:49.0 | 1:28.8 |
| `30_IMG_0296_6m12.4s-7m20.9s.mp4` | 30 | IMG_0296 | 6:12.4 | 7:20.9 | 1:08.5 |
| `7_Cam A_take 2_0m05s-1m00s.MOV` | 7 | Cam A_take 2 | 0:05.0 | 1:00.0 | 0:55.0 |

- `in_ms = round((in_min * 60 + in_sec) * 1000)`, and the same for `out_ms`.
- A name whose out time isn't after its in time is **unmatched** ("out before in").
- `source` is the greedy middle part, so underscores inside it are kept.

## Per row

| Field | Rule |
|---|---|
| file name | The first cell whose trimmed text matches `FILE_RE`. |
| title | The longest remaining cell text that isn't a URL. It is trimmed, inner whitespace is collapsed, and it is cut at 200 characters. |
| link | The first cell link (`href`), or else the first remaining cell that is an `http(s)` URL. |

## Classification

| Bucket | When |
|---|---|
| empty | Every cell is blank. Dropped silently. |
| **existing** | The file name matches one already under this video (case-insensitive). Counted, not added (FR-033). |
| **fresh** | It has a clip file name, and that name isn't already present. Later duplicates within the same paste are counted as existing. |
| **unmatched** | Any non-blank text, but no clip file name. Listed with its cells, editable (title, file name), or left out (FR-034). |

At most 200 non-empty rows are classified. `overflow` counts the rest, and the preview says "N more rows left out (200 at a time)".

## Preview copy (English; Arabic in `messages/ar.json`)

- Summary: `{fresh} new · {existing} already in the sheet · {unmatched} without a clip file name`.
- Button: `Add {count} clips`. `count` = fresh, plus fixed unmatched rows that have a title. The button is disabled at 0.
- After adding: `{created} clips added`, plus `{skipped} were already added by someone else` when the server skipped any.
