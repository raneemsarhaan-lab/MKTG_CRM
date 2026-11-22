/**
 * Who may act on a task (pure): its owner, its assignee, or an admin or
 * superuser. The same rule `canAct` in src/actions/tasks.ts applies; shared
 * here so spec 021's actions use it without copying.
 */
export function canActOn(
  task: { task_owner_id: string; assignee_id: string | null },
  member: { id: string; access: string },
): boolean {
  return task.task_owner_id === member.id
    || task.assignee_id === member.id
    || member.access === 'admin'
    || member.access === 'superuser'
}
