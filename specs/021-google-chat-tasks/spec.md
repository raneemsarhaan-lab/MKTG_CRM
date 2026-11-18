# Feature Specification: Add to Momentum from Google Chat

**Feature Branch**: `claude/nice-faraday-p5eraq`

**Created**: 2026-11-18

**Status**: Draft (clarified)

**Input**: User description: "Can we create a connector that works on Google Chat: when someone assigns a task to me, I click on it and it's added automatically to the tasks?" Agreed in conversation:
- the task goes on the **Momentum board**, not ClickUp, Google Tasks or the Inbox alone;
- the trigger is a **click on an "Add to Momentum" action** on a Chat message, not an automatic sync.

## Context: what exists today

- **Work arrives in Google Chat.** Managers and colleagues ask for work in Chat spaces and direct messages. Today someone retypes it into Momentum, or it gets lost in the scroll.
- **Google Chat's own "Assign" button** (in spaces) sends the work to Google Tasks. Google tells no outside app when that happens. That is why this feature acts on a click and does not watch for assignments.
- **Members sign in to Momentum with their Forefront email**, which is also their Google account. That email is how a person in Chat is recognised as a member.
- **Tasks** have an owner (accountable, fixed at creation), an assignee (does the work) and a creator. A new task starts in To Do. Brand, content type and due date are optional.
- **Who may create tasks.** Admins and superusers may create tasks. Members with `user` access cannot, and the board hides "+ New task" from them. This feature makes one narrow exception (FR-010).
- **Notifications (spec 012).** Creating a task makes its creator, owner and assignee follow it, and tells a new assignee they were assigned.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Turn a Chat message into my task with one click (Priority: P1)

In the "Marketing" space, Salma writes: "Yosra, can you do the LinkedIn carousel for the Omnisight launch, ideally by Thursday?" Yosra opens the message's menu and chooses **Add to Momentum**. A moment later, a reply only she can see says "Added to Momentum ✓ **LinkedIn carousel for the Omnisight launch**" with an **Open task** button. The task is on the board in To Do. Its brief holds Salma's full message, who sent it, when, and a link back to the conversation.

**Why this priority**: This is the whole request. Without it nothing else has value.

**Independent Test**: A member clicks Add to Momentum on any Chat message. Within 5 seconds they get the private confirmation, and the board shows a new To Do task carrying the message text and a working link back to the message.

**Acceptance Scenarios**:

1. **Given** any Momentum member, **When** they choose Add to Momentum on a message, **Then** one task is created in To Do, and they get a private "Added" reply with a link that opens that task.
2. **Given** a message of several lines, **When** it is added, **Then** the task name is its first meaningful line, trimmed and cut to 120 characters, and the brief holds the whole message.
3. **Given** the added task, **When** anyone opens it, **Then** the brief shows who sent the message, in which space or chat, when, and a link that opens the original message in Google Chat.
4. **Given** the new task, **Then** the clicker is its assignee. The sender (Salma) is its owner when she is a member, otherwise the clicker is. Both follow it, as with any new task (spec 012).
5. **Given** the Chat reply, **Then** only the clicker sees it; nobody else in the space is shown a message.
6. **Given** a member with `user` access, **When** they add a message, **Then** the task is created and assigned to them (FR-010).

---

### User Story 2 - Clicking twice doesn't make two tasks (Priority: P1)

Yosra isn't sure the first click worked and clicks Add to Momentum again on the same message. The reply says "Already in Momentum" with a link to the same task. Nothing new is created.

**Why this priority**: Duplicate tasks break the board, the workload numbers and the SLA picture. People double-click, and Chat can retry.

**Independent Test**: Click Add to Momentum on one message three times, including twice within a second. Exactly one task exists, and every reply links to it.

**Acceptance Scenarios**:

1. **Given** a message already added, **When** anyone clicks Add to Momentum on it again, **Then** no task is created and the reply links to the existing task.
2. **Given** two clicks on the same message at the same moment, **Then** exactly one task is created.
3. **Given** a message whose task has since been deleted, **When** it is clicked again, **Then** a new task is created.
4. **Given** a message whose task was dropped, **When** it is clicked again, **Then** the reply says it is in Momentum (dropped) and links to it, so the person can restore it rather than duplicate it.

---

### User Story 3 - Clear answers when it can't be added (Priority: P2)

A freelancer outside Forefront tries Add to Momentum. The reply says "Momentum didn't recognise your account (name@gmail.com). Ask an admin to add you to the team." Nothing is created.

**Why this priority**: The action is visible to everyone who can use the app in Chat, and some of them are not members. A silent failure would look like a broken button.

**Independent Test**: Trigger the action from an account that isn't a member, and while Momentum's Chat configuration is missing. Each gets its own plain-language reply, and no task is created in any case.

**Acceptance Scenarios**:

1. **Given** a Google account whose email matches no member, **When** it uses the action, **Then** the reply names the email, says to ask an admin, and nothing is created.
2. **Given** Momentum's Google Chat setup is incomplete, **When** the action is used, **Then** the reply says the integration isn't set up yet, and nothing is created.
3. **Given** a message with no text (only an attachment or a card), **When** it is added, **Then** the name falls back to "Task from <sender> in <space>" and the brief still links to the message.

---

### User Story 4 - Set it up once (Priority: P2)

An admin follows a written setup guide: create the Google Cloud project, turn on Chat, register the Momentum app with Momentum's address, have the Workspace admin allow it for forefront.consulting, and add the configuration to Momentum's hosting. Then they check that the app shows up in Chat.

**Why this priority**: None of the feature works until a person does this outside the code, and this team has not done it before.

**Independent Test**: Someone who has never set up a Chat app follows only the guide, and reaches a working Add to Momentum in under an hour.

**Acceptance Scenarios**:

1. **Given** the guide, **Then** every step names the screen, the exact values to enter and how to confirm it worked.
2. **Given** a configured app, **When** an admin checks Momentum's existing diagnostics, **Then** they can see whether the Google Chat integration is configured. Secrets are never shown.

---

### Edge Cases

- **Request not from Google Chat.** Someone who finds the address sends a forged request. It is rejected, and nothing is created or revealed.
- **Email case.** "Yosra@Forefront.Consulting" in Google matches "yosra@forefront.consulting" in Momentum.
- **Long or formatted messages.** Chat formatting (bold, links, mentions) is kept as readable text in the brief. Very long messages are kept whole in the brief; only the name is cut.
- **@mentions in the message.** "@Yosra" stays as text in the brief. Momentum @mentions are not created from Chat mentions, so nobody gets surprise notifications.
- **A message in a thread.** The link opens the message within its thread.
- **Arabic messages.** Right-to-left text is kept as written in the name and the brief.
- **Momentum is slow or down.** The reply comes within Chat's time limit. If the task can't be saved, the reply says so and asks the person to try again; no half-made task remains.
- **The clicker isn't the person asked.** Anyone may add any message they can see. The task goes to the clicker (FR-006), not to whoever is @mentioned.
- **Adding your own message.** The sender and the clicker are the same person, so they are both owner and assignee.
- **The sender is a Chat app or bot.** The clicker is the owner.
- **A deleted Chat message.** A task already made from it keeps its brief. The link will no longer open the message.

## Requirements *(mandatory)*

### Functional Requirements

**The action**

- **FR-001**: Google Chat MUST offer an **Add to Momentum** action on messages in spaces, group chats and direct messages where the Momentum app is available.
- **FR-002**: Where Chat cannot offer an action on a message, the member MUST be able to add the message another way in one step, such as a `/momentum` command used in a reply to it.
- **FR-003**: The action MUST work for members on Google Chat's web, desktop and mobile apps, wherever Chat supports app actions.

**Who is acting**

- **FR-004**: Momentum MUST accept only requests that genuinely come from Google Chat for Forefront's registered app. It MUST reject anything else without creating or revealing anything.
- **FR-005**: Momentum MUST identify the clicker by matching their Google account email to a member's email, ignoring letter case. With no match, nothing is created and the reply says so (Story 3).
- **FR-006**: The task's **assignee** MUST be the clicker. The task's **owner** MUST be the message's sender, when the sender's email matches a member. Otherwise the clicker is the owner. *(Decided 2026-11-18: the person who asked is accountable.)*
- **FR-010**: Every member MAY use the action, whatever their access, because the task is always assigned to the clicker (FR-006). This is a deliberate, narrow exception to the board rule that `user`-access members cannot create tasks. It does not give them "+ New task" or any other way to create tasks for other people. *(Decided 2026-11-18.)*

**The task**

- **FR-011**: The task MUST be created under the same rules as a task made on the board: To Do stage, the workspace's current pipeline length, default priority, created by the clicker. The same notifications and following apply (spec 012).
- **FR-012**: The task name MUST be the message's first non-empty line, with Chat formatting removed, trimmed, and cut to 120 characters with an ellipsis. With no text, it falls back to "Task from <sender> in <space name>".
- **FR-013**: The brief MUST contain the full message text, the sender's name, the space or chat name, the time it was sent, and a link that opens the original message in Google Chat.
- **FR-014**: Brand, content type, campaign, platform, hours estimate and due date MUST be left empty, for the person to fill in on the board. A due date written in the message ("by Thursday") is NOT read automatically.
- **FR-015**: Momentum MUST remember which Chat message each task came from, and show "From Google Chat" with the link on the task.

**Duplicates**

- **FR-020**: One Chat message MUST produce at most one live task, even under simultaneous clicks or Google retries.
- **FR-021**: Clicking again on a message with a live or dropped task MUST reply with a link to that task instead of creating one. If its task was deleted, a new one is made.

**Replies**

- **FR-030**: Every use of the action MUST get a reply, visible only to the clicker, within Google Chat's response time limit. The reply is one of: Added, Already in Momentum, Not a member, Not set up, Couldn't save.
- **FR-031**: The Added and Already replies MUST include a button that opens the task on the Momentum board.
- **FR-032**: Replies MUST be in English. Momentum's Arabic preference is per browser, and Chat gives no reliable signal for it.

**Setup and safety**

- **FR-040**: If Momentum's Google Chat configuration is missing, the integration MUST stay off: no tasks are created, the action replies "not set up yet", and the rest of Momentum is unaffected.
- **FR-041**: The feature MUST ship with a step-by-step setup guide for a non-developer admin. It covers the Google Cloud project, turning on Chat, registering the app, Workspace admin approval for forefront.consulting, Momentum's hosting configuration, and a final check.
- **FR-042**: Momentum's diagnostics MUST show whether the integration is configured, without showing secret values.
- **FR-043**: Momentum MUST keep only what a task needs: the message text and link in the brief, and the message reference for FR-015 and FR-020. It MUST NOT read or store other messages in the space.

### Key Entities

- **Chat-origin link**: ties one Google Chat message to the one Momentum task made from it. It records the message's identity, its space, a link to open it, the sender's name, who clicked, and when. Used to show the task's origin and to stop duplicates.
- **Task** (existing): gains the Chat-origin link. Otherwise unchanged.
- **Member** (existing): matched by email. No new fields.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member turns a Chat message into a board task in under 10 seconds, with one action and no typing.
- **SC-002**: 100% of uses get a reply. None ends in silence or a generic Chat error.
- **SC-003**: Zero duplicate tasks from the same message, across repeated and simultaneous clicks.
- **SC-004**: 100% of forged or unsigned requests are rejected, and none creates a task.
- **SC-005**: Every task made this way opens its original Chat message from the task in one click.
- **SC-006**: An admin new to Google Chat apps completes setup from the guide alone in under 1 hour.
- **SC-007**: Within a month of launch, the team reports that work asked for in Chat no longer needs retyping into Momentum.

## Assumptions

- Forefront uses Google Workspace, and a Workspace admin can approve an internal Chat app for the forefront.consulting domain.
- Members' Momentum emails are the same as their Google Workspace emails.
- Momentum stays reachable from the public internet over HTTPS at its current address, so Google Chat can reach it.
- The app is internal to Forefront and is not published to the public Google Workspace Marketplace.
- Out of scope:
  - syncing assignments made with Google Chat's own "Assign" button (Google Tasks);
  - ClickUp and Google Tasks as destinations;
  - sending status changes back to Chat;
  - reading due dates or brands from the message text;
  - choosing fields in a form before the task is created;
  - a Claude/MCP connector (the action runs inside Google Chat, with no AI step).
