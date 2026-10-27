import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Automation } from '../shared/automations-types'
import type { CliStatusResult, RuntimeTerminalListResult } from '../shared/runtime-types'
import { setCliStyleEnabled, stripStyle } from './cli-style'
import {
  formatAutomationList,
  formatCliStatus,
  formatProjectList,
  formatRepoList,
  formatTerminalList,
  formatWorktreeList,
  formatWorktreePs,
  reportCliError
} from './format'
import { formatCommandHelp } from './help'
import { styleHelpText } from './help-style'
import { formatWorkspaceOpenPath } from './open-path-command'
import { RuntimeClientError } from './runtime-client'

const savedEnv = { TERM: process.env.TERM, WT_SESSION: process.env.WT_SESSION }

beforeAll(() => {
  // Why: pin Unicode glyphs so output matches on every platform.
  process.env.TERM = 'xterm-256color'
  process.env.WT_SESSION = 'test'
})

afterAll(() => {
  process.env.TERM = savedEnv.TERM
  process.env.WT_SESSION = savedEnv.WT_SESSION
})

beforeEach(() => setCliStyleEnabled(true))
afterEach(() => setCliStyleEnabled(null))

function plain(text: string): string {
  expect(text).toContain('\u001b[')
  return stripStyle(text)
}

describe('styled CLI output', () => {
  it('renders status as a headline with aligned details', () => {
    const status = {
      app: { running: true, pid: 42, desktopWindowStatus: 'available' },
      runtime: { state: 'ready', reachable: true, runtimeId: 'rt-1' },
      graph: { state: 'ready' }
    } as CliStatusResult
    expect(plain(formatCliStatus(status))).toBe(
      [
        '✓ Muster is running',
        '  pid         42',
        '  window      available',
        '  runtime     ready',
        '  runtime id  rt-1',
        '  projects    ready'
      ].join('\n')
    )
  })

  it('renders an opened path', () => {
    expect(
      plain(
        formatWorkspaceOpenPath({
          outcome: 'imported',
          kind: 'folder',
          repo: { id: 'r1', displayName: 'site', path: '/work/site' },
          worktree: { id: 'r1::/work/site', displayName: 'site', path: '/work/site' }
        })
      )
    ).toBe(['✓ Added and opened site', '  path  /work/site', '  type  folder project'].join('\n'))
  })

  it('renders repo, worktree and project lists as tables', () => {
    expect(
      plain(
        formatRepoList({
          repos: [
            { id: 'r1', displayName: 'muster-ui', path: '/work/muster-ui', kind: 'git' },
            { id: 'r2', displayName: 'notes', path: '/work/notes', kind: 'folder' }
          ]
        } as never)
      )
    ).toBe(
      [
        'NAME       TYPE    PATH',
        'muster-ui  git     /work/muster-ui',
        'notes      folder  /work/notes'
      ].join('\n')
    )
    expect(
      plain(
        formatWorktreeList({
          worktrees: [{ id: 'w1', displayName: 'cli', branch: 'feature/cli', path: '/work/cli' }],
          totalCount: 3,
          truncated: true
        } as never)
      )
    ).toBe(
      ['NAME  BRANCH       PATH', 'cli   feature/cli  /work/cli', 'Showing 1 of 3.'].join('\n')
    )
    expect(
      plain(
        formatProjectList({
          projects: [
            {
              id: 'p1',
              displayName: 'muster',
              providerIdentity: { provider: 'github', owner: 'efront', repo: 'muster' }
            }
          ]
        } as never)
      )
    ).toBe(['NAME    PROVIDER       ID', 'muster  efront/muster  p1'].join('\n'))
  })

  it('shows live and idle state as glyphs', () => {
    expect(
      plain(
        formatWorktreePs({
          worktrees: [
            { repo: 'site', branch: 'main', liveTerminalCount: 2, unread: true, path: '/a' },
            { repo: 'site', branch: 'dev', liveTerminalCount: 0, unread: false, path: '/b' }
          ],
          totalCount: 2,
          truncated: false
        } as never)
      )
    ).toBe(
      [
        '   REPO  BRANCH       TERMINALS  PATH',
        '●  site  main unread  2          /a',
        '○  site  dev          0          /b'
      ].join('\n')
    )
    const terminals = {
      terminals: [{ handle: 'term_1', title: null, connected: true, worktreePath: '/a' }],
      totalCount: 1,
      truncated: false
    } as unknown as RuntimeTerminalListResult
    expect(plain(formatTerminalList(terminals))).toBe(
      ['   HANDLE  TITLE       WORKTREE', '●  term_1  (untitled)  /a'].join('\n')
    )
    const automations = [
      { name: 'nightly', agentId: 'codex', enabled: false, rrule: 'FREQ=DAILY', nextRunAt: 0 }
    ] as unknown as Automation[]
    expect(plain(formatAutomationList({ automations }))).toMatch(/^○ {2}nightly {2}codex/m)
  })

  it('prints errors with a failure mark and next steps', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stderr = process.stderr as { isTTY?: boolean }
    reportCliError(
      new RuntimeClientError('invalid_argument', 'Unknown command: stauts', {
        nextSteps: ['muster status']
      }),
      false
    )
    expect(stripStyle(String(errorSpy.mock.calls[0]?.[0]))).toBe(
      ['✗ Unknown command: stauts', '  › muster status'].join('\n')
    )
    expect(stderr).toBeDefined()
    errorSpy.mockRestore()
  })

  it('colours help without changing its text', () => {
    const help = formatCommandHelp({
      path: ['open'],
      summary: 'Launch Muster, or open a folder as a project',
      usage: 'muster open [path] [--json]',
      allowedFlags: ['json'],
      examples: ['muster .']
    })
    expect(plain(styleHelpText(help))).toBe(help)
  })

  it('leaves help untouched when styling is off', () => {
    setCliStyleEnabled(false)
    expect(styleHelpText('muster\n\nUsage: muster <command>')).toBe(
      'muster\n\nUsage: muster <command>'
    )
  })
})
