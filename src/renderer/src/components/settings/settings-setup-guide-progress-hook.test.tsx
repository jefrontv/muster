import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeatureWallSetupProgress } from '../feature-wall/feature-wall-setup-progress'
import { useSettingsSetupGuideProgress } from './settings-setup-guide-progress'

const mocks = vi.hoisted(() => ({
  useSetupGuideProgress: vi.fn()
}))

vi.mock('../setup-guide/use-setup-guide-progress', () => ({
  useSetupGuideProgress: mocks.useSetupGuideProgress
}))

function makeProgress(): FeatureWallSetupProgress {
  return {
    ready: true,
    stepDone: {
      'default-agent': true,
      'add-two-repos': false,
      notifications: true,
      'two-worktrees': true,
      browser: false,
      'task-sources': true,
      'setup-script': false
    },
    coreDoneCount: 4,
    coreTotal: 8
  }
}

function SettingsProgressProbe(): React.JSX.Element {
  const progress = useSettingsSetupGuideProgress(true)
  return <span>{`${progress.doneCount}/${progress.total}`}</span>
}

describe('useSettingsSetupGuideProgress', () => {
  beforeEach(() => {
    mocks.useSetupGuideProgress.mockReset()
  })

  it('uses the same setup progress path as the main sidebar', () => {
    mocks.useSetupGuideProgress.mockReturnValue(makeProgress())

    expect(renderToStaticMarkup(<SettingsProgressProbe />)).toContain('4/7')
    expect(mocks.useSetupGuideProgress).toHaveBeenCalledWith(true)
  })

  it('uses legacy-aware completion returned by the shared setup progress path', () => {
    mocks.useSetupGuideProgress.mockReturnValue({
      ...makeProgress(),
      stepDone: {
        'default-agent': true,
        'add-two-repos': true,
        notifications: true,
        'two-worktrees': true,
        browser: true,
        'task-sources': true,
        'setup-script': true
      },
      coreDoneCount: 8
    })

    expect(renderToStaticMarkup(<SettingsProgressProbe />)).toContain('7/7')
  })

  it('shows browser incomplete after the browser migration has already run for fresh users', () => {
    mocks.useSetupGuideProgress.mockReturnValue({
      ...makeProgress(),
      stepDone: {
        'default-agent': true,
        'add-two-repos': true,
        notifications: true,
        'two-worktrees': true,
        browser: false,
        'task-sources': true,
        'setup-script': true
      },
      coreDoneCount: 6
    })

    expect(renderToStaticMarkup(<SettingsProgressProbe />)).toContain('6/7')
  })
})
