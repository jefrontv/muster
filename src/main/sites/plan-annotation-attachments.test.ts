import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PlanAttachmentError,
  planAttachmentsDir,
  savePlanAttachment
} from './plan-annotation-attachments'

let userDataPath: string

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'plan-attach-'))
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')

describe('savePlanAttachment', () => {
  it('writes the image and returns a path the agent can open', async () => {
    const path = await savePlanAttachment({ userDataPath, name: 'shot.png', dataBase64: PNG })

    expect(dirname(path)).toBe(planAttachmentsDir(userDataPath))
    expect(readFileSync(path).toString('base64')).toBe(PNG)
    expect(path.endsWith('.png')).toBe(true)
  })

  it('keeps a traversing name inside the attachments directory', async () => {
    // Why: the name comes off a dropped file, so it is attacker-influenced. Untreated, this would
    // write outside userData entirely.
    const path = await savePlanAttachment({
      userDataPath,
      name: '../../../../etc/authorized_keys.png',
      dataBase64: PNG
    })

    expect(dirname(path)).toBe(planAttachmentsDir(userDataPath))
    expect(path).not.toContain('..')
  })

  it('never collides two files of the same name', async () => {
    const first = await savePlanAttachment({ userDataPath, name: 'shot.png', dataBase64: PNG })
    const second = await savePlanAttachment({ userDataPath, name: 'shot.png', dataBase64: PNG })

    // A second screenshot must not silently replace the evidence attached to an earlier note.
    expect(first).not.toBe(second)
  })

  it('refuses a type the agent could not read back', async () => {
    await expect(
      savePlanAttachment({ userDataPath, name: 'payload.svg', dataBase64: PNG })
    ).rejects.toBeInstanceOf(PlanAttachmentError)
  })

  it('refuses an empty attachment', async () => {
    await expect(
      savePlanAttachment({ userDataPath, name: 'shot.png', dataBase64: '' })
    ).rejects.toBeInstanceOf(PlanAttachmentError)
  })
})
