/**
 * What the Inbox needs from its host (spec 006 contracts/inbox-ui.md §1).
 *
 * The board implements this over its own state and the server actions; the
 * lab implements it with a stub. The components never call a server action
 * themselves, so both hosts drive exactly the same code.
 */
import type { MoveTaskResult, StageId } from '@/types/index'

export type Ok = { success: boolean; error?: string }

export interface InboxApi {
  /** The board's move: optimistic, same rule and celebration as a drag. */
  move(taskId: string, to: StageId): Promise<MoveTaskResult>
  comment(taskId: string, body: string, mentions: string[]): Promise<Ok>
  setDate(taskId: string, isoDate: string): Promise<Ok>
  snooze(taskId: string, until: string): Promise<Ok>
  unsnooze(taskIds: string[]): Promise<Ok>
  setPrefs(p: { pinned?: boolean; showWeek?: boolean }): Promise<Ok>
  openTask(taskId: string, opts?: { commentId?: string }): void
}
