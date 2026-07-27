// The assigned-task list's state machine, kept out of the component so every transition is
// assertable without a DOM. Mirrors task-page-jira-load-state.ts, minus the HTTP-status guessing:
// the ActiveCollab client is result-typed, so the failure kind arrives already classified.
import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'

/**
 * `canConnect` separates the two failures that end at the credential form from the ones a
 * reconnect cannot fix: `auth` had a token the instance refused, `not-configured` never had one.
 */
export type ActiveCollabTaskListError = {
  message: string
  canConnect: boolean
}

export type ActiveCollabTaskListState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | {
      kind: 'ready'
      tasks: readonly ActiveCollabTask[]
      hasMore: boolean
      loadingMore: boolean
      /** A page-two fault, shown beside the rows that did load rather than replacing them. */
      error: ActiveCollabTaskListError | null
    }
  | { kind: 'failed'; error: ActiveCollabTaskListError }

export type ActiveCollabTaskListInput = {
  tasks: readonly ActiveCollabTask[]
  hasMore: boolean
  loading: boolean
  failure: ActiveCollabFailure | null
}

/**
 * Copy comes from the shared failure module so the list, the connect dialog, and the settings card
 * cannot disagree about what a kind means. Trust `kind`, never `status` — the main-process client
 * remaps ActiveCollab's HTTP 500-on-bad-password onto `auth`.
 */
export function describeActiveCollabTaskListError(
  failure: ActiveCollabFailure
): ActiveCollabTaskListError {
  return {
    message: describeActiveCollabFailure(failure),
    canConnect: failure.kind === 'auth' || failure.kind === 'not-configured'
  }
}

/**
 * Rows outrank everything: a next-page fault or a refresh in flight must not blank the list the
 * user is already reading. Below that an in-flight read outranks a failure, so a retry shows
 * progress instead of the error it is busy retrying.
 */
export function deriveActiveCollabTaskListState(
  input: ActiveCollabTaskListInput
): ActiveCollabTaskListState {
  const error = input.failure ? describeActiveCollabTaskListError(input.failure) : null

  if (input.tasks.length > 0) {
    return {
      kind: 'ready',
      tasks: input.tasks,
      hasMore: input.hasMore,
      loadingMore: input.loading,
      error
    }
  }
  if (input.loading) {
    return { kind: 'loading' }
  }
  return error ? { kind: 'failed', error } : { kind: 'empty' }
}
