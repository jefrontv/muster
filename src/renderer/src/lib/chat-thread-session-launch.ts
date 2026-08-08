// Launches the headless stream-json child behind a chat-mode thread. Keeps the
// PTY launcher's plan building (trust, startup plans, pane-key identity, hook
// env) but transports through chatThreadStream: stdout NDJSON streams deltas to
// the UI while the Claude transcript file stays the message source of truth.
// The tabId is a plain uuid whose only job is pane-key routing (colon-prefixed
// synthetic ids are illegal in the pane-key grammar; see
// docs/specs/chat-mode-tab-plan.md risk 1). Local-only for now; SSH/runtime
// variants slot in behind the thread transport later.

import { useAppStore } from '@/store'
import {
  buildAgentResumeStartupPlan,
  buildAgentStartupPlan,
  quoteStartupArg,
  resolveStartupShell,
  type AgentStartupPlan
} from '@/lib/tui-agent-startup'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../shared/tui-agent-launch-defaults'
import { resolveNativeChatSessionOptionDefaults } from '../../../shared/native-chat-session-option-defaults'
import { resolveAgentSessionOptionLaunch } from '../../../shared/agent-session-option-launch'
import { TUI_AGENT_CONFIG } from '../../../shared/tui-agent-config'
import { makePaneKey } from '../../../shared/stable-pane-id'
import { resolveLocalWindowsAgentStartupShell } from '../../../shared/windows-terminal-shell'
import type { AgentProviderSessionMetadata } from '../../../shared/agent-session-resume'
import type { SessionOptionValue } from '../../../shared/native-chat-session-options'
import type { ChatThread, ChatWorkspace } from '../../../shared/chat-mode-types'
import { createBrowserUuid } from '@/lib/browser-uuid'

/** Headless stream transport flags; the CLI reads turns on stdin and writes
 *  NDJSON (with partial deltas) on stdout. `--permission-prompt-tool stdio`
 *  (hidden from --help, verified on 2.1.224) makes un-allowlisted tool calls
 *  emit can_use_tool control_requests instead of silently denying.
 *  `--permission-mode manual` overrides a user-level "auto" default whose
 *  classifier denies risky tools outright — manual asks, so the question
 *  reaches the composer's approval card instead of a silent denial. */
const CLAUDE_STREAM_FLAGS =
  '-p --verbose --input-format stream-json --output-format stream-json --include-partial-messages --permission-mode manual --permission-prompt-tool stdio'

export type ChatThreadLaunchResult = {
  tabId: string
  leafId: string
  paneKey: string
  appliedSessionOptions?: Record<string, SessionOptionValue>
}

export async function launchChatThreadSession(args: {
  thread: ChatThread
  /** Null for standalone chats — the session starts in the provider's default (home). */
  workspace: ChatWorkspace | null
  /** Overrides the persisted model/effort defaults (option-change relaunch). */
  sessionOptions?: Record<string, SessionOptionValue>
}): Promise<ChatThreadLaunchResult | null> {
  const { thread, workspace } = args
  const store = useAppStore.getState()
  const agent = thread.agent
  if (agent !== 'claude') {
    // Why: the stream-json contract (flags, stdin turn format, record shapes)
    // is Claude's; other agents need their own transport mapping first.
    throw new Error(`Chat threads only support Claude today (got "${agent}").`)
  }
  const primaryDirectory = workspace ? workspace.directories[0] : undefined
  if (workspace && !primaryDirectory) {
    throw new Error('This chat workspace has no directory yet; add one first.')
  }

  // Why: the session is invisible, so the trust menu would stall it with no way to answer.
  const preflight = TUI_AGENT_CONFIG[agent].preflightTrust
  if (preflight && workspace && window.api.agentTrust?.markTrusted) {
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
  const addDirArgs = (workspace?.directories.slice(1) ?? [])
    .map((dir) => `--add-dir ${quoteStartupArg(dir, shell)}`)
    .join(' ')
  const baseArgs = resolveTuiAgentLaunchArgs(agent, store.settings?.agentDefaultArgs)
  const agentArgs = [baseArgs, addDirArgs, CLAUDE_STREAM_FLAGS]
    .filter((part) => part.length > 0)
    .join(' ')
  const agentEnv = resolveTuiAgentLaunchEnv(agent, store.settings?.agentDefaultEnv)
  // Persisted model/effort defaults (or the caller's override) become launch
  // flags; the composer's pickers read them back from the thread's session
  // record since a headless pane has no terminal frame to scrape.
  const sessionOptions =
    args.sessionOptions ??
    resolveNativeChatSessionOptionDefaults(store.settings?.nativeChatSessionOptions, agent)

  const resumeSession: AgentProviderSessionMetadata | null =
    thread.claudeSessionId !== null
      ? {
          key: 'session_id',
          id: thread.claudeSessionId,
          ...(thread.transcriptPath ? { transcriptPath: thread.transcriptPath } : {})
        }
      : null
  // Why: the resume plan builder takes no sessionOptions, so model/effort flags
  // ride agentArgs for resumed streams; appliedValues still feed the pickers.
  const resumeOptionLaunch = resumeSession
    ? resolveAgentSessionOptionLaunch(agent, sessionOptions)
    : null
  const resumeOptionArgs = (resumeOptionLaunch?.args ?? [])
    .map((arg) => quoteStartupArg(arg, shell))
    .join(' ')
  const startupPlan: AgentStartupPlan | null = resumeSession
    ? buildAgentResumeStartupPlan({
        agent,
        providerSession: resumeSession,
        cmdOverrides,
        platform: CLIENT_PLATFORM,
        shell: startupShell,
        agentArgs: [resumeOptionArgs, agentArgs].filter((part) => part.length > 0).join(' '),
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
        ...(sessionOptions ? { sessionOptions } : {})
      })
  if (!startupPlan) {
    return null
  }
  const appliedSessionOptions = resumeSession
    ? resumeOptionLaunch?.appliedValues
    : startupPlan.sessionOptions

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

  try {
    const result = await window.api.chatThreadStream.start({
      threadId: thread.id,
      command: startupPlan.launchCommand,
      ...(primaryDirectory ? { cwd: primaryDirectory } : {}),
      env: paneEnv
    })
    if (!result.ok) {
      throw new Error(result.error ?? 'The chat session could not be started.')
    }
  } catch (error) {
    useAppStore.getState().clearAgentLaunchConfig(paneKey)
    throw error
  }
  return {
    tabId,
    leafId,
    paneKey,
    ...(appliedSessionOptions && Object.keys(appliedSessionOptions).length > 0
      ? { appliedSessionOptions }
      : {})
  }
}
