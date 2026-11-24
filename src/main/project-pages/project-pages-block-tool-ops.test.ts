import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProjectPagesAttachments } from './project-pages-attachments'
import { runProjectPagesBlockOp } from './project-pages-block-tool-ops'
import { createProjectPagesStore } from './project-pages-store'

const project = { id: 'r', name: 'Repo' }
let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pages-blocks-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('block tool ops', () => {
  it('lists the block reference', () => {
    const out = runProjectPagesBlockOp('blocks', { scopeKey: 's', project, args: {} }) as {
      blocks: { block: string }[]
    }
    expect(out.blocks.map((b) => b.block)).toContain('Callout')
  })

  it('attaches a local image and returns its markdown', () => {
    createProjectPagesStore({ rootDir: root }).createPage('s', { title: 'A' }, { kind: 'user' })
    const attachments = createProjectPagesAttachments({ rootDir: root })
    const image = join(root, 'Site [map].png')
    writeFileSync(image, new Uint8Array([1, 2]))
    const out = runProjectPagesBlockOp('attach', {
      attachments,
      scopeKey: 's',
      project,
      args: { path: image }
    }) as { file: string; markdown: string }
    expect(out.markdown).toBe(`![Site map](${out.file})`)
    expect([...attachments.read('s', out.file).bytes]).toEqual([1, 2])
  })

  it('refuses relative paths, missing files and non-images', () => {
    const attachments = createProjectPagesAttachments({ rootDir: root })
    const run = (path: string) =>
      runProjectPagesBlockOp('attach', { attachments, scopeKey: 's', project, args: { path } })
    expect(() => run('shot.png')).toThrow(/absolute path/)
    expect(() => run(join(root, 'nope.png'))).toThrow(/absolute path/)
    writeFileSync(join(root, 'notes.txt'), 'x')
    expect(() => run(join(root, 'notes.txt'))).toThrow(/Only images/)
  })
})
