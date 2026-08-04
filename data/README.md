# data/

Source data that `scripts/migrate.sh` loads at container start.

## clickup-export.csv

The ClickUp export. `scripts/import-clickup.ts` keeps only rows from the
**ALL MEDIA** list and upserts them by external id, so re-running is safe.

## projects-plan.json

The planning data from `Projects_Overview.docx` and `Team_Tasks_Board.docx`,
extracted into one file. **Nothing reads it yet** — it is committed so the
extraction is not lost and can be reviewed before any schema is built on it.

The three datasets in those documents overlap, and merging them is the whole
reason this file exists:

- **Aspiring** — 40 projects, the full portfolio.
- **Focus** — 14 of those same 40, re-planned. A strict subset; every Focus
  project appears in Aspiring under the same name.
- **Team board** — 141 tasks whose ids (`Mani0`, `Bank0`, …) are *the same
  records* as the project steps. The team board is those steps grouped by
  assignee rather than by project.

So one list, not three:

```
projects[]        40 · key, name, brand, standing, due_date, focus
  steps[]        327 · key, name, duration_days, due_date, done, assignee
                 227 of the steps carry an assignee
```

Decisions taken while merging, worth knowing before trusting the dates:

- **Focus dates win.** Where a step appears in both plans with different dates,
  the Focus value is kept — those read as the re-planned ones. *Islam Course
  Launch* is due `2026-11-29` in Focus and `2026-09-01` in Aspiring; the file
  says November.
- **`focus` is a flag, not a copy.** A project belongs to one list and is
  marked as being in Focus, rather than existing twice.
- **Team-only tasks are folded in.** Tasks naming a project but absent from its
  plan are appended as steps of that project.
- **Seven projects have no brand**, because no assigned task supplied one — all
  the "Digital & Social — …" standing items, "Guest Posts", and "TSC —
  Community Management". They need placing by hand.

`people` maps the three short names in the documents (`samaa`, `yosra`,
`salma`) to display names and roles; those correspond to members already in the
database.
