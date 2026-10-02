import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { AgentType } from '../../../../shared/agent-status-types'
import { updateNativeChatSessionOptionDefaults } from '../../../../shared/native-chat-session-option-defaults'
import type {
  SessionOptionDescriptor,
  SessionOptionValue
} from '../../../../shared/native-chat-session-options'
import { useAppStore } from '../../store'
import {
  createNativeChatPtySessionOptions,
  type NativeChatPtySessionOptionsSurface
} from './native-chat-pty-session-options'
import type { NativeChatSessionOptionDispatchCommand } from './native-chat-session-option-command-dispatch'
import {
  ensureNativeChatModelEnrichment,
  readNativeChatEnrichedModels,
  subscribeNativeChatEnrichedModels
} from './native-chat-session-option-enrichment'
import {
  discoverNativeChatCatalogModels,
  resolveNativeChatModelDiscoveryContext
} from './native-chat-session-option-discovery'
import { readClaudeSessionOptionsFromTerminalScreen } from './claude-terminal-session-options'
import { getAgentSessionOptionCatalog } from '../../../../shared/agent-session-option-catalog'

const EMPTY_SNAPSHOT: SessionOptionDescriptor[] = []
const subscribeEmpty = (): (() => void) => () => {}
const getEmptySnapshot = (): SessionOptionDescriptor[] => EMPTY_SNAPSHOT

/** Launch-flag session options registered for this tab's pane, if any. Headless
 *  panes (chat-mode threads) have no terminal frame to scrape, so the values the
 *  launcher applied via --model/--effort are the only truthful current state. */
function readLaunchAppliedSessionOptions(
  terminalTabId: string
): Record<string, SessionOptionValue> | null {
  // ?? {}: test harnesses build partial stores without the chat slice.
  for (const session of Object.values(useAppStore.getState().chatThreadSessions ?? {})) {
    if (session.tabId === terminalTabId && session.appliedSessionOptions) {
      return session.appliedSessionOptions
    }
  }
  return null
}

/** A headless stream changes options by relaunching, so flip-only toggles (fast mode) can't apply. */
export function withoutUnlaunchableOptions(
  agent: AgentType,
  snapshot: SessionOptionDescriptor[]
): SessionOptionDescriptor[] {
  const catalog = getAgentSessionOptionCatalog(agent)
  if (!catalog) {
    return snapshot
  }
  const unlaunchable = new Set(
    catalog.models.flatMap((model) =>
      model.options.filter((option) => !option.apply.launchArgs).map((option) => option.id)
    )
  )
  const filtered = snapshot.filter((descriptor) => !unlaunchable.has(descriptor.id))
  return filtered.length === snapshot.length ? snapshot : filtered
}

export function useNativeChatSessionOptions(args: {
  agent: AgentType
  terminalTabId: string
  targetPtyId: string | null
  /** Stream-transport pane: live pickers without a PTY (dispatch relaunches). */
  hasTransport?: boolean
  dispatchCommand: NativeChatSessionOptionDispatchCommand
  onAgentPicker?: () => void
  readTerminalScreen?: () => string | null
}): {
  surface: NativeChatPtySessionOptionsSurface | null
  snapshot: SessionOptionDescriptor[]
} {
  const {
    agent,
    terminalTabId,
    targetPtyId,
    hasTransport = false,
    dispatchCommand,
    onAgentPicker,
    readTerminalScreen
  } = args
  const discoveryContext = useMemo(
    () => resolveNativeChatModelDiscoveryContext(terminalTabId),
    [terminalTabId]
  )
  const surface = useMemo(() => {
    // Why: native chat currently attaches only after startup is already queued;
    // exposing a draft picker here would claim it can still mutate that command.
    if (!targetPtyId && !hasTransport) {
      return null
    }
    const scopeKey = targetPtyId ?? terminalTabId
    const reportedValues =
      agent === 'claude'
        ? (readClaudeSessionOptionsFromTerminalScreen(readTerminalScreen?.()) ??
          readLaunchAppliedSessionOptions(terminalTabId))
        : null
    let settingsWrite = Promise.resolve()
    return createNativeChatPtySessionOptions({
      agent,
      scopeKey,
      ...(targetPtyId ? { fallbackScopeKey: terminalTabId } : {}),
      ...(discoveryContext
        ? {
            initialModels:
              readNativeChatEnrichedModels(agent, discoveryContext.hostKey) ?? undefined
          }
        : {}),
      mode: targetPtyId || hasTransport ? 'live' : 'draft',
      reportedValues,
      dispatchCommand,
      onAgentPicker,
      persistSelection: async ({ modelId, optionId, value }) => {
        // Why: read the live persisted defaults at write time (after any prior
        // write in this chain settles) and merge only this selection onto them,
        // rather than a baseline captured once at surface creation. A frozen
        // baseline would let a second same-agent pane's write be clobbered,
        // since updateSettings shallow-merges nativeChatSessionOptions. Chaining
        // still keeps rapid consecutive picks in selection order.
        settingsWrite = settingsWrite
          .catch(() => undefined)
          .then(() => {
            const base = useAppStore.getState().settings?.nativeChatSessionOptions
            const next = updateNativeChatSessionOptionDefaults({
              persisted: base,
              agent,
              modelId,
              optionId,
              value
            })
            return useAppStore.getState().updateSettings({ nativeChatSessionOptions: next })
          })
        await settingsWrite
      }
    })
  }, [
    agent,
    dispatchCommand,
    discoveryContext,
    hasTransport,
    onAgentPicker,
    readTerminalScreen,
    targetPtyId,
    terminalTabId
  ])

  useEffect(() => {
    if (!surface || agent !== 'claude') {
      return
    }
    let cancelled = false
    const reportCurrentValues = async (): Promise<void> => {
      let authoritativeScreen: string | null = null
      if (targetPtyId && window.api?.pty?.getMainBufferSnapshot) {
        try {
          const snapshot = await window.api.pty.getMainBufferSnapshot(targetPtyId, {
            scrollbackRows: 0
          })
          // Why: the API snapshots the main buffer, which is stale while a TUI
          // owns the alternate screen. The mounted xterm is authoritative then.
          authoritativeScreen = snapshot?.alternateScreen ? null : (snapshot?.data ?? null)
        } catch {
          // The mounted renderer buffer remains a transport-neutral fallback.
        }
      }
      const reportedValues =
        readClaudeSessionOptionsFromTerminalScreen(authoritativeScreen) ??
        readClaudeSessionOptionsFromTerminalScreen(readTerminalScreen?.()) ??
        readLaunchAppliedSessionOptions(terminalTabId)
      if (!cancelled && reportedValues) {
        surface.reportSessionOptions(reportedValues)
      }
    }
    void reportCurrentValues()
    return () => {
      cancelled = true
    }
  }, [agent, readTerminalScreen, surface, targetPtyId])

  useEffect(() => {
    if (!surface || !discoveryContext) {
      return
    }
    const unsubscribe = subscribeNativeChatEnrichedModels(
      agent,
      discoveryContext.hostKey,
      (models) => surface.replaceModels(models)
    )
    ensureNativeChatModelEnrichment({
      agent,
      hostKey: discoveryContext.hostKey,
      discover: () => discoverNativeChatCatalogModels(agent, discoveryContext.runtime)
    })
    return unsubscribe
  }, [agent, discoveryContext, surface])

  const rawSnapshot = useSyncExternalStore(
    surface?.subscribe ?? subscribeEmpty,
    surface?.getSnapshot ?? getEmptySnapshot,
    surface?.getSnapshot ?? getEmptySnapshot
  )
  const headless = hasTransport && !targetPtyId
  const snapshot = useMemo(
    () => (headless ? withoutUnlaunchableOptions(agent, rawSnapshot) : rawSnapshot),
    [agent, headless, rawSnapshot]
  )
  return { surface, snapshot }
}
