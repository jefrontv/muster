import type { SettingsNavTarget } from '@/lib/settings-navigation-types'

export type SettingsNavigationTarget = {
  pane: SettingsNavTarget
  repoId: string | null
  sectionId?: string
}

/** Section ids are pane ids except for per-project rows, which encode the repo id. */
export function getSettingsTargetFromSectionId(sectionId: string): SettingsNavigationTarget {
  if (sectionId.startsWith('repo-')) {
    return { pane: 'repo', repoId: sectionId.slice('repo-'.length) }
  }
  return { pane: sectionId as SettingsNavTarget, repoId: null }
}
