// IPC for agent site-setup approvals: push the front request to every window, take the answer back.

import { BrowserWindow, clipboard, ipcMain } from 'electron'
import type { Store } from '../persistence'
import {
  getPendingSiteSetupApproval,
  listPendingSiteSetupApprovals,
  respondSiteSetupApproval,
  setSiteSetupAlwaysAllowStore,
  setSiteSetupApprovalResolvedSender,
  setSiteSetupApprovalSender,
  setSiteSetupSecretStore
} from '../sites/site-setup-approval-requests'
import { setSiteSecret } from '../sites/site-secret-store'
import { setSiteSetupJobListener } from '../sites/site-setup-jobs'
import { applyClipboardLinkFields } from '../sites/site-setup-clipboard-link'
import {
  dropHeldLink,
  holdOpenedLinkForCard,
  linkForCard,
  linkSummaryForCard
} from '../sites/site-setup-link-handoff'
import { focusMusterWindow, notifyWhenUnfocused } from './muster-window-attention'
import { setSiteBindUrlInterceptor } from './site-bind'
import { normalizeSiteSetupAlwaysAllow } from '../../shared/site-setup-always-allow'
import type {
  SiteSetupApprovalRequest,
  SiteSetupClipboardLink
} from '../../shared/site-setup-approval-types'

export const SITE_SETUP_APPROVAL_REQUEST_CHANNEL = 'siteSetupApproval:request'
export const SITE_SETUP_APPROVAL_RESOLVED_CHANNEL = 'siteSetupApproval:resolved'
export const SITE_SETUP_JOB_UPDATE_CHANNEL = 'siteSetupApproval:jobUpdate'
export const SITE_SETUP_LINK_RECEIVED_CHANNEL = 'siteSetupApproval:linkReceived'

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

/** The card only shows inside Muster; when it is in the background, say so from the OS. */
function notifyIfUnfocused(request: SiteSetupApprovalRequest): void {
  notifyWhenUnfocused({
    title: request.secret ? 'Muster needs a password' : 'Muster needs your approval',
    body: request.title
  })
}

/** Only an SSH password card can take a link: the link's password is the SSH login. */
function sshSecretRequest(requestId: unknown): SiteSetupApprovalRequest | null {
  const request = typeof requestId === 'string' ? getPendingSiteSetupApproval(requestId) : null
  return request?.secret?.kind === 'ssh' && request.siteId ? request : null
}

/** Stores the link's password through the card, then fills the environment from the same link. */
function approveWithClipboardLink(store: Store, request: SiteSetupApprovalRequest): boolean {
  // Read again rather than trusting what the card was shown: the clipboard may have changed.
  const link = linkForCard(request.requestId, clipboard.readText())
  if (!link) {
    throw new Error('The clipboard no longer holds a muster:// link with a password.')
  }
  const answered = respondSiteSetupApproval(request.requestId, 'approved', link.password)
  if (answered) {
    applyClipboardLinkFields(store, request.siteId!, request.secret!.environment, link.fields)
  }
  return answered
}

export function registerSiteSetupApprovalHandlers(store: Store): void {
  ipcMain.removeHandler('siteSetupApproval:respond')
  ipcMain.removeHandler('siteSetupApproval:listPending')
  ipcMain.removeHandler('siteSetupApproval:clipboardLink')

  ipcMain.handle(
    'siteSetupApproval:respond',
    (
      _event,
      args: {
        requestId?: unknown
        decision?: unknown
        secretValue?: unknown
        useClipboardLink?: unknown
        alwaysAllow?: unknown
      }
    ): boolean => {
      if (typeof args?.requestId !== 'string' || args.requestId === '') {
        throw new Error('siteSetupApproval: requestId must be a non-empty string')
      }
      if (args.useClipboardLink === true) {
        const request = sshSecretRequest(args.requestId)
        return request ? approveWithClipboardLink(store, request) : false
      }
      const decision = args.decision
      if (decision !== 'approved' && decision !== 'approved-site' && decision !== 'denied') {
        throw new Error('siteSetupApproval: unknown decision')
      }
      const secretValue = typeof args.secretValue === 'string' ? args.secretValue : undefined
      return respondSiteSetupApproval(
        args.requestId,
        decision,
        secretValue,
        args.alwaysAllow === true
      )
    }
  )

  ipcMain.handle('siteSetupApproval:listPending', (): SiteSetupApprovalRequest[] =>
    listPendingSiteSetupApprovals()
  )

  // Read only for an open SSH password card, and only the link's non-secret fields leave main.
  ipcMain.handle(
    'siteSetupApproval:clipboardLink',
    (_event, requestId: unknown): SiteSetupClipboardLink | null =>
      sshSecretRequest(requestId)
        ? linkSummaryForCard(requestId as string, clipboard.readText())
        : null
  )

  setSiteSetupApprovalSender((request) => {
    broadcast(SITE_SETUP_APPROVAL_REQUEST_CHANNEL, request)
    notifyIfUnfocused(request)
  })
  setSiteSetupApprovalResolvedSender((requestId) => {
    dropHeldLink(requestId)
    broadcast(SITE_SETUP_APPROVAL_RESOLVED_CHANNEL, requestId)
  })
  setSiteBindUrlInterceptor((url) => {
    const waiting = listPendingSiteSetupApprovals()
      .filter((request) => request.secret?.kind === 'ssh' && request.siteId)
      .map((request) => request.requestId)
    const requestId = holdOpenedLinkForCard(url, waiting)
    if (!requestId) {
      return false
    }
    broadcast(SITE_SETUP_LINK_RECEIVED_CHANNEL, requestId)
    focusMusterWindow()
    return true
  })
  setSiteSetupJobListener((update) => broadcast(SITE_SETUP_JOB_UPDATE_CHANNEL, update))
  const grants = (): string[] =>
    normalizeSiteSetupAlwaysAllow(store.getSettings().siteSetupAlwaysAllow)
  setSiteSetupAlwaysAllowStore({
    has: (action) => grants().includes(action),
    add: (action) => {
      store.updateSettings({ siteSetupAlwaysAllow: [...grants(), action] })
    }
  })
  setSiteSetupSecretStore((siteId, environment, kind, value) => {
    const site = store.getSite(siteId)
    if (!site || !(environment in site.environments)) {
      throw new Error(`The ${environment} environment no longer exists on this site.`)
    }
    setSiteSecret(site.id, environment, kind, value)
  })
}
