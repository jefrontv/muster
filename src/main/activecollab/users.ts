// The user roster, read for exactly one purpose: putting a NAME on a task's `assignee_id`.
//
// ActiveCollab 8.0.31 omits `assignee_name` AND `assignee_names` from every task row — verified
// against projects.efront.com.au, where 0 of 11 rows carrying a positive `assignee_id` shipped
// either field — so an id-to-name join against this collection is the only way to render an
// assignee at all.
//
// Deliberately a SINGLE unpaginated request. `/users` ignores `page` (asking for page 2 returns
// the same 176 rows) and answers with no `X-Angie-Pagination*` headers at all, unlike `/projects`.
// Paging it would re-fetch the identical roster forever.
//
// Not exposed over IPC, and never returned to the renderer: the assignee label is the only thing
// the fix needs, and publishing an entire instance's roster is a far wider surface than that.

import { acCollection, acIsRecord, acNullableId } from './codecs'
import type { AcHttpClient } from './http'

/** Just enough to label an assignee. Emails, avatars and permissions are deliberately not carried. */
export type ActiveCollabUser = {
  id: number
  name: string
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * `display_name` is populated for all 176 users on the target instance; the rest are insurance
 * against a build that omits it. Email is the last resort because it still identifies a person,
 * whereas an empty string identifies nobody and would be dropped as unresolvable.
 */
function userName(row: Record<string, unknown>): string {
  const composed = `${asText(row.first_name)} ${asText(row.last_name)}`.trim()
  return asText(row.display_name) || asText(row.short_display_name) || composed || asText(row.email)
}

/**
 * Archived users are kept: a task can outlive the person's account, and their real name is a more
 * honest label than a blank. Rows with no id or no usable name are dropped — there is nothing to
 * join them on, and a nameless entry would only shadow a later usable one.
 */
export async function listUsers(args: { http: AcHttpClient }): Promise<ActiveCollabUser[]> {
  const response = await args.http.request<unknown>('users')
  const users: ActiveCollabUser[] = []
  for (const entry of acCollection(response.data, 'users')) {
    if (!acIsRecord(entry)) {
      continue
    }
    const id = acNullableId(entry.id)
    const name = userName(entry)
    if (id !== null && name !== '') {
      users.push({ id, name })
    }
  }
  return users
}
