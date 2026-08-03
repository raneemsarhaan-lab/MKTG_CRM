import { LoginForm } from './LoginForm'

/**
 * The login page is a server component so that it can say something when the
 * client never starts.
 *
 * When React has hydrated, handleSubmit calls preventDefault and the form is
 * never submitted by the browser. When it has *not* — a chunk that failed to
 * load, a script blocked by an extension, a bundle cached from an older build —
 * clicking Sign in falls back to a plain HTML submit: a GET to this same URL.
 * The button never enters its loading state, no error appears, and the page
 * quietly reloads. From the outside it is indistinguishable from a wrong
 * password, and it is the failure that cost this project several days.
 *
 * The email field carries a name, so that submit arrives here as ?email=…
 * The password field does not, so it never appears in a URL or in history.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const params = await searchParams
  return <LoginForm jsFailed={params.email !== undefined} />
}
