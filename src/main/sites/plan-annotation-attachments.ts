// Images a reviewer attaches to a plan note, written to disk so the agent gets a path.
//
// Why a path and not inline data: the agent can open a file, and a screenshot base64'd into a tool
// result would swamp its context to say the same thing.

import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Big enough for a full-screen retina grab, small enough that a stray paste cannot fill the disk. */
const MAX_BYTES = 20 * 1024 * 1024

/** Only formats the agent can actually read back. */
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

export class PlanAttachmentError extends Error {}

/**
 * Strips everything but a safe stem and extension.
 *
 * The name arrives from a dropped file, so it is attacker-influenced: without this a name like
 * `../../.ssh/authorized_keys` would escape the attachment directory.
 */
function safeName(name: string): string {
  const extension = extname(name).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new PlanAttachmentError(`Unsupported image type: ${extension || name}`)
  }
  const stem = name
    .slice(0, name.length - extension.length)
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 64)
  return `${stem.length > 0 ? stem : 'image'}-${randomUUID().slice(0, 8)}${extension}`
}

export function planAttachmentsDir(userDataPath: string): string {
  return join(userDataPath, 'plan-attachments')
}

export async function savePlanAttachment(args: {
  userDataPath: string
  name: string
  dataBase64: string
}): Promise<string> {
  const bytes = Buffer.from(args.dataBase64, 'base64')
  if (bytes.byteLength === 0) {
    throw new PlanAttachmentError('Attachment was empty.')
  }
  if (bytes.byteLength > MAX_BYTES) {
    throw new PlanAttachmentError('Attachment is larger than 20MB.')
  }
  const directory = planAttachmentsDir(args.userDataPath)
  await mkdir(directory, { recursive: true })
  const target = join(directory, safeName(args.name))
  await writeFile(target, bytes)
  return target
}
