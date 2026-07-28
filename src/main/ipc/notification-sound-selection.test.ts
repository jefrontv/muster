import { describe, expect, it, vi } from 'vitest'

// Why: the module imports bundler `?asset` sound paths, which only resolve through electron-vite.
vi.mock('../../../resources/notification-sounds/beep.mp3?asset', () => ({ default: '/s/beep.mp3' }))
vi.mock('../../../resources/notification-sounds/blip.mp3?asset', () => ({ default: '/s/blip.mp3' }))
vi.mock('../../../resources/notification-sounds/blop.mp3?asset', () => ({ default: '/s/blop.mp3' }))
vi.mock('../../../resources/notification-sounds/bong.mp3?asset', () => ({ default: '/s/bong.mp3' }))
vi.mock('../../../resources/notification-sounds/clack.mp3?asset', () => ({
  default: '/s/clack.mp3'
}))
vi.mock('../../../resources/notification-sounds/ding.mp3?asset', () => ({ default: '/s/ding.mp3' }))
vi.mock('../../../resources/notification-sounds/sonar.mp3?asset', () => ({
  default: '/s/sonar.mp3'
}))
vi.mock('../../../resources/notification-sounds/thump.mp3?asset', () => ({
  default: '/s/thump.mp3'
}))
vi.mock('../../../resources/notification-sounds/two-tone.mp3?asset', () => ({
  default: '/s/two-tone.mp3'
}))

import { getDefaultNotificationSettings } from '../../shared/constants'
import type { NotificationSettings } from '../../shared/types'
import {
  getNotificationSoundScope,
  resolveNotificationSoundFile
} from './notification-sound-selection'

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return { ...getDefaultNotificationSettings(), ...overrides }
}

describe('notification sound scope', () => {
  it('ships inheriting the global sound rather than picking one behind the user', () => {
    expect(getDefaultNotificationSettings().activeCollabSoundId).toBe('global')
  })

  it('gives ActiveCollab the global sound while the override says global', () => {
    const current = settings({ customSoundId: 'sonar', activeCollabSoundId: 'global' })

    expect(getNotificationSoundScope(current, 'activecollab-comments')).toEqual({
      soundId: 'sonar',
      customPath: null
    })
  })

  it('lets ActiveCollab override the global sound without touching other sources', () => {
    const current = settings({ customSoundId: 'sonar', activeCollabSoundId: 'ding' })

    expect(getNotificationSoundScope(current, 'activecollab-due').soundId).toBe('ding')
    expect(getNotificationSoundScope(current, 'agent-task-complete').soundId).toBe('sonar')
    expect(getNotificationSoundScope(current).soundId).toBe('sonar')
  })

  it('keeps an explicit match distinguishable from inheriting the same sound', () => {
    const inherited = settings({ customSoundId: 'ding', activeCollabSoundId: 'global' })
    const explicit = settings({ customSoundId: 'ding', activeCollabSoundId: 'ding' })

    // Same audible result, different stored intent: changing the global only moves the inherited one.
    expect(getNotificationSoundScope(inherited, 'activecollab-due').soundId).toBe('ding')
    expect(getNotificationSoundScope(explicit, 'activecollab-due').soundId).toBe('ding')

    const movedGlobal = { customSoundId: 'blip' } as const
    expect(
      getNotificationSoundScope({ ...inherited, ...movedGlobal }, 'activecollab-due').soundId
    ).toBe('blip')
    expect(
      getNotificationSoundScope({ ...explicit, ...movedGlobal }, 'activecollab-due').soundId
    ).toBe('ding')
  })

  it('reads the ActiveCollab custom file, not the global one', () => {
    const current = settings({
      customSoundId: 'custom',
      customSoundPath: '/sounds/global.mp3',
      activeCollabSoundId: 'custom',
      activeCollabSoundPath: '/sounds/activecollab.mp3'
    })

    expect(resolveNotificationSoundFile(current, 'activecollab-assigned')).toEqual({
      ok: true,
      path: '/sounds/activecollab.mp3',
      mimeType: 'audio/mpeg'
    })
    expect(resolveNotificationSoundFile(current, 'agent-task-complete')).toEqual({
      ok: true,
      path: '/sounds/global.mp3',
      mimeType: 'audio/mpeg'
    })
  })

  it('resolves a built-in override to its bundled asset', () => {
    expect(
      resolveNotificationSoundFile(settings({ activeCollabSoundId: 'sonar' }), 'activecollab-due')
    ).toEqual({ ok: true, path: '/s/sonar.mp3', mimeType: 'audio/mpeg' })
  })

  it('reports no file for the system sound, so the OS alert is what plays', () => {
    expect(
      resolveNotificationSoundFile(
        settings({ activeCollabSoundId: 'system' }),
        'activecollab-updated'
      )
    ).toEqual({ ok: false, reason: 'missing-path' })
  })

  it('refuses a custom override with no file rather than resolving to silence', () => {
    expect(
      resolveNotificationSoundFile(
        settings({ activeCollabSoundId: 'custom', activeCollabSoundPath: null }),
        'activecollab-due'
      )
    ).toEqual({ ok: false, reason: 'missing-path' })
    expect(
      resolveNotificationSoundFile(
        settings({ activeCollabSoundId: 'custom', activeCollabSoundPath: 'relative/sound.mp3' }),
        'activecollab-due'
      )
    ).toEqual({ ok: false, reason: 'invalid-path' })
    expect(
      resolveNotificationSoundFile(
        settings({ activeCollabSoundId: 'custom', activeCollabSoundPath: '/sounds/notes.txt' }),
        'activecollab-due'
      )
    ).toEqual({ ok: false, reason: 'unsupported-type' })
  })

  it('falls back to the global sound for settings written before the override existed', () => {
    const legacy = { ...getDefaultNotificationSettings(), customSoundId: 'blop' } as Omit<
      NotificationSettings,
      'activeCollabSoundId' | 'activeCollabSoundPath'
    > as NotificationSettings

    expect(getNotificationSoundScope(legacy, 'activecollab-assigned').soundId).toBe('blop')
  })
})
