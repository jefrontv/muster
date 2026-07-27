// Argument validation for the ActiveCollab IPC surface.
//
// Everything crossing the bridge is untrusted JSON, so a call is rebuilt field by field rather
// than spread: a smuggled extra key must never reach a PUT body, and an omitted key must stay
// omitted, because ActiveCollab reads absent as "leave alone" and an explicit null as "clear".

import type { ActiveCollabTaskRef } from '../../shared/activecollab-api-types'
import type { ActiveCollabTaskUpdate } from '../../shared/activecollab-types'
import { acIsRecord } from '../activecollab/codecs'

// ActiveCollab's own columns are far shorter than any of these. The bounds exist so a hostile or
// wedged renderer cannot stream megabytes into a request body or the credential file.
export const MAX_URL = 2_048
export const MAX_EMAIL = 320
export const MAX_SECRET = 1_024
export const MAX_BODY = 65_536
const MAX_NAME = 512
const MAX_LABEL_NAME = 128
const MAX_LABELS = 64

/** A malformed call, rejected before the credential is read or any request is built. */
export class InvalidRequestError extends Error {}

/** Nothing usable is stored, so there is no instance to address. */
export class NotConfiguredError extends Error {}

export function record(value: unknown): Record<string, unknown> {
  return acIsRecord(value) ? value : {}
}

export function positiveId(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new InvalidRequestError(`${field} must be a positive integer.`)
  }
  return value
}

export function boundedText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new InvalidRequestError(`${field} must be a string.`)
  }
  if (value.length > max) {
    throw new InvalidRequestError(`${field} exceeds ${max} characters.`)
  }
  return value
}

/** Clamped rather than rejected: a stale list asking for page 0 should read page 1, not fail. */
export function pageNumber(value: unknown): number {
  if (value === undefined || value === null) {
    return 1
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidRequestError('page must be a finite number.')
  }
  return Math.max(1, Math.trunc(value))
}

export function taskRef(args: unknown): ActiveCollabTaskRef {
  const input = record(args)
  return {
    projectId: positiveId(input.projectId, 'projectId'),
    taskId: positiveId(input.taskId, 'taskId')
  }
}

function labelNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new InvalidRequestError('update.labelNames must be an array of label names.')
  }
  if (value.length > MAX_LABELS) {
    throw new InvalidRequestError(`update.labelNames exceeds ${MAX_LABELS} entries.`)
  }
  return value.map((entry) => boundedText(entry, 'update.labelNames entry', MAX_LABEL_NAME))
}

/**
 * Rebuilt key by key rather than passed through. An omitted key has to stay omitted — ActiveCollab
 * reads absent as "leave alone" and null as "clear" — and spreading untrusted JSON would smuggle
 * unvalidated fields straight into the PUT body.
 */
export function taskUpdate(value: unknown): ActiveCollabTaskUpdate {
  const input = record(value)
  const update: ActiveCollabTaskUpdate = {}
  if (input.name !== undefined) {
    update.name = boundedText(input.name, 'update.name', MAX_NAME)
  }
  if (input.bodyHtml !== undefined) {
    update.bodyHtml = boundedText(input.bodyHtml, 'update.bodyHtml', MAX_BODY)
  }
  if (input.assigneeId !== undefined) {
    update.assigneeId =
      input.assigneeId === null ? null : positiveId(input.assigneeId, 'update.assigneeId')
  }
  if (input.dueOn !== undefined) {
    if (
      input.dueOn !== null &&
      (typeof input.dueOn !== 'number' || !Number.isFinite(input.dueOn))
    ) {
      throw new InvalidRequestError('update.dueOn must be epoch milliseconds or null.')
    }
    update.dueOn = input.dueOn
  }
  if (input.labelNames !== undefined) {
    update.labelNames = labelNames(input.labelNames)
  }
  if (Object.keys(update).length === 0) {
    throw new InvalidRequestError('update requires at least one field.')
  }
  return update
}
