// The chat thread behind a project's Ask agent panel. It lives in the chat workspace whose
// first folder is the repo, so the agent starts there and loads that project's MCP servers.
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import type { ChatThread, ChatWorkspace } from '../../../../shared/chat-mode-types'

const STORAGE_PREFIX = 'muster.projectPages.agentThread.'

function rememberedThread(scopeKey: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + scopeKey)
  } catch {
    return null
  }
}

function rememberThread(scopeKey: string, threadId: string | null): void {
  try {
    if (threadId) {
      localStorage.setItem(STORAGE_PREFIX + scopeKey, threadId)
    } else {
      localStorage.removeItem(STORAGE_PREFIX + scopeKey)
    }
  } catch {
    // Storage can be unavailable; the panel then starts a new chat each time.
  }
}

export type AgentThreadRepo = { path: string; displayName: string }

export function useProjectPagesAgentThread(
  scopeKey: string,
  repo: AgentThreadRepo | null
): {
  thread: ChatThread | null
  workspace: ChatWorkspace | null
  error: string | null
  startNew: () => void
} {
  const hydrated = useAppStore((s) => s.chatModeHydrated)
  const hydrate = useAppStore((s) => s.hydrateChatMode)
  const workspaces = useAppStore((s) => s.chatWorkspaces)
  const threads = useAppStore((s) => s.chatThreads)
  const createChatWorkspace = useAppStore((s) => s.createChatWorkspace)
  const createChatThread = useAppStore((s) => s.createChatThread)
  const [threadId, setThreadId] = useState(() => rememberedThread(scopeKey))
  const [error, setError] = useState<string | null>(null)
  const creating = useRef(false)

  useEffect(() => {
    setThreadId(rememberedThread(scopeKey))
  }, [scopeKey])

  useEffect(() => {
    if (!hydrated) {
      void hydrate()
    }
  }, [hydrated, hydrate])

  const thread = threads.find((t) => t.id === threadId && t.archived !== true) ?? null
  const workspace = thread ? (workspaces.find((w) => w.id === thread.workspaceId) ?? null) : null

  useEffect(() => {
    if (!hydrated || !repo || thread || creating.current) {
      return
    }
    creating.current = true
    void (async () => {
      try {
        const home =
          workspaces.find((w) => w.directories[0] === repo.path) ??
          (await createChatWorkspace({ name: repo.displayName, directories: [repo.path] }))
        const created = await createChatThread(home.id, undefined, { activate: false })
        if (created) {
          rememberThread(scopeKey, created.id)
          setThreadId(created.id)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        creating.current = false
      }
    })()
  }, [hydrated, repo, thread, workspaces, scopeKey, createChatWorkspace, createChatThread])

  return {
    thread,
    workspace,
    error,
    startNew: () => {
      rememberThread(scopeKey, null)
      setThreadId(null)
    }
  }
}
