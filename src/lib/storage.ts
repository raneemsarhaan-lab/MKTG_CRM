import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

/**
 * Object storage for uploaded files.
 *
 * Until now an upload lived in Postgres as a data URL, which worked and cost
 * more than it was worth: a phone photo had to be re-encoded down to a
 * megabyte before it could be stored at all, every row carrying bytes made the
 * table heavier to read, and the board had to be careful never to select the
 * column. A bucket removes all three problems at once — the file is stored
 * once, at full quality, and the database keeps a URL.
 *
 * Configured entirely from the environment, and optional. With no credentials
 * set, `configured()` is false and the app keeps storing uploads the old way,
 * so nothing breaks between deploying this and setting the variables:
 *
 *   S3_ENDPOINT           https://<account>.r2.cloudflarestorage.com
 *   S3_BUCKET             the bucket name
 *   S3_ACCESS_KEY_ID      \
 *   S3_SECRET_ACCESS_KEY  / the credentials — secrets, unlike the three above
 *   S3_PUBLIC_URL         the CDN origin files are served from
 *   S3_REGION             optional; "auto" suits R2 and is the default
 *
 * Deliberately not marked 'server-only': scripts/migrate-attachments.ts is a
 * plain Node script, not part of the Next build, and it needs exactly these
 * functions. Nothing here is importable usefully from a browser anyway — the
 * credentials are read from process.env, which a client bundle does not have.
 *
 * Existing rows are untouched. `data` still holds the older uploads and still
 * renders; see attachmentSrc, which prefers whichever of the two a row has.
 */

const ENDPOINT   = process.env.S3_ENDPOINT?.replace(/\/+$/, '') ?? ''
const BUCKET     = process.env.S3_BUCKET ?? ''
const KEY_ID     = process.env.S3_ACCESS_KEY_ID ?? ''
const SECRET     = process.env.S3_SECRET_ACCESS_KEY ?? ''
const PUBLIC_URL = (process.env.S3_PUBLIC_URL ?? '').replace(/\/+$/, '')
const REGION     = process.env.S3_REGION || 'auto'

/** True when every value an upload needs is present. */
export function configured(): boolean {
  return Boolean(ENDPOINT && BUCKET && KEY_ID && SECRET && PUBLIC_URL)
}

/**
 * Which of the settings are missing, for the diagnostics panel.
 *
 * Names only — never a value. Half of these are credentials, and a page that
 * prints them to whoever asks is worse than one that says nothing.
 */
export function missingSettings(): string[] {
  return [
    ['S3_ENDPOINT', ENDPOINT], ['S3_BUCKET', BUCKET],
    ['S3_ACCESS_KEY_ID', KEY_ID], ['S3_SECRET_ACCESS_KEY', SECRET],
    ['S3_PUBLIC_URL', PUBLIC_URL],
  ].filter(([, v]) => !v).map(([k]) => k)
}

let client: S3Client | null = null

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region:   REGION,
      endpoint: ENDPOINT,
      // R2 serves one bucket per path, not per subdomain.
      forcePathStyle: true,
      credentials: { accessKeyId: KEY_ID, secretAccessKey: SECRET },
    })
  }
  return client
}

/**
 * Where a file goes.
 *
 * Grouped by task so a task's files sit together, and prefixed with a random
 * id so two people uploading "cover.png" to the same task do not overwrite one
 * another. The original name is kept in the database, not in the key: names
 * can be edited, and an edit must not have to move an object.
 */
export function keyFor(taskId: string, filename: string): string {
  const ext  = filename.match(/\.[A-Za-z0-9]{1,8}$/)?.[0]?.toLowerCase() ?? ''
  const rand = crypto.randomUUID()
  return `tasks/${taskId}/${rand}${ext}`
}

/** The address the browser fetches this object from. */
export function publicUrl(key: string): string {
  return `${PUBLIC_URL}/${key.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Store one file and return where it can be read from.
 *
 * Content type is passed through so the CDN serves a picture as a picture
 * rather than as a download, and the cache header is a year: a key is unique
 * per upload, so an object at a given key never changes.
 */
export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<string> {
  await s3().send(new PutObjectCommand({
    Bucket:       BUCKET,
    Key:          key,
    Body:         body,
    ContentType:  contentType || 'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  return publicUrl(key)
}

/**
 * Remove one object.
 *
 * Never throws. A file removed from a task should disappear from the task even
 * if the bucket refuses; an orphaned object costs a fraction of a cent, while a
 * delete that fails halfway leaves a row pointing at nothing.
 */
export async function deleteObject(key: string): Promise<void> {
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  } catch {
    /* orphan rather than block */
  }
}
