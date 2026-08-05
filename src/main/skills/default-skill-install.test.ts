import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_AGENT_SKILL_NAMES, installDefaultAgentSkills } from './default-skill-install'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function sandbox(): { home: string; packageRoot: string } {
  const root = mkdtempSync(join(tmpdir(), 'muster-default-skills-'))
  roots.push(root)
  const home = join(root, 'home')
  const packageRoot = join(root, 'skill-packages')
  mkdirSync(home, { recursive: true })
  for (const name of DEFAULT_AGENT_SKILL_NAMES) {
    mkdirSync(join(packageRoot, name), { recursive: true })
    writeFileSync(join(packageRoot, name, 'SKILL.md'), `# ${name} guide\n`, 'utf8')
  }
  return { home, packageRoot }
}

describe('installDefaultAgentSkills', () => {
  it('writes the canonical copy for every default skill', () => {
    const { home, packageRoot } = sandbox()

    const result = installDefaultAgentSkills({ home, packageRoot })

    for (const name of DEFAULT_AGENT_SKILL_NAMES) {
      expect(readFileSync(join(home, '.agents', 'skills', name, 'SKILL.md'), 'utf8')).toBe(
        `# ${name} guide\n`
      )
    }
    expect(result.installed.sort()).toEqual([...DEFAULT_AGENT_SKILL_NAMES].sort())
  })

  it('registers each skill with a harness that already exists', () => {
    const { home, packageRoot } = sandbox()
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true })

    installDefaultAgentSkills({ home, packageRoot })

    const link = join(home, '.claude', 'skills', 'orca-cli')
    expect(readlinkSync(link)).toContain(join('.agents', 'skills', 'orca-cli'))
  })

  it('never creates a harness directory that is not already there', () => {
    // Making ~/.grok/skills for a harness the user does not have would invent an install and put
    // a skill in front of an agent they never set up.
    const { home, packageRoot } = sandbox()

    const result = installDefaultAgentSkills({ home, packageRoot })

    expect(() => readFileSync(join(home, '.grok', 'skills', 'orca-cli'))).toThrow()
    expect(result.linkedRoots).toEqual([])
  })

  it('leaves an existing copy alone rather than clobbering someone else\u2019s edit', () => {
    const { home, packageRoot } = sandbox()
    const canonical = join(home, '.agents', 'skills', 'orca-cli')
    mkdirSync(canonical, { recursive: true })
    writeFileSync(join(canonical, 'SKILL.md'), '# my own edited guide\n', 'utf8')

    const result = installDefaultAgentSkills({ home, packageRoot })

    expect(readFileSync(join(canonical, 'SKILL.md'), 'utf8')).toBe('# my own edited guide\n')
    expect(result.skipped).toContain('orca-cli')
  })

  it('leaves a harness entry that is not our symlink alone', () => {
    const { home, packageRoot } = sandbox()
    const claudeSkills = join(home, '.claude', 'skills')
    mkdirSync(join(claudeSkills, 'orca-cli'), { recursive: true })
    writeFileSync(join(claudeSkills, 'orca-cli', 'SKILL.md'), '# theirs\n', 'utf8')

    installDefaultAgentSkills({ home, packageRoot })

    expect(readFileSync(join(claudeSkills, 'orca-cli', 'SKILL.md'), 'utf8')).toBe('# theirs\n')
  })

  it('is idempotent, so running it every launch changes nothing after the first', () => {
    const { home, packageRoot } = sandbox()
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true })

    const first = installDefaultAgentSkills({ home, packageRoot })
    const second = installDefaultAgentSkills({ home, packageRoot })

    expect(first.installed.length).toBeGreaterThan(0)
    expect(second.installed).toEqual([])
    expect(second.alreadyCurrent.sort()).toEqual([...DEFAULT_AGENT_SKILL_NAMES].sort())
  })

  it('refreshes a canonical copy that still matches a previous Muster build', () => {
    // Not a clobber: the bytes are ours, just older. Leaving them would pin agents to whatever
    // guide shipped the day they first launched Muster.
    const { home, packageRoot } = sandbox()
    const canonical = join(home, '.agents', 'skills', 'orca-cli')
    mkdirSync(canonical, { recursive: true })
    writeFileSync(join(canonical, 'SKILL.md'), '# orca-cli guide\n', 'utf8')
    writeFileSync(join(packageRoot, 'orca-cli', 'SKILL.md'), '# newer guide\n', 'utf8')

    installDefaultAgentSkills({
      home,
      packageRoot,
      knownPreviousContents: { 'orca-cli': ['# orca-cli guide\n'] }
    })

    expect(readFileSync(join(canonical, 'SKILL.md'), 'utf8')).toBe('# newer guide\n')
  })

  it('answers cleanly when the packaged skills are missing instead of throwing at startup', () => {
    const { home } = sandbox()

    const result = installDefaultAgentSkills({ home, packageRoot: join(home, 'nope') })

    expect(result.installed).toEqual([])
    expect(result.unavailable.sort()).toEqual([...DEFAULT_AGENT_SKILL_NAMES].sort())
  })

  it('repairs a missing harness link without rewriting the canonical copy', () => {
    const { home, packageRoot } = sandbox()
    installDefaultAgentSkills({ home, packageRoot })
    // The harness arrives after the first launch — the next one should still register it.
    mkdirSync(join(home, '.codex', 'skills'), { recursive: true })

    const result = installDefaultAgentSkills({ home, packageRoot })

    expect(readlinkSync(join(home, '.codex', 'skills', 'orca-cli'))).toContain('orca-cli')
    expect(result.installed).toEqual([])
  })

  it('replaces a dangling link left by a removed skills directory', () => {
    const { home, packageRoot } = sandbox()
    const claudeSkills = join(home, '.claude', 'skills')
    mkdirSync(claudeSkills, { recursive: true })
    symlinkSync(join(home, '.agents', 'skills', 'orca-cli'), join(claudeSkills, 'orca-cli'))

    installDefaultAgentSkills({ home, packageRoot })

    expect(readFileSync(join(claudeSkills, 'orca-cli', 'SKILL.md'), 'utf8')).toBe(
      '# orca-cli guide\n'
    )
  })

  it('removes a retired orchestration install and our harness links', () => {
    const { home, packageRoot } = sandbox()
    const canonical = join(home, '.agents', 'skills', 'orchestration')
    const claudeSkills = join(home, '.claude', 'skills')
    mkdirSync(canonical, { recursive: true })
    writeFileSync(join(canonical, 'SKILL.md'), '# retired guide\n', 'utf8')
    mkdirSync(claudeSkills, { recursive: true })
    symlinkSync(canonical, join(claudeSkills, 'orchestration'))

    const result = installDefaultAgentSkills({ home, packageRoot })

    expect(result.retired).toContain('orchestration')
    expect(() => readFileSync(join(canonical, 'SKILL.md'))).toThrow()
    expect(() => readlinkSync(join(claudeSkills, 'orchestration'))).toThrow()
  })

  it('installs every skill when the capability record is empty or absent', () => {
    // Why both: `{}` is what a fresh profile persists, `undefined` is every profile saved before
    // the setting existed. Neither may withhold a skill.
    for (const bundledSkillCapabilities of [undefined, {}]) {
      const { home, packageRoot } = sandbox()

      const result = installDefaultAgentSkills({ home, packageRoot, bundledSkillCapabilities })

      expect(result.disabled).toEqual([])
      expect(result.installed.sort()).toEqual([...DEFAULT_AGENT_SKILL_NAMES].sort())
    }
  })

  it('installs a skill whose entry is explicitly true', () => {
    const { home, packageRoot } = sandbox()

    const result = installDefaultAgentSkills({
      home,
      packageRoot,
      bundledSkillCapabilities: { 'orca-cli': true }
    })

    expect(result.disabled).toEqual([])
    expect(result.installed).toContain('orca-cli')
  })

  it('skips a skill the user turned off, without touching the harness roots', () => {
    const { home, packageRoot } = sandbox()
    const claudeSkills = join(home, '.claude', 'skills')
    mkdirSync(claudeSkills, { recursive: true })

    const result = installDefaultAgentSkills({
      home,
      packageRoot,
      bundledSkillCapabilities: { 'orca-cli': false }
    })

    expect(result.disabled).toEqual(['orca-cli'])
    expect(result.installed).toEqual([])
    expect(result.linkedRoots).toEqual([])
    expect(() => readFileSync(join(home, '.agents', 'skills', 'orca-cli', 'SKILL.md'))).toThrow()
    expect(() => readlinkSync(join(claudeSkills, 'orca-cli'))).toThrow()
  })

  it('leaves an already-installed copy in place when the skill is turned off', () => {
    // Turning the capability off withholds future installs; deleting a skill an agent may be
    // mid-conversation with is a separate, destructive decision this must not make.
    const { home, packageRoot } = sandbox()
    installDefaultAgentSkills({ home, packageRoot })

    const result = installDefaultAgentSkills({
      home,
      packageRoot,
      bundledSkillCapabilities: { 'orca-cli': false }
    })

    expect(result.disabled).toEqual(['orca-cli'])
    expect(readFileSync(join(home, '.agents', 'skills', 'orca-cli', 'SKILL.md'), 'utf8')).toBe(
      '# orca-cli guide\n'
    )
  })

  it('still retires withdrawn skills while a capability is turned off', () => {
    const { home, packageRoot } = sandbox()
    const canonical = join(home, '.agents', 'skills', 'orchestration')
    mkdirSync(canonical, { recursive: true })
    writeFileSync(join(canonical, 'SKILL.md'), '# retired guide\n', 'utf8')

    const result = installDefaultAgentSkills({
      home,
      packageRoot,
      bundledSkillCapabilities: { 'orca-cli': false }
    })

    expect(result.retired).toContain('orchestration')
  })
})
