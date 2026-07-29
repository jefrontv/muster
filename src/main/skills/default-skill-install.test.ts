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

    const link = join(home, '.claude', 'skills', 'orchestration')
    expect(readlinkSync(link)).toContain(join('.agents', 'skills', 'orchestration'))
  })

  it('never creates a harness directory that is not already there', () => {
    // Making ~/.grok/skills for a harness the user does not have would invent an install and put
    // a skill in front of an agent they never set up.
    const { home, packageRoot } = sandbox()

    const result = installDefaultAgentSkills({ home, packageRoot })

    expect(() => readFileSync(join(home, '.grok', 'skills', 'orchestration'))).toThrow()
    expect(result.linkedRoots).toEqual([])
  })

  it('leaves an existing copy alone rather than clobbering someone else\u2019s edit', () => {
    const { home, packageRoot } = sandbox()
    const canonical = join(home, '.agents', 'skills', 'orchestration')
    mkdirSync(canonical, { recursive: true })
    writeFileSync(join(canonical, 'SKILL.md'), '# my own edited guide\n', 'utf8')

    const result = installDefaultAgentSkills({ home, packageRoot })

    expect(readFileSync(join(canonical, 'SKILL.md'), 'utf8')).toBe('# my own edited guide\n')
    expect(result.skipped).toContain('orchestration')
  })

  it('leaves a harness entry that is not our symlink alone', () => {
    const { home, packageRoot } = sandbox()
    const claudeSkills = join(home, '.claude', 'skills')
    mkdirSync(join(claudeSkills, 'orchestration'), { recursive: true })
    writeFileSync(join(claudeSkills, 'orchestration', 'SKILL.md'), '# theirs\n', 'utf8')

    installDefaultAgentSkills({ home, packageRoot })

    expect(readFileSync(join(claudeSkills, 'orchestration', 'SKILL.md'), 'utf8')).toBe('# theirs\n')
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
    const canonical = join(home, '.agents', 'skills', 'orchestration')
    mkdirSync(canonical, { recursive: true })
    writeFileSync(join(canonical, 'SKILL.md'), '# orchestration guide\n', 'utf8')
    writeFileSync(join(packageRoot, 'orchestration', 'SKILL.md'), '# newer guide\n', 'utf8')

    installDefaultAgentSkills({
      home,
      packageRoot,
      knownPreviousContents: { orchestration: ['# orchestration guide\n'] }
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
    symlinkSync(
      join(home, '.agents', 'skills', 'orchestration'),
      join(claudeSkills, 'orchestration')
    )

    installDefaultAgentSkills({ home, packageRoot })

    expect(readFileSync(join(claudeSkills, 'orchestration', 'SKILL.md'), 'utf8')).toBe(
      '# orchestration guide\n'
    )
  })
})
