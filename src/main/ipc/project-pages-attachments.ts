// IPC for images and files on pages: save pasted or picked bytes, read them back for display.
import { ipcMain } from 'electron'
import { projectPagesAttachments } from '../project-pages/project-pages'
import { ProjectPagesError } from '../project-pages/project-pages-store'
import { guarded, scope } from './project-pages'

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value || value.length > 300) {
    throw new ProjectPagesError('invalid', `${name} is required.`)
  }
  return value
}

export function registerProjectPagesAttachmentHandlers(): void {
  ipcMain.removeHandler('projectPages:saveFile')
  ipcMain.removeHandler('projectPages:readFile')
  ipcMain.handle('projectPages:saveFile', (_e, key: unknown, name: unknown, bytes: unknown) =>
    guarded(() => {
      if (!(bytes instanceof Uint8Array)) {
        throw new ProjectPagesError('invalid', 'File bytes are required.')
      }
      return projectPagesAttachments().save(scope(key), text(name, 'name'), bytes)
    })
  )
  ipcMain.handle('projectPages:readFile', (_e, key: unknown, ref: unknown) =>
    guarded(() => {
      const file = projectPagesAttachments().read(scope(key), text(ref, 'ref'))
      return { bytes: new Uint8Array(file.bytes), type: file.type }
    })
  )
}
