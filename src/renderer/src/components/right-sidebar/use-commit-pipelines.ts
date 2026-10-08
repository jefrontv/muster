// CI status for the Commits panel rows.
//
// Reads on history load (throttled when the commits are unchanged), shortly after a push, and every
// minute while something is in flight and the window is visible. Same visibility discipline as
// use-site-pipelines.ts: the timer is torn down while hidden, with an immediate read on reveal.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getConnectionId } from '@/lib/connection-context'
import { isWindowVisible } from '@/lib/window-visibility-interval'
import { getActiveRuntimeTarget } from '@/runtime/runtime-client-target'
import type { GlobalSettings } from '../../../../shared/types'
import type { GitHistoryResult } from '../../../../shared/git-history'
import type { CommitPipelineRun, CommitPipelinesResult } from '../../../../shared/commit-pipelines'
import {
  COMMIT_PIPELINES_AFTER_PUSH_DELAY_MS,
  COMMIT_PIPELINES_MIN_REFETCH_MS,
  COMMIT_PIPELINES_POLL_MS,
  COMMIT_PIPELINES_PUSH_GRACE_MS,
  isPushTransition,
  shouldPollCommitPipelines,
  type CommitPushState
} from './commit-pipelines-polling'

export type UseCommitPipelinesInput = {
  worktreeId: string | null
  worktreePath: string | null
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  /** False while the Commits panel is collapsed or hidden, or for a folder workspace. */
  enabled: boolean
  history: GitHistoryResult | undefined
  pushState: CommitPushState | undefined
}

type Target = { key: string; worktreePath: string; connectionId?: string }
type Snapshot = { key: string; result: CommitPipelinesResult }

/** `sha -> latest run` while the column should show, otherwise null (hide the column). */
export function useCommitPipelines(
  input: UseCommitPipelinesInput
): Readonly<Record<string, CommitPipelineRun>> | null {
  const { worktreeId, worktreePath, enabled, history, pushState } = input
  // Why: a remote runtime's checkout is not on this machine and the runtime RPC has no
  // remote-URL read, so there is no way to name the forge from here yet.
  const isLocalRuntime = getActiveRuntimeTarget(input.settings).kind === 'local'
  const target = useMemo<Target | null>(() => {
    if (!enabled || !isLocalRuntime || !worktreeId || !worktreePath) {
      return null
    }
    const connectionId = getConnectionId(worktreeId) ?? undefined
    return { key: `${connectionId ?? 'local'}\0${worktreePath}`, worktreePath, connectionId }
  }, [enabled, isLocalRuntime, worktreeId, worktreePath])
  const targetKey = target?.key ?? null
  const shas = useMemo(() => history?.items.map((item) => item.id) ?? [], [history])
  const shasKey = shas.join(',')

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [pushGraceUntil, setPushGraceUntil] = useState(0)

  const targetRef = useRef(target)
  targetRef.current = target
  const shasRef = useRef(shas)
  shasRef.current = shas
  const inFlightRef = useRef<string | null>(null)
  const lastFetchRef = useRef<{ key: string; shasKey: string; at: number } | null>(null)
  const seqRef = useRef(0)

  const fetchNow = useCallback(async (): Promise<void> => {
    const current = targetRef.current
    const currentShas = shasRef.current
    if (!current || currentShas.length === 0) {
      return
    }
    const currentShasKey = currentShas.join(',')
    const requestKey = `${current.key}\0${currentShasKey}`
    if (inFlightRef.current === requestKey) {
      return
    }
    inFlightRef.current = requestKey
    lastFetchRef.current = { key: current.key, shasKey: currentShasKey, at: Date.now() }
    const seq = ++seqRef.current
    try {
      const result = await window.api.git.commitPipelines({
        worktreePath: current.worktreePath,
        connectionId: current.connectionId,
        shas: [...currentShas]
      })
      if (seq === seqRef.current) {
        setSnapshot({ key: current.key, result })
      }
    } catch {
      // Why: a flaky network keeps the last good icons instead of blanking the column.
    } finally {
      if (inFlightRef.current === requestKey) {
        inFlightRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!targetKey || shasKey === '') {
      return
    }
    const last = lastFetchRef.current
    const sameCommits = last?.key === targetKey && last.shasKey === shasKey
    if (!sameCommits || Date.now() - last.at >= COMMIT_PIPELINES_MIN_REFETCH_MS) {
      void fetchNow()
    }
    // history is a dep so a reload with the same commits can still refetch once throttled.
  }, [targetKey, shasKey, history, fetchNow])

  const previousPushRef = useRef<{ key: string | null; state: CommitPushState | null } | null>(null)
  const pushAhead = pushState?.ahead
  const pushHasUpstream = pushState?.hasUpstream
  const pushUpstreamName = pushState?.upstreamName
  useEffect(() => {
    const next =
      pushAhead === undefined || pushHasUpstream === undefined
        ? null
        : { ahead: pushAhead, hasUpstream: pushHasUpstream, upstreamName: pushUpstreamName }
    const previous = previousPushRef.current
    previousPushRef.current = { key: targetKey, state: next }
    if (!targetKey || previous?.key !== targetKey || !isPushTransition(previous.state, next)) {
      return
    }
    setPushGraceUntil(Date.now() + COMMIT_PIPELINES_PUSH_GRACE_MS)
    // Why: Bitbucket needs a few seconds after the push lands to create the run.
    const timer = window.setTimeout(() => void fetchNow(), COMMIT_PIPELINES_AFTER_PUSH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [targetKey, pushAhead, pushHasUpstream, pushUpstreamName, fetchNow])

  const runsBySha =
    targetKey && snapshot?.key === targetKey && snapshot.result.available
      ? snapshot.result.runsBySha
      : null

  useEffect(() => {
    if (!targetKey || !shouldPollCommitPipelines({ runsBySha, now: Date.now(), pushGraceUntil })) {
      return
    }
    let interval: number | null = null
    const start = (): void => {
      if (interval === null && isWindowVisible()) {
        interval = window.setInterval(() => void fetchNow(), COMMIT_PIPELINES_POLL_MS)
      }
    }
    const reconcile = (): void => {
      if (isWindowVisible()) {
        if (interval === null) {
          start()
          // A run that finished while the window was away shows its result straight away.
          void fetchNow()
        }
        return
      }
      if (interval !== null) {
        window.clearInterval(interval)
        interval = null
      }
    }
    // No immediate read: this effect re-arms after every fetch, which just happened.
    start()
    document.addEventListener('visibilitychange', reconcile)
    return () => {
      document.removeEventListener('visibilitychange', reconcile)
      if (interval !== null) {
        window.clearInterval(interval)
      }
    }
  }, [targetKey, runsBySha, pushGraceUntil, fetchNow])

  return runsBySha
}
