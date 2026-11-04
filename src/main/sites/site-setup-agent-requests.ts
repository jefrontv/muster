// An agent's "set up this site": opens the Set up dialog prefilled, then follows it to the end.
//
// The dialog is the consent (nothing is written before its "Set up site"), so there is no approval
// card. The window reports each state change here, and the agent waits on it instead of sleeping.

import { randomUUID } from 'node:crypto'
import type {
  SiteSetupAgentOpen,
  SiteSetupAgentReport,
  SiteSetupAgentRequest
} from '../../shared/site-setup-agent-types'

/** Finished setups stay readable this long, so a late wait still gets the result. */
const RETENTION_MS = 3_600_000

type Entry = {
  request: SiteSetupAgentRequest
  report: SiteSetupAgentReport
  /** Bumped on a new state or step only, so a percent tick does not wake every waiter. */
  version: number
  waiters: Set<() => void>
}

const entries = new Map<string, Entry>()
let sendOpen: ((request: SiteSetupAgentRequest) => void) | null = null

export function setSiteSetupAgentSender(sender: typeof sendOpen): void {
  sendOpen = sender
}

function isFinished(report: SiteSetupAgentReport): boolean {
  return report.state === 'done' || report.state === 'cancelled' || report.state === 'failed'
}

function activeEntry(): Entry | null {
  return [...entries.values()].find((entry) => !isFinished(entry.report)) ?? null
}

export function openSiteSetupForAgent(
  input: SiteSetupAgentOpen
): { setupId: string } | { error: string } {
  if (!sendOpen) {
    return { error: 'Open Muster and try again.' }
  }
  const busy = activeEntry()
  if (busy) {
    return {
      error: `Muster is already setting up ${busy.request.label}. Wait for that to finish first.`
    }
  }
  const request: SiteSetupAgentRequest = { ...input, setupId: randomUUID(), openedAt: Date.now() }
  entries.set(request.setupId, {
    request,
    report: { state: 'opening', step: '', percent: null, detail: '', result: null },
    version: 0,
    waiters: new Set()
  })
  sendOpen(request)
  return { setupId: request.setupId }
}

/** From the window. Unknown or finished setups are ignored, so a stale dialog cannot rewrite one. */
export function reportSiteSetupForAgent(setupId: string, report: SiteSetupAgentReport): void {
  const entry = entries.get(setupId)
  if (!entry || isFinished(entry.report)) {
    return
  }
  const changed = entry.report.state !== report.state || entry.report.step !== report.step
  entry.report = report
  if (!changed) {
    return
  }
  entry.version += 1
  for (const wake of entry.waiters) {
    wake()
  }
  entry.waiters.clear()
  if (isFinished(report)) {
    setTimeout(() => entries.delete(setupId), RETENTION_MS).unref?.()
  }
}

export type SiteSetupAgentWait =
  | { known: false }
  | { known: true; label: string; version: number; report: SiteSetupAgentReport }

/** Answers once the state or step moves past `afterVersion`, or when `waitMs` runs out. */
export async function waitForSiteSetupForAgent(
  setupId: string,
  afterVersion: number,
  waitMs: number
): Promise<SiteSetupAgentWait> {
  const entry = entries.get(setupId)
  if (!entry) {
    return { known: false }
  }
  if (entry.version <= afterVersion && !isFinished(entry.report)) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(
        () => {
          entry.waiters.delete(wake)
          resolve()
        },
        Math.max(0, waitMs)
      )
      timer.unref?.()
      const wake = (): void => {
        clearTimeout(timer)
        resolve()
      }
      entry.waiters.add(wake)
    })
  }
  return {
    known: true,
    label: entry.request.label,
    version: entry.version,
    report: { ...entry.report }
  }
}

/** Setups the window has not finished, so a window opened later can show them. */
export function listOpenSiteSetupsForAgent(): SiteSetupAgentRequest[] {
  return [...entries.values()]
    .filter((entry) => !isFinished(entry.report))
    .map((entry) => entry.request)
}

/** Test-only. */
export function clearSiteSetupAgentRequestsForTests(): void {
  entries.clear()
  sendOpen = null
}
