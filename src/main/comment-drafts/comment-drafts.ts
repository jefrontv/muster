// The app's comment drafts: the bots server's plus the ones coding agents queue over MCP.
import { app } from 'electron'
import { getCanonicalUserDataPath } from '../persistence'
import { botsCommentDrafts, onBotsCommentDraftsChanged } from '../bots/bots-sidecar'
import {
  createAgentCommentDraftStore,
  type AgentCommentDraftStore
} from './agent-comment-draft-store'
import { sendAgentDraftFeedback, type AgentFeedbackRuntime } from './agent-draft-feedback'
import { createMergedCommentDraftsClient } from './merged-comment-drafts'

let feedbackRuntime: AgentFeedbackRuntime | null = null
let store: AgentCommentDraftStore | null = null

export function setCommentDraftsRuntime(runtime: AgentFeedbackRuntime): void {
  feedbackRuntime = runtime
}

export function agentCommentDrafts(): AgentCommentDraftStore {
  store ??= createAgentCommentDraftStore({
    dataDir: getCanonicalUserDataPath(),
    downloadsDir: app.getPath('downloads'),
    sendFeedback: (draft, note) => sendAgentDraftFeedback(feedbackRuntime, draft, note)
  })
  return store
}

// Lazy so importing this module never touches userData before the app is ready.
const agentClient: AgentCommentDraftStore = new Proxy({} as AgentCommentDraftStore, {
  get: (_target, key) => agentCommentDrafts()[key as keyof AgentCommentDraftStore]
})

export const commentDrafts = createMergedCommentDraftsClient(botsCommentDrafts, agentClient)

export function onCommentDraftsChanged(listener: () => void): () => void {
  const stopBots = onBotsCommentDraftsChanged(listener)
  const stopAgents = agentCommentDrafts().onChanged(listener)
  return () => {
    stopBots()
    stopAgents()
  }
}
