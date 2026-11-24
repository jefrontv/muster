// Files on agent comment drafts: copied into userData when added, limited like the bots server's.
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, realpathSync, rmSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import type {
  AgentCommentDraftSource,
  BotsCommentDraftAttachment
} from '../../shared/bots-comment-draft-types'

const MAX_FILES = 20
const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_TOTAL_BYTES = 128 * 1024 * 1024

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.zip': 'application/zip'
}

export class AgentDraftError extends Error {}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function realOrSelf(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function fileSize(path: string): number {
  try {
    const stat = statSync(path)
    if (stat.isFile()) {
      return stat.size
    }
  } catch {
    // Reported below as unreadable.
  }
  throw new AgentDraftError(`${path} is not a readable file.`)
}

export type AgentDraftFiles = ReturnType<typeof createAgentDraftFiles>

export function createAgentDraftFiles(options: { filesRoot: string; downloadsDir: string }) {
  const folder = (draftId: string): string =>
    join(options.filesRoot, draftId.replace(/[^a-zA-Z0-9_-]/g, ''))

  return {
    /** An agent may only attach from its working folder or Downloads. */
    checkAgentPath(path: string, source: AgentCommentDraftSource): string {
      const real = realOrSelf(isAbsolute(path) ? path : resolve(source.cwd, path))
      const roots = [source.cwd, options.downloadsDir].map(realOrSelf)
      if (!roots.some((root) => inside(root, real))) {
        throw new AgentDraftError(`${path} is outside your working folder and Downloads.`)
      }
      return real
    },

    copyIn(
      draftId: string,
      paths: string[],
      addedBy: 'bot' | 'user',
      keep: BotsCommentDraftAttachment[]
    ): BotsCommentDraftAttachment[] {
      const sizes = paths.map((path) => {
        const size = fileSize(path)
        if (size > MAX_FILE_BYTES) {
          throw new AgentDraftError(`${basename(path)} is over 64 MB.`)
        }
        return size
      })
      if (keep.length + paths.length > MAX_FILES) {
        throw new AgentDraftError(`A draft holds at most ${MAX_FILES} files.`)
      }
      const total = keep.reduce((sum, f) => sum + f.size, 0) + sizes.reduce((a, b) => a + b, 0)
      if (total > MAX_TOTAL_BYTES) {
        throw new AgentDraftError('A draft holds at most 128 MB of files.')
      }
      mkdirSync(folder(draftId), { recursive: true })
      const added = paths.map((path, index) => {
        const id = randomUUID()
        copyFileSync(path, join(folder(draftId), id))
        return {
          id,
          name: basename(path),
          size: sizes[index],
          mime: MIME[extname(path).toLowerCase()] ?? 'application/octet-stream',
          addedBy
        }
      })
      return [...keep, ...added]
    },

    drop(draftId: string, removed: BotsCommentDraftAttachment[]): void {
      for (const attachment of removed) {
        rmSync(join(folder(draftId), attachment.id), { force: true })
      }
    },

    removeAll(draftId: string): void {
      rmSync(folder(draftId), { recursive: true, force: true })
    },

    read(draftId: string, attachmentId: string): Promise<Buffer> {
      return readFile(join(folder(draftId), attachmentId))
    }
  }
}
