// In-memory LocalWpFileOperations for the LocalWP migration tests: a `null` value marks a
// directory, a string marks a file's contents. Shared so the app/public tests and the migration
// tests assert against the same fake tree semantics.

import type { LocalWpFileOperations } from './localwp-app-public'

export type FakeFileTree = {
  operations: LocalWpFileOperations
  entries: Map<string, string | null>
}

export function fakeFileOperations(seed: Record<string, string | null>): FakeFileTree {
  const entries = new Map<string, string | null>(Object.entries(seed))
  const subtree = (root: string): string[] =>
    [...entries.keys()].filter((key) => key === root || key.startsWith(`${root}/`))
  const operations: LocalWpFileOperations = {
    listDirectory: async (dirPath) => {
      const prefix = `${dirPath}/`
      const children = new Set<string>()
      for (const key of entries.keys()) {
        if (key.startsWith(prefix)) {
          children.add(key.slice(prefix.length).split('/')[0] ?? '')
        }
      }
      return [...children].filter((name) => name.length > 0)
    },
    pathExists: async (filePath) => entries.has(filePath) || subtree(filePath).length > 0,
    move: async (from, to) => {
      for (const key of subtree(from)) {
        const value = entries.get(key)
        entries.delete(key)
        entries.set(`${to}${key.slice(from.length)}`, value ?? null)
      }
    },
    removeRecursive: async (target) => {
      for (const key of subtree(target)) {
        entries.delete(key)
      }
    },
    readTextFile: async (filePath) => {
      const value = entries.get(filePath)
      if (typeof value !== 'string') {
        throw new Error(`ENOENT: ${filePath}`)
      }
      return value
    },
    writeTextFile: async (filePath, contents) => {
      entries.set(filePath, contents)
    },
    makeDirectory: async (dirPath) => {
      if (!entries.has(dirPath)) {
        entries.set(dirPath, null)
      }
    }
  }
  return { operations, entries }
}
