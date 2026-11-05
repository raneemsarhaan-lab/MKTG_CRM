# Server contract: `src/actions/inbox.ts`

Every action:
- reads the member from the session (`getSessionMember`) and never takes a member id;
- returns `{ success: true, … }` or `{ success: false, error }`;
- calls `revalidatePath('/board')`.

| Action | Input | Effect | Errors |
|---|---|---|---|
| `markMentionsRead(commentIds: string[])` | 1–500 comment ids | Upserts a `mention_reads` row for each id whose comment mentions the member. Other ids are ignored. | `not_authenticated` |
| `replyToMention(commentId: string, body: string)` | A mention of the member; non-empty body (≤ 4000 chars) | In one transaction: creates a comment on the same task that mentions the original author, and marks the mention read. | `not_authenticated`, `not_found`, `empty` |
| `snoozeTask(taskId: string, until: string)` | ISO time in the future | Upserts the snooze. `until` is capped at now + 36 h (R6). | `not_authenticated`, `not_found`, `bad_time` |
| `unsnoozeTasks(taskIds: string[])` | Task ids | Deletes the member's snoozes for those tasks. | `not_authenticated` |
| `setInboxPrefs(p: { pinned?: boolean; showWeek?: boolean })` | Either field | Updates the member's `inbox_pinned` and `show_week`. | `not_authenticated` |

**Reused unchanged**:
- `setTaskStage(taskId, stage)` for Approve, Move on and Send back. It keeps the authorisation, `dropped` and `not_authorized` errors, and returns `shouldCelebrate`.
- `addComment(taskId, body, mentions)` for the Send back note.
- `updateTask(taskId, { due_date })` for Set date.
