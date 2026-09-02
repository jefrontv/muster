// IPC for `annotate_plan`: push a queued plan to every window, take the reviewer's verdict back.
//
// Mirrors the chat-connector confirm wiring, because the shape is the same — main is blocked on a
// promise until a renderer answers, correlated by requestId.

import { BrowserWindow, ipcMain } from 'electron'
import { getCanonicalUserDataPath } from '../persistence'
import { savePlanAttachment } from '../sites/plan-annotation-attachments'
import {
  listPendingPlanAnnotations,
  respondPlanAnnotation,
  setPlanAnnotationQueuedSender,
  setPlanAnnotationResolvedSender,
  setPlanAnnotationSender
} from '../sites/plan-annotation-requests'
import type {
  PlanAnnotationRequest,
  PlanAnnotationResult
} from '../../shared/plan-annotation-types'

export const PLAN_ANNOTATION_REQUEST_CHANNEL = 'planAnnotation:request'
export const PLAN_ANNOTATION_RESOLVED_CHANNEL = 'planAnnotation:resolved'
export const PLAN_ANNOTATION_QUEUED_CHANNEL = 'planAnnotation:queued'

function broadcast(request: PlanAnnotationRequest): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(PLAN_ANNOTATION_REQUEST_CHANNEL, request)
    }
  }
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

  ipcMain.handle(
    'planAnnotation:respond',
    (_event, args: { requestId?: unknown; result?: unknown }): boolean => {
      if (typeof args?.requestId !== 'string' || args.requestId === '') {
        throw new Error('planAnnotation: requestId must be a non-empty string')
      }
      return respondPlanAnnotation(args.requestId, readResult(args.result))
    }
  )

  // Why: a window that opens after a review is already queued would otherwise never see it, and
  // the agent would wait out the full timeout for a modal that was never shown.
  ipcMain.handle('planAnnotation:listPending', (): PlanAnnotationRequest[] =>
    listPendingPlanAnnotations()
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
  setPlanAnnotationQueuedSender((count) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(PLAN_ANNOTATION_QUEUED_CHANNEL, count)
      }
    }
  })
  setPlanAnnotationResolvedSender((requestId) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(PLAN_ANNOTATION_RESOLVED_CHANNEL, requestId)
      }
    }
  })
}
