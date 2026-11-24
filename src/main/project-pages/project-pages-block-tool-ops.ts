// Agent ops for content beyond text: the block reference, and attaching a local image.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, isAbsolute } from 'node:path'
import { PAGE_BLOCKS } from '../../shared/project-pages-blocks'
import {
  PAGE_FILE_MAX_BYTES,
  pageFileType,
  type ProjectPagesAttachments
} from './project-pages-attachments'
import { ProjectPagesError } from './project-pages-store'
import { toolText, type ToolArgs } from './project-pages-tool-args'

export const PROJECT_PAGES_BLOCK_OPS = ['blocks', 'attach'] as const
type BlockOp = (typeof PROJECT_PAGES_BLOCK_OPS)[number]

export function isProjectPagesBlockOp(op: string): op is BlockOp {
  return PROJECT_PAGES_BLOCK_OPS.includes(op as BlockOp)
}

export function runProjectPagesBlockOp(
  op: BlockOp,
  ctx: {
    attachments?: ProjectPagesAttachments
    scopeKey: string
    project: { id: string; name: string }
    args: ToolArgs
  }
): unknown {
  if (op === 'blocks') {
    return { blocks: PAGE_BLOCKS }
  }
  if (!ctx.attachments) {
    throw new ProjectPagesError('error', 'This Muster build cannot store page files.')
  }
  const attached = attachLocalImage(ctx.attachments, ctx.scopeKey, toolText(ctx.args, 'path', true))
  const alt = (toolText(ctx.args, 'alt') || attached.alt).replace(/[[\]]/g, '')
  return { project: ctx.project, file: attached.file, markdown: `![${alt}](${attached.file})` }
}

/** Copies an image from this computer into the space's files/; also used for Finder drops. */
export function attachLocalImage(
  attachments: ProjectPagesAttachments,
  scopeKey: string,
  path: string
): { file: string; alt: string } {
  // The file is read on this computer, so a path on an SSH host is not found here.
  if (!isAbsolute(path) || !existsSync(path) || !statSync(path).isFile()) {
    throw new ProjectPagesError(
      'invalid',
      'No file at that absolute path on this computer. For a remote project, link an https image instead.'
    )
  }
  if (!pageFileType(path).startsWith('image/')) {
    throw new ProjectPagesError('invalid', 'Only images attach: png, jpg, gif, webp, avif or svg.')
  }
  if (statSync(path).size > PAGE_FILE_MAX_BYTES) {
    throw new ProjectPagesError('invalid', 'Files must be under 20 MB.')
  }
  const file = attachments.save(scopeKey, basename(path), readFileSync(path))
  return {
    file,
    alt: basename(path)
      .replace(/\.[^.]+$/, '')
      .replace(/[[\]]/g, '')
  }
}
