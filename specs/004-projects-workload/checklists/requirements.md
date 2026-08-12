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

- [ ] No [NEEDS CLARIFICATION] markers remain — **1 remaining (FR-021), pending Q3**
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

**Remaining marker**: FR-021 (who may see whose numbers) is genuinely undecidable without the user — it is the difference between an admin planning tool and a team transparency view, and both are defensible. Held for Q3 rather than guessed.

## Notes

- Items marked incomplete require spec updates before `/speckit-plan`.
