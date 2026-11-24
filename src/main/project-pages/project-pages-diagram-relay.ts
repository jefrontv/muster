// Hands agent diagram work to the renderer, which owns the maxGraph model, and waits for the answer.
import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type {
  DiagramWorkRequest,
  DiagramWorkResponse
} from '../../shared/project-pages-diagram-agent'
import { getTrustedUIRendererWebContents } from '../ipc/ui'
import { ProjectPagesError } from './project-pages-store'

const TIMEOUT_MS = 20_000
const REQUEST = 'projectPages:diagramWork'
const RESPONSE = 'projectPages:diagramWorkResponse'

export type DiagramWorker = (request: DiagramWorkRequest) => Promise<unknown>

const retry = (): ProjectPagesError =>
  new ProjectPagesError(
    'error',
    "Muster's window is not ready for diagram work. Try again shortly."
  )

export const requestDiagramWork: DiagramWorker = (request) => {
  const renderer = getTrustedUIRendererWebContents()
  if (!renderer) {
    return Promise.reject(retry())
  }
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const done = (): void => {
      clearTimeout(timer)
      ipcMain.removeListener(RESPONSE, onResponse)
      renderer.removeListener('destroyed', onGone)
    }
    const onGone = (): void => {
      done()
      reject(retry())
    }
    const timer = setTimeout(onGone, TIMEOUT_MS)
    const onResponse = (event: Electron.IpcMainEvent, response: DiagramWorkResponse): void => {
      if (event.sender !== renderer || response?.id !== id) {
        return
      }
      done()
      if (response.ok) {
        resolve(response.result)
      } else {
        reject(new ProjectPagesError('invalid', response.error))
      }
    }
    ipcMain.on(RESPONSE, onResponse)
    renderer.once('destroyed', onGone)
    renderer.send(REQUEST, { id, ...request })
  })
}
