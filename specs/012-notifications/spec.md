# Feature Specification: Task Notifications

**Feature Branch**: `claude/nice-noether-x4rgei`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "Build a Facebook-style Notifications System". The request covers:
- §1 triggers: comment, reply, task created in a stage, task moved to a stage, attachment, assignment, @mention, due soon or overdue;
- §2 grouping within 2 hours;
- §3 a bell with an unread count, a dropdown with All and Unread tabs, deep links, a full page and toasts;
- §4 per-user settings;
- §5 a data model;
- §6 a central notify service, realtime delivery, an hourly due-date job, and 90-day clean-up;
- §7 English and Arabic;
- §8 edge cases.

"Review the existing data model … and reuse it. Do not duplicate existing entities."

## Context: what exists today

What the app has now, from the data model and the Board Inbox (spec 006):

- **People and roles.** Members have a role (Content Creator, Graphic Designer, Video Editor, Marketing Manager, Brand Director, Managing Director…) and an access level.
- **Tasks.** Each task has:
  - an **owner**, who is accountable;
  - an **assignee**, who does the work;
  - a **creator**.
- **Stages.** Tasks move through a nine-stage pipeline (eight when the content check is off), plus terminal states. **A stage's owner is a role, not a person.**
  - Four review stages name a role: Marketing Manager, Managing Director, Brand Director, Marketing Manager.
  - The working stages belong to whoever holds the task: its assignee, or its owner when there is no assignee.
  - The app already has one rule for "who holds this stage". This spec uses it wherever the request says "stage owner".
- **Comments.**
  - Comments are flat: **there are no replies today.** This feature adds them (FR-081).
  - Each comment already records whom it @mentions, and the Inbox already tracks which mentions each person has read.
- **Attachments.** Files and links, each recorded with who added it.
- **The Board Inbox (spec 006).**
  - It **replaced the bell** that used to be in the header.
  - It shows what needs the person (reviews and their own tasks), the comments that mention them, team activity on their tasks, and what they published.
  - It counts and reads these from the tasks and comments already on the board. It stores no notification records.
- **Live updates.** There is no live channel from the server today. Pages update when the person acts or reloads.
- **Scheduled jobs.** There is no scheduled job today.

This feature adds what the Inbox doesn't do:
- a **record per event**, with read state, grouping and history;
- **following**;
- **per-person settings**;
- **live arrival**, with toasts.

It sits beside the Inbox as a bell (FR-080): the bell says what happened, and the Inbox keeps what you need to act on.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know when something happens on my tasks (Priority: P1)

Salma comments on "Q4 LinkedIn Carousel". Its assignee, Yosra, sees the bell's badge go from 2 to 3 within seconds, without reloading. She opens the list and reads "**Salma** commented on '**Q4 LinkedIn Carousel**'", 2m ago, with a blue dot. She clicks it. The task opens, scrolled to Salma's comment, which is briefly highlighted. The notification is now read and the badge goes down to 2.

**Why this priority**: It is the core loop: an event happens, the right people hear about it, and one click takes them to it.

**Independent Test**: Two members on two devices. Member A comments on a task that member B is assigned to. Within 10 seconds B's badge goes up by one. Clicking the notification opens the comment, and the badge goes down. A gets nothing.

**Acceptance Scenarios**:

1. **Given** a task with an assignee and a creator, **When** another member comments, **Then** the assignee, the creator and the task's followers each get one notification, and the commenter gets none.
2. **Given** a member who is both the assignee and the creator, **When** someone comments, **Then** they get exactly one notification (FR-004).
3. **Given** an unread notification, **When** the member clicks it, **Then** the task opens at the target and the notification becomes read:
   - a comment or reply: scrolled to the comment, and the comment highlighted;
   - an attachment: the Attachments section;
   - otherwise: the task.
4. **Given** the list is open, **When** a new notification arrives, **Then** it appears at the top without a reload, and the badge updates.
5. **Given** a notification for a task that was deleted, or that the member can no longer see, **When** they click it, **Then** they see "This task is no longer available", not an error.

---

### User Story 2 - Hear about work entering my stage, assignments and mentions (Priority: P1)

Nermin moves "Manifesto Post" into Review. Everyone who holds the Review stage gets "**Nermin** moved '**Manifesto Post**' to your stage: Review". In other examples:
- Raneem assigns "Omnisight Launch Teaser" to Samaa, and Samaa gets "You were assigned to '**Omnisight Launch Teaser**'".
- Raneem @mentions Salma in "Campaign Brief", and Salma is told even though she doesn't follow that task.

**Why this priority**: Stage moves, assignments and mentions are how work changes hands in this team. Missing one stalls a task.

**Independent Test**:
- Move a task into a review stage: every member with that stage's role is notified once, and the mover is not.
- Assign a task: only the new assignee is notified.
- Mention someone who doesn't follow the task: they are notified, and they now follow it.

**Acceptance Scenarios**:

1. **Given** a task created directly in a stage, **When** it is saved, **Then** the stage's holders, other than the creator, are told "New task '…' was added to your stage: …".
2. **Given** a task moved into a stage, **When** the move succeeds, **Then** the destination stage's holders, other than the mover, are notified.
3. **Given** the move leaves a stage, **When** later events happen on the task, **Then** the previous stage's holders hear nothing more unless they follow the task.
4. **Given** an assignee change, **When** it is saved, **Then** the new assignee is notified (unless they assigned themselves) and now follows the task.
5. **Given** an @mention in a comment, or in the task's description when it is saved, **When** it is saved, **Then** each mentioned member is notified even if they don't follow the task, and they now follow it. Mentions and assignments are never grouped (FR-021).

---

### User Story 3 - A calm list, not a flood (Priority: P1)

Five people comment on "Q4 LinkedIn Carousel" within an hour. Yosra sees one line, not five: "**Salma**, **Yosra** and 3 others commented on '**Q4 LinkedIn Carousel**'", with stacked avatars. When Samaa adds five files, Yosra sees "**Samaa** added 5 attachments to '**Website Hero Visual**'". Once she has read a group, the next comment starts a new one.

**Why this priority**: Without grouping, a busy task buries everything else, and people stop reading the list.

**Independent Test**: Five comments by three people on one task within two hours give one unread notification naming the latest two people, "and 3 others". After marking it read, a sixth comment makes a new notification.

**Acceptance Scenarios**:

1. **Given** unread comment notifications on one task, **When** another comment arrives within 2 hours of the group's first event, **Then** it joins that notification: the count goes up, the actors are updated, and the time is updated. No new line appears.
2. **Given** a group has been read, **When** a new event of the same kind arrives on the task, **Then** a new notification starts.
3. **Given** mentions and assignments, **When** several arrive, **Then** each is its own notification.

---

### User Story 4 - Look through, mark and silence (Priority: P2)

The list shows the latest 20 and loads older ones as Yosra scrolls. She switches between **All** and **Unread**. She uses **Mark all as read**. On a noisy task she opens "⋯" and chooses "Turn off notifications for this task". When nothing is unread, the Unread tab says "You're all caught up."

**Why this priority**: Keeping the list tidy is what keeps the badge meaningful.

**Independent Test**:
- With 45 notifications, the first 20 load, and scrolling loads the rest.
- Mark all as read sets the badge to 0.
- Turning a task off stops new notifications from it, except mentions and assignments (FR-032).
- Mark as unread brings the dot back.

**Acceptance Scenarios**:

1. **Given** more than 20 notifications, **When** the list is scrolled to its end, **Then** the next ones load, with no duplicates and no gaps.
2. **Given** the Unread tab, **When** a notification is marked read there, **Then** it stays visible, dimmed, until the tab is reopened.
3. **Given** "Turn off notifications for this task", **When** later events happen on it, **Then** the member gets none for that task (they stop following it), except mentions and assignments.
4. **Given** the ⋯ menu, **When** "Mark as unread" is chosen, **Then** the dot and tint come back, and the badge goes up by one.

---

### User Story 5 - Follow and unfollow a task (Priority: P2)

On any task, a member sees **Follow** or **Following**. Yosra follows "Retreat Banner" to hear about it although it isn't hers. People who create, are assigned to, comment on, or are mentioned in a task follow it automatically.

**Why this priority**: Following decides who hears about comments and attachments beyond the assignee and creator.

**Independent Test**: Follow a task you have no role on: you're told about its next comment. Unfollow it: you aren't told about the one after.

**Acceptance Scenarios**:

1. **Given** a member creates, is assigned to, comments on, or is mentioned in a task, **When** that happens, **Then** they follow it, unless they had unfollowed it on purpose (FR-013).
2. **Given** the toggle, **When** it is used, **Then** the change is immediate and remembered.

---

### User Story 6 - Toasts while I'm working (Priority: P2)

While Yosra works on the board, a notification arrives. A small toast appears in the bottom corner for 5 seconds. Clicking it follows the same deep link. Events on the task she has open don't toast: she can already see them.

**Why this priority**: It tells people about events without making them open the list.

**Independent Test**: With the board open, an event for the member shows a toast that disappears after about 5 s. With that task open, it shows none. With Do not disturb on, it shows none, but the notification is still in the list.

**Acceptance Scenarios**:

1. **Given** the member is active in the app, **When** a notification arrives, **Then** a toast shows for 5 s. It is clickable and can be closed.
2. **Given** the task the event is about is open, **When** it arrives, **Then** no toast shows.
3. **Given** Do not disturb is on, **When** notifications arrive, **Then** no toasts show, and the list and badge still update.
4. **Given** several notifications in a few seconds, **When** they arrive, **Then** at most one toast shows at a time, and it gives the count of the others ("and 2 more").

---

### User Story 7 - Due soon and overdue (Priority: P2)

The day before "Newsletter Draft" is due, its assignee and the stage's holders get "'**Newsletter Draft**' is due tomorrow". If it passes its date unfinished, they get "'**Newsletter Draft**' is overdue". Each is sent once.

**Why this priority**: It prevents silent slips. The board shows lateness already, but only to someone who is looking.

**Independent Test**: A task due tomorrow gives one "due tomorrow" notification to its assignee and the stage's holders within an hour. Running the check again sends nothing new. After the date passes, one "overdue" notification is sent.

**Acceptance Scenarios**:

1. **Given** a live task due tomorrow (in the team's time zone), **When** the hourly check runs, **Then** its assignee and the stage's holders get "due tomorrow" once.
2. **Given** a live task past its due date and not published or archived, **When** the check runs, **Then** they get "overdue" once.
3. **Given** the due date is changed, **When** the new date comes near, **Then** the reminders apply again for the new date.

---

### User Story 8 - Choose what I'm told about (Priority: P3)

In Notification settings, each member turns each kind of notification on or off, and can switch on Do not disturb. Mentions and assignments start on, and carry a note recommending they stay on.

**Why this priority**: It lets people tune the volume. The defaults suit most people.

**Independent Test**: Turn "New attachment" off: attachments on a followed task no longer notify. Turn it on again: they do.

**Acceptance Scenarios**:

1. **Given** a kind turned off, **When** such an event happens, **Then** no notification is recorded for that member.
2. **Given** a new member, **When** they first open settings, **Then** every kind is on.

---

### User Story 9 - The full history (Priority: P3)

A **Notifications** page lists the whole history, filtered by kind (comment, reply, attachment, move, assignment, mention, due date) and by date range.

**Why this priority**: It is useful for catching up after time off. The dropdown covers the daily need.

**Independent Test**: Filter by "Mentions" and "Last 7 days": only mentions from that week show, and the newest first.

---

### User Story 10 - In my language (Priority: P2)

Notifications are built from the event's facts at display time, in the reader's language. An Arabic reader sees "علّقت سلمى على مهمة 'Q4 LinkedIn Carousel'", with the list, toasts and settings laid out right to left. Task titles and names show as typed.

**Why this priority**: The team works in both languages. Storing finished sentences would freeze them in one language.

**Independent Test**: Switch the language: every existing notification reads in the new language, with the correct grammar for counts (one, two, few, many) and the actor's gender where Arabic needs it.

---

### Edge Cases

- **Your own action**: commenting on your own task, moving your own task, adding your own file or assigning yourself never notifies you (FR-003).
- **Several roles on a task**: one notification per event per person (FR-004).
- **The task is deleted, archived or out of reach**:
  - Its notifications stay in the history.
  - Clicking one says "This task is no longer available".
  - No new notifications are made for an archived task, except "overdue", which isn't sent either.
- **The comment or attachment is deleted**: the notification opens the task, without a highlight.
- **Edited comments**: editing doesn't notify again. A mention added by an edit notifies only the newly mentioned person.
- **Bulk changes** (moving or assigning many tasks at once): one notification per task per person, grouped where the kind allows.
- **A mention of someone who turned that task off**: still notified. Mentions always go through.
- **A stage with no holder** (no member has the role): nobody is notified for that move. This is not an error.
- **Two events at the same moment on a group**: neither is lost, and the count is exact.
- **Offline or closed app**: notifications wait. The badge is correct on next open, and no toasts replay for old events.
- **Clips (video sheet) and pieces (Content sheet)**: they are tasks, so the same rules apply.
- **Imports and backfills** (Paste plan, Paste clips): no notifications for tasks created by a paste, beyond one per paste per stage holder.

## Requirements *(mandatory)*

### Functional Requirements

**Events and recipients**

- **FR-001**: The system MUST record a notification for each event, to the recipients listed:

  | Event | Recipients |
  |---|---|
  | New comment on a task | The task's assignee, owner, creator and followers |
  | Reply to a comment | The parent comment's author, everyone else who replied in that thread, and the task's followers |
  | Task created in a stage | That stage's holders |
  | Task moved into a stage | The destination stage's holders |
  | Attachment added | The task's assignee, owner, creator, the current stage's holders, and followers |
  | Assignment | The new assignee |
  | @mention in a comment, reply or task description | Each mentioned member |
  | Due tomorrow | The task's assignee and the current stage's holders |
  | Overdue | The task's assignee and the current stage's holders |

- **FR-002**: "Stage holders" MUST follow the app's existing rule. A review stage is held by every member with its role. Any other stage is held by the task's assignee, or by its owner when there is no assignee.
- **FR-003**: The member who performed the action MUST NOT be notified about it.
- **FR-004**: A member who qualifies in several ways for one event MUST receive one notification for it.
- **FR-005**: Before recording, the system MUST respect the member's settings (FR-040) and their "turned off" tasks (FR-032).
- **FR-006**: Each notification MUST store the facts of the event, not a finished sentence:
  - the kind;
  - the actor or actors;
  - the task;
  - the comment or attachment, where there is one;
  - the stage;
  - the count;
  - a snippet of up to 100 characters of the comment's text.

**Following**

- **FR-010**: A member MUST follow a task automatically when they create it, are assigned to it, comment on it, or are mentioned in it.
- **FR-011**: Every task MUST show a Follow / Following toggle to everyone who can see it.
- **FR-012**: Leaving a stage MUST NOT keep the previous stage's holders notified, unless they follow the task.
- **FR-013**: A member who unfollows a task MUST NOT be followed back automatically by later comments of others. Their own new action on the task (a comment, an assignment to them, or a mention of them) MUST make them follow it again.

**Grouping**

- **FR-020**: Unread notifications of the same kind on the same task, for the same member, MUST combine into one when the new event comes within 2 hours of the group's first event. The combined notification shows:
  - the latest two actors;
  - "and N others";
  - the total count;
  - the newest time.
- **FR-021**: Mentions, assignments, "due tomorrow" and "overdue" MUST NOT be grouped.
- **FR-022**: Once a group is read, a later event of that kind MUST start a new notification.

**The bell and the list**

- **FR-030**: The header MUST show a bell with the unread count, shown as "9+" above 9. The count MUST update within 10 seconds of an event, without a reload, while the app is open.
- **FR-031**: The bell MUST open a list of the latest 20 notifications, newest first, that loads older ones on scroll. It MUST have **All** and **Unread** tabs. Each row MUST show:
  - the actor's avatar, or stacked avatars for a group;
  - an icon for the kind;
  - the sentence, with the actor and the task title in bold;
  - the relative time ("5m", "2h", "Yesterday");
  - an unread dot and tint.
- **FR-032**: Each row MUST offer a ⋯ menu with "Mark as read" / "Mark as unread" and "Turn off notifications for this task". Turning a task off unfollows the member and keeps them unfollowed. Mentions and assignments still come through.
- **FR-033**: The list MUST offer **Mark all as read**, a link to **Notification settings**, and a link to the full page. When nothing is unread it MUST say "You're all caught up".
- **FR-034**: Clicking a notification MUST mark it read and open its target:
  - a comment or reply: the task, scrolled to the comment and highlighted;
  - an attachment: the task's Attachments section;
  - a stage move, a new task or a due date: the task.

  A task that is gone or out of reach MUST show "This task is no longer available".
- **FR-035**: A **Notifications** page MUST list the whole history, filterable by kind and by date range.

**Toasts**

- **FR-036**: A new notification MUST show a toast in the bottom corner for 5 seconds while the member is active. The toast follows FR-034 when clicked, and shows at most one at a time, with "and N more".
- **FR-037**: There MUST be no toast for events on the task the member has open, and none while Do not disturb is on. The list and badge MUST still update.

**Settings**

- **FR-040**: Each member MUST be able to turn each kind on or off for in-app notifications, and to switch Do not disturb.
- **FR-041**: Every kind MUST start on. Mentions and assignments MUST carry a note recommending they stay on.

**Due dates**

- **FR-050**: An hourly check MUST send "due tomorrow" once per task per due date, and "overdue" once per task per due date, for live tasks that are not published or archived. Dates are read in the team's time zone. A new due date resets both.

**Retention**

- **FR-060**: Read notifications older than 90 days MUST be removed automatically. Unread ones are kept.

**Language and access**

- **FR-070**: Every sentence, label and message MUST exist in English and Arabic, and be built at display time in the reader's language. Arabic MUST use the correct plural forms and the actor's gender where the sentence needs it. The list, toasts, page and settings MUST work right to left.
- **FR-071**: A member MUST only see notifications about tasks they can see.
- **FR-072**: Everything MUST be usable with the keyboard alone, and the bell's accessible name MUST include the unread count.

**Decisions (clarified with the user)**

- **FR-080**: *(Clarified 2026-11-08: option A, a bell beside the Inbox. Design comparison: `design/notifications-options.html`.)* The header MUST show the bell beside the Inbox button.
  - **The bell holds "what happened"**: every notification in this spec.
  - **The Inbox keeps "what you need to act on"**: Reviews waiting, Your tasks, and Done.
  - **The Inbox's Mentions and Team tabs move into the bell.** Mentions become "mention" notifications. Team activity becomes comment, reply and attachment notifications on the member's tasks.
  - **The Inbox's count covers its to-do lists only.** It no longer counts unread mentions.
  - **The two counts look different.** The bell's is red. The Inbox's stays purple, or orange when something is urgent (spec 006).
  - **This replaces parts of spec 006:**
    - the Mentions and Team tabs (US3–US4);
    - mentions in the Inbox count (FR-011);
    - the mention read-state;
    - the rest of spec 006 stands.
  - **Unread mentions carry over.** Those made in the last 7 days become unread "mention" notifications at launch, so nothing waiting is lost.
- **FR-081**: *(Clarified 2026-11-08: one-level replies, built now.)* A member MUST be able to reply under any comment. Replies show under their comment, as a thread one level deep: a reply can't be replied to, though "Reply" on a reply adds to the same thread. Replies may mention people and add followers like comments do. The "reply" notification (FR-001) goes to the parent comment's author, everyone else who replied in that thread, and the task's followers.

### Key Entities

Existing entities are reused, not copied: members, tasks, stages and their roles, comments (with their mentions), attachments, and the Inbox's mention read-state. These are new:

- **Notification**: one per recipient per event or group. It holds:
  - the recipient;
  - the actors (one, or several for a group);
  - the kind;
  - the task;
  - optionally the comment, attachment and stage;
  - the count;
  - the snippet;
  - the read state and read time;
  - the created and updated times;
  - a grouping key.
- **Task follower**: a member who follows a task, and since when. It also records "turned off", so automatic following doesn't undo a deliberate choice.
- **Notification setting**: per member and kind, on or off for in-app. It has room for email later. Do not disturb is per member.
- **Reminder sent**: which due-date reminders went out for which task and date, so each is sent once.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An event reaches every intended recipient's badge within 10 seconds while their app is open, in 95% of cases. It never reaches the person who caused it.
- **SC-002**: For each of the nine kinds of event, a scripted test with members in several roles gives exactly one notification per intended recipient and none to anyone else.
- **SC-003**: A burst of 10 comments by 4 people on one task within an hour shows as one line in each recipient's list.
- **SC-004**: Clicking any notification lands on the exact comment or attachment, or on the task, within 2 seconds. Deleted targets show "This task is no longer available".
- **SC-005**: The bell's count matches the Unread tab's count at all times, after marking one read, marking one unread, Mark all, and arrivals.
- **SC-006**: Every notification reads correctly in English and Arabic, including counts of 1, 2, 3, 11 and 100. The list, toasts and settings pass a right-to-left check.
- **SC-007**: Each due-date reminder is sent once per task per due date over a week of hourly checks.
- **SC-008**: The list opens within 1 second with 1,000 notifications in a member's history.

## Assumptions

- **"Stage owner"** means the stage's holders under the app's existing rule (FR-002), because a stage's owner is a role here.
- **"Creator"** means the member who created the task. Tasks imported without one (from ClickUp) have none. The task's owner, the accountable person, is also told about comments and attachments, as the person who asked for the work.
- **"Anyone else in that thread"** means everyone who replied under the same comment.
- **The team's time zone** for due dates is the one the app already uses for "today" and "late".
- **Email notifications and digests are phase 2.** The settings keep room for them, but nothing is sent by email in this feature.
- **"Active"** for toasts means the app is open and visible, and the member has interacted within the last few minutes.
- **Pastes are summarised.** Paste plan and Paste clips create many tasks at once, so they notify each stage holder once per paste, not once per task.
- **Old history is not backfilled**, with one exception: unread mentions from the last 7 days (FR-080). Other comments and events from before launch don't become notifications.

## Out of Scope

- Email and digest delivery (phase 2).
- Phone or browser push notifications outside the app.
- Notifications about projects, themes or settings changes.
- Changing who may see or edit a task.
