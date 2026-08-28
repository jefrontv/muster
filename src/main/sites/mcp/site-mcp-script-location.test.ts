// What an agent is told about a step's script file.
//
// The failure this prevents: an agent writes the script to a guessed directory, the step points
// somewhere else, and nobody finds out until the step fails partway through a production deploy.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createEmptySiteEnvironment,
  CUSTOM_STEP_SCRIPT_DIR,
  type Site,
  type SiteCustomStep
} from '../../../shared/site-types'
import { describeStep } from './site-mcp-custom-step-support'

let checkout: string

function step(overrides: Partial<SiteCustomStep> = {}): SiteCustomStep {
  return {
    id: 'step-1',
    name: 'Purge CDN',
    group: 'deploy',
    runsOn: 'remote',
    command: '',
    scriptPath: `${CUSTOM_STEP_SCRIPT_DIR}/purge.sh`,
    position: 'after',
    order: 0,
    enabled: true,
    ...overrides
  }
}

function site(): Site {
  return {
    id: 'site-1',
    path: checkout,
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'plain',
    dbUser: '',
    dbSocket: '',
    dbPort: null,
    phpVersion: '',
    activeEnvironment: 'main',
    environments: { main: createEmptySiteEnvironment() },
    notes: '',
    searchReplaceTimeoutSeconds: 0
  }
}

beforeEach(() => {
  checkout = mkdtempSync(join(tmpdir(), 'muster-loc-'))
})

afterEach(() => {
  rmSync(checkout, { recursive: true, force: true })
})

describe('describeStep script location', () => {
  it('reports the absolute file and that it exists', () => {
    mkdirSync(join(checkout, CUSTOM_STEP_SCRIPT_DIR), { recursive: true })
    writeFileSync(join(checkout, CUSTOM_STEP_SCRIPT_DIR, 'purge.sh'), 'echo hi\n')

    const described = describeStep(step(), site())

    expect(described.script_file).toBe(join(checkout, CUSTOM_STEP_SCRIPT_DIR, 'purge.sh'))
    expect(described.script_exists).toBe(true)
    expect(described).not.toHaveProperty('script_missing_create_file_at')
  })

  it('names the exact file to create when the script is missing', () => {
    const described = describeStep(step(), site())

    expect(described.script_exists).toBe(false)
    expect(described.script_missing_create_file_at).toBe(
      join(checkout, CUSTOM_STEP_SCRIPT_DIR, 'purge.sh')
    )
  })

  it('reports an unsafe path as missing rather than resolving it', () => {
    const described = describeStep(step({ scriptPath: '../../../etc/passwd' }), site())

    expect(described.script_file).toBeNull()
    expect(described.script_exists).toBe(false)
  })

  it('says nothing about scripts for a command step', () => {
    const described = describeStep(
      step({ command: 'wp cache flush', scriptPath: undefined }),
      site()
    )

    expect(described).not.toHaveProperty('script_file')
    expect(described.script_path).toBeNull()
  })

  it('omits location for a library entry, which belongs to no checkout', () => {
    const described = describeStep(step())

    expect(described).not.toHaveProperty('script_file')
    expect(described.script_path).toBe(`${CUSTOM_STEP_SCRIPT_DIR}/purge.sh`)
  })
})
