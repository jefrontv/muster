// Comment drafts that coding agents queue through the Muster MCP. Same contract as the bots
// server's store (docs/muster/2026-11-06-bots-comment-drafts-contract.md), kept in Muster's userData.
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type {
  AgentCommentDraftSource,
  BotsCommentDraft,
  BotsCommentDraftResult
} from '../../shared/bots-comment-draft-types'
import type { BotsCommentDraftsClient } from '../bots/bots-comment-drafts-client'
import { AgentDraftError, createAgentDraftFiles } from './agent-comment-draft-files'
import {
  loadAgentDrafts,
  saveAgentDrafts,
  type StoredAgentDraft
} from './agent-comment-draft-file-store'
import { commentHtmlToText } from './comment-draft-html-text'

export { AgentDraftError } from './agent-comment-draft-files'
export const AGENT_DRAFT_ID_PREFIX = 'agent-'

export type AgentDraftQueueArgs = {
  projectId: number
  taskId: number
  bodyHtml: string
  source: AgentCommentDraftSource
  /** Replaces the agent's own files; undefined keeps every file. */
  attachments?: string[]
}

export type AgentDraftAmendArgs = {
  /** Draft id or waiting number. */
  draft: string
  bodyHtml: string
  note?: string
  attachments?: string[]
  source: AgentCommentDraftSource
}

export type AgentCommentDraftStore = BotsCommentDraftsClient & {
  queue: (args: AgentDraftQueueArgs) => { draft: BotsCommentDraft; replaced: boolean }
  amend: (args: AgentDraftAmendArgs) => BotsCommentDraft
  onChanged: (listener: () => void) => () => void
}

const GONE = {
  ok: false,
  reason: 'gone',
  message: 'This draft was already posted or discarded.'
} as const

export function createAgentCommentDraftStore(options: {
  dataDir: string
  downloadsDir: string
  /** Delivers the person's note to the agent; false when nobody can receive it. */
  sendFeedback: (draft: BotsCommentDraft, note: string) => Promise<boolean>
  now?: () => number
}): AgentCommentDraftStore {
  const now = options.now ?? Date.now
  const file = join(options.dataDir, 'agent-comment-drafts.json')
  const files = createAgentDraftFiles({
    filesRoot: join(options.dataDir, 'agent-comment-draft-files'),
    downloadsDir: options.downloadsDir
  })
  const listeners = new Set<() => void>()
  let drafts: StoredAgentDraft[] = loadAgentDrafts(file)

  function save(): void {
    drafts = saveAgentDrafts(file, drafts)
    for (const listener of listeners) {
      listener()
    }
  }

  const waitingOrdered = (): StoredAgentDraft[] =>
    drafts.filter((d) => d.status === 'waiting').sort((a, b) => a.queuedAt - b.queuedAt)

  function view(draft: StoredAgentDraft): BotsCommentDraft {
    const { previous, ...rest } = draft
    const index = waitingOrdered().indexOf(draft)
    return { ...rest, number: index === -1 ? null : index + 1, canUndo: previous !== null }
  }

  const waiting = (id: string): StoredAgentDraft | undefined =>
    drafts.find((d) => d.id === id && d.status === 'waiting')

  function setBody(
    draft: StoredAgentDraft,
    bodyHtml: string,
    editedBy: 'bot' | 'user',
    bodyText?: string
  ): void {
    draft.previous = { bodyHtml: draft.bodyHtml, bodyText: draft.bodyText }
    draft.bodyHtml = bodyHtml
    draft.bodyText = bodyText ?? commentHtmlToText(bodyHtml)
    draft.version += 1
    draft.editedBy = editedBy
    draft.updatedAt = now()
  }

  function replaceAgentFiles(
    draft: StoredAgentDraft,
    paths: string[],
    source: AgentCommentDraftSource
  ): void {
    const checked = paths.map((path) => files.checkAgentPath(path, source))
    const removed = draft.attachments.filter((f) => f.addedBy === 'bot')
    const keep = draft.attachments.filter((f) => f.addedBy === 'user')
    draft.attachments = files.copyIn(draft.id, checked, 'bot', keep)
    files.drop(draft.id, removed)
  }

  function resolveRef(ref: string): StoredAgentDraft {
    const byNumber = /^#?\d+$/.test(ref)
      ? waitingOrdered()[Number(ref.replace('#', '')) - 1]
      : undefined
    const draft = drafts.find((d) => d.id === ref) ?? byNumber
    if (!draft) {
      throw new AgentDraftError(`No draft matches ${ref}. Call list_comment_drafts for the ids.`)
    }
    if (draft.status !== 'waiting') {
      throw new AgentDraftError(`Draft ${ref} was already ${draft.status}.`)
    }
    return draft
  }

  /** Runs a person's change on a waiting draft and saves it. */
  async function onWaiting(
    id: string,
    change: (draft: StoredAgentDraft) => BotsCommentDraftResult<BotsCommentDraft> | undefined
  ): Promise<BotsCommentDraftResult<BotsCommentDraft>> {
    const draft = waiting(id)
    if (!draft) {
      return GONE
    }
    try {
      const failed = change(draft)
      if (failed) {
        return failed
      }
    } catch (error) {
      return { ok: false, reason: 'error', message: (error as Error).message }
    }
    save()
    return { ok: true, value: view(draft) }
  }

  return {
    onChanged(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    queue(args) {
      const existing = waitingOrdered().find((d) => d.taskId === args.taskId)
      if (existing) {
        setBody(existing, args.bodyHtml, 'bot')
        existing.amendNote = null
        existing.agentSource = args.source
        if (args.attachments) {
          replaceAgentFiles(existing, args.attachments, args.source)
        }
        save()
        return { draft: view(existing), replaced: true }
      }
      const at = now()
      const id = `${AGENT_DRAFT_ID_PREFIX}${randomUUID()}`
      const attachments = args.attachments?.length
        ? files.copyIn(
            id,
            args.attachments.map((path) => files.checkAgentPath(path, args.source)),
            'bot',
            []
          )
        : []
      const draft: StoredAgentDraft = {
        id,
        agentSource: args.source,
        botId: `agent:${args.source.agent}`,
        botName: args.source.agent,
        threadId: '',
        projectId: args.projectId,
        taskId: args.taskId,
        bodyHtml: args.bodyHtml,
        bodyText: commentHtmlToText(args.bodyHtml),
        attachments,
        status: 'waiting',
        version: 1,
        editedBy: 'bot',
        amendNote: null,
        queuedAt: at,
        createdAt: at,
        updatedAt: at,
        previous: null
      }
      drafts.push(draft)
      save()
      return { draft: view(draft), replaced: false }
    },
    amend(args) {
      const draft = resolveRef(args.draft)
      setBody(draft, args.bodyHtml, 'bot')
      draft.amendNote = args.note?.trim() || null
      if (args.attachments) {
        replaceAgentFiles(draft, args.attachments, args.source)
      }
      save()
      return view(draft)
    },
    async list(status = 'waiting') {
      const open = waitingOrdered().map(view)
      if (status === 'waiting') {
        return { ok: true, value: open }
      }
      const closed = drafts
        .filter((d) => d.status !== 'waiting')
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(view)
      return { ok: true, value: [...open, ...closed] }
    },
    update: (edit) =>
      onWaiting(edit.id, (draft) => {
        if (draft.version !== edit.baseVersion) {
          return {
            ok: false,
            reason: 'conflict',
            message: 'The agent changed this draft while you were editing.',
            draft: view(draft)
          }
        }
        setBody(draft, edit.bodyHtml, 'user', edit.bodyText)
        return undefined
      }),
    setStatus: (id, status) =>
      onWaiting(id, (draft) => {
        draft.status = status
        draft.updatedAt = now()
        files.removeAll(draft.id)
        draft.attachments = []
      }),
    undo: (id) =>
      onWaiting(id, (draft) => {
        if (!draft.previous) {
          return {
            ok: false,
            reason: 'error',
            message: 'There is no earlier version to go back to.'
          }
        }
        const { bodyHtml, bodyText } = draft.previous
        setBody(draft, bodyHtml, 'user', bodyText)
        draft.previous = null
        return undefined
      }),
    async feedback(id, note) {
      const draft = waiting(id)
      if (!draft) {
        return GONE
      }
      return (await options.sendFeedback(view(draft), note))
        ? { ok: true, value: null }
        : {
            ok: false,
            reason: 'unavailable',
            message: "The agent's terminal is closed, so the note has nowhere to go."
          }
    },
    addAttachments: (id, paths) =>
      onWaiting(id, (draft) => {
        draft.attachments = files.copyIn(draft.id, paths, 'user', draft.attachments)
        draft.updatedAt = now()
      }),
    removeAttachment: (id, attachmentId) =>
      onWaiting(id, (draft) => {
        files.drop(
          draft.id,
          draft.attachments.filter((f) => f.id === attachmentId)
        )
        draft.attachments = draft.attachments.filter((f) => f.id !== attachmentId)
        draft.updatedAt = now()
      }),
    async attachmentBytes(id, attachmentId) {
      if (!drafts.find((d) => d.id === id)?.attachments.some((f) => f.id === attachmentId)) {
        return GONE
      }
      try {
        return { ok: true, value: await files.read(id, attachmentId) }
      } catch (error) {
        return { ok: false, reason: 'error', message: (error as Error).message }
      }
    }
  }
}
