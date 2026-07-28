// Hermetic: Electron is a stub, the credential store is a stub, `fetch` is stubbed, and every path
// lives under a per-test temp directory. No dialog opens, no network, no keychain.

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActiveCollabResult } from '../../shared/activecollab-api-types'

const { showOpenDialogMock, getCredentialMock, getStatusMock } = vi.hoisted(() => ({
  showOpenDialogMock: vi.fn(),
  getCredentialMock: vi.fn(),
  getStatusMock: vi.fn()
}))

vi.mock('electron', () => ({
  dialog: { showOpenDialog: showOpenDialogMock },
  BrowserWindow: { fromWebContents: () => null }
}))

vi.mock('../activecollab/credential-store', () => ({
  getActiveCollabCredential: getCredentialMock,
  getActiveCollabConnectionStatus: getStatusMock
}))

import {
  acDescribeCommentAttachments,
  acPickCommentAttachments,
  acUploadCommentAttachments
} from './activecollab-comment-attachments'

const TOKEN = 'ac-secret-token-Zq7'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
const CODE = 'FVz6RyPOo4mwh4NUVxoPLjg0tcHuBQt8AS2ggGVv'

let directory: string
let requests: RequestInit[]

function answering(body: unknown): void {
  requests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      requests.push(init)
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    })
  )
}

async function write(name: string): Promise<string> {
  const path = join(directory, name)
  await writeFile(path, PNG)
  return path
}

function valueOf<T>(result: ActiveCollabResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected success, got ${JSON.stringify(result)}`)
  }
  return result.value
}

function failureOf(result: ActiveCollabResult<unknown>): { kind: string; error: string } {
  if (result.ok) {
    throw new Error(`Expected a failure, got ${JSON.stringify(result)}`)
  }
  return { kind: result.kind, error: result.error }
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ac-upload-ipc-'))
  showOpenDialogMock.mockReset()
  getCredentialMock.mockReset().mockReturnValue({
    instanceUrl: 'https://projects.example.com',
    token: TOKEN,
    userId: 42,
    userName: 'Jake',
    userEmail: 'jake@example.com'
  })
  getStatusMock.mockReset().mockReturnValue({ configured: false, connection: null, reason: 'nope' })
  answering([{ code: CODE }])
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await rm(directory, { recursive: true, force: true })
})

describe('acPickCommentAttachments', () => {
  it('opens a multi-select file picker and describes every choice', async () => {
    const first = await write('ac.png')
    const second = await write('brief.pdf')
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [first, second] })

    const staged = valueOf(await acPickCommentAttachments())

    expect(showOpenDialogMock).toHaveBeenCalledWith({
      properties: ['openFile', 'multiSelections']
    })
    expect(staged).toEqual([
      { path: first, name: 'ac.png', size: PNG.byteLength, rejected: null },
      { path: second, name: 'brief.pdf', size: PNG.byteLength, rejected: null }
    ])
  })

  it('treats a dismissed picker as an empty stage, not a failure', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] })

    expect(await acPickCommentAttachments()).toEqual({ ok: true, value: [] })
  })

  it('refuses before opening a dialog when no instance is connected', async () => {
    getCredentialMock.mockReturnValue(null)

    expect(failureOf(await acPickCommentAttachments()).kind).toBe('not-configured')
    expect(showOpenDialogMock).not.toHaveBeenCalled()
  })
})

describe('acDescribeCommentAttachments', () => {
  it('sizes dropped paths and flags the ones that cannot be sent', async () => {
    const good = await write('ac.png')

    const staged = valueOf(
      await acDescribeCommentAttachments({ paths: [good, join(directory, 'gone.zip')] })
    )

    expect(staged.map((file) => [file.name, file.rejected])).toEqual([
      ['ac.png', null],
      ['gone.zip', 'unreadable']
    ])
  })

  it('rejects a malformed or empty path list', async () => {
    for (const args of [{}, { paths: [] }, { paths: 'nope' }, { paths: [7] }]) {
      expect(failureOf(await acDescribeCommentAttachments(args)).kind).toBe('invalid-request')
    }
  })

  it('rejects more paths than one comment can carry', async () => {
    const paths = Array.from({ length: 21 }, (_unused, index) => join(directory, `f${index}.png`))

    expect(failureOf(await acDescribeCommentAttachments({ paths })).error).toContain('exceeds 20')
  })
})

describe('acUploadCommentAttachments', () => {
  it('uploads each path and answers its code', async () => {
    const path = await write('ac.png')

    expect(valueOf(await acUploadCommentAttachments({ paths: [path] }))).toEqual([
      { path, name: 'ac.png', size: PNG.byteLength, code: CODE }
    ])
    expect(requests).toHaveLength(1)
  })

  it('reports an HTTP 200 carrying an empty array as a rejected upload', async () => {
    answering([])
    const path = await write('ac.png')

    const failure = failureOf(await acUploadCommentAttachments({ paths: [path] }))

    expect(failure.kind).toBe('invalid-request')
    expect(failure.error).toContain('rejected the upload of "ac.png"')
  })

  it('refuses when no instance is connected, without reading anything', async () => {
    getCredentialMock.mockReturnValue(null)
    const path = await write('ac.png')

    expect(failureOf(await acUploadCommentAttachments({ paths: [path] })).kind).toBe(
      'not-configured'
    )
    expect(requests).toHaveLength(0)
  })

  it('keeps the token out of every answer it gives', async () => {
    const path = await write('ac.png')
    expect(JSON.stringify(await acUploadCommentAttachments({ paths: [path] }))).not.toContain(TOKEN)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(`connect ECONNREFUSED with ${TOKEN}`)
      })
    )
    const failure = failureOf(await acUploadCommentAttachments({ paths: [path] }))

    expect(failure.error).not.toContain(TOKEN)
    expect(failure.error).toContain('***')
  })
})
