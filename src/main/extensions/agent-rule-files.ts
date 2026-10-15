// Adds a catalog entry's agent rule to the global agent instruction files, between markers so it
// can be refreshed or removed without touching the user's own text.

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { ExtensionEntry } from '../../shared/extension-catalog-types'
import { extensionCommandSpec } from '../../shared/extension-command-resolution'
import { claudeMarketplaceLocation } from './claude-marketplace-probe'

export type AgentRuleFileEnv = {
  claudeConfigDir: string
  codexHome: string
}

export function defaultAgentRuleFileEnv(): AgentRuleFileEnv {
  return {
    claudeConfigDir: process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude'),
    codexHome: process.env.CODEX_HOME || path.join(homedir(), '.codex')
  }
}

function startMarker(id: string): string {
  return `<!-- muster-extension:${id} -->`
}

function endMarker(id: string): string {
  return `<!-- /muster-extension:${id} -->`
}

/**
 * Global instruction files, deduplicated by real path: a CLAUDE.md symlinked to AGENTS.md is one
 * file and must get one copy. Codex's file is only a target when Codex is installed.
 */
function targetFiles(env: AgentRuleFileEnv): string[] {
  const candidates = [path.join(env.claudeConfigDir, 'CLAUDE.md')]
  if (existsSync(env.codexHome)) {
    candidates.push(path.join(env.codexHome, 'AGENTS.md'))
  }
  const seen = new Set<string>()
  const files: string[] = []
  for (const file of candidates) {
    // Why the real path: writing to a symlink's path with a rename would replace the link.
    const real = existsSync(file) ? realpathSync(file) : file
    if (!seen.has(real)) {
      seen.add(real)
      files.push(real)
    }
  }
  return files
}

function withoutBlock(text: string, id: string): string {
  const start = text.indexOf(startMarker(id))
  if (start === -1) {
    return text
  }
  const endAt = text.indexOf(endMarker(id), start)
  if (endAt === -1) {
    return text
  }
  const before = text.slice(0, start).replace(/\n+$/, '')
  const after = text.slice(endAt + endMarker(id).length).replace(/^\n+/, '')
  if (!before) {
    return after
  }
  return after ? `${before}\n\n${after}` : `${before}\n`
}

/** Adds or refreshes the rule in every target file. Returns the files it changed. */
export function writeAgentRule(
  id: string,
  rule: string,
  env: AgentRuleFileEnv = defaultAgentRuleFileEnv()
): string[] {
  const changed: string[] = []
  for (const file of targetFiles(env)) {
    const current = existsSync(file) ? readFileSync(file, 'utf-8') : ''
    const base = withoutBlock(current, id).replace(/\n+$/, '')
    const block = `${startMarker(id)}\n${rule.trim()}\n${endMarker(id)}\n`
    const next = base ? `${base}\n\n${block}` : block
    if (next !== current) {
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, next, 'utf-8')
      changed.push(file)
    }
  }
  return changed
}

/** Removes the rule from every target file that has it. Returns the files it changed. */
export function removeAgentRule(
  id: string,
  env: AgentRuleFileEnv = defaultAgentRuleFileEnv()
): string[] {
  const changed: string[] = []
  for (const file of targetFiles(env)) {
    if (!existsSync(file)) {
      continue
    }
    const current = readFileSync(file, 'utf-8')
    const next = withoutBlock(current, id)
    if (next !== current) {
      writeFileSync(file, next, 'utf-8')
      changed.push(file)
    }
  }
  return changed
}

/** True when the entry's rule block is in any target file. */
export function isAgentRuleActive(
  id: string,
  env: AgentRuleFileEnv = defaultAgentRuleFileEnv()
): boolean {
  return targetFiles(env).some(
    (file) => existsSync(file) && readFileSync(file, 'utf-8').includes(startMarker(id))
  )
}

/** The entry's rule text, read from its marketplace checkout for a file rule. Null when unavailable. */
export function resolveAgentRuleText(entry: ExtensionEntry): string | null {
  const rule = entry.agentRule
  if (rule?.text) {
    return rule.text
  }
  if (!rule?.file) {
    return null
  }
  const marketplace = extensionCommandSpec(entry)?.claudeMarketplace
  const location = marketplace ? claudeMarketplaceLocation(marketplace) : null
  const file = location ? path.join(location, ...rule.file.split('/')) : null
  return file && existsSync(file) ? readFileSync(file, 'utf-8') : null
}

export function writeResolvedAgentRule(entry: ExtensionEntry, id = entry.id): string[] {
  const text = resolveAgentRuleText(entry)
  if (!text) {
    throw new Error(`${entry.name} is not installed where its rule points.`)
  }
  return writeAgentRule(id, text)
}
