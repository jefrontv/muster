// Which sound file a notification should play, given the settings and which source fired it.
//
// Split out of notifications.ts because there are now two scopes, not one: the global picker and
// the ActiveCollab override. Keeping the resolution pure and in one place means the dispatcher, the
// `resolveSoundPath` handler and the `loadSound` handler cannot disagree about what is playing.

import { extname, isAbsolute, normalize } from 'node:path'
import beepSoundPath from '../../../resources/notification-sounds/beep.mp3?asset'
import blipSoundPath from '../../../resources/notification-sounds/blip.mp3?asset'
import blopSoundPath from '../../../resources/notification-sounds/blop.mp3?asset'
import bongSoundPath from '../../../resources/notification-sounds/bong.mp3?asset'
import clackSoundPath from '../../../resources/notification-sounds/clack.mp3?asset'
import dingSoundPath from '../../../resources/notification-sounds/ding.mp3?asset'
import sonarSoundPath from '../../../resources/notification-sounds/sonar.mp3?asset'
import thumpSoundPath from '../../../resources/notification-sounds/thump.mp3?asset'
import twoToneSoundPath from '../../../resources/notification-sounds/two-tone.mp3?asset'
import type {
  NotificationEventSource,
  NotificationSettings,
  NotificationSoundId
} from '../../shared/types'

export const NOTIFICATION_SOUND_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac'
}

const BUILT_IN_NOTIFICATION_SOUNDS: Readonly<Partial<Record<NotificationSoundId, string>>> = {
  'two-tone': twoToneSoundPath,
  bong: bongSoundPath,
  thump: thumpSoundPath,
  blip: blipSoundPath,
  sonar: sonarSoundPath,
  blop: blopSoundPath,
  ding: dingSoundPath,
  clack: clackSoundPath,
  beep: beepSoundPath
}

export type NotificationSoundScope = {
  soundId: NotificationSoundId
  customPath: string | null
}

/**
 * The scope a source draws its sound from. ActiveCollab has its own picker whose default,
 * `'global'`, means "whatever the global picker says" — so an inherited sound and a deliberately
 * matching one behave identically, and neither can silently resolve to nothing.
 */
export function getNotificationSoundScope(
  settings: NotificationSettings,
  source?: NotificationEventSource
): NotificationSoundScope {
  const globalScope: NotificationSoundScope = {
    // Why: pre-`customSoundId` settings only recorded a path, so a path with no id means 'custom'.
    soundId: settings.customSoundId ?? (settings.customSoundPath ? 'custom' : 'system'),
    customPath: settings.customSoundPath
  }
  if (source?.startsWith('activecollab-') !== true) {
    return globalScope
  }
  const override = settings.activeCollabSoundId
  if (override === undefined || override === 'global') {
    return globalScope
  }
  return { soundId: override, customPath: settings.activeCollabSoundPath ?? null }
}

/**
 * The file to play, or why there is none. `'system'` resolves to no file on purpose: the OS plays
 * its own alert, so silence here is the OS being audible rather than Muster being mute.
 */
export function getSelectedNotificationSoundPath(
  settings: NotificationSettings,
  source?: NotificationEventSource
): { path: string | null; reason?: 'missing-path' | 'invalid-path' } {
  const scope = getNotificationSoundScope(settings, source)
  if (scope.soundId === 'system') {
    return { path: null, reason: 'missing-path' }
  }
  if (scope.soundId !== 'custom') {
    const builtInPath = BUILT_IN_NOTIFICATION_SOUNDS[scope.soundId]
    return builtInPath ? { path: builtInPath } : { path: null, reason: 'missing-path' }
  }
  if (!scope.customPath) {
    return { path: null, reason: 'missing-path' }
  }
  const normalizedPath = normalize(scope.customPath)
  if (!isAbsolute(normalizedPath)) {
    return { path: null, reason: 'invalid-path' }
  }
  return { path: normalizedPath }
}

/** The resolved file plus its MIME type, or the reason the renderer cannot play anything. */
export function resolveNotificationSoundFile(
  settings: NotificationSettings,
  source?: NotificationEventSource
):
  | { ok: true; path: string; mimeType: string }
  | { ok: false; reason: 'missing-path' | 'invalid-path' | 'unsupported-type' } {
  const selectedSound = getSelectedNotificationSoundPath(settings, source)
  if (!selectedSound.path) {
    return { ok: false, reason: selectedSound.reason ?? 'missing-path' }
  }
  const normalizedPath = normalize(selectedSound.path)
  const mimeType = NOTIFICATION_SOUND_MIME_BY_EXTENSION[extname(normalizedPath).toLowerCase()]
  if (!mimeType) {
    return { ok: false, reason: 'unsupported-type' }
  }
  return { ok: true, path: normalizedPath, mimeType }
}
