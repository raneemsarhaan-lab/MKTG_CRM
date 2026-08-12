# Specification Quality Checklist: Projects Workload — per team member and per brand

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-12
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — resolved by D3 (admin-only panel)
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Validation Notes

**Verified against live data** rather than accepted from the reference screenshots:

- Focus project count (14) and per-brand project counts (3 / 2 / 8 / 1) reproduce exactly from `data/projects-plan.json`, confirming the panel's scope is Focus and the brand grouping is correct.
- Samaa's "164 days of work" reproduces exactly (164.0 assigned step-days), confirming the per-person calculation model.
- Hours figures and several monthly figures do **not** reproduce (mock Forefront 444h vs. 94 live step-days; mock Aug 38d vs. 26d live). Recorded in the spec as data drift so acceptance is written against the model, not the mock's numbers.
- 391 of 960 step-days are unassigned (41%) and 30 of Samaa's 164 days are undated. Both drive requirements (FR-014, FR-019) that the reference screenshots do not cover.

**Five mock elements have no data source** — consumed hours, milestones, deliverable/post counts, seniority, supervision overhead. Excluded via FR-027 and Out of Scope, pending Q1.

**Resolution of the open marker**: FR-021 (who may see whose numbers) was put to the user with three options. It is now settled by D3 — admin-only, matching the existing Capacity view — and recorded under Decisions Taken so it can be overturned deliberately rather than drifting. The two alternatives are preserved in the conversation that produced this spec.

## Clarification session 2026-08-12

Five questions asked and answered; the spec grew from 27 to 47 functional requirements. Two answers reversed Phase 0 conclusions and one cost the spec a property:

- **Consumed hours** was excluded as "needs time tracking". It does not — it is done step-days valued in hours, and reproduces the mock's four brand percentages and its 102h figure exactly. Now FR-006a/FR-006b/FR-008.
- **Milestones** are in, as an explicit flag seeded from the plan's existing marker names (FR-028–FR-032).
- **Deliverables** dropped by choice, not for lack of a source — recorded so its absence is not later "fixed".
- **Seniority and supervision** change the maths, which breaks reconciliation. Resolved by carrying plan days and effort days separately (FR-043, FR-044): utilisation is measured on effort, reconciliation is checked on plan.
- **The supervision rule** was given as code and validated against live data — the video editor's 33 complex days give 14.8d against the mock's 16d. It introduces step complexity, which no field supplies; FR-045–FR-047 default it to a configurable duration threshold with a per-step override.

**One item is now outstanding**: FR-038 computes the supervision amount but does not say **who receives it**. The mock puts it on "Marketing manager"; with several admins in this workspace that is ambiguous, and putting hours on the wrong person's row is worse than showing none. This needs answering before implementation. The question quota (5) was reached, so it is deferred rather than guessed.

**Downstream artifacts are now stale.** `plan.md`, `research.md`, `data-model.md` and `contracts/workload.md` were written against the pre-clarification spec and do not know about milestones, seniority, supervision, complexity or the plan/effort split. Re-run `/speckit-plan` before `/speckit-tasks`.

## Notes

- All checklist items pass on the spec itself.
- The three decisions (D1 scope, D2 capacity grouping, D3 placement) are defaults taken so planning was not blocked. If any is overturned, revise the spec before implementation rather than patching it downstream.
