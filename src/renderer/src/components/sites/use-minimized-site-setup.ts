// Minimizing a site setup: hide the dialog, keep the work, report progress to the status bar.
//
// Shared by both entry points — the `muster://` bind flow and New Site from git — because the
// contract has to be identical. A chip that behaved differently depending on which dialog opened
// it would be worse than no chip.

import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import type { SiteSetupFlowPhase } from '../../../../shared/site-setup-minimize'

export type SiteSetupFlowReport = {
  label: string
  stage: string
  phase: SiteSetupFlowPhase
  percent: number | null
}

export function useMinimizedSiteSetup(
  flowId: string,
  report: SiteSetupFlowReport
): {
  /** True while the flow lives in the status bar; the dialog hides but stays mounted. */
  minimized: boolean
  minimize: () => void
} {
  const flows = useAppStore((s) => s.minimizedSiteSetupFlows)
  const minimizeFlow = useAppStore((s) => s.minimizeSiteSetupFlow)
  const updateFlow = useAppStore((s) => s.updateMinimizedSiteSetupFlow)
  const clearFlow = useAppStore((s) => s.clearSiteSetupFlow)
  const minimized = flowId in flows

  // Why a ref and primitive deps below: callers build the report inline, so the object is a new
  // identity every render. Depending on it would push state on every render and spin.
  const latest = useRef(report)
  latest.current = report
  const { label, stage, phase, percent } = report

  // Why keep pushing while minimized: the chip is the only view of the flow, so it has to follow
  // the clone's percentage and whatever stage comes after it. The store ignores an unknown id, so
  // a late report cannot resurrect a flow the user already restored.
  useEffect(() => {
    if (!minimized) {
      return
    }
    updateFlow(flowId, { label, stage, phase, percent })
  }, [minimized, flowId, updateFlow, label, stage, phase, percent])

  // Why clear on unmount: the dialog going away for any reason — finished, dismissed, the window
  // closing — must not leave a chip pointing at a flow that no longer exists.
  useEffect(() => {
    return () => clearFlow(flowId)
  }, [flowId, clearFlow])

  const minimize = useCallback(() => {
    minimizeFlow({ id: flowId, ...latest.current })
  }, [flowId, minimizeFlow])

  return { minimized, minimize }
}
