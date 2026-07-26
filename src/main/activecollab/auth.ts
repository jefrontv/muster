// ActiveCollab sign-in: exchange an email + password for the long-lived API token, then work out
// which user that token belongs to.
//
// Two API facts drive the shape of this file:
//   - Bad credentials come back as HTTP 500 with a human-readable `message` in the body, not a 401.
//     Reporting a generic server error would bury "Invalid username or password", so the API's own
//     message is surfaced verbatim.
//   - There is no dependable whoami. `GET user-session` is the best signal but its payload differs
//     across builds, and `/users` is admin-gated on some instances, so identity resolution walks
//     several sources before it gives up.

import type { ActiveCollabConnection } from '../../shared/activecollab-types'
import { acIsRecord, acNullableId } from './codecs'
import { normaliseActiveCollabInstanceUrl, setActiveCollabCredential } from './credential-store'
import { createAcHttp, type AcHttpClient } from './http'

export type ActiveCollabTokenResult = { ok: true; token: string } | { ok: false; message: string }

export type ActiveCollabIdentity = { id: number; name: string; email: string }

export type ActiveCollabConnectResult =
  | { ok: true; connection: ActiveCollabConnection }
  | { ok: false; message: string }

/** Shown in ActiveCollab's own "connected applications" list, so it names the product. */
const CLIENT_NAME = 'Muster'
const CLIENT_VENDOR = 'muster'

const NO_TOKEN_MESSAGE =
  'ActiveCollab accepted the sign-in but returned no API token. Check the instance URL.'

const NO_IDENTITY_MESSAGE =
  'Signed in to ActiveCollab, but could not determine which user the token belongs to.'

type Row = Record<string, unknown>

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** ActiveCollabApiError.message already holds the API's own `message`, so it passes through. */
function failureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 0 ? message : 'The ActiveCollab request failed.'
}

export async function issueActiveCollabToken(args: {
  baseUrl: string
  email: string
  password: string
}): Promise<ActiveCollabTokenResult> {
  let payload: unknown
  try {
    const response = await createAcHttp({ baseUrl: args.baseUrl, token: null }).request<unknown>(
      'issue-token',
      {
        method: 'POST',
        form: {
          username: args.email,
          password: args.password,
          client_name: CLIENT_NAME,
          client_vendor: CLIENT_VENDOR
        }
      }
    )
    payload = response.data
  } catch (error) {
    return { ok: false, message: failureMessage(error) }
  }
  if (!acIsRecord(payload)) {
    return { ok: false, message: NO_TOKEN_MESSAGE }
  }
  const token = asText(payload.token)
  if (token.length === 0 || payload.is_ok === false) {
    return { ok: false, message: asText(payload.message) || NO_TOKEN_MESSAGE }
  }
  return { ok: true, token }
}

function displayNameOf(row: Row): string {
  const explicit = asText(row.display_name) || asText(row.name)
  if (explicit.length > 0) {
    return explicit
  }
  const full = `${asText(row.first_name)} ${asText(row.last_name)}`.trim()
  return full.length > 0 ? full : asText(row.email)
}

/** Null unless the row carries something worth caching: an id with no name is not an identity. */
function identityOf(row: unknown, id: number | null): ActiveCollabIdentity | null {
  if (!acIsRecord(row) || id === null) {
    return null
  }
  const name = displayNameOf(row)
  const email = asText(row.email)
  return name.length > 0 || email.length > 0 ? { id, name, email } : null
}

/** Every whoami spelling seen in the wild; `logged_user` is a nested object on newer builds. */
function sessionUserId(session: Row): number | null {
  return (
    acNullableId(session.logged_user_id) ??
    acNullableId(session.user_id) ??
    acNullableId(session.id) ??
    (acIsRecord(session.logged_user) ? acNullableId(session.logged_user.id) : null)
  )
}

/**
 * A single-object read, unwrapped from ActiveCollab's `{ single: {...}, <sidecars> }` envelope.
 * Failures answer null rather than throwing: every caller has another source to try.
 */
async function readRow(http: AcHttpClient, path: string): Promise<Row | null> {
  let payload: unknown
  try {
    payload = (await http.request<unknown>(path)).data
  } catch {
    return null
  }
  if (!acIsRecord(payload)) {
    return null
  }
  return acIsRecord(payload.single) ? payload.single : payload
}

async function findUserByEmail(
  http: AcHttpClient,
  email: string
): Promise<ActiveCollabIdentity | null> {
  if (email.length === 0) {
    return null
  }
  let payload: unknown
  try {
    payload = (await http.request<unknown>('users')).data
  } catch {
    return null
  }
  if (!Array.isArray(payload)) {
    return null
  }
  const wanted = email.toLowerCase()
  for (const entry of payload) {
    if (acIsRecord(entry) && asText(entry.email).toLowerCase() === wanted) {
      return identityOf(entry, acNullableId(entry.id))
    }
  }
  return null
}

export async function resolveActiveCollabUser(args: {
  baseUrl: string
  token: string
  /** Only the `/users` fallback needs it; `user-session` identifies the caller on its own. */
  email?: string
}): Promise<ActiveCollabIdentity> {
  const http = createAcHttp({ baseUrl: args.baseUrl, token: args.token })
  const session = await readRow(http, 'user-session')
  const sessionId = session === null ? null : sessionUserId(session)
  if (session !== null) {
    // Newer builds inline the whole user, which saves the users/{id} round trip.
    const inline = identityOf(session.logged_user ?? session, sessionId)
    if (inline !== null) {
      return inline
    }
  }
  if (sessionId !== null) {
    const hydrated = identityOf(await readRow(http, `users/${sessionId}`), sessionId)
    if (hydrated !== null) {
      return hydrated
    }
  }
  const byEmail = await findUserByEmail(http, asText(args.email))
  if (byEmail !== null) {
    return byEmail
  }
  if (sessionId !== null) {
    // `/users` is admin-gated on some instances, but the id alone still addresses users/{id}/tasks.
    const email = asText(args.email)
    return { id: sessionId, name: email, email }
  }
  throw new Error(NO_IDENTITY_MESSAGE)
}

/** One call for the IPC layer: token, identity, and the credential write that binds them. */
export async function connectActiveCollab(args: {
  baseUrl: string
  email: string
  password: string
}): Promise<ActiveCollabConnectResult> {
  const issued = await issueActiveCollabToken(args)
  if (!issued.ok) {
    return issued
  }
  try {
    const identity = await resolveActiveCollabUser({
      baseUrl: args.baseUrl,
      token: issued.token,
      email: args.email
    })
    const connection: ActiveCollabConnection = {
      instanceUrl: normaliseActiveCollabInstanceUrl(args.baseUrl),
      userId: identity.id,
      userName: identity.name,
      userEmail: identity.email
    }
    setActiveCollabCredential({ ...connection, token: issued.token })
    return { ok: true, connection }
  } catch (error) {
    return { ok: false, message: failureMessage(error) }
  }
}
