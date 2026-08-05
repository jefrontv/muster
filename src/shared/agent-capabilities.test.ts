import { describe, expect, it } from 'vitest'
import {
  isBundledSkillEnabled,
  isSitesMcpExposedToAgents,
  setBundledSkillEnabled
} from './agent-capabilities'

describe('isSitesMcpExposedToAgents', () => {
  it('treats a profile saved before the toggle existed as exposed', () => {
    expect(isSitesMcpExposedToAgents({})).toBe(true)
    expect(isSitesMcpExposedToAgents(undefined)).toBe(true)
  })

  it('only withholds the server on an explicit opt-out', () => {
    expect(isSitesMcpExposedToAgents({ agentCapabilitySitesMcp: false })).toBe(false)
    expect(isSitesMcpExposedToAgents({ agentCapabilitySitesMcp: true })).toBe(true)
  })
})

describe('isBundledSkillEnabled', () => {
  it('installs a skill that has no recorded preference', () => {
    expect(isBundledSkillEnabled(undefined, 'orca-cli')).toBe(true)
    expect(isBundledSkillEnabled({}, 'orca-cli')).toBe(true)
    expect(isBundledSkillEnabled({ 'orca-linear': false }, 'orca-cli')).toBe(true)
  })

  it('skips only the skill that was explicitly turned off', () => {
    expect(isBundledSkillEnabled({ 'orca-cli': false }, 'orca-cli')).toBe(false)
  })
})

describe('setBundledSkillEnabled', () => {
  it('records an opt-out', () => {
    expect(setBundledSkillEnabled({}, 'orca-cli', false)).toEqual({ 'orca-cli': false })
  })

  it('drops the key when re-enabling so the record only holds opt-outs', () => {
    expect(setBundledSkillEnabled({ 'orca-cli': false }, 'orca-cli', true)).toEqual({})
  })

  it('leaves the other skills untouched', () => {
    expect(setBundledSkillEnabled({ 'orca-linear': false }, 'orca-cli', false)).toEqual({
      'orca-cli': false,
      'orca-linear': false
    })
  })

  it('does not mutate the record it was given', () => {
    const current = { 'orca-cli': false }
    setBundledSkillEnabled(current, 'orca-cli', true)
    expect(current).toEqual({ 'orca-cli': false })
  })
})
