import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, () => unknown>()

vi.mock('electron', () => ({
  app: { getVersion: () => '1.5.53' },
  ipcMain: {
    handle: (channel: string, handler: () => unknown) => {
      handlers.set(channel, handler)
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel)
    }
  }
}))

import { registerWhatsNewHandlers } from './whats-new'
import { getWhatsNewFilePath } from '../whats-new-store'

let dir: string

beforeEach(() => {
  handlers.clear()
  dir = mkdtempSync(join(tmpdir(), 'whats-new-ipc-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function register(loadNotes?: (version: string) => Promise<unknown>): void {
  registerWhatsNewHandlers({
    userDataDir: dir,
    loadNotes: loadNotes as never
  })
}

const get = (): Promise<unknown> => handlers.get('whatsnew:get')!() as Promise<unknown>
const dismiss = (): void => void handlers.get('whatsnew:dismiss')!()

describe('whats-new ipc handlers', () => {
  it('answers ready with fetched notes on an update launch and records the version on dismiss', async () => {
    const file = getWhatsNewFilePath(dir)
    writeFileSync(file, JSON.stringify({ lastRunVersion: '1.5.52' }), 'utf8')
    const loadNotes = vi.fn(async () => ({
      version: '1.5.53',
      notes: '## Features\n- thing',
      notesUrl: 'https://github.com/jefrontv/muster/releases/tag/v1.5.53'
    }))
    register(loadNotes)

    await expect(get()).resolves.toEqual({
      status: 'ready',
      payload: {
        version: '1.5.53',
        notes: '## Features\n- thing',
        notesUrl: 'https://github.com/jefrontv/muster/releases/tag/v1.5.53'
      }
    })
    // Why: seeing the notes must not mark them seen — only dismissal does, so a
    // crash mid-read re-offers the modal next launch.
    expect(readFileSync(file, 'utf8')).toContain('1.5.52')

    dismiss()
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ lastRunVersion: '1.5.53' })
  })

  it('answers ready with null notes when the fetch fails, so the modal can fall back to a link', async () => {
    writeFileSync(join(dir, 'whats-new.json'), JSON.stringify({ lastRunVersion: '1.5.52' }), 'utf8')
    register(async () => null)

    await expect(get()).resolves.toEqual({
      status: 'ready',
      payload: { version: '1.5.53', notes: null, notesUrl: null }
    })
  })

  it('answers none on a fresh install and records the running version', async () => {
    register(async () => {
      throw new Error('must not fetch on a fresh install')
    })

    await expect(get()).resolves.toEqual({ status: 'none' })
    expect(JSON.parse(readFileSync(getWhatsNewFilePath(dir), 'utf8'))).toEqual({
      lastRunVersion: '1.5.53'
    })
  })

  it('answers none on a rollback and records the running (older) version', async () => {
    writeFileSync(join(dir, 'whats-new.json'), JSON.stringify({ lastRunVersion: '1.5.54' }), 'utf8')
    register(async () => {
      throw new Error('must not fetch on a rollback')
    })

    await expect(get()).resolves.toEqual({ status: 'none' })
    expect(JSON.parse(readFileSync(getWhatsNewFilePath(dir), 'utf8'))).toEqual({
      lastRunVersion: '1.5.53'
    })
  })
})
