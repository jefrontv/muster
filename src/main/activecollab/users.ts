// The user roster. Read for two purposes: putting a NAME on a task's `assignee_id`, and offering
// the comment composer somebody to @mention.
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
// The roster IS now reachable from the renderer, via `activecollab:listUsers`. An @mention menu
// cannot filter a list it cannot see. It is served out of the SAME credential-keyed window in
// name-directory.ts that the assignee join already fills, so exposing it costs no extra request,
// and the shape stays at id-plus-name: no emails, avatars or permissions cross the bridge.

import type { ActiveCollabUser } from '../../shared/activecollab-types'
import { acCollection, acIsRecord, acNullableId } from './codecs'
import type { AcHttpClient } from './http'

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
