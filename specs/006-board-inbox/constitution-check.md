# Constitution Check: Board Inbox (constitution 2.1.0)

| Principle | Status |
|---|---|
| I. Design System Fidelity | **Pass.** Colours come only from `INBOX_UI` and `--inbox-*`; the lab rejects raw colours in `src/components/inbox/`. Stage pills and avatars reuse the sheet components. |
| II. Workflow Pipeline Integrity | **Pass.** No stage or SLA change. Moves go through `setTaskStage`, and SLA status comes from `getAlertStatus` at render. |
| III. Role-Based Feature Access | **Pass.** Action buttons show only when `allowedStages` (or the edit rule, for Set date) allows them, and the server checks again. Read state, snoozes and prefs are keyed by the session member; no action takes a member id. |
| IV. Design-Driven Development | **Pass, with sign-off.** `design/board-inbox.html` is the approved preview. Deviations: the panel opens under the button, so the button stays visible; the urgent badge uses dark text on amber, for contrast; the faint text is darker. It is plain HTML, the same sign-off as specs 005, 007, 008 and 009. |
| V. Cultural UX | **Pass.** An `inbox` namespace in English and Arabic, laid out right to left. Approve and Move on celebrate exactly when a drag would. Closing a celebration doesn't close the Inbox. |
| VI. State Architecture | **Pass.** Pin and Show your week are member fields in the database, because they follow the member across devices. The only new browser storage is the pulse's per-device "seen" list (§VI 2.1.0). `InboxTab`, `InboxReason` and `InboxState` are in `src/types/index.ts`. |
