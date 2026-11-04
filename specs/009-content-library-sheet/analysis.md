# /speckit-analyze: spec 009 (2026-11-04)

Run without stopping, at the user's request. Findings are fixed in place.

| ID | Severity | Finding | Fix |
|---|---|---|---|
| G1 | MEDIUM | SC-006 (20 rows visible) had no task | T030 adds `content-rows` |
| U1 | MEDIUM | Edge case "Task Link to a task in another theme" had no task | T016/T017: flagged "In {theme}", with a per-row Move here tick, off by default; `PlanRowInput.move` |
| I1 | HIGH | Contract sent a piece's published link through `updateClip`, which refuses tasks that aren't clips | `updatePiece` takes `published_url` (contract and T021) |
| A1 | LOW | "Assigned to a theme" is not defined in the spec | Defined once in research R7: owns or is assigned a live piece in it |

**Coverage**: every FR and SC maps to at least one task (FR-001…FR-082, SC-001…SC-009; SC-008 is post-launch).
**Constitution**: no conflicts. The §III exception is recorded for sign-off (plan Complexity Tracking, T033).
**Critical issues**: 0.
