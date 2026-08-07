// Launches the hidden Claude PTY behind a chat-mode thread. Modeled on the local branch
// of launchAgentBackgroundSession, minus its worktree/tab coupling: chat threads have no
// worktree and no store tab — the tabId is a plain uuid whose only job is pane-key routing
// (colon-prefixed synthetic ids are illegal in the pane-key grammar; see
// docs/specs/chat-mode-tab-plan.md risk 1). Local-only for now; SSH/runtime variants slot
// in behind the thread transport later.

import { useAppStore } from '@/store'
import {
  buildAgentResumeStartupPlan,
  buildAgentStartupPlan,
  quoteStartupArg,
  resolveStartupShell,
  type AgentStartupPlan
} from '@/lib/tui-agent-startup'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import { tuiAgentToAgentKind } from '@/lib/telemetry'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../shared/tui-agent-launch-defaults'
import { resolveNativeChatSessionOptionDefaults } from '../../../shared/native-chat-session-option-defaults'
import { TUI_AGENT_CONFIG } from '../../../shared/tui-agent-config'
import { makePaneKey } from '../../../shared/stable-pane-id'
import { resolveLocalWindowsAgentStartupShell } from '../../../shared/windows-terminal-shell'
import type { AgentProviderSessionMetadata } from '../../../shared/agent-session-resume'
import type { ParsedAgentStatusPayload } from '../../../shared/agent-status-types'
import type { SessionOptionValue } from '../../../shared/native-chat-session-options'
import type { ChatThread, ChatWorkspace } from '../../../shared/chat-mode-types'
import {
  registerEagerPtyBuffer,
  subscribeToPtyExit,
  type EagerPtyHandle
} from '@/components/terminal-pane/pty-dispatcher'
import { subscribeToPtyData } from '@/components/terminal-pane/pty-data-sidecar-subscriptions'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { runBestEffortAgentBackgroundCleanups } from '@/lib/agent-background-session-cleanup'
import { createBackgroundAgentStatusConsumer } from '@/lib/background-agent-status-consumer'

export type ChatThreadLaunchResult = {
  tabId: string
  leafId: string
  paneKey: string
  ptyId: string
  appliedSessionOptions?: Record<string, SessionOptionValue>
}

export async function launchChatThreadSession(args: {
  thread: ChatThread
  workspace: ChatWorkspace
  onAgentStatus?: (payload: ParsedAgentStatusPayload) => void
  onExit?: (ptyId: string, code: number) => void
}): Promise<ChatThreadLaunchResult | null> {
  const { thread, workspace, onAgentStatus, onExit } = args
  const store = useAppStore.getState()
  const agent = thread.agent
  const primaryDirectory = workspace.directories[0]
  if (!primaryDirectory) {
    throw new Error('This chat workspace has no directory yet; add one first.')
  }

  // Why: the session is invisible, so the trust menu would stall it with no way to answer.
  const preflight = TUI_AGENT_CONFIG[agent].preflightTrust
  if (preflight && window.api.agentTrust?.markTrusted) {
    for (const directory of workspace.directories) {
      try {
        await window.api.agentTrust.markTrusted({ preset: preflight, workspacePath: directory })
      } catch {
        // Best-effort; launch continues and the composer can still answer prompts.
      }
    }
  }

  const cmdOverrides = store.settings?.agentCmdOverrides ?? {}
  const startupShell = resolveLocalWindowsAgentStartupShell({
    platform: CLIENT_PLATFORM,
    isRemote: false,
    terminalWindowsShell: store.settings?.terminalWindowsShell
  })
  const shell = resolveStartupShell(CLIENT_PLATFORM, startupShell)
  // Extra workspace directories become the session's file-access scope.
  const addDirArgs = workspace.directories
    .slice(1)
    .map((dir) => `--add-dir ${quoteStartupArg(dir, shell)}`)
    .join(' ')
  const baseArgs = resolveTuiAgentLaunchArgs(agent, store.settings?.agentDefaultArgs)
  const agentArgs = [baseArgs, addDirArgs].filter((part) => part.length > 0).join(' ')
  const agentEnv = resolveTuiAgentLaunchEnv(agent, store.settings?.agentDefaultEnv)

  const resumeSession: AgentProviderSessionMetadata | null =
    thread.claudeSessionId !== null
      ? {
          key: 'session_id',
          id: thread.claudeSessionId,
          ...(thread.transcriptPath ? { transcriptPath: thread.transcriptPath } : {})
        }
      : null
  const startupPlan: AgentStartupPlan | null = resumeSession
    ? buildAgentResumeStartupPlan({
        agent,
        providerSession: resumeSession,
        cmdOverrides,
        platform: CLIENT_PLATFORM,
        shell: startupShell,
        agentArgs,
        agentEnv,
        isRemote: false
      })
    : buildAgentStartupPlan({
        agent,
        prompt: '',
        cmdOverrides,
        agentArgs,
        agentEnv,
        platform: CLIENT_PLATFORM,
        shell: startupShell,
        isRemote: false,
        allowEmptyPromptLaunch: true,
        // Persisted model/effort defaults become launch flags; the composer's
        // pickers read them back from the thread's session record since a
        // headless pane has no terminal frame to scrape.
        sessionOptions: resolveNativeChatSessionOptionDefaults(
          store.settings?.nativeChatSessionOptions,
          agent
        )
      })
  if (!startupPlan) {
    return null
  }

  const tabId = createBrowserUuid()
  const leafId = createBrowserUuid()
  const paneKey = makePaneKey(tabId, leafId)
  const launchToken = createBrowserUuid()
  const launchRegistration = { agentType: agent, launchToken, tabId, leafId }
  store.registerAgentLaunchConfig(paneKey, startupPlan.launchConfig, launchRegistration)
  const paneEnv = {
    ...startupPlan.env,
    ORCA_PANE_KEY: paneKey,
    ORCA_TAB_ID: tabId,
    ORCA_AGENT_LAUNCH_TOKEN: launchToken
  }

  let ptyId = ''
  let exitHandled = false
  let eagerPtyBuffer: EagerPtyHandle | null = null
  let unsubscribeExit = (): void => {}
  let unsubscribeData = (): void => {}
  const handleExit = (exitPtyId: string, code: number): void => {
    if (exitHandled) {
      return
    }
    exitHandled = true
    unsubscribeExit()
    unsubscribeData()
    useAppStore.getState().clearAgentLaunchConfig(paneKey)
    onExit?.(exitPtyId, code)
  }
  const agentStatusConsumer = createBackgroundAgentStatusConsumer({
    paneKey,
    launchToken,
    // Local PTY facts flow through main's authoritative scanner.
    mainOwnsAgentStatusWrites: true,
    expectedConnectionId: null,
    runtimeEnvironmentId: null,
    getPtyId: () => ptyId,
    ...(onAgentStatus ? { onAgentStatus } : {})
  })

  try {
    const result = await window.api.pty.spawn({
      cols: 120,
      rows: 40,
      cwd: primaryDirectory,
      command: startupPlan.launchCommand,
      ...(startupPlan.startupCommandDelivery
        ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
        : {}),
      env: paneEnv,
      launchConfig: startupPlan.launchConfig,
      launchToken,
      launchAgent: agent,
      tabId,
      leafId,
      ...(resumeSession ? { resumeProviderSession: resumeSession } : {}),
      telemetry: {
        agent_kind: tuiAgentToAgentKind(agent),
        launch_source: 'unknown',
        request_kind: resumeSession ? 'resume' : 'new'
      }
    })
    ptyId = result.id
    if (result.launchConfig) {
      store.registerAgentLaunchConfig(paneKey, result.launchConfig, launchRegistration)
    }
    eagerPtyBuffer = registerEagerPtyBuffer(ptyId, handleExit)
    unsubscribeData = subscribeToPtyData(ptyId, (data) => agentStatusConsumer.consume(data))
    unsubscribeExit = subscribeToPtyExit(ptyId, (code) => handleExit(ptyId, code))
    return {
      tabId,
      leafId,
      paneKey,
      ptyId,
      ...(startupPlan.sessionOptions ? { appliedSessionOptions: startupPlan.sessionOptions } : {})
    }
  } catch (error) {
    exitHandled = true
    runBestEffortAgentBackgroundCleanups(unsubscribeExit, unsubscribeData)
    runBestEffortAgentBackgroundCleanups(() => eagerPtyBuffer?.dispose())
    runBestEffortAgentBackgroundCleanups(() => store.clearAgentLaunchConfig(paneKey))
    if (ptyId) {
      runBestEffortAgentBackgroundCleanups(() => void window.api.pty.kill(ptyId))
    }
    throw error
  }
}
