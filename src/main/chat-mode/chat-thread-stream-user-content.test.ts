import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildChatStreamUserContent,
  chatStreamImageMediaType,
  readChatStreamImages
} from './chat-thread-stream-user-content'

describe('chatStreamImageMediaType', () => {
  it('maps known image extensions case-insensitively', () => {
    expect(chatStreamImageMediaType('/a/shot.PNG')).toBe('image/png')
    expect(chatStreamImageMediaType('/a/photo.jpeg')).toBe('image/jpeg')
    expect(chatStreamImageMediaType('/a/document.pdf')).toBeNull()
  })
})

describe('buildChatStreamUserContent', () => {
  it('orders images before text and drops an empty text block', () => {
    const image = { mediaType: 'image/png', dataBase64: 'AAAA' }
    expect(buildChatStreamUserContent('hi', [image])).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      { type: 'text', text: 'hi' }
    ])
    expect(buildChatStreamUserContent('   ', [image])).toHaveLength(1)
    expect(buildChatStreamUserContent('', [])).toEqual([])
  })
})

describe('readChatStreamImages', () => {
  it('reads valid images and skips unsupported or missing files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chat-stream-images-'))
    const pngPath = join(dir, 'shot.png')
    await writeFile(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const { images, skipped } = await readChatStreamImages([
      pngPath,
      join(dir, 'missing.png'),
      join(dir, 'notes.txt')
    ])
    expect(images).toEqual([
      {
        mediaType: 'image/png',
        dataBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')
      }
    ])
    expect(skipped).toHaveLength(2)
  })
})
