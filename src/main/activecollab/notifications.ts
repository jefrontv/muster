// Recently-updated tasks for the ActiveCollab "My Updates" bell: one `GET
// notifications/object-updates` against the instance.
//
// Three wire quirks are absorbed here rather than leaked upward:
//   - `updates` is EITHER a keyed count object (`{ new_comments: 3 }`) OR an empty array `[]`,
//     and both shapes occur in the vendor's own examples.
//   - `total_unread` can be `-1` — "not computed", NOT zero — so it must not render as a count.
//   - A project's NAME is only in the `related.Project` sidecar; the object row carries the id.

import type {
  ActiveCollabObjectUpdate,
  ActiveCollabUpdateKind,
  ActiveCollabUpdates
} from '../../shared/activecollab-types'
import { acCollection, acIsRecord, acNullableId } from './codecs'
import type { AcHttpClient, AcResponse } from './http'

// The endpoint caps its own page here; a `limit` parameter is ignored like everywhere else.
const ACTIVECOLLAB_UPDATES_PAGE_SIZE = 30

const UPDATE_KIND_BY_KEY: Record<string, ActiveCollabUpdateKind | undefined> = {
  new_comments: 'comment',
  mentions: 'mention',
  new_instance: 'created',
  reassigned: 'reassigned'
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Epoch seconds to epoch ms. `0` and null both mean unset, which is not 1970. */
function epochMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value * 1000 : null
}

/** `-1` is "not computed", NOT zero, so any negative collapses to null rather than a false count. */
function unreadCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Collapse the dual-shape `updates` field. Unknown keys map to `other` rather than being dropped,
 * so a future ActiveCollab update kind still reads as activity; a non-numeric count is skipped.
 */
function normaliseKinds(value: unknown): { kind: ActiveCollabUpdateKind; count: number }[] {
  if (!acIsRecord(value)) {
    return []
  }
  const kinds: { kind: ActiveCollabUpdateKind; count: number }[] = []
  for (const [key, count] of Object.entries(value)) {
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
      continue
    }
    kinds.push({ kind: UPDATE_KIND_BY_KEY[key] ?? 'other', count })
  }
  return kinds
}

function projectNameOf(related: unknown, projectId: number): string {
  const projects = acIsRecord(related) ? related.Project : undefined
  if (!acIsRecord(projects)) {
    return ''
  }
  const project = projects[String(projectId)]
  return acIsRecord(project) ? asText(project.name) : ''
}

function normaliseUpdate(value: unknown, related: unknown): ActiveCollabObjectUpdate | null {
  if (!acIsRecord(value)) {
    return null
  }
  const row = acIsRecord(value.object) ? value.object : null
  if (row === null) {
    return null
  }
  // Only Task rows survive: the panel can open tasks and nothing else.
  if (asText(row.class) !== 'Task') {
    return null
  }
  const taskId = acNullableId(row.id)
  const projectId = acNullableId(row.project_id)
  if (taskId === null || projectId === null) {
    return null
  }
  return {
    taskId,
    projectId,
    projectName: projectNameOf(related, projectId),
    taskNumber: acNullableId(row.task_number),
    name: asText(row.name),
    lastUpdateOn: epochMs(value.last_update_on),
    kinds: normaliseKinds(value.updates),
    isSubscribed: value.is_subscribed === true
  }
}

/**
 * Derived from the `X-Angie-Pagination*` headers, never from how many rows came back: a full page
 * is the only one that can have a successor when the totals header is absent.
 */
function hasMorePages(
  response: AcResponse<unknown>,
  requestedPage: number,
  rowCount: number
): boolean {
  const perPage =
    response.perPage !== null && response.perPage > 0
      ? response.perPage
      : ACTIVECOLLAB_UPDATES_PAGE_SIZE
  if (response.totalItems !== null) {
    const page = response.page !== null && response.page > 0 ? response.page : requestedPage
    return page * perPage < response.totalItems
  }
  return rowCount >= perPage
}

export async function listObjectUpdates(args: {
  http: AcHttpClient
  page?: number
}): Promise<ActiveCollabUpdates> {
  const page = args.page !== undefined && args.page > 1 ? Math.trunc(args.page) : 1
  const response = await args.http.request<unknown>('notifications/object-updates', {
    query: { page }
  })
  const payload = response.data
  const related = acIsRecord(payload) ? payload.related : undefined
  const rows = acCollection(payload, 'objects_and_updates')
  const updates: ActiveCollabObjectUpdate[] = []
  for (const entry of rows) {
    const update = normaliseUpdate(entry, related)
    if (update !== null) {
      updates.push(update)
    }
  }
  return {
    updates,
    totalUnread: acIsRecord(payload) ? unreadCount(payload.total_unread) : null,
    hasMore: hasMorePages(response, page, rows.length)
  }
}
