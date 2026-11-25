// IPC for `annotate_plan`: push a queued plan to every window, take the reviewer's verdict back.
//
// Mirrors the chat-connector confirm wiring, because the shape is the same — main is blocked on a
// promise until a renderer answers, correlated by requestId.

import { BrowserWindow, ipcMain } from 'electron'
import { getCanonicalUserDataPath } from '../persistence'
import { savePlanAttachment } from '../sites/plan-annotation-attachments'
import { notifyWhenUnfocused } from './muster-window-attention'
import {
  isPlanAnnotationOnScreen,
  listPendingPlanAnnotations,
  markPlanAnnotationShown,
  respondPlanAnnotation,
  savePlanAnnotationToPages,
  setPlanAnnotationQueuedSender,
  setPlanAnnotationResolvedSender,
  setPlanAnnotationSender
} from '../sites/plan-annotation-requests'
import type {
  PlanAnnotationRequest,
  PlanAnnotationResult,
  PlanReviewPageRef
} from '../../shared/plan-annotation-types'

export const PLAN_ANNOTATION_REQUEST_CHANNEL = 'planAnnotation:request'
export const PLAN_ANNOTATION_RESOLVED_CHANNEL = 'planAnnotation:resolved'
export const PLAN_ANNOTATION_QUEUED_CHANNEL = 'planAnnotation:queued'
export const PLAN_ANNOTATION_REVEAL_CHANNEL = 'planAnnotation:reveal'

const OFF_SCREEN_GRACE_MS = 1_500

/** Reviews already announced by an OS notification, so a window's report does not repeat it. */
const notified = new Set<string>()

function sendToWindows(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

function announce(request: PlanAnnotationRequest, evenWhenFocused: boolean): void {
  if (notified.has(request.requestId)) {
    return
  }
  // notifyWhenUnfocused may decline; only a shown banner counts as announced.
  if (!evenWhenFocused && BrowserWindow.getFocusedWindow()) {
    return
  }
  notified.add(request.requestId)
  notifyWhenUnfocused(
    {
      title: 'A plan is waiting for your review',
      body: `${request.agent ?? 'An agent'}: ${request.title}`
    },
    {
      evenWhenFocused,
      onClick: () => sendToWindows(PLAN_ANNOTATION_REVEAL_CHANNEL, request.requestId)
    }
  )
}

function broadcast(request: PlanAnnotationRequest): void {
  sendToWindows(PLAN_ANNOTATION_REQUEST_CHANNEL, request)
  // A review behind the terminal is one the agent rightly thinks nobody saw.
  announce(request, false)
}

function readResult(value: unknown): PlanAnnotationResult {
  const raw = (value ?? {}) as Partial<PlanAnnotationResult>
  const decision = raw.decision
  if (
    decision !== 'annotated' &&
    decision !== 'approved' &&
    decision !== 'approved_with_notes' &&
    decision !== 'dismissed'
  ) {
    throw new Error('planAnnotation: unknown decision')
  }
  return {
    decision,
    annotations: Array.isArray(raw.annotations) ? raw.annotations : [],
    ...(raw.edits ? { edits: raw.edits } : {}),
    ...(raw.reason ? { reason: raw.reason } : {})
  }
}

export function registerPlanAnnotationHandlers(): void {
  ipcMain.removeHandler('planAnnotation:respond')
  ipcMain.removeHandler('planAnnotation:listPending')
  ipcMain.removeHandler('planAnnotation:saveAttachment')
  ipcMain.removeHandler('planAnnotation:saveToPages')
  ipcMain.removeHandler('planAnnotation:shown')

  ipcMain.handle(
    'planAnnotation:respond',
    (_event, args: { requestId?: unknown; result?: unknown }): boolean => {
      if (typeof args?.requestId !== 'string' || args.requestId === '') {
        throw new Error('planAnnotation: requestId must be a non-empty string')
      }
      return respondPlanAnnotation(args.requestId, readResult(args.result))
    }
  )

  // Returns the page, or null when Pages is off or no project holds the agent's folder.
  ipcMain.handle(
    'planAnnotation:saveToPages',
    (_event, args: { requestId?: unknown; folder?: unknown }): PlanReviewPageRef | null => {
      if (typeof args?.requestId !== 'string' || args.requestId === '') {
        throw new Error('planAnnotation: requestId must be a non-empty string')
      }
      const folder = typeof args.folder === 'string' && args.folder.trim() ? args.folder : null
      return savePlanAnnotationToPages(args.requestId, folder)
    }
  )

  // Why: a window that opens after a review is already queued would otherwise never see it, and
  // the agent would wait out the full timeout for a modal that was never shown.
  ipcMain.handle('planAnnotation:listPending', (): PlanAnnotationRequest[] =>
    listPendingPlanAnnotations()
  )

  // A window placed the review; off screen (another project, Bots view) earns a notification.
  ipcMain.handle(
    'planAnnotation:shown',
    (_event, args: { requestId?: unknown; onScreen?: unknown }): void => {
      if (typeof args?.requestId !== 'string' || typeof args.onScreen !== 'boolean') {
        return
      }
      const request = markPlanAnnotationShown(args.requestId, args.onScreen)
      if (request && !args.onScreen) {
        // Another window may still report it on screen; only announce if none does.
        setTimeout(() => {
          if (isPlanAnnotationOnScreen(request.requestId) === false) {
            announce(request, true)
          }
        }, OFF_SCREEN_GRACE_MS)
      }
    }
  )

  ipcMain.handle(
    'planAnnotation:saveAttachment',
    (_event, args: { name?: unknown; dataBase64?: unknown }): Promise<string> => {
      if (typeof args?.name !== 'string' || typeof args.dataBase64 !== 'string') {
        throw new Error('planAnnotation: attachment needs a name and base64 data')
      }
      return savePlanAttachment({
        userDataPath: getCanonicalUserDataPath(),
        name: args.name,
        dataBase64: args.dataBase64
      })
    }
  )

  setPlanAnnotationSender(broadcast)
  setPlanAnnotationQueuedSender((count) => sendToWindows(PLAN_ANNOTATION_QUEUED_CHANNEL, count))
  setPlanAnnotationResolvedSender((requestId) => {
    notified.delete(requestId)
    sendToWindows(PLAN_ANNOTATION_RESOLVED_CHANNEL, requestId)
  })
}
