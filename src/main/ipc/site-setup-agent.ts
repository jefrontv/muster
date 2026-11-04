// IPC for agent-opened site setups: open the dialog in every window, take its reports back, and
// let the dialog pull a muster:// link from the clipboard through the normal link path.

import { BrowserWindow, clipboard, ipcMain } from 'electron'
import {
  listOpenSiteSetupsForAgent,
  reportSiteSetupForAgent,
  setSiteSetupAgentSender
} from '../sites/site-setup-agent-requests'
import { summarizeClipboardLink } from '../sites/site-setup-clipboard-link'
import type {
  SiteSetupAgentReport,
  SiteSetupAgentRequest,
  SiteSetupAgentState
} from '../../shared/site-setup-agent-types'
import type { SiteSetupClipboardLink } from '../../shared/site-setup-approval-types'
import { notifyWhenUnfocused } from './muster-window-attention'
import { handleSiteBindUrl } from './site-bind'

const OPEN_CHANNEL = 'siteSetupAgent:open'
const STATES: readonly SiteSetupAgentState[] = [
  'opening',
  'reviewing',
  'running',
  'attention',
  'done',
  'cancelled',
  'failed'
]

/** The dialog shows inside Muster; when Muster is in the background, say so from the OS. */
function notifyIfUnfocused(request: SiteSetupAgentRequest): void {
  notifyWhenUnfocused({
    title: `Set up ${request.label}`,
    body: `${request.agent ?? 'An agent'} opened site setup in Muster. Check it and press Set up site.`
  })
}

function readReport(value: unknown): SiteSetupAgentReport | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const report = value as Record<string, unknown>
  if (!STATES.includes(report.state as SiteSetupAgentState)) {
    return null
  }
  const result = report.result as SiteSetupAgentReport['result']
  return {
    state: report.state as SiteSetupAgentState,
    step: typeof report.step === 'string' ? report.step.slice(0, 64) : '',
    percent: typeof report.percent === 'number' ? Math.round(report.percent) : null,
    detail: typeof report.detail === 'string' ? report.detail.slice(0, 1_000) : '',
    result:
      result && typeof result === 'object' && typeof result.siteId === 'string'
        ? {
            siteId: result.siteId,
            path: typeof result.path === 'string' ? result.path : '',
            steps: Array.isArray(result.steps) ? result.steps.slice(0, 10) : []
          }
        : null
  }
}

export function registerSiteSetupAgentHandlers(): void {
  ipcMain.removeHandler('siteSetupAgent:report')
  ipcMain.removeHandler('siteSetupAgent:listOpen')
  ipcMain.removeHandler('siteSetupAgent:clipboardLink')
  ipcMain.removeHandler('siteSetupAgent:useClipboardLink')

  ipcMain.handle('siteSetupAgent:report', (_event, setupId: unknown, report: unknown): void => {
    const parsed = readReport(report)
    if (typeof setupId === 'string' && parsed) {
      reportSiteSetupForAgent(setupId, parsed)
    }
  })

  ipcMain.handle('siteSetupAgent:listOpen', (): SiteSetupAgentRequest[] =>
    listOpenSiteSetupsForAgent()
  )

  // Only the link's non-secret fields leave main.
  ipcMain.handle('siteSetupAgent:clipboardLink', (): SiteSetupClipboardLink | null =>
    summarizeClipboardLink(clipboard.readText())
  )

  // Same path as clicking the link: the bind intake keeps the password and the window gets the rest.
  ipcMain.handle('siteSetupAgent:useClipboardLink', (): { ok: boolean; error: string } =>
    handleSiteBindUrl(clipboard.readText().trim())
  )

  setSiteSetupAgentSender((request) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(OPEN_CHANNEL, request)
      }
    }
    notifyIfUnfocused(request)
  })
}
