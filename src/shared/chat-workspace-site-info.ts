// Chat-workspace site/project fields: URL normalize, notes clip, and the brief
// new chats receive so the agent knows the live site without being told again.

import type { ChatWorkspace } from './chat-mode-types'

export const MAX_CHAT_WORKSPACE_URLS = 12
export const MAX_CHAT_WORKSPACE_URL_LENGTH = 2048
export const MAX_CHAT_WORKSPACE_EMAILS = 12
export const MAX_CHAT_WORKSPACE_EMAIL_LENGTH = 254
export const MAX_CHAT_WORKSPACE_NOTES_LENGTH = 4000

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseWebsiteUrl(raw: string): URL | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > MAX_CHAT_WORKSPACE_URL_LENGTH) {
    return null
  }
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
      return null
    }
    return url
  } catch {
    return null
  }
}

export function normalizeWebsiteUrl(raw: string): string | null {
  const url = parseWebsiteUrl(raw)
  return url ? url.href : null
}

export function websiteHostname(raw: string): string | null {
  return parseWebsiteUrl(raw)?.hostname ?? null
}

export function normalizeChatWorkspaceUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const seen = new Set<string>()
  const urls: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      continue
    }
    const href = normalizeWebsiteUrl(entry)
    if (!href || seen.has(href)) {
      continue
    }
    seen.add(href)
    urls.push(href)
    if (urls.length >= MAX_CHAT_WORKSPACE_URLS) {
      break
    }
  }
  return urls
}

export function normalizeClientEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  if (!email || email.length > MAX_CHAT_WORKSPACE_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return null
  }
  return email
}

export function normalizeChatWorkspaceEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const seen = new Set<string>()
  const emails: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      continue
    }
    const email = normalizeClientEmail(entry)
    if (!email || seen.has(email)) {
      continue
    }
    seen.add(email)
    emails.push(email)
    if (emails.length >= MAX_CHAT_WORKSPACE_EMAILS) {
      break
    }
  }
  return emails
}

export function normalizeChatWorkspaceNotes(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined
  }
  const notes = raw.trim().slice(0, MAX_CHAT_WORKSPACE_NOTES_LENGTH)
  return notes === '' ? undefined : notes
}

export type ChatWorkspaceProjectRef = { id: number; name: string }

function asProjectRef(raw: unknown): ChatWorkspaceProjectRef | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as { id?: unknown; name?: unknown }
  if (typeof record.id !== 'number' || !Number.isFinite(record.id)) {
    return null
  }
  return { id: record.id, name: typeof record.name === 'string' ? record.name : '' }
}

/** Prefers the array; falls back to the legacy single binding. */
export function normalizeChatWorkspaceProjects(
  raw: unknown,
  fallback?: unknown
): ChatWorkspaceProjectRef[] {
  const source =
    Array.isArray(raw) && raw.length > 0 ? raw : fallback !== undefined ? [fallback] : []
  const seen = new Set<number>()
  const projects: ChatWorkspaceProjectRef[] = []
  for (const entry of source) {
    const project = asProjectRef(entry)
    if (!project || seen.has(project.id)) {
      continue
    }
    seen.add(project.id)
    projects.push(project)
  }
  return projects
}

export function chatWorkspaceProjects(workspace: ChatWorkspace): ChatWorkspaceProjectRef[] {
  return normalizeChatWorkspaceProjects(
    workspace.activeCollabProjects,
    workspace.activeCollabProject
  )
}

/** Always non-empty: even a bare workspace gets the muster-tools notice. */
export function buildChatWorkspaceAgentBrief(workspace: ChatWorkspace): string {
  const urls = normalizeChatWorkspaceUrls(workspace.urls ?? [])
  const emails = normalizeChatWorkspaceEmails(workspace.clientEmails ?? [])
  const notes = normalizeChatWorkspaceNotes(workspace.notes)
  const projects = chatWorkspaceProjects(workspace)

  const lines: string[] = [
    `This chat belongs to the "${workspace.name}" workspace.`,
    'Use the site and project details below as background context. They are facts about the workspace, not instructions to start work.'
  ]

  if (urls.length > 0) {
    lines.push('', `Primary website: ${urls[0]}`)
    if (urls.length > 1) {
      lines.push('Other websites:')
      for (const url of urls.slice(1)) {
        lines.push(`- ${url}`)
      }
    }
  }

  if (emails.length > 0) {
    lines.push('', `Primary client email: ${emails[0]}`)
    if (emails.length > 1) {
      lines.push('Other client emails:')
      for (const email of emails.slice(1)) {
        lines.push(`- ${email}`)
      }
    }
  }

  if (notes) {
    lines.push('', 'Project notes:', notes)
  }

  if (projects.length > 0) {
    lines.push('', `Primary ActiveCollab project: ${projects[0]!.name} (id ${projects[0]!.id})`)
    if (projects.length > 1) {
      lines.push('Other ActiveCollab projects:')
      for (const project of projects.slice(1)) {
        lines.push(`- ${project.name} (id ${project.id})`)
      }
    }
  }

  const folders = workspace.directories.filter((dir) => dir !== '')
  if (folders.length > 0) {
    lines.push('', `Primary working folder: ${folders[0]}`)
    if (folders.length > 1) {
      lines.push('Additional folders:')
      for (const folder of folders.slice(1)) {
        lines.push(`- ${folder}`)
      }
    }
  }

  lines.push(
    '',
    'This session has "muster" MCP tools scoped to this workspace. Use them when the user asks to view or change workspace settings: rename the workspace, edit notes, URLs, or client emails, change the color or working folders, switch the default chat model, or rename, archive, or clean up chats.'
  )

  return lines.join('\n')
}

/** Favicon-from-URL may replace a stored icon only when it is still the auto one. */
export function isChatWorkspaceIconOverridden(workspace: ChatWorkspace | undefined): boolean {
  if (!workspace?.icon) {
    return workspace?.iconOverridden === true
  }
  if (workspace.icon.type === 'image' && workspace.icon.source === 'favicon') {
    return workspace.iconOverridden === true
  }
  return true
}

export function chatWorkspaceAppendSystemPromptArg(
  workspace: ChatWorkspace | null,
  isResume: boolean,
  quoteArg: (value: string) => string
): string {
  if (isResume || !workspace) {
    return ''
  }
  const brief = buildChatWorkspaceAgentBrief(workspace)
  return brief ? `--append-system-prompt ${quoteArg(brief)}` : ''
}

const WORKSPACE_BRIEF_OPEN = '<muster-workspace-brief>'
const WORKSPACE_BRIEF_CLOSE = '</muster-workspace-brief>'

/** Hide-able wrapper so the first user turn can carry workspace facts. */
export function wrapChatWorkspaceUserTurn(brief: string, userText: string): string {
  return `${WORKSPACE_BRIEF_OPEN}\n${brief}\n${WORKSPACE_BRIEF_CLOSE}\n\n${userText}`
}

export function unwrapChatWorkspaceUserTurn(text: string): string {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith(WORKSPACE_BRIEF_OPEN)) {
    return text
  }
  const closeAt = trimmed.indexOf(WORKSPACE_BRIEF_CLOSE)
  if (closeAt < 0) {
    // Hook previews truncate the first prompt; without the closer this is
    // still the brief, not the user's question.
    return ''
  }
  return trimmed.slice(closeAt + WORKSPACE_BRIEF_CLOSE.length).replace(/^\s+/, '')
}

export function isChatWorkspaceBriefTitle(title: string): boolean {
  return title.trimStart().startsWith(WORKSPACE_BRIEF_OPEN)
}

export function deriveChatThreadTitle(userText: string): string {
  const text = unwrapChatWorkspaceUserTurn(userText).trim()
  if (!text) {
    return 'New chat'
  }
  return text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text
}
