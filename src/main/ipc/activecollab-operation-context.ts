// The per-call context every ActiveCollab operation is built on, and the failure mapping they all
// answer with.
//
// Split out of ipc/activecollab.ts so the people operations can share it without that module and
// activecollab-people.ts importing each other. Nothing here throws across the bridge: a malformed
// argument, a missing credential and a rejected token are all results the renderer branches on.

import type { ActiveCollabFailure, ActiveCollabResult } from '../../shared/activecollab-api-types'
import { ActiveCollabAttachmentError } from '../activecollab/attachment-image'
import {
  getActiveCollabConnectionStatus,
  getActiveCollabCredential,
  type ActiveCollabCredentialRecord
} from '../activecollab/credential-store'
import { ActiveCollabApiError, createAcHttp, type AcHttpClient } from '../activecollab/http'
import { acNameDirectory, type AcNameDirectoryLoader } from '../activecollab/name-directory'
import { acProjectMembers, type AcProjectMembersLoader } from '../activecollab/project-members'
import { InvalidRequestError, NotConfiguredError } from './activecollab-argument-validation'

export function toFailure(error: unknown): ActiveCollabFailure {
  if (error instanceof ActiveCollabApiError) {
    // A rejected token means reconnect; anything else is the instance misbehaving and is worth
    // retrying. Collapsing the two would put a reconnect prompt in front of a 503.
    return {
      ok: false,
      kind: error.isAuthError ? 'auth' : 'api',
      error: error.message,
      status: error.status
    }
  }
  if (error instanceof NotConfiguredError) {
    return { ok: false, kind: 'not-configured', error: error.message, status: null }
  }
  // A policy refusal — not an image, or past the size cap — reads the same to the renderer as a
  // malformed argument: non-retryable, and no reason to prompt a reconnect.
  if (error instanceof InvalidRequestError || error instanceof ActiveCollabAttachmentError) {
    return { ok: false, kind: 'invalid-request', error: error.message, status: null }
  }
  return {
    ok: false,
    kind: 'unknown',
    error: error instanceof Error ? error.message : String(error),
    status: null
  }
}

export async function guard<T>(call: () => Promise<T>): Promise<ActiveCollabResult<T>> {
  try {
    return { ok: true, value: await call() }
  } catch (error) {
    return toFailure(error)
  }
}

export type AcContext = {
  http: AcHttpClient
  userId: number
  names: AcNameDirectoryLoader
  members: AcProjectMembersLoader
}

/**
 * Built per call, never cached: a reconnect can replace the credential at any moment, and a cached
 * client would keep addressing the previous instance with the previous token.
 */
export function acClient(): AcContext {
  let credential: ActiveCollabCredentialRecord | null = null
  try {
    credential = getActiveCollabCredential()
  } catch {
    // A keychain refusal and an absent file are the same story to the user — reconnect — and
    // getActiveCollabConnectionStatus() already phrases which of the two happened.
    credential = null
  }
  if (credential === null) {
    throw new NotConfiguredError(getActiveCollabConnectionStatus().reason)
  }
  const http = createAcHttp({ baseUrl: credential.instanceUrl, token: credential.token })
  // The CLIENT is per call; the directories behind `names` and `members` are shared, keyed on the
  // credential identity below, so a page of rows costs one `/projects` and one `/users` per cache
  // window and a project's membership costs one read per project per window.
  const identity = { instanceUrl: credential.instanceUrl, userId: credential.userId }
  const names = acNameDirectory({ http, ...identity })
  return {
    http,
    userId: credential.userId,
    names,
    members: acProjectMembers({ http, names, ...identity })
  }
}
