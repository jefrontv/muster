// The save-to-disk operation for an attachment: pick a destination, stream the bytes into it,
// reveal the result.
//
// LOCAL ONLY, and deliberately absent from the runtime RPC surface in rpc/methods/activecollab.ts.
// The save dialog and the reveal both belong to the window the user is looking at; a remote runtime
// host would write the file to its own disk and answer with a path nothing on this machine can
// open. Split out of ipc/activecollab.ts rather than added to it because that module is at its line
// budget, the same reason activecollab-people.ts exists.

import { BrowserWindow, app, dialog, shell, type WebContents } from 'electron'
import { basename, dirname } from 'node:path'

import type {
  ActiveCollabAttachmentDownload,
  ActiveCollabResult
} from '../../shared/activecollab-api-types'
import { acAttachmentSavePath, downloadAcAttachment } from '../activecollab/attachment-download'
import { boundedText, positiveId, record } from './activecollab-argument-validation'
import { acClient, guard } from './activecollab-operation-context'

/** ActiveCollab's own column is far shorter; the bound stops a wedged renderer streaming text in. */
const MAX_ATTACHMENT_NAME = 1_024

function downloadsDirectory(): string {
  try {
    return app.getPath('downloads')
  } catch {
    // A profile with no downloads directory still has a home to seed the dialog from.
    return app.getPath('home')
  }
}

async function chooseDestination(
  sender: WebContents | undefined,
  defaultPath: string
): Promise<string | null> {
  const parent = sender ? BrowserWindow.fromWebContents(sender) : null
  const options = { defaultPath }
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options)
  return result.canceled || !result.filePath ? null : result.filePath
}

/**
 * The destination the user picked is trusted — they typed it. The attachment NAME is not, so it is
 * sanitised into the dialog seed before it can address anything.
 */
export function acDownloadAttachment(
  args: unknown,
  sender?: WebContents
): Promise<ActiveCollabResult<ActiveCollabAttachmentDownload>> {
  return guard(async () => {
    const input = record(args)
    const attachmentId = positiveId(input.attachmentId, 'attachmentId')
    const name = boundedText(input.name, 'name', MAX_ATTACHMENT_NAME)
    // The credential is read FIRST: a disconnected instance should say so rather than make the
    // user pick a folder for a transfer that can never start.
    const { http } = acClient()
    const destinationPath = await chooseDestination(
      sender,
      acAttachmentSavePath(downloadsDirectory(), name)
    )
    if (destinationPath === null) {
      return { status: 'cancelled' as const }
    }
    await downloadAcAttachment({ http, attachmentId, destinationPath })
    try {
      // Reveal, never open: the file came off a third-party server and must not be executed.
      shell.showItemInFolder(destinationPath)
    } catch {
      // A file manager that refuses to launch does not un-save the file.
    }
    return {
      status: 'saved' as const,
      filePath: destinationPath,
      // Split here because the renderer has no path module to split it with.
      fileName: basename(destinationPath),
      directory: dirname(destinationPath)
    }
  })
}
