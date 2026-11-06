// HTTP client for the bots server's comment drafts API (embedded server only, owner-token guarded).
import type {
  BotsCommentDraft,
  BotsCommentDraftEdit,
  BotsCommentDraftResult
} from '../../shared/bots-comment-draft-types'

export type BotsServerConnection = { port: number; token: string }

type Fetch = typeof fetch

const REQUEST_TIMEOUT_MS = 10_000
export const BOTS_OWNER_HEADER = 'X-OpenMausBot-Desktop-Owner'

export type BotsCommentDraftsClient = {
  list: (status?: 'waiting' | 'all') => Promise<BotsCommentDraftResult<BotsCommentDraft[]>>
  update: (edit: BotsCommentDraftEdit) => Promise<BotsCommentDraftResult<BotsCommentDraft>>
  setStatus: (
    id: string,
    status: 'posted' | 'discarded'
  ) => Promise<BotsCommentDraftResult<BotsCommentDraft>>
  undo: (id: string) => Promise<BotsCommentDraftResult<BotsCommentDraft>>
  feedback: (id: string, note: string) => Promise<BotsCommentDraftResult<null>>
}

function isDraft(value: unknown): value is BotsCommentDraft {
  const draft = value as Partial<BotsCommentDraft> | null
  return (
    !!draft &&
    typeof draft.id === 'string' &&
    typeof draft.taskId === 'number' &&
    typeof draft.projectId === 'number' &&
    typeof draft.bodyHtml === 'string' &&
    typeof draft.version === 'number'
  )
}

function errorText(body: unknown, fallback: string): string {
  const error = (body as { error?: unknown } | null)?.error
  return typeof error === 'string' && error ? error : fallback
}

export function createBotsCommentDraftsClient(
  connection: () => BotsServerConnection | null,
  // Looked up per call so a test spy on the global is honoured.
  fetchImpl: Fetch = (input, init) => fetch(input, init)
): BotsCommentDraftsClient {
  async function call(
    method: string,
    route: string,
    body?: unknown
  ): Promise<{ status: number; body: unknown } | { failure: BotsCommentDraftResult<never> }> {
    const server = connection()
    if (!server) {
      return {
        failure: {
          ok: false,
          reason: 'unavailable',
          message: 'Muster Bots is not running.'
        }
      }
    }
    try {
      const response = await fetchImpl(
        `http://127.0.0.1:${server.port}/api/muster/comment-drafts${route}`,
        {
          method,
          headers: {
            [BOTS_OWNER_HEADER]: server.token,
            ...(body === undefined ? {} : { 'content-type': 'application/json' })
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        }
      )
      const parsed: unknown = await response.json().catch(() => null)
      return { status: response.status, body: parsed }
    } catch (error) {
      return {
        failure: {
          ok: false,
          reason: 'error',
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
  }

  // Shared 2xx/409/410 mapping for every route that answers `{ draft }`.
  async function draftCall(
    method: string,
    route: string,
    body?: unknown
  ): Promise<BotsCommentDraftResult<BotsCommentDraft>> {
    const answer = await call(method, route, body)
    if ('failure' in answer) {
      return answer.failure
    }
    const draft = (answer.body as { draft?: unknown } | null)?.draft
    if (answer.status >= 200 && answer.status < 300 && isDraft(draft)) {
      return { ok: true, value: draft }
    }
    if (answer.status === 409 && isDraft(draft)) {
      return {
        ok: false,
        reason: 'conflict',
        message: errorText(answer.body, 'The draft changed.'),
        draft
      }
    }
    if (answer.status === 410) {
      return {
        ok: false,
        reason: 'gone',
        message: errorText(answer.body, 'This draft was already posted or discarded.')
      }
    }
    return {
      ok: false,
      reason: 'error',
      message: errorText(answer.body, `The bots server answered HTTP ${answer.status}.`)
    }
  }

  const path = (id: string, suffix = ''): string => `/${encodeURIComponent(id)}${suffix}`

  return {
    async list(status = 'waiting') {
      const answer = await call('GET', `?status=${status}`)
      if ('failure' in answer) {
        return answer.failure
      }
      const drafts = (answer.body as { drafts?: unknown } | null)?.drafts
      if (answer.status !== 200 || !Array.isArray(drafts)) {
        return {
          ok: false,
          reason: 'error',
          message: errorText(answer.body, `The bots server answered HTTP ${answer.status}.`)
        }
      }
      return { ok: true, value: drafts.filter(isDraft) }
    },
    update: ({ id, bodyHtml, bodyText, baseVersion }) =>
      draftCall('PATCH', path(id), { bodyHtml, bodyText, baseVersion }),
    setStatus: (id, status) => draftCall('POST', path(id, '/status'), { status }),
    undo: (id) => draftCall('POST', path(id, '/undo')),
    async feedback(id, note) {
      const answer = await call('POST', path(id, '/feedback'), { note })
      if ('failure' in answer) {
        return answer.failure
      }
      if (answer.status >= 200 && answer.status < 300) {
        return { ok: true, value: null }
      }
      return {
        ok: false,
        reason: answer.status === 410 ? 'gone' : 'error',
        message: errorText(answer.body, `The bots server answered HTTP ${answer.status}.`)
      }
    }
  }
}
