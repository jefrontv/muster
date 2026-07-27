// Hermetic: Electron is a stub, the credential store is a stub, `fetch` is stubbed, and every path
// this touches lives under a per-test temp directory. No dialog opens, no network, no keychain.

import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActiveCollabResult } from '../../shared/activecollab-api-types'

const { getPathMock, showSaveDialogMock, showItemInFolderMock, getCredentialMock, getStatusMock } =
  vi.hoisted(() => ({
    getPathMock: vi.fn(),
    showSaveDialogMock: vi.fn(),
    showItemInFolderMock: vi.fn(),
    getCredentialMock: vi.fn(),
    getStatusMock: vi.fn()
  }))

vi.mock('electron', () => ({
  app: { getPath: getPathMock },
  dialog: { showSaveDialog: showSaveDialogMock },
  shell: { showItemInFolder: showItemInFolderMock },
  BrowserWindow: { fromWebContents: () => null }
}))

vi.mock('../activecollab/credential-store', () => ({
  getActiveCollabCredential: getCredentialMock,
  getActiveCollabConnectionStatus: getStatusMock
}))

import { acDownloadAttachment } from './activecollab-attachment-download'

const TOKEN = 'ac-secret-token-Zq7'
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x7f])

let directory: string

function ok(response: Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response)
  )
}

function zipResponse(): Response {
  return new Response(ZIP, { status: 200, headers: { 'content-type': 'application/zip' } })
}

/** Narrowed so a failing assertion reports the tagged failure instead of "undefined". */
function failureOf(result: ActiveCollabResult<unknown>): {
  kind: string
  error: string
  status: number | null
} {
  if (result.ok) {
    throw new Error(`Expected a failure, got ${JSON.stringify(result)}`)
  }
  return { kind: result.kind, error: result.error, status: result.status }
}

function savedValue(result: ActiveCollabResult<unknown>): Record<string, unknown> {
  if (!result.ok) {
    throw new Error(`Expected success, got ${JSON.stringify(result)}`)
  }
  return result.value as Record<string, unknown>
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ac-download-ipc-'))
  getPathMock.mockReset().mockReturnValue(directory)
  showSaveDialogMock.mockReset()
  showItemInFolderMock.mockReset()
  getCredentialMock.mockReset().mockReturnValue({
    instanceUrl: 'https://projects.example.com',
    token: TOKEN,
    userId: 42,
    userName: 'Jake',
    userEmail: 'jake@example.com'
  })
  getStatusMock.mockReset()
  ok(zipResponse())
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await rm(directory, { recursive: true, force: true })
})

describe('acDownloadAttachment', () => {
  it('writes the bytes to the chosen path and reveals the result', async () => {
    const destinationPath = join(directory, 'WOTS FAS Icons.zip')
    showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: destinationPath })

    const result = await acDownloadAttachment({
      attachmentId: 249087,
      name: 'WOTS FAS Icons.zip'
    })

    expect(savedValue(result)).toEqual({
      status: 'saved',
      filePath: destinationPath,
      fileName: 'WOTS FAS Icons.zip',
      directory
    })
    expect(new Uint8Array(await readFile(destinationPath))).toEqual(ZIP)
    expect(showItemInFolderMock).toHaveBeenCalledWith(destinationPath)
  })

  it('treats a dismissed save dialog as a normal outcome, not a failure', async () => {
    showSaveDialogMock.mockResolvedValue({ canceled: true, filePath: undefined })

    const result = await acDownloadAttachment({ attachmentId: 249087, name: 'brief.pdf' })

    expect(result).toEqual({ ok: true, value: { status: 'cancelled' } })
    expect(await readdir(directory)).toEqual([])
    expect(showItemInFolderMock).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('seeds the dialog inside the download directory even for a traversal-shaped name', async () => {
    showSaveDialogMock.mockResolvedValue({ canceled: true, filePath: undefined })

    await acDownloadAttachment({ attachmentId: 249087, name: '../../../etc/passwd' })

    const seed = showSaveDialogMock.mock.calls[0][0].defaultPath as string
    expect(dirname(seed)).toBe(directory)
    expect(basename(seed)).toBe('passwd')
  })

  it('falls back to home when the profile has no downloads directory', async () => {
    getPathMock.mockImplementation((name: string) => {
      if (name === 'downloads') {
        throw new Error("Failed to get 'downloads' path")
      }
      return directory
    })
    showSaveDialogMock.mockResolvedValue({ canceled: true, filePath: undefined })

    const result = await acDownloadAttachment({ attachmentId: 249087, name: 'brief.pdf' })

    expect(result).toEqual({ ok: true, value: { status: 'cancelled' } })
    expect(getPathMock).toHaveBeenCalledWith('home')
    expect(showSaveDialogMock.mock.calls[0][0].defaultPath).toBe(join(directory, 'brief.pdf'))
  })

  it('maps a rejected token to auth so the UI offers a reconnect', async () => {
    showSaveDialogMock.mockResolvedValue({
      canceled: false,
      filePath: join(directory, 'brief.pdf')
    })
    ok(
      new Response(JSON.stringify({ message: 'Token expired' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })
    )

    const failure = failureOf(await acDownloadAttachment({ attachmentId: 7, name: 'brief.pdf' }))

    expect(failure.kind).toBe('auth')
    expect(failure.status).toBe(401)
    // A failed transfer leaves the chosen path empty rather than half written.
    expect(await readdir(directory)).toEqual([])
  })

  it('keeps the token out of the result and out of an echoed error', async () => {
    const destinationPath = join(directory, 'brief.pdf')
    showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: destinationPath })

    const saved = await acDownloadAttachment({ attachmentId: 7, name: 'brief.pdf' })
    expect(JSON.stringify(saved)).not.toContain(TOKEN)

    ok(
      new Response(JSON.stringify({ message: `Bad token ${TOKEN}` }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })
    )
    const failure = failureOf(await acDownloadAttachment({ attachmentId: 8, name: 'brief.pdf' }))
    expect(failure.error).not.toContain(TOKEN)
    expect(failure.error).toContain('***')
  })

  it('rejects a malformed call before any dialog opens', async () => {
    for (const args of [{}, { attachmentId: 0, name: 'a.zip' }, { attachmentId: 5 }]) {
      expect(failureOf(await acDownloadAttachment(args)).kind).toBe('invalid-request')
    }
    expect(showSaveDialogMock).not.toHaveBeenCalled()
  })

  it('still reports the file as saved when the file manager refuses to launch', async () => {
    const destinationPath = join(directory, 'brief.pdf')
    showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: destinationPath })
    showItemInFolderMock.mockImplementation(() => {
      throw new Error('no file manager')
    })

    const result = await acDownloadAttachment({ attachmentId: 7, name: 'brief.pdf' })

    expect(savedValue(result).status).toBe('saved')
    expect(new Uint8Array(await readFile(destinationPath))).toEqual(ZIP)
  })
})
