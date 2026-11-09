# UI Contract: Task Notifications

The look follows `design/notifications.html`, which is made before the UI work (§IV) and extends `design/notifications-options.html`, option A. The strings live in a new `notifications` namespace in `messages/en.json` and `messages/ar.json`.

## 1. The bell (header, beside the Inbox)

- **Component.** `src/components/notifications/NotificationBell.tsx` (`data-bell`). It sits in `BoardHeader`'s `inbox` slot, before the Inbox button.
- **Badge.** Red (`--nt-red`), showing "9+" above 9. It is hidden at 0.
- **Accessible name.** "Notifications, {n} unread".
- **The pulse.** `useNotificationPulse()` polls the pulse route (R7) and shares `{ unread, latest }` with the bell, the panel and the toasts.

## 2. The panel

- **Container.** `NotificationPanel.tsx` (`data-notification-panel`, `role="dialog"`). It is 400 px wide under the bell, and full-screen on phones (≤ 767 px).
- **Head.** "Notifications", **Mark all as read** (`data-mark-all`), and the tabs **All** / **Unread** (`data-nt-tab`).
- **The list.** It loads 20 at a time with an `IntersectionObserver` sentinel (`data-nt-more`).
- **Each row** (`data-notification="<id>"`, `.is-unread`) shows:
  - the avatar, or two stacked avatars for a group;
  - an icon for the kind;
  - the sentence, with bold names and task title;
  - a 100-character snippet in quotes, for comments, replies and mentions;
  - the relative time ("5m", "2h", "Yesterday", then a date);
  - a blue dot when unread.
- **The row's ⋯ menu** (`data-nt-more-menu`) has "Mark as read" / "Mark as unread" and "Turn off notifications for this task".
- **Foot.** **Notification settings** and **See all**, which go to `/notifications`.
- **Empty.** "You're all caught up." when nothing is unread, on the Unread tab or on All with nothing at all.
- **The phone-alerts offer** (`data-push-offer`) shows at the top until alerts are allowed or the member dismisses it (FR-090).
- **Click.** `openNotification(id)`, then the deep link (R14). For a missing task, the dialog reads "This task is no longer available".

## 3. Toasts

- **Container.** `NotificationToasts.tsx` (`data-nt-toast`, `role="status"`). It sits in the bottom inline-end corner, above the phone tab bar.
- **Timing.** It shows for 5 s and pauses while hovered. ✕ closes it.
- **One at a time,** with "and N more" when several arrive together.
- **Not shown** with DND on, or for the open task (FR-037).

## 4. The task panel (`TaskModal`)

- **Follow toggle.** **Follow** / **Following** (`data-follow`) in the header actions.
- **Comments.**
  - "Reply" (`data-reply="<commentId>"`) under each top-level comment. It opens a composer indented under the thread, with the same @mention picker.
  - Replies show under their comment.
  - "Reply" on a reply replies in the same thread.
- **Deep link props.** `initialCommentId` scrolls to the comment and flashes it. `initialSection="attachments"` opens Attachments.
- **The description editor.** An `@` picker beside `/` (R11).

## 5. The Notifications page (`/notifications`)

- **Filters.** By kind (multi-select chips) and by date range (Today, Last 7 days, Last 30 days, Custom).
- **The list.** The same rows as the panel, with infinite scroll (FR-035).

## 6. Notification settings (`/notifications/settings`)

- **The table.** One row per kind, in this order:
  1. Mentions;
  2. Assignments;
  3. Comments;
  4. Replies;
  5. Attachments;
  6. New task in your stage;
  7. Moved to your stage;
  8. Due tomorrow;
  9. Overdue.
- **Columns.** **In the app**, **Phone**, **Email** (`data-setting="<kind>:<channel>"`). Mentions and assignments carry the note "Recommended: keep on".
- **"In the app" off** turns that row's phone and email switches off too (FR-040).
- **Email.** Instant / Daily summary / Off (`data-email-mode`). If email isn't set up, the note reads "Email isn't set up yet".
- **Do not disturb** (`data-dnd`).
- **This device.** "Get alerts on this phone" / "Alerts are on for this device · Turn off" (`data-push-device`). On an iPhone outside the Home Screen app, it shows the add-to-Home-Screen steps.
- **Saving.** Every change saves straight away, with a quiet "Saved" note.

## 7. The Inbox (spec 006), after option A

- **Panel tabs.** To do and Done; the Mentions and Team tabs are removed.
- **Count and summary.** They cover only reviews and your tasks.

## 8. Language, keyboard and access

- **Arabic.** Every surface mirrors. Sentences use ICU plural and select, with gender where Arabic needs it (R6).
- **Keyboard.**
  - The bell opens with Enter and closes with Esc, which returns focus to the bell.
  - ↑↓ move between rows, Enter opens a row, and Shift+F10 or the ⋯ button opens its menu.
- **Toasts** are announced politely and never take focus.
- **Colours.** Red badge `#E5484D`, unread tint `#F4F0FF`, unread dot and time `#2563EB`, as `--nt-*` variables in `globals.css`.
