// The app's project pages store, kept in the active profile's folder because repo ids belong to a profile.
import { join } from 'node:path'
import { loadOrCreateProfileIndex } from '../orca-profiles/profile-index-store'
import {
  getOrcaProfileDirectory,
  getProfileUserDataPath
} from '../orca-profiles/profile-storage-paths'
import { createProjectPagesStore, type ProjectPagesStore } from './project-pages-store'

let store: ProjectPagesStore | null = null

// Switching profiles relaunches the app, so the folder is resolved once.
export function projectPages(): ProjectPagesStore {
  if (!store) {
    const userData = getProfileUserDataPath()
    const profileId = loadOrCreateProfileIndex(userData).activeProfileId
    store = createProjectPagesStore({
      rootDir: join(getOrcaProfileDirectory(profileId, userData), 'project-pages')
    })
  }
  return store
}
