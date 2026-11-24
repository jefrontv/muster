// Images and files added to pages, kept in the space's files/ folder and linked from markdown as
// files/<name>, so agents and exports see an ordinary relative path.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { safeFileName } from './project-pages-file-names'
import { createProjectPagesFiles } from './project-pages-files'
import { ProjectPagesError } from './project-pages-store'

export const PAGE_FILES_DIR = 'files'
export const PAGE_FILE_MAX_BYTES = 20 * 1024 * 1024
const REF = /^files\/[A-Za-z0-9][A-Za-z0-9._ ()-]{0,150}$/
const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf'
}

export function pageFileType(name: string): string {
  return TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream'
}

export function createProjectPagesAttachments({ rootDir }: { rootDir: string }) {
  const files = createProjectPagesFiles(rootDir)

  function folder(scopeKey: string, create: boolean): string | null {
    const dir = files.spaceDir(scopeKey, create)
    return dir ? join(dir, PAGE_FILES_DIR) : null
  }

  /** Stores the bytes and returns the files/... reference to put in markdown. */
  function save(scopeKey: string, name: string, bytes: Uint8Array): string {
    if (bytes.byteLength === 0 || bytes.byteLength > PAGE_FILE_MAX_BYTES) {
      throw new ProjectPagesError('invalid', 'Files must be under 20 MB.')
    }
    const dir = folder(scopeKey, true)
    if (!dir) {
      throw new ProjectPagesError('error', 'Could not open the pages folder.')
    }
    const ext = extname(name)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
      .slice(0, 8)
    // Same character set read() accepts, so every stored file can be read back.
    const base = safeFileName(name.slice(0, name.length - ext.length))
      .replace(/\s+/g, '-')
      .replace(/[^A-Za-z0-9._()-]/g, '')
      .slice(0, 60)
    const stored = `${randomBytes(4).toString('hex')}-${base}${ext}`
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, stored), bytes)
    return `${PAGE_FILES_DIR}/${stored}`
  }

  function read(scopeKey: string, ref: string): { bytes: Buffer; type: string } {
    const dir = folder(scopeKey, false)
    const name = ref.slice(PAGE_FILES_DIR.length + 1)
    if (!REF.test(ref) || name.includes('..') || !dir || !existsSync(join(dir, name))) {
      throw new ProjectPagesError('not_found', 'That file is not in this project.')
    }
    return { bytes: readFileSync(join(dir, name)), type: pageFileType(name) }
  }

  return { save, read, folder: (scopeKey: string) => folder(scopeKey, false) }
}

export type ProjectPagesAttachments = ReturnType<typeof createProjectPagesAttachments>
