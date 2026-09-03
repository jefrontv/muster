// React binding for site-setup-runner.ts: one runner per mounted dialog, snapshots read through
// useSyncExternalStore so a minimised dialog keeps its run and re-renders from the same state.

import { useMemo, useSyncExternalStore } from 'react'
import {
  createSiteSetupRunner,
  type SiteSetupRunner,
  type SiteSetupRunnerSnapshot
} from './site-setup-runner'

export function useSiteSetupRunner(): {
  runner: SiteSetupRunner
  snapshot: SiteSetupRunnerSnapshot
} {
  const runner = useMemo(() => createSiteSetupRunner(window.api), [])
  const snapshot = useSyncExternalStore(runner.subscribe, runner.snapshot, runner.snapshot)
  return { runner, snapshot }
}
