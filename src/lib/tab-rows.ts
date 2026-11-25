/**
 * Spec 027 (US3): added tabs of grouped rows. Pure helpers shared by the server and the client.
 */

/** Where an added tab keeps its own columns (sheet_columns.sheet): `rows:tab:<sheetId>`. */
export const tabSheetId = (sheetId: string) => `rows:tab:${sheetId}` as const

/** A rows tab's id from its columns key, or null for any other sheet. */
export const tabOfSheetKey = (key: string | null | undefined): string | null =>
  key && key.startsWith('rows:tab:') ? key.slice('rows:tab:'.length) : null
