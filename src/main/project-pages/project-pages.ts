// The app's project pages store, kept in the active profile's folder because repo ids belong to a profile.
import { join } from 'node:path'
import {
  createProjectPagesAttachments,
  type ProjectPagesAttachments
} from './project-pages-attachments'
import { loadOrCreateProfileIndex } from '../orca-profiles/profile-index-store'
import {
  getOrcaProfileDirectory,
  getProfileUserDataPath
} from '../orca-profiles/profile-storage-paths'
import {
  createProjectPagesDatabases,
  type ProjectPagesDatabases
} from './project-pages-database-store'
import {
  createProjectPagesDiagrams,
  type ProjectPagesDiagrams
} from './project-pages-diagram-store'
import {
  createProjectPagesSearchIndex,
  type ProjectPagesSearchIndex
} from './project-pages-search-index'
import { createProjectPagesStore, type ProjectPagesStore } from './project-pages-store'
import { createProjectPagesComments, type ProjectPagesComments } from './project-pages-comments'

let rootDir: string | null = null
let store: ProjectPagesStore | null = null
let searchIndex: ProjectPagesSearchIndex | null = null
let databases: ProjectPagesDatabases | null = null
let attachments: ProjectPagesAttachments | null = null
let diagrams: ProjectPagesDiagrams | null = null
let comments: ProjectPagesComments | null = null

// Switching profiles relaunches the app, so the folder is resolved once.
function pagesRoot(): string {
  if (!rootDir) {
    const userData = getProfileUserDataPath()
    const profileId = loadOrCreateProfileIndex(userData).activeProfileId
    rootDir = join(getOrcaProfileDirectory(profileId, userData), 'project-pages')
  }
  return rootDir
}

export function projectPages(): ProjectPagesStore {
  store ??= createProjectPagesStore({ rootDir: pagesRoot() })
  return store
}

export function projectPagesComments(): ProjectPagesComments {
  comments ??= createProjectPagesComments({ rootDir: pagesRoot() })
  return comments
}

export function projectPagesSearch(): ProjectPagesSearchIndex {
  searchIndex ??= createProjectPagesSearchIndex(projectPages(), {
    diagramXml: (scopeKey, pageId) => projectPagesDiagrams().readDiagram(scopeKey, pageId).xml
  })
  return searchIndex
}

export function projectPagesDatabases(): ProjectPagesDatabases {
  databases ??= createProjectPagesDatabases({ rootDir: pagesRoot(), store: projectPages() })
  return databases
}

export function projectPagesDiagrams(): ProjectPagesDiagrams {
  diagrams ??= createProjectPagesDiagrams({ rootDir: pagesRoot(), store: projectPages() })
  return diagrams
}

export function projectPagesAttachments(): ProjectPagesAttachments {
  attachments ??= createProjectPagesAttachments({ rootDir: pagesRoot() })
  return attachments
}
