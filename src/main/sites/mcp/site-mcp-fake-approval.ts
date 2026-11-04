// Test fake for the setup-approval side of SiteMcpContext.

import type {
  SiteSetupApprovalDecision,
  SiteSetupApprovalInput
} from '../../../shared/site-setup-approval-types'
import type { SiteSetupReadOp, SiteSetupWriteOp } from '../../../shared/site-setup-bridge-ops'
import type { SiteMcpContext } from './site-mcp-context'

export type FakeApprovalOptions = {
  /** Defaults on, so the existing write-tool tests run as before. */
  siteSetupEnabled?: boolean
  /** The decision `collectSetupApproval` reports; null keeps it pending. */
  approvalDecision?: SiteSetupApprovalDecision | null
  /** Sites the GUI already approved for the session, answered without a card. */
  approvedSiteIds?: string[]
  /** What the GUI answers for each setup lookup; absent answers null. */
  setupReadAnswers?: Partial<Record<SiteSetupReadOp, unknown>>
}

// The census calls every tool with no setup answers configured, so each lookup has a plausible one.
const DEFAULT_SETUP_READS: Record<SiteSetupReadOp, unknown> = {
  projects: [
    { id: 'repo-1', name: 'acme', path: '/Sites/acme', kind: 'git', host: 'local', site: null }
  ],
  'clone-sources': {
    providers: [{ id: 'bitbucket', label: 'Bitbucket', configured: true, reason: '' }]
  },
  'site-folders': {
    roots: ['/Sites'],
    primaryRoot: '/Sites',
    candidates: [],
    scannedAt: 1_000,
    truncated: false,
    configuredRoots: []
  },
  'setup-plan': {
    siteId: 'site-1',
    stages: [{ id: 'target', state: 'done', reason: '' }],
    clone: { status: 'not-needed' },
    stack: {},
    import: {}
  },
  'setup-job': {
    id: 'job-1',
    label: 'Set up',
    state: 'running',
    log: ['starting'],
    result: null,
    error: ''
  },
  'ocsites-preview': {
    found: true,
    configDirectory: '/home/.config/ocsites',
    sites: [{ name: 'Acme', path: '/Sites/acme', environments: ['main'], alreadyInMuster: true }]
  },
  'local-stack': {
    detection: { supported: true, reason: '', stack: 'plain', registered: false },
    installed: ['ddev']
  },
  'agent-setup': {
    known: true,
    label: 'acme',
    version: 1,
    report: { state: 'reviewing', step: '', percent: null, detail: '', result: null }
  }
}

export function fakeSetupApproval(
  options: FakeApprovalOptions,
  approvalRequests: SiteSetupApprovalInput[],
  setupReads: { op: SiteSetupReadOp; args: Record<string, unknown> }[] = [],
  setupWrites: { op: SiteSetupWriteOp; approvalId: string; args: Record<string, unknown> }[] = []
): Pick<
  SiteMcpContext,
  'siteSetupEnabled' | 'requestSetupApproval' | 'collectSetupApproval' | 'readSetup' | 'writeSetup'
> {
  return {
    writeSetup: (op, approvalId, args) => {
      setupWrites.push({ op, approvalId, args })
      return Promise.resolve({ ok: true, op })
    },
    readSetup: (op, args) => {
      setupReads.push({ op, args })
      return Promise.resolve(options.setupReadAnswers?.[op] ?? DEFAULT_SETUP_READS[op])
    },
    siteSetupEnabled: () => options.siteSetupEnabled ?? true,
    requestSetupApproval: (input) => {
      approvalRequests.push(input)
      const preApproved =
        !input.secret && input.siteId !== null && options.approvedSiteIds?.includes(input.siteId)
      return Promise.resolve({
        requestId: `approval-${approvalRequests.length}`,
        decision: preApproved ? ('approved-site' as const) : null
      })
    },
    collectSetupApproval: () => {
      const decision = options.approvalDecision ?? null
      return Promise.resolve(
        decision === null
          ? { status: 'pending' as const, openedMs: 1_000 }
          : { status: 'settled' as const, decision }
      )
    }
  }
}
