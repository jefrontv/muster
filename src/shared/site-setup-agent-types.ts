// An agent asking Muster to open the Set up dialog, and what the dialog reports back.

import type { CloneSourceRepo } from './site-clone-source-types'
import type { SiteLocalStack } from './site-types'

export type SiteSetupAgentSource =
  /** A repo found on a git host: the dialog skips its picker and opens on the review. */
  | { kind: 'repo'; repo: CloneSourceRepo }
  /** Finish setup on a site that already exists. */
  | { kind: 'site'; siteId: string }

/** Suggestions for the review. The user can change every one before pressing Set up site. */
export type SiteSetupAgentHints = {
  stack?: SiteLocalStack
  domain?: string
  serve?: boolean
  import?: boolean
}

export type SiteSetupAgentOpen = {
  source: SiteSetupAgentSource
  label: string
  hints: SiteSetupAgentHints
  /** Self-reported MCP client name. Shown, never trusted. */
  agent: string | null
}

export type SiteSetupAgentRequest = SiteSetupAgentOpen & { setupId: string; openedAt: number }

export type SiteSetupAgentState =
  | 'opening'
  | 'reviewing'
  | 'running'
  /** A step failed and the dialog is open on it, so the user can retry: not finished. */
  | 'attention'
  | 'done'
  | 'cancelled'
  /** Closed after a failure without a retry. */
  | 'failed'

export type SiteSetupAgentStepResult = { id: string; state: string; detail: string }

export type SiteSetupAgentReport = {
  state: SiteSetupAgentState
  /** The running or failed step, e.g. `clone`; empty otherwise. */
  step: string
  percent: number | null
  /** A failure reason, or what the user is doing (e.g. "using a muster:// link"). */
  detail: string
  result: { siteId: string; path: string; steps: SiteSetupAgentStepResult[] } | null
}
