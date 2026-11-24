import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProjectPagesAttachments } from './project-pages-attachments'
import { createProjectPagesDatabases } from './project-pages-database-store'
import { exportProjectPages } from './project-pages-export'
import { createProjectPagesStore } from './project-pages-store'

const USER = { kind: 'user' } as const
let root: string
let out: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pages-files-'))
  out = mkdtempSync(join(tmpdir(), 'pages-files-out-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
})

describe('page attachments', () => {
  it('stores files under files/ and refuses paths outside it', () => {
    const store = createProjectPagesStore({ rootDir: root })
    store.createPage('s', { title: 'A' }, USER)
    const files = createProjectPagesAttachments({ rootDir: root })
    const ref = files.save('s', 'My Diagram.PNG', new Uint8Array([1, 2, 3]))
    expect(ref).toMatch(/^files\/[0-9a-f]{8}-My-Diagram\.png$/)
    expect([...files.read('s', ref).bytes]).toEqual([1, 2, 3])
    expect(files.read('s', ref).type).toBe('image/png')
    expect(() => files.read('s', 'files/../tree.json')).toThrow()
    expect(() => files.read('s', '../tree.json')).toThrow()
  })

  it('exports images beside the pages with working relative links', () => {
    const store = createProjectPagesStore({ rootDir: root })
    const databases = createProjectPagesDatabases({ rootDir: root, store })
    const files = createProjectPagesAttachments({ rootDir: root })
    const parent = store.createPage('s', { title: 'Parent' }, USER).meta
    const ref = files.save('s', 'shot.png', new Uint8Array([9]))
    store.createPage(
      's',
      { parentId: parent.id, title: 'Child', markdown: `![shot](${ref})` },
      USER
    )
    exportProjectPages({
      store,
      databases,
      scopeKey: 's',
      targetDir: out,
      filesDir: files.folder('s')
    })
    expect(readFileSync(join(out, 'Parent', 'Child.md'), 'utf-8')).toContain(`![shot](../${ref})`)
    expect(existsSync(join(out, ref))).toBe(true)
  })
})
