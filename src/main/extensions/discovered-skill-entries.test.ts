import { describe, expect, it } from 'vitest'
import type { DiscoveredSkill, SkillDiscoveryResult } from '../../shared/skills'
import { discoveredSkillEntries, discoveredSkillId } from './discovered-skill-entries'

function skill(overrides: Partial<DiscoveredSkill> = {}): DiscoveredSkill {
  return {
    id: 'x',
    name: 'acme-skill',
    description: 'Does Acme things.',
    providers: ['claude'],
    sourceKind: 'home',
    sourceLabel: 'Home',
    rootPath: '/home/dev/.agents/skills',
    directoryPath: '/home/dev/.agents/skills/acme-skill',
    skillFilePath: '/home/dev/.agents/skills/acme-skill/SKILL.md',
    installed: true,
    fileCount: 1,
    updatedAt: null,
    ...overrides
  }
}

function discovery(...skills: DiscoveredSkill[]): SkillDiscoveryResult {
  return { skills, sources: [], scannedAt: 0 }
}

describe('discoveredSkillId', () => {
  it('produces an id the catalog schema would also accept', () => {
    expect(discoveredSkillId('Acme Skill!')).toBe('local-skill-acme-skill')
  })

  it('survives a name with nothing usable in it', () => {
    expect(discoveredSkillId('!!!')).toBe('local-skill-unnamed')
  })
})

describe('discoveredSkillEntries', () => {
  it('turns a discovered skill into an installed row', () => {
    const [row] = discoveredSkillEntries(discovery(skill()), new Set())
    expect(row.entry).toMatchObject({ kind: 'skill', name: 'acme-skill' })
    expect(row.state).toMatchObject({ installed: true, status: 'current' })
  })

  it('records where the skill actually lives', () => {
    const [row] = discoveredSkillEntries(discovery(skill()), new Set())
    expect(row.state.origin).toEqual({
      label: 'Home',
      path: '/home/dev/.agents/skills/acme-skill/SKILL.md',
      providers: ['claude']
    })
  })

  it('offers no install route, because Muster did not put it there', () => {
    const [row] = discoveredSkillEntries(discovery(skill()), new Set())
    expect(row.entry.install).toEqual({ method: 'bundled-skill', skill: 'acme-skill' })
    expect(row.state.autoUpdateSupported).toBe(false)
  })

  it('skips a name a catalog entry already claims', () => {
    const rows = discoveredSkillEntries(
      discovery(skill()),
      new Set([discoveredSkillId('acme-skill')])
    )
    expect(rows).toEqual([])
  })

  it('keeps one row when the same skill is reached through two roots', () => {
    const rows = discoveredSkillEntries(
      discovery(skill(), skill({ sourceKind: 'plugin', sourceLabel: 'Plugin' })),
      new Set()
    )
    expect(rows).toHaveLength(1)
  })

  it('carries the source and providers into keywords so search finds them', () => {
    const [row] = discoveredSkillEntries(discovery(skill()), new Set())
    expect(row.entry.keywords).toEqual(['home', 'claude'])
  })
})
