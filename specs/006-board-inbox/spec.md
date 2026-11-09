# Feature Specification: Board Inbox (the "for you" section, behind one button)

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-04

**Status**: Draft

> **Changed by spec 012 (Task Notifications, R12, FR-080).** The Mentions and Team tabs moved to the notification bell beside the Inbox. The Inbox now has To do and Done, and its number counts to-dos only. FR-030 to FR-034 (Mentions) and FR-040 to FR-042 (Team) are superseded by spec 012. The rest of this spec stands.

**Input**: User description: "Option B (Inbox), with a few enhancements: make it hidden by default, and the inbox is a button with a notification number; when you click it, it shows the details." Chosen from the Board "for you" analysis and the interactive preview "Board For-You Options" (tab "Option B · Inbox button").

## Context

Today the Board opens with a "for you" section above the pipeline. It holds four cards: Needs your attention, Activity feed, Your week and Daily Spark. The header also has a bell. The analysis of that section found these problems:

| Finding | Problem today | Addressed by |
|---|---|---|
| N1 | Reviews waiting on you (C-Review, C-Check, D-Check, Final check) are missing. Only tasks assigned to you are listed. | FR-020, FR-021 |
| N2 | Rows don't say why a task is there or what to do next. | FR-022, FR-023 |
| N3 | "193 published" sits inside a to-do card. | FR-050 |
| N5 | Nothing can be done from the card; every action needs the task panel. | FR-024 to FR-028 |
| H3 | The bell counts every mention ever (17) and the number never goes down. | FR-010 to FR-013, FR-030 to FR-034 |
| A1, A2 | Stage moves show an avatar for someone who did not do it, and say "just now" for something that only has a date. | FR-041 |
| A3 | Your own uploads and moves fill your own feed. | FR-040 |
| L1, L2 | The section pushes the pipeline down and the cards leave empty space. | FR-001 to FR-004 |

The fix puts everything that needs the person into one **Inbox**. The Inbox is hidden until they ask for it, and one button in the header says how much is waiting.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how much needs me, and open it in one click (Priority: P1)

A team member opens the Board. The pipeline starts right under the header, with no cards above it. In the header, an **Inbox** button stands out: filled in the brand purple, it shows a number (how many things need them now) and a short line saying what is waiting, such as "2 reviews waiting · 1 due today". They click it, and a panel opens over the board listing those things. They click a task in the list, and its task panel opens.

**Why this priority**: This is the change itself: the board comes first, and one number replaces the bell and the two cards. Without it, nothing else in this spec has a home.

**Independent Test**: Sign in as a member with one review waiting, one task due today and one unread mention. Open the Board. The pipeline's first cards are visible without scrolling, and the Inbox button shows 3. Click it: the panel lists those three items. Click one: its task panel opens.

**Acceptance Scenarios**:

1. **Given** a member with items that need them, **When** they open the Board, **Then** no "for you" cards appear above the pipeline, and the Inbox button in the header shows the number of items that need them.
2. **Given** the Inbox is closed, **When** the member clicks the Inbox button, **Then** the Inbox panel opens over the board on the To do tab, showing the same items the number counts.
3. **Given** the Inbox is open, **When** the member presses Esc, clicks ✕, or clicks anywhere on the board outside the panel, **Then** the panel closes and keyboard focus returns to the Inbox button.
4. **Given** nothing needs the member, **When** they look at the header, **Then** the Inbox button turns quiet (outlined, no fill), shows no number and reads "All clear", and opening it says "All clear".
5. **Given** something in the count is due today or late, **When** the member looks at the header, **Then** the number is shown in the "urgent" colour instead of the normal one.
6. **Given** the Inbox is open, **When** the member clicks an item's row (not one of its action buttons), **Then** that task's panel opens.
7. **Given** items are waiting, **When** the member looks at the header, **Then** the Inbox button is filled in the brand purple and shows a line naming the two most pressing kinds of item (for example "2 reviews waiting · 1 due today").
8. **Given** a new unread mention or an urgent task, **When** the Board opens, **Then** a soft ring pulses around the Inbox button three times and stops; it does not pulse again until something new arrives after the member opens the Inbox.

---

### User Story 2 - Reviews waiting on me, and acting on them in place (Priority: P1)

A reviewer (for example, the Marketing Manager for C-Review and Final check) opens the Inbox. Their To do tab starts with **Waiting for your review**. Each row gives the task, its stage, how long it has waited, and its due date and SLA status. They press **Approve →** and the task moves to the next stage, exactly as if they had dragged it. Or they press **Send back** and it returns to the stage before, with a short note to the person doing the work.

**Why this priority**: The biggest gap today (N1). Reviews are the work most likely to block other people, and today a reviewer has to scan the whole board to find them.

**Independent Test**: Put a task in C-Review. Sign in as a member whose role owns C-Review. Open the Inbox. The task is listed under "Waiting for your review" with its stage, waiting time and due date. Press Approve. The task moves to the next stage on the board, the celebration plays if the move earns one, and the Inbox number drops by one.

**Acceptance Scenarios**:

1. **Given** a task sits in a review stage owned by the member's role, **When** the member opens the Inbox, **Then** the task is listed under "Waiting for your review", above their own tasks.
2. **Given** a review row, **When** the member presses Approve, **Then** the task moves to its next stage under the same rules as a drag on the board (permissions, SLA, celebration), the row leaves the list, and the number updates.
3. **Given** a review row, **When** the member presses Send back, **Then** they can add a short note, and the task returns to the stage before the review. The note is posted as a comment on the task, naming the task's owner.
4. **Given** a member whose role does not own a review stage, **When** they open the Inbox, **Then** no "Waiting for your review" group is shown.
5. **Given** an admin whose role does not own the stage a task is in, **When** they open the Inbox, **Then** that task is not listed as waiting for their review.

---

### User Story 3 - My own work that needs a decision today (Priority: P2)

Under the reviews, the member sees **Your tasks**: their open work that is late, due today, or has no due date. Each row says why it is there ("2 days late", "Due today", "No due date"). From the row they can **Set date**, **Move on →** to the next stage, or press **Tomorrow** to put it off until tomorrow.

**Why this priority**: This replaces "Needs your attention" and adds the reason and the actions it lacked (N2, N5). It ranks below reviews because the board already shows a person's own cards.

**Independent Test**: Give a member one late task, one task due today and one with no date. Open the Inbox. All three appear under "Your tasks", each with its reason. Press Tomorrow on one: it disappears and the number drops. Set a date on the undated one: it shows the new date.

**Acceptance Scenarios**:

1. **Given** the member owns open tasks that are late, due today or undated, **When** they open the Inbox, **Then** those tasks are listed under "Your tasks", late first, then due today, then undated, and each row shows its reason.
2. **Given** a "Your tasks" row, **When** the member presses Tomorrow, **Then** the task is hidden from the Inbox and the count until the start of the next day, and a "Put off until tomorrow · Bring back" line lets them undo it.
3. **Given** an undated task, **When** the member presses Set date and picks a date, **Then** the task's due date is saved and shown wherever the task appears.
4. **Given** a "Your tasks" row, **When** the member presses Move on →, **Then** the task advances one stage under the same rules as a drag, with the celebration if it earns one.

---

### User Story 4 - Mentions I haven't read (Priority: P2)

Someone writes "@Raneem can you check the headline before 3pm?" on a task. The member's Inbox number goes up by one, and the **Mentions** tab shows "1 new". They open it and see the comment quoted with the task it is on. They reply in place, or press **Mark read**. Either way the number goes down and stays down.

**Why this priority**: This fixes the bell that never goes down (H3). A person waiting on an answer is the most time-sensitive thing a teammate can send.

**Independent Test**: Mention a member in a comment. Their Inbox number rises by one. Open Mentions: the comment is shown first, marked unread. Reply in place: the reply appears on the task, and the mention becomes read. Sign in on a second device: it is still read there.

**Acceptance Scenarios**:

1. **Given** a new comment that mentions the member, **When** the Board next loads its data, **Then** the Inbox number includes it and the Mentions tab shows how many are new.
2. **Given** the Mentions tab, **When** it is shown, **Then** unread mentions come first, newest first, each with the author, the task, the comment text and when it was written.
3. **Given** an unread mention, **When** the member replies in place, presses Mark read, or opens the task from that mention, **Then** the mention becomes read and the number drops.
4. **Given** several unread mentions, **When** the member presses Mark all read, **Then** all of them become read.
5. **Given** a mention was read on one device, **When** the member opens the Board on another device, **Then** it is shown as read there too.
6. **Given** the member only opens the Inbox and looks, **When** they close it, **Then** nothing is marked read.

---

### User Story 5 - What the team did on my work, without my own noise (Priority: P3)

The **Team** tab lists what other people did on the member's tasks: comments, files added, stage moves and publishes. It leaves out the member's own actions, and leaves out mentions, which live in Mentions.

**Why this priority**: Useful context, but nothing in it asks the member to act. It replaces the Activity feed card and fixes its problems (A1 to A3).

**Independent Test**: As member A, upload a file to your own task; as member B, comment on the same task. In A's Team tab, B's comment is listed and A's own upload is not.

**Acceptance Scenarios**:

1. **Given** activity on the member's tasks, **When** they open the Team tab, **Then** it lists other people's comments, files and publishes, and stage moves, newest first, and leaves out the member's own actions and mentions of the member.
2. **Given** a stage move, **When** it is listed, **Then** it says which task moved and to which stage, without an avatar or a name suggesting who moved it, and with a date-only time ("today", "yesterday", "3d ago"), never "just now".
3. **Given** an item in the Team tab, **When** the member clicks it, **Then** the task opens. For a comment, it opens at that comment.

---

### User Story 6 - What I finished, kept apart from what is left (Priority: P3)

The **Done** tab lists the member's tasks published this week (Monday to today) and their published total ("193 published in total").

**Why this priority**: Keeps the sense of progress that "193 published" gave, without it sitting inside a to-do card (N3).

**Independent Test**: Publish one of a member's tasks. It appears at the top of their Done tab, and the total goes up by one.

**Acceptance Scenarios**:

1. **Given** the member's tasks published this week, **When** they open Done, **Then** those tasks are listed newest first, each with when it was published, followed by the all-time total.
2. **Given** no task was published this week, **When** they open Done, **Then** it says so, and still shows the all-time total.

---

### User Story 7 - Keep the Inbox open, and bring back "Your week" (Priority: P3)

Some people want the Inbox always visible. A **pin** in the panel keeps it open beside the board instead of over it, and the board makes room. Clicking the board no longer closes it, and the choice is remembered. Separately, a **View** menu next to the Board title holds two switches: "Show your week" (Week Momentum and Daily Spark), off by default, and "Columns before design", the old "Hide what's upstream" button.

**Why this priority**: "Hidden by default" must not take anything away from people who liked the old layout. Few people will use it, so it ranks last.

**Independent Test**: Open the Inbox and press the pin. The panel sits beside the board and stays open after a click on the board. Reload the page: it is still open. Turn on "Show your week" in View: Week Momentum and Daily Spark appear above the pipeline. Reload: they are still shown.

**Acceptance Scenarios**:

1. **Given** the Inbox is open, **When** the member presses the pin, **Then** the panel moves beside the board, the board narrows to make room, and clicks on the board no longer close it.
2. **Given** the Inbox is pinned, **When** the member reloads the Board or comes back later, **Then** it is still open and pinned.
3. **Given** the Inbox is pinned, **When** the member presses the pin again or ✕, **Then** it is unpinned and closed, and the board takes its full width again.
4. **Given** the View menu, **When** the member turns on "Show your week", **Then** Week Momentum and Daily Spark appear above the pipeline and stay on until turned off.
5. **Given** the View menu, **When** the member changes "Columns before design", **Then** the board shows or hides those columns exactly as the old header button did, and their previous choice is kept.

---

### Edge Cases

- **First day after launch**: The member already has many old mentions. Only mentions from the last 7 days count as unread; older ones start as read, so the number starts small and true.
- **Very large counts**: The number shows up to 99, then "99+". The panel heading always shows the exact counts per kind.
- **A task leaves the Inbox while it is open**: For example, someone else approves it, or it is deleted. It disappears the next time the Board refreshes its data. An action on a task that has already moved fails safely, says it was already moved, and refreshes the list.
- **An action fails**: For example, the connection is lost. The row stays, a short message says it didn't work, and the number does not change.
- **Snoozed task becomes late**: A task put off until tomorrow comes back at the start of the next day even if it is now late. Snoozing never hides a task for more than one day.
- **Mention on a task the member can't see**: For `user`-tier members with access to their own tasks only, such a mention is still listed, but opening the task follows the existing access rules.
- **Mention edited or deleted**: An edited mention shows the new text and keeps its read state. A deleted one leaves the list and the count.
- **Phone width**: The panel opens full width. The button keeps its purple fill, the word "Inbox" and the number, but drops the summary line. Row actions sit on their own line under each row.
- **Arabic (right-to-left)**: The panel opens from the left side, and tabs, rows and actions are mirrored. Numbers and counts are correct in both languages.
- **Pinned on a narrow screen**: Below tablet width, there is no room beside the board, so a pinned Inbox sits above the board instead.

## Requirements *(mandatory)*

### Functional Requirements

**Layout: hidden by default**

- **FR-001**: The Board MUST NOT show the Needs your attention or Activity feed cards. Their content moves into the Inbox.
- **FR-002**: Week Momentum and Daily Spark MUST be hidden by default and shown only when the member turns on "Show your week" in the View menu. The choice MUST be remembered per member.
- **FR-003**: The "Hide what's upstream / Preview what's coming" header button MUST move into the View menu as "Columns before design", keeping its current behaviour and each member's saved choice.
- **FR-004**: With the Inbox closed and "Show your week" off, the pipeline MUST begin directly under the header and the board filters.

**The Inbox button**

- **FR-010**: The header MUST show an Inbox button in place of the bell. The bell and its dropdown MUST be removed.
- **FR-011**: The Inbox number MUST equal the reviews waiting for the member (FR-020), plus their tasks that are late, due today or undated (FR-022) and not put off, plus their unread mentions (FR-030). It MUST be hidden when the total is zero, and show "99+" above 99.
- **FR-012**: The number MUST use the urgent colour when at least one counted task is due today or late, and the normal colour otherwise.
- **FR-012a**: When the count is above zero, the Inbox button MUST be the most prominent header control after "+ New task": filled in the brand purple and at least as tall as "+ New task". The number MUST sit as a badge on the top corner of the inbox icon (the inline-end corner, so top-left in Arabic), cut out from the icon by a ring in the button's colour.
  - *Superseded by spec 011 FR-012 (2026-11-05): the header's Inbox is a compact button (icon, "Inbox", count badge) with the summary in its tooltip and accessible name. The urgent colour, "All clear", the ring and the panel stand.*
- **FR-012b**: Beside the word "Inbox", the button MUST show a one-line summary of the two most pressing kinds of waiting item, in this order: reviews waiting, late, due today, new mentions (for example "2 reviews waiting · 1 due today"). When only undated tasks are counted it MUST read "N to do".
- **FR-012c**: When the count is zero, the button MUST change to a quiet outlined style reading "All clear", so the purple fill keeps meaning "something is waiting".
- **FR-012d**: When the Board opens with a new unread mention or an urgent task, a soft ring MUST pulse around the button three times and then stop. It MUST NOT pulse again until something new arrives after the member last opened the Inbox, and MUST NOT animate when the member's system asks for reduced motion.
- **FR-013**: The button's accessible name MUST state the counts in words (for example "Inbox, 3 to do, 2 unread mentions"). Its expanded state MUST be announced.
- **FR-014**: Clicking the button MUST open the Inbox panel. Clicking it while the panel is open MUST close it.

**The Inbox panel**

- **FR-015**: The panel MUST have four tabs in this order: To do, Mentions, Team, Done. To do and Done show their counts; Mentions shows its unread count when there is one.
- **FR-016**: The panel MUST open on To do. If To do is empty, it MUST open on Mentions, or on Team if both are empty.
- **FR-017**: The panel heading MUST summarise the counts ("3 to do · 2 unread mentions", or "All clear").
- **FR-018**: The panel MUST open over the board on the inline-end side (right in English, left in Arabic). It MUST close on Esc, ✕, or a click outside it when not pinned, and focus MUST return to the Inbox button.
- **FR-019**: Clicking a row, outside its action buttons, MUST open that task's panel.

**To do**

- **FR-020**: To do MUST first list "Waiting for your review": open tasks in a review stage (C-Review, C-Check, D-Check, Final check) whose owner role matches the member's role, longest waiting first.
- **FR-021**: Each review row MUST show the task name, its stage, how long it has been waiting in that stage, its due date if any, and its SLA status when it is at risk or breached.
- **FR-022**: To do MUST then list "Your tasks": open tasks the member owns that are late, due today, or have no due date, in that order. Each row MUST show the reason.
- **FR-023**: Tasks in neither group MUST NOT appear in To do. This includes the member's tasks due later, which stay on the board.
- **FR-024**: Review rows MUST offer Approve → and Send back. Approve MUST advance the task to its next stage under the same permission, SLA and celebration rules as moving it on the board.
- **FR-025**: Send back MUST let the member add an optional short note. It MUST return the task to the stage before the review, and post the note, if given, as a comment that mentions the task's owner.
- **FR-026**: "Your tasks" rows MUST offer Set date, Move on → and Tomorrow. Set date MUST save the due date. Move on → MUST advance the task under the same rules as Approve.
- **FR-027**: Tomorrow MUST hide the task from the Inbox and from the count until the start of the member's next day. A "Put off until tomorrow · N · Bring back" line MUST let the member undo it. Put-off tasks MUST stay on the board as normal.
- **FR-028**: Action buttons MUST be shown only when the member may perform the action, following the existing role rules. Otherwise the row shows no actions and opens the task.
- **FR-029**: After an action succeeds, the row MUST leave the list or update, and the number MUST update immediately. If it fails, the row MUST stay, a short message MUST explain, and the number MUST NOT change.

**Mentions**

- **FR-030**: Mentions MUST list comments that mention the member: unread first, then read, each newest first. Each shows the author, the task, the comment text and its age.
- **FR-031**: A mention MUST become read only when the member replies to it in place, presses Mark read, presses Mark all read, or opens the task from that mention. Opening the panel or the tab MUST NOT mark anything read.
- **FR-032**: Replying in place MUST post the reply as a comment on the task, mentioning the author.
- **FR-033**: Read state MUST be stored per member and shared across their devices and sessions.
- **FR-034**: When this feature launches, mentions older than 7 days MUST start as read.

**Team**

- **FR-040**: Team MUST list other people's comments, files added, stage moves and publishes on tasks the member owns or is assigned to, newest first. It MUST exclude the member's own actions and mentions of the member.
- **FR-041**: Stage moves MUST name the task and the new stage, without an avatar or a name of who moved it. They MUST use date-only wording ("today", "yesterday", "3d ago").
- **FR-042**: Clicking a Team item MUST open the task; for a comment, at that comment.

**Done**

- **FR-050**: Done MUST list the member's tasks that reached Published this week (Monday to today), newest first, followed by their all-time published total.

**Pin**

- **FR-060**: The panel MUST offer a pin. When pinned, the panel MUST sit beside the board and narrow it, outside clicks MUST NOT close it, and the state MUST be remembered per member.
- **FR-061**: Below tablet width, a pinned panel MUST sit above the board instead of beside it.

**Language, accessibility and design**

- **FR-070**: Every new string MUST exist in English and Arabic, and the panel MUST lay out right to left in Arabic.
- **FR-071**: The panel, tabs, rows and actions MUST be reachable and usable with the keyboard alone. The tabs MUST behave as a tab list.
- **FR-072**: The look MUST follow the approved preview ("Board For-You Options", tab "Option B · Inbox button") and use only the project's design tokens.

### Key Entities

- **Inbox item**: Something that needs the member, of one of three kinds: a review waiting for their role, one of their own tasks needing a decision, or an unread mention. It is worked out from the tasks, comments and the two records below, not stored on its own.
- **Mention read state**: For one member and one mention, whether and when they read it. Needed for the number to go down and stay down across devices.
- **Put-off (snooze)**: For one member and one task, the moment until which the task is hidden from their Inbox (the start of their next day).
- **Member Inbox preferences**: Per member, whether the Inbox is pinned and whether "Show your week" is on. "Columns before design" keeps its existing saved setting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a 1366×768 laptop screen, the first cards of the pipeline are visible on opening the Board without scrolling. Today they are pushed below the fold.
- **SC-002**: In 100% of checks, the Inbox number equals the number of items listed across To do and unread Mentions.
- **SC-003**: Every task sitting in a review stage owned by the member's role appears in their To do. In a check of all review-stage tasks, no task is missing and no extra task appears.
- **SC-004**: After any Inbox action (Approve, Send back, Move on, Tomorrow, Set date, Mark read, reply), the number and list update within 1 second.
- **SC-005**: A reviewer can approve a waiting task in 2 clicks from opening the Board (Inbox, then Approve). Today it takes finding the card on the board and dragging it.
- **SC-006**: A mention read on one device shows as read on another device the next time the Board loads, in 100% of checks.
- **SC-007**: On launch day, no member's Inbox number includes mentions older than 7 days.
- **SC-008**: The Inbox opens and closes in under half a second on a typical team laptop, and works fully with the keyboard alone.
- **SC-009**: After two weeks of use, at least 4 of 5 team members asked can say correctly what the Inbox number counts.
- **SC-010**: When asked "where do you see what needs you?" on first seeing the new Board, at least 4 of 5 team members point to the Inbox button within 5 seconds.

## Assumptions

- **What the number counts**: The number counts only what needs the member now: reviews waiting, own tasks that are late, due today or undated, and unread mentions. Their tasks due later are left out so the number stays small and meaningful. This is a choice made for this spec; the preview counted every open task because it only had three.
- **The pin and "Show your week" follow the member**: Both are per member, remembered across sessions. "Columns before design" keeps its existing saved setting on each device, unchanged.
- **Approvals with no event log**: There is no record of who moved a task. So the Team tab never names who moved something, and Done lists published tasks the member owns, not reviews they approved.
- **Freshness**: Changes made by others reach the Inbox when the Board next loads or refreshes its data, as the board does today. Live, instant updates are out of scope.
- **The start of the next day for Tomorrow**: Midnight in the member's own time zone, on the device they are using.
- **The 7-day launch window**: Chosen as long enough to keep recent mentions someone may still owe an answer to, and short enough that the first number is small.
- **The approved design**: The interactive preview "Board For-You Options" (tab "Option B · Inbox button") is the approved design. Per the constitution's Design-Driven Development principle, it will be committed to `design/` before any UI work.
- **Out of scope**: Email or push notifications, a full activity history page, notification settings per kind, and snoozing for longer than one day.
- **The bell's due-date notices**: These move into To do, so no information the bell showed is lost.
