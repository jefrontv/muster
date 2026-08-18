/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: setup-guide readiness is driven by bounded IPC probes and browser focus events; the state cannot be derived synchronously from render inputs. */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import { hasFeatureInteraction } from '../../../../shared/feature-interactions'
import { checkRuntimeHooks } from '@/runtime/runtime-hooks-client'
import { hasEffectiveSetupCommand } from '@/lib/setup-script-status'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { ORCHESTRATION_SKILL_NAME } from '@/lib/agent-feature-install-commands'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkill
} from '@/hooks/useInstalledAgentSkills'
import { useActiveProjectSkillRuntime } from '@/hooks/useActiveProjectSkillRuntime'
import {
  getFeatureWallSetupProgress,
  type FeatureWallSetupProgress
} from '../feature-wall/feature-wall-setup-progress'
import { deriveActiveCollabConnectionState } from '../settings/activecollab-connection-state'
import { useSetupGuideBrowserMilestoneProgress } from './setup-guide-browser-milestone-progress'
import {
  getCurrentSetupScriptProbeState,
  getSetupGuideProgressReady,
  getSetupScriptProbeSignature
} from './setup-guide-progress-readiness'
import {
  readSetupScriptProbeCache,
  setSetupScriptProbeCache,
  subscribeSetupScriptProbeCache
} from './setup-script-probe-cache'

const SETUP_SCRIPT_PROBE_SETTLE_TIMEOUT_MS = 15_000

export function useSetupGuideProgress(shouldRefreshCoreState: boolean): FeatureWallSetupProgress {
  const settings = useAppStore((s) => s.settings)
  const featureInteractions = useAppStore((s) => s.featureInteractions)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  // Why: chat view swaps the checklist to the chat set; activeView is the
  // persisted default-view signal onboarding writes via openChatPage().
  const setupMode = useAppStore((s) => (s.activeView === 'chat' ? 'chat' : 'code'))
  const chatWorkspaceCount = useAppStore((s) => s.chatWorkspaces.length)
  const chatThreadCount = useAppStore((s) => s.chatThreads.length)
  const chatModeHydrated = useAppStore((s) => s.chatModeHydrated)
  const activeCollabStatus = useAppStore((s) => s.activeCollabStatus)
  const activeCollabStatusChecked = useAppStore((s) => s.activeCollabStatusChecked)
  const activeCollabStatusContextKey = useAppStore((s) => s.activeCollabStatusContextKey)
  const checkActiveCollabConnection = useAppStore((s) => s.checkActiveCollabConnection)
  const activeSkillRuntime = useActiveProjectSkillRuntime()
  const repos = useAppStore((s) => s.repos)
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const setupScriptProbe = useSyncExternalStore(
    subscribeSetupScriptProbeCache,
    readSetupScriptProbeCache,
    readSetupScriptProbeCache
  )
  const {
    installed: detectedOrchestrationSkillInstalled,
    loading: detectedOrchestrationSkillLoading
  } = useInstalledAgentSkill(ORCHESTRATION_SKILL_NAME, {
    enabled: shouldRefreshCoreState,
    discoveryTarget: activeSkillRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const providerRuntimeContextKey = getProviderRuntimeContextKey(settings)
  const activeCollabStatusCurrent = activeCollabStatusContextKey === providerRuntimeContextKey

  useEffect(() => {
    if (!shouldRefreshCoreState) {
      return
    }
    if (!activeCollabStatusCurrent || !activeCollabStatusChecked) {
      void checkActiveCollabConnection()
    }
  }, [
    activeCollabStatusChecked,
    activeCollabStatusCurrent,
    checkActiveCollabConnection,
    shouldRefreshCoreState
  ])

  const orderedGitRepos = useMemo(() => {
    const gitRepos = repos.filter(isGitRepoKind)
    const activeRepo = activeRepoId
      ? (gitRepos.find((repo) => repo.id === activeRepoId) ?? null)
      : null
    return activeRepo
      ? [activeRepo, ...gitRepos.filter((repo) => repo.id !== activeRepo.id)]
      : gitRepos
  }, [activeRepoId, repos])

  const setupScriptProbeSignature = useMemo(
    () => getSetupScriptProbeSignature(settings, orderedGitRepos),
    [orderedGitRepos, settings]
  )
  const activeSetupScriptProbeSignatureRef = useRef<string | null>(setupScriptProbeSignature)
  activeSetupScriptProbeSignatureRef.current = setupScriptProbeSignature

  useEffect(() => {
    if (!shouldRefreshCoreState || !settings || setupScriptProbeSignature === null) {
      return
    }
    const signature = setupScriptProbeSignature
    let stale = false
    // Why: setup-script checks can cross SSH/runtime streams. Bound sidebar
    // visibility readiness so a wedged read cannot hide the checklist forever.
    const timeoutId = window.setTimeout(() => {
      if (activeSetupScriptProbeSignatureRef.current === signature) {
        setSetupScriptProbeCache({ signature, ready: true, hasSetupScript: false })
      }
    }, SETUP_SCRIPT_PROBE_SETTLE_TIMEOUT_MS)

    const settle = (hasSetupScript: boolean): void => {
      window.clearTimeout(timeoutId)
      if (activeSetupScriptProbeSignatureRef.current === signature) {
        setSetupScriptProbeCache({ signature, ready: true, hasSetupScript })
      }
    }

    async function refreshSetupScriptState(): Promise<void> {
      for (const repo of orderedGitRepos) {
        const hooksResult = await checkRuntimeHooks(settings, repo.id).catch(() => null)
        if (stale) {
          return
        }
        if (hooksResult && hasEffectiveSetupCommand(repo, hooksResult)) {
          settle(true)
          return
        }
      }
      settle(false)
    }

    void refreshSetupScriptState()
    return () => {
      stale = true
      window.clearTimeout(timeoutId)
    }
  }, [orderedGitRepos, settings, setupScriptProbeSignature, shouldRefreshCoreState])

  // Why: the step tracks the exact connected state the ActiveCollab settings
  // card renders, so the checklist can never disagree with Settings.
  const taskSourceStatus = deriveActiveCollabConnectionState({
    status: activeCollabStatus,
    statusChecked: activeCollabStatusChecked,
    statusContextKey: activeCollabStatusContextKey,
    providerRuntimeContextKey
  })
  const hasConnectedTaskSource = taskSourceStatus.connected
  const gitRepoCount = orderedGitRepos.length
  const currentSetupScriptProbe = getCurrentSetupScriptProbeState(
    setupScriptProbe,
    setupScriptProbeSignature
  )
  const ready =
    getSetupGuideProgressReady({
      refreshEnabled: shouldRefreshCoreState,
      settingsLoaded: settings !== null,
      taskSourceStatusChecked: !taskSourceStatus.checking,
      orchestrationSkillDiscoveryLoading: detectedOrchestrationSkillLoading,
      setupScriptProbeReady: currentSetupScriptProbe.ready
    }) &&
    // Why: chat counts read the hydrated chat store; before hydration they
    // would report 0 and flash the chat checklist as unstarted.
    (setupMode !== 'chat' || chatModeHydrated)

  const rawProgress = useMemo(
    () =>
      getFeatureWallSetupProgress({
        ready,
        mode: setupMode,
        settings,
        featureInteractions,
        hasConnectedTaskSource,
        gitRepoCount,
        worktreesByRepo,
        hasSetupScript: currentSetupScriptProbe.hasSetupScript,
        chatWorkspaceCount,
        chatThreadCount
      }),
    [
      ready,
      detectedOrchestrationSkillInstalled,
      featureInteractions,
      gitRepoCount,
      hasConnectedTaskSource,
      currentSetupScriptProbe.hasSetupScript,
      setupMode,
      chatWorkspaceCount,
      chatThreadCount,
      settings,
      worktreesByRepo
    ]
  )
  const historicalSplitTerminalDone = hasFeatureInteraction(
    featureInteractions,
    'terminal-pane-split'
  )
  return useSetupGuideBrowserMilestoneProgress(rawProgress, historicalSplitTerminalDone)
}
