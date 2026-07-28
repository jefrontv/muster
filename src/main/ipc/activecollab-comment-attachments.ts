// Staging and uploading the files a comment attaches: pick or describe local paths, then send them.
//
// LOCAL ONLY, and deliberately absent from the runtime RPC surface in rpc/methods/activecollab.ts,
// for the reason activecollab-attachment-download.ts is absent from it: every path here names a
// file on the disk of the machine the user is looking at, and the file dialog belongs to that
// window. A remote runtime host would stat and read its OWN disk and upload something else.
//
// Split out of ipc/activecollab.ts rather than added to it because that module is at its line
// budget, the same reason activecollab-people.ts and activecollab-attachment-download.ts exist.

import { BrowserWindow, dialog, type WebContents } from 'electron'

import type {
  ActiveCollabResult,
  ActiveCollabStagedFile,
  ActiveCollabUploadedFile
} from '../../shared/activecollab-api-types'
import {
  AC_MAX_COMMENT_ATTACHMENTS,
  describeAcCommentAttachments,
  uploadAcCommentAttachments
} from '../activecollab/comment-attachment-upload'
import {
  InvalidRequestError,
  MAX_PATH,
  boundedTextList,
  record
} from './activecollab-argument-validation'
import { acClient, guard } from './activecollab-operation-context'

function attachmentPaths(args: unknown): string[] {
  const paths = boundedTextList(record(args).paths, 'paths', AC_MAX_COMMENT_ATTACHMENTS, MAX_PATH)
  if (paths.length === 0) {
    throw new InvalidRequestError('paths must name at least one file.')
  }
  return paths
}

/**
 * The credential is read BEFORE the dialog opens, matching the save-to-disk path: a disconnected
 * instance should say so rather than walk the user through choosing files for an upload that can
 * never start.
 */
export function acPickCommentAttachments(
  sender?: WebContents
): Promise<ActiveCollabResult<ActiveCollabStagedFile[]>> {
  return guard(async () => {
    acClient()
    const parent = sender ? BrowserWindow.fromWebContents(sender) : null
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile', 'multiSelections']
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    // A dismissed dialog is an empty stage, not a failure: nothing went wrong and nothing changed.
    if (result.canceled || result.filePaths.length === 0) {
      return []
    }
    return describeAcCommentAttachments(result.filePaths.slice(0, AC_MAX_COMMENT_ATTACHMENTS))
  })
}

/** Sizes for paths the user dropped, so the strip can show them before anything is uploaded. */
export function acDescribeCommentAttachments(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabStagedFile[]>> {
  return guard(async () => describeAcCommentAttachments(attachmentPaths(args)))
}

export function acUploadCommentAttachments(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabUploadedFile[]>> {
  return guard(async () =>
    uploadAcCommentAttachments({ http: acClient().http, paths: attachmentPaths(args) })
  )
}
