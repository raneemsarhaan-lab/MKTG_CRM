// Sheet lab stub for src/actions/task-fields.ts (spec 023): the lab has no fields and no database.
export async function setFieldValue(_taskId: string, _fieldId: string, value: unknown) { return { success: true as const, value } }
export async function setFieldValues() { return { success: true as const, results: [] } }
export async function makeTaskField(_sheet: string, _columnKey: string) { return { success: false as const, error: "lab" } }
