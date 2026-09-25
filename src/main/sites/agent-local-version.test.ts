import { describe, expect, it } from 'vitest'
import {
  AGENT_LOCAL_IMPORT_ROUTES_MIN_VERSION,
  agentLocalVersionAtLeast
} from './agent-local-version'

describe('agentLocalVersionAtLeast', () => {
  it.each([
    ['dev', true],
    ['0.34.1-5-g419a927', true],
    ['v0.37.0', true],
    ['0.32.1', false],
    ['', false]
  ])('%s against the import floor → %s', (version, expected) => {
    expect(agentLocalVersionAtLeast(version, AGENT_LOCAL_IMPORT_ROUTES_MIN_VERSION)).toBe(expected)
  })
})
