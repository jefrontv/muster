import { describe, expect, it } from 'vitest'
import {
  boundActiveCollabRepoIds,
  readActiveCollabRepoProject,
  setActiveCollabRepoProject
} from './activecollab-repo-project-binding'

describe('readActiveCollabRepoProject', () => {
  it('answers null when nothing is bound', () => {
    expect(readActiveCollabRepoProject(null, 'repo-1')).toBeNull()
  })

  it('answers null for a repo with no binding of its own', () => {
    const settings = { activeCollabRepoProjects: { 'repo-2': 42 } }
    expect(readActiveCollabRepoProject(settings, 'repo-1')).toBeNull()
  })

  it('reads the bound project', () => {
    const settings = { activeCollabRepoProjects: { 'repo-1': 42 } }
    expect(readActiveCollabRepoProject(settings, 'repo-1')).toBe(42)
  })

  it('answers null without a repo id, so no repo means no tasks', () => {
    const settings = { activeCollabRepoProjects: { 'repo-1': 42 } }
    expect(readActiveCollabRepoProject(settings, null)).toBeNull()
  })

  // Settings are persisted JSON an older build may have written, so a wrong type is a real case
  // and must not reach an API call as a project id.
  it.each([
    ['a string', '42'],
    ['zero', 0],
    ['a negative', -1],
    ['a fraction', 4.2],
    ['null', null]
  ])('refuses %s', (_label, value) => {
    const settings = { activeCollabRepoProjects: { 'repo-1': value as unknown as number } }
    expect(readActiveCollabRepoProject(settings, 'repo-1')).toBeNull()
  })
})

describe('setActiveCollabRepoProject', () => {
  it('binds a repo with nothing stored yet', () => {
    expect(setActiveCollabRepoProject(undefined, 'repo-1', 42)).toEqual({ 'repo-1': 42 })
  })

  it('leaves other repos alone', () => {
    const existing = { 'repo-2': 7 }
    expect(setActiveCollabRepoProject(existing, 'repo-1', 42)).toEqual({
      'repo-2': 7,
      'repo-1': 42
    })
  })

  it('replaces an existing binding', () => {
    expect(setActiveCollabRepoProject({ 'repo-1': 42 }, 'repo-1', 7)).toEqual({ 'repo-1': 7 })
  })

  it('clears rather than storing an empty binding', () => {
    expect(setActiveCollabRepoProject({ 'repo-1': 42, 'repo-2': 7 }, 'repo-1', null)).toEqual({
      'repo-2': 7
    })
  })

  it('does not mutate what it was given', () => {
    const existing = { 'repo-1': 42 }
    setActiveCollabRepoProject(existing, 'repo-1', null)
    expect(existing).toEqual({ 'repo-1': 42 })
  })
})

describe('boundActiveCollabRepoIds', () => {
  it('lists only repos with a real binding', () => {
    const settings = {
      activeCollabRepoProjects: {
        'repo-1': 42,
        'repo-2': undefined as unknown as number
      }
    }
    expect(boundActiveCollabRepoIds(settings)).toEqual(['repo-1'])
  })

  it('answers an empty list when nothing is bound', () => {
    expect(boundActiveCollabRepoIds(null)).toEqual([])
  })
})
