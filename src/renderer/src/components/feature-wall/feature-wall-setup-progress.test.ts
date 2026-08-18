import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FeatureWallSetupProgressInput } from './feature-wall-setup-progress'
import { getFeatureWallSetupProgress } from './feature-wall-setup-progress'
import {
  getFeatureWallSetupSteps,
  getFeatureWallSetupStepsForSection,
  getFirstIncompleteFeatureWallSetupStepId
} from '../../../../shared/feature-wall-setup-steps'
import type { Worktree } from '../../../../shared/types'

function makeInput(
  overrides: Partial<FeatureWallSetupProgressInput> = {}
): FeatureWallSetupProgressInput {
  return {
    settings: null,
    featureInteractions: {},
    hasConnectedTaskSource: false,
    gitRepoCount: 0,
    worktreesByRepo: {},
    hasSetupScript: false,
    ...overrides
  }
}

function makeWorktree(
  id: string,
  options: { createdAt?: number; isMainWorktree?: boolean; path?: string | null } = {}
): Worktree {
  return {
    id,
    path: options.path === null ? undefined : (options.path ?? `/repo/${id}`),
    createdAt: options.createdAt,
    isMainWorktree: options.isMainWorktree ?? false
  } as unknown as Worktree
}

describe('getFeatureWallSetupProgress', () => {
  it('tracks Add 2 projects from durable git repo count', () => {
    expect(getFeatureWallSetupProgress(makeInput({ gitRepoCount: 1 })).stepDone).toMatchObject({
      'add-two-repos': false
    })

    const progress = getFeatureWallSetupProgress(makeInput({ gitRepoCount: 2 }))

    expect(progress.stepDone['add-two-repos']).toBe(true)
    expect(progress.coreTotal).toBe(7)
  })

  it('preserves the durable setup step definition order', () => {
    expect(getFeatureWallSetupSteps().map((step) => step.id)).toEqual([
      'two-worktrees',
      'browser',
      'notifications',
      'default-agent',
      'task-sources',
      'setup-script',
      'add-two-repos'
    ])
  })

  it('groups setup guide steps into Parallel work and Setup sections', () => {
    expect(getFeatureWallSetupStepsForSection('parallel-work').map((step) => step.id)).toEqual([
      'two-worktrees',
      'browser'
    ])
    expect(getFeatureWallSetupStepsForSection('setup').map((step) => step.id)).toEqual([
      'notifications',
      'default-agent',
      'task-sources',
      'setup-script',
      'add-two-repos'
    ])
  })

  it('renders Setup before Milestones and numbers Milestones after Setup', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/renderer/src/components/feature-wall/FeatureWallSetupChecklist.tsx'),
      'utf8'
    )
    const setupSectionIndex = source.indexOf('steps={setupSteps}')
    const milestonesSectionIndex = source.indexOf('steps={parallelWorkSteps}')

    expect(setupSectionIndex).toBeGreaterThanOrEqual(0)
    expect(milestonesSectionIndex).toBeGreaterThan(setupSectionIndex)
    expect(source).toContain('startOrdinal={setupSteps.length + 1}')
  })

  it('auto-selects incomplete parallel work after setup steps are complete', () => {
    const progress = getFeatureWallSetupProgress(
      makeInput({
        settings: {
          defaultTuiAgent: 'claude',
          notifications: { enabled: true, agentTaskComplete: true }
        } as never,
        hasConnectedTaskSource: true,
        hasSetupScript: true,
        gitRepoCount: 2
      })
    )

    expect(getFirstIncompleteFeatureWallSetupStepId(progress.stepDone)).toBe('two-worktrees')
  })

  it('does not include the removed split-terminal step in active progress', () => {
    const progress = getFeatureWallSetupProgress(
      makeInput({
        featureInteractions: {
          'terminal-pane-split': { firstInteractedAt: 1_700_000_000_000, interactionCount: 1 }
        }
      })
    )

    expect(Object.hasOwn(progress.stepDone, 'split-terminal')).toBe(false)
    expect(progress.coreTotal).toBe(7)
  })

  it('marks all active steps complete without historical terminal split interaction', () => {
    const progress = getFeatureWallSetupProgress(
      makeInput({
        settings: {
          defaultTuiAgent: 'claude',
          notifications: { enabled: true, agentTaskComplete: true }
        } as never,
        featureInteractions: {
          browser: { firstInteractedAt: 1_700_000_000_000, interactionCount: 1 }
        },
        worktreesByRepo: {
          'repo-1': [makeWorktree('main', { isMainWorktree: true }), makeWorktree('worktree-1')]
        },
        hasConnectedTaskSource: true,
        hasSetupScript: true,
        gitRepoCount: 2
      })
    )

    expect(progress.coreDoneCount).toBe(7)
    expect(getFeatureWallSetupSteps('code').every((step) => progress.stepDone[step.id])).toBe(true)
  })

  it('defaults to the code checklist when no mode is given', () => {
    const progress = getFeatureWallSetupProgress(makeInput())

    expect(progress.mode).toBe('code')
    expect(progress.coreTotal).toBe(getFeatureWallSetupSteps('code').length)
  })

  it('counts the chat checklist when in chat mode', () => {
    const progress = getFeatureWallSetupProgress(
      makeInput({
        mode: 'chat',
        hasConnectedTaskSource: true,
        chatWorkspaceCount: 1,
        chatThreadCount: 0
      })
    )

    expect(progress.mode).toBe('chat')
    expect(progress.coreTotal).toBe(5)
    expect(progress.stepDone['task-sources']).toBe(true)
    expect(progress.stepDone['create-first-workspace']).toBe(true)
    expect(progress.stepDone['start-first-thread']).toBe(false)
    expect(progress.coreDoneCount).toBe(2)
  })

  it('ignores code-only steps when counting chat progress', () => {
    const progress = getFeatureWallSetupProgress(
      makeInput({
        mode: 'chat',
        // Code-only signals complete, chat signals absent.
        hasSetupScript: true,
        gitRepoCount: 2
      })
    )

    expect(progress.coreDoneCount).toBe(0)
  })

  it('completes the chat checklist from chat signals plus shared steps', () => {
    const progress = getFeatureWallSetupProgress(
      makeInput({
        mode: 'chat',
        settings: {
          defaultTuiAgent: 'claude',
          notifications: { enabled: true, agentTaskComplete: true }
        } as never,
        hasConnectedTaskSource: true,
        chatWorkspaceCount: 2,
        chatThreadCount: 3
      })
    )

    expect(progress.coreDoneCount).toBe(progress.coreTotal)
  })

  it('keeps the chat checklist definition order', () => {
    expect(getFeatureWallSetupSteps('chat').map((step) => step.id)).toEqual([
      'task-sources',
      'create-first-workspace',
      'start-first-thread',
      'notifications',
      'default-agent'
    ])
  })

  it('auto-selects the first incomplete chat step in chat mode', () => {
    const progress = getFeatureWallSetupProgress(
      makeInput({ mode: 'chat', hasConnectedTaskSource: true })
    )

    expect(getFirstIncompleteFeatureWallSetupStepId(progress.stepDone, 'chat')).toBe(
      'create-first-workspace'
    )
  })

  it('does not mark the step complete from the main checkout alone', () => {
    expect(
      getFeatureWallSetupProgress(
        makeInput({
          worktreesByRepo: { 'repo-1': [makeWorktree('main', { isMainWorktree: true })] }
        })
      ).stepDone['two-worktrees']
    ).toBe(false)
  })

  it('does not pre-complete the step when two repos contribute only main checkouts', () => {
    const progress = getFeatureWallSetupProgress(
      makeInput({
        worktreesByRepo: {
          'repo-1': [makeWorktree('main-1', { isMainWorktree: true })],
          'repo-2': [makeWorktree('main-2', { isMainWorktree: true })]
        }
      })
    )

    expect(progress.stepDone['two-worktrees']).toBe(false)
  })

  it('does not mark the step complete from an unconfirmed non-main worktree placeholder', () => {
    const progress = getFeatureWallSetupProgress(
      makeInput({
        worktreesByRepo: {
          'repo-1': [
            makeWorktree('main', { isMainWorktree: true }),
            makeWorktree('ssh-restored-placeholder', { path: null })
          ]
        }
      })
    )

    expect(progress.stepDone['two-worktrees']).toBe(false)
  })

  it('marks the step complete once a non-main worktree exists beyond the main checkout', () => {
    const progress = getFeatureWallSetupProgress(
      makeInput({
        worktreesByRepo: {
          'repo-1': [makeWorktree('main', { isMainWorktree: true }), makeWorktree('worktree-1')]
        }
      })
    )

    expect(progress.stepDone['two-worktrees']).toBe(true)
  })

  it('marks the browser step complete once a non-blank page has been viewed', () => {
    const progress = getFeatureWallSetupProgress(
      makeInput({
        featureInteractions: {
          browser: { firstInteractedAt: 1_700_000_000_000, interactionCount: 1 }
        }
      })
    )

    expect(progress.stepDone.browser).toBe(true)
  })

  it('does not mark the browser step complete without a viewed page', () => {
    expect(getFeatureWallSetupProgress(makeInput()).stepDone.browser).toBe(false)
  })

  it('marks Connect ActiveCollab complete when ActiveCollab is connected', () => {
    const progress = getFeatureWallSetupProgress(makeInput({ hasConnectedTaskSource: true }))

    expect(progress.stepDone['task-sources']).toBe(true)
  })

  it('does not mark Connect ActiveCollab complete while ActiveCollab is not connected', () => {
    const progress = getFeatureWallSetupProgress(makeInput({ hasConnectedTaskSource: false }))

    expect(progress.stepDone['task-sources']).toBe(false)
  })
})
