// An agent's request to create a project or write site config, held until a person answers it.

export type SiteSetupApprovalDetail = { label: string; value: string }

/** A password the user types into the card. The value goes to the keychain, never to the agent. */
export type SiteSetupSecretPrompt = { environment: string; kind: 'ssh' | 'db' }

/** What a tool asks for. The GUI shows it verbatim; nothing here is trusted beyond display. */
export type SiteSetupApprovalInput = {
  /** Stable action name, e.g. `create_project`. */
  action: string
  title: string
  summary: string
  details: SiteSetupApprovalDetail[]
  /** The site this touches, when there is one. "Approve for this site" needs it. */
  siteId: string | null
  siteName: string | null
  /** Self-reported MCP client name. Shown, never trusted. */
  agent: string | null
  /** Set for a password prompt: the card shows a password field and never auto-approves. */
  secret?: SiteSetupSecretPrompt
}

/** What a password card shows of a muster:// link on the clipboard. The password stays in main. */
export type SiteSetupClipboardLink = {
  /** `opened`: the user clicked the link while the card waited, instead of the usual bind modal. */
  source: 'clipboard' | 'opened'
  reponame: string
  hostname: string
  username: string
  rootPath: string
  liveDomain: string
  /** The link's own environment, which may differ from the card's. */
  environment: string
}

export type SiteSetupApprovalRequest = SiteSetupApprovalInput & {
  requestId: string
  openedAt: number
}

export type SiteSetupApprovalDecision = 'approved' | 'approved-site' | 'denied' | 'expired'

export type SiteSetupApprovalOutcome =
  | { status: 'settled'; decision: SiteSetupApprovalDecision }
  | { status: 'pending'; openedMs: number }
  | { status: 'unknown' }

/** A long setup job's state as the window shows it: a progress toast, never the full log. */
export type SiteSetupJobUpdate = {
  id: string
  label: string
  state: 'running' | 'succeeded' | 'failed'
  /** Latest step, e.g. "Receiving objects"; empty when the job reports none. */
  phase: string
  /** 0-100, or null when the job has no percentage. */
  percent: number | null
  error: string
}
