import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TASK_SOURCE,
  DEFAULT_VISIBLE_TASK_PROVIDERS,
  filterAvailableTaskProviders,
  normalizeTaskProviderSettings,
  normalizeVisibleTaskProviders,
  restoreAvailableDefaultTaskProvider,
  resolveVisibleTaskProvider
} from './task-providers'

describe('task providers', () => {
  it('normalizes provider lists while preserving supported order', () => {
    expect(normalizeVisibleTaskProviders(['gitlab', 'unknown', 'gitlab', 'linear'])).toEqual([
      'gitlab',
      'linear'
    ])
  })

  it('ships ActiveCollab as the only provider a fresh profile sees', () => {
    expect(DEFAULT_TASK_SOURCE).toBe('activecollab')
    expect(DEFAULT_VISIBLE_TASK_PROVIDERS).toEqual(['activecollab'])
  })

  it('falls back to the fork default rather than every provider when none are visible', () => {
    expect(normalizeVisibleTaskProviders([])).toEqual(['activecollab'])
    expect(normalizeVisibleTaskProviders(['nope'])).toEqual(['activecollab'])
    expect(normalizeVisibleTaskProviders(undefined)).toEqual(['activecollab'])
  })

  it('never resolves a source from an empty visible list', () => {
    expect(resolveVisibleTaskProvider(null, [])).toBe('activecollab')
    expect(resolveVisibleTaskProvider('github', [])).toBe('activecollab')
  })

  it('keeps a re-enabled provider visible beside ActiveCollab', () => {
    expect(
      normalizeTaskProviderSettings({
        visibleTaskProviders: ['activecollab', 'github'],
        defaultTaskSource: 'activecollab'
      })
    ).toEqual({
      defaultTaskSource: 'activecollab',
      visibleTaskProviders: ['activecollab', 'github']
    })
    expect(
      restoreAvailableDefaultTaskProvider(
        ['activecollab', 'github'],
        { gitlabInstalled: false, linearConnected: false },
        'activecollab'
      )
    ).toEqual(['activecollab', 'github'])
  })

  it('narrows to ActiveCollab alone once GitHub is hidden again', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        ['activecollab'],
        { gitlabInstalled: false, linearConnected: false },
        'activecollab'
      )
    ).toEqual(['activecollab'])
  })

  it('re-adds an unhidden saved default, which is why the fork default is not github', () => {
    // Locks the reason DEFAULT_TASK_SOURCE exists: GitHub always reports available, so any surface
    // that falls back to 'github' before settings hydrate puts GitHub back into an
    // ActiveCollab-only switcher for that render.
    expect(
      restoreAvailableDefaultTaskProvider(
        ['activecollab'],
        { gitlabInstalled: false, linearConnected: false },
        'github'
      )
    ).toEqual(['github', 'activecollab'])
    expect(
      restoreAvailableDefaultTaskProvider(
        ['activecollab'],
        { gitlabInstalled: false, linearConnected: false },
        DEFAULT_TASK_SOURCE
      )
    ).toEqual(['activecollab'])
  })

  it('restores a valid saved default when provider settings drifted', () => {
    expect(
      normalizeTaskProviderSettings({
        visibleTaskProviders: ['linear'],
        defaultTaskSource: 'github'
      })
    ).toEqual({
      defaultTaskSource: 'github',
      visibleTaskProviders: ['github', 'linear']
    })
  })

  it('normalizes invalid saved defaults to the first visible provider', () => {
    expect(
      normalizeTaskProviderSettings({
        visibleTaskProviders: ['gitlab'],
        defaultTaskSource: 'bitbucket'
      })
    ).toEqual({
      defaultTaskSource: 'gitlab',
      visibleTaskProviders: ['gitlab']
    })
  })

  it('resolves hidden preferred providers to the first visible provider', () => {
    expect(resolveVisibleTaskProvider('github', ['linear'])).toBe('linear')
  })

  it('filters runtime-unavailable providers without changing preference normalization', () => {
    expect(
      filterAvailableTaskProviders(['github', 'gitlab', 'linear'], {
        gitlabInstalled: false,
        linearConnected: true
      })
    ).toEqual(['github', 'linear'])
  })

  it('keeps an available saved default visible when provider visibility drifted', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        ['linear'],
        {
          gitlabInstalled: false,
          linearConnected: true
        },
        'github'
      )
    ).toEqual(['github', 'linear'])
  })

  it('preserves intentionally narrowed providers when the saved default matches them', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        ['linear'],
        {
          gitlabInstalled: false,
          linearConnected: true
        },
        'linear'
      )
    ).toEqual(['linear'])
  })

  it('does not restore an unavailable saved default', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        ['linear'],
        {
          gitlabInstalled: false,
          linearConnected: true
        },
        'gitlab'
      )
    ).toEqual(['linear'])
  })

  it('ignores invalid saved defaults while restoring visible providers', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        ['gitlab'],
        {
          gitlabInstalled: false,
          linearConnected: true
        },
        'bitbucket'
      )
    ).toEqual(['activecollab'])
  })

  it('falls back to ActiveCollab when every preferred provider is unavailable', () => {
    expect(
      filterAvailableTaskProviders(['gitlab', 'linear'], {
        gitlabInstalled: false,
        linearConnected: false
      })
    ).toEqual(['activecollab'])
  })
})
