import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isAgentRuleActive,
  removeAgentRule,
  resolveAgentRuleText,
  writeAgentRule,
  type AgentRuleFileEnv
} from './agent-rule-files'
import type { ExtensionEntry } from '../../shared/extension-catalog-types'

describe('agent rule files', () => {
  let root: string
  let env: AgentRuleFileEnv
  let claudeFile: string
  let codexFile: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 'agent-rules-')))
    env = { claudeConfigDir: path.join(root, '.claude'), codexHome: path.join(root, '.codex') }
    claudeFile = path.join(env.claudeConfigDir, 'CLAUDE.md')
    codexFile = path.join(env.codexHome, 'AGENTS.md')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('appends the rule after existing text and creates CLAUDE.md when missing', () => {
    mkdirSync(env.claudeConfigDir, { recursive: true })
    writeFileSync(claudeFile, '# My rules\n\n- be brief\n')
    expect(writeAgentRule('context-mode', 'Use context-mode.', env)).toEqual([claudeFile])
    expect(readFileSync(claudeFile, 'utf-8')).toBe(
      '# My rules\n\n- be brief\n\n<!-- muster-extension:context-mode -->\nUse context-mode.\n<!-- /muster-extension:context-mode -->\n'
    )

    rmSync(claudeFile)
    writeAgentRule('context-mode', 'Use context-mode.', env)
    expect(readFileSync(claudeFile, 'utf-8')).toBe(
      '<!-- muster-extension:context-mode -->\nUse context-mode.\n<!-- /muster-extension:context-mode -->\n'
    )
  })

  it('refreshes the rule in place without duplicating it', () => {
    writeAgentRule('context-mode', 'Old rule.', env)
    writeFileSync(claudeFile, `${readFileSync(claudeFile, 'utf-8')}\n- added later\n`)
    writeAgentRule('context-mode', 'New rule.', env)
    const text = readFileSync(claudeFile, 'utf-8')
    expect(text.match(/muster-extension:context-mode -->/g)).toHaveLength(2)
    expect(text).toContain('New rule.')
    expect(text).not.toContain('Old rule.')
    expect(text.startsWith('- added later')).toBe(true)
    expect(writeAgentRule('context-mode', 'New rule.', env)).toEqual([])
  })

  it('writes AGENTS.md only when Codex is installed, once for a symlinked pair', () => {
    writeAgentRule('context-mode', 'Use it.', env)
    expect(() => readFileSync(codexFile, 'utf-8')).toThrow()

    rmSync(claudeFile)
    mkdirSync(env.codexHome, { recursive: true })
    writeFileSync(codexFile, '# Shared\n')
    symlinkSync(codexFile, claudeFile)
    expect(writeAgentRule('context-mode', 'Use it.', env)).toEqual([codexFile])
    expect(readFileSync(codexFile, 'utf-8').match(/Use it\./g)).toHaveLength(1)
  })

  it('removes the rule and leaves the rest of the file intact', () => {
    mkdirSync(env.claudeConfigDir, { recursive: true })
    writeFileSync(claudeFile, '# My rules\n')
    writeAgentRule('context-mode', 'Use it.', env)
    expect(removeAgentRule('context-mode', env)).toEqual([claudeFile])
    expect(readFileSync(claudeFile, 'utf-8')).toBe('# My rules\n')
    expect(removeAgentRule('context-mode', env)).toEqual([])
  })

  it('reports whether the rule is present', () => {
    expect(isAgentRuleActive('context-mode', env)).toBe(false)
    writeAgentRule('context-mode', 'Use it.', env)
    expect(isAgentRuleActive('context-mode', env)).toBe(true)
  })

  it('reads a file rule from the marketplace checkout', () => {
    const location = path.join(root, 'checkout')
    mkdirSync(path.join(location, 'configs'), { recursive: true })
    writeFileSync(path.join(location, 'configs', 'CLAUDE.md'), '# Routing\n')
    mkdirSync(path.join(env.claudeConfigDir, 'plugins'), { recursive: true })
    writeFileSync(
      path.join(env.claudeConfigDir, 'plugins', 'known_marketplaces.json'),
      JSON.stringify({ 'context-mode': { installLocation: location } })
    )
    vi.stubEnv('CLAUDE_CONFIG_DIR', env.claudeConfigDir)
    const entry = {
      id: 'context-mode',
      name: 'Context Mode',
      install: { method: 'command', command: { install: 'x', claudeMarketplace: 'context-mode' } },
      agentRule: { file: 'configs/CLAUDE.md', onInstall: true }
    } as unknown as ExtensionEntry
    expect(resolveAgentRuleText(entry)).toBe('# Routing\n')
    vi.stubEnv('CLAUDE_CONFIG_DIR', path.join(root, 'missing'))
    expect(resolveAgentRuleText(entry)).toBeNull()
    vi.unstubAllEnvs()
  })
})
