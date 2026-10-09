import { describe, expect, it } from 'vitest'
import {
  NO_PUBLISH_REMOTE_MESSAGE,
  PUBLISH_REMOTE_CHOICE_REQUIRED_MESSAGE,
  resolveDefaultPublishDestination,
  resolvePublishRemoteFromList,
  resolvePublishRemoteWithGit
} from './git-publish-remote'

function remotes(stdout: string) {
  return async (args: string[]) => {
    expect(args).toEqual(['remote'])
    return { stdout }
  }
}

describe('resolvePublishRemoteFromList', () => {
  it('uses the only remote, whatever its name', () => {
    expect(resolvePublishRemoteFromList(['upstream'])).toEqual({ remote: 'upstream' })
  })

  it('prefers origin when there are several remotes', () => {
    expect(resolvePublishRemoteFromList(['fork', 'origin', 'upstream'])).toEqual({
      remote: 'origin'
    })
  })

  it('asks for a choice when several remotes have no origin', () => {
    expect(resolvePublishRemoteFromList(['fork', 'upstream'])).toEqual({
      needsChoice: true,
      remotes: ['fork', 'upstream']
    })
  })
})

describe('resolvePublishRemoteWithGit', () => {
  it('keeps a configured push remote without listing remotes', async () => {
    const result = await resolvePublishRemoteWithGit(async () => {
      throw new Error('should not list remotes')
    }, 'fork')
    expect(result).toEqual({ remote: 'fork' })
  })

  it('falls back to the remote list', async () => {
    expect(await resolvePublishRemoteWithGit(remotes('fork\nupstream\n'), null)).toEqual({
      needsChoice: true,
      remotes: ['fork', 'upstream']
    })
  })
})

describe('resolveDefaultPublishDestination', () => {
  it('pushes HEAD to the picked remote', async () => {
    expect(await resolveDefaultPublishDestination(remotes('upstream\n'))).toEqual([
      'upstream',
      'HEAD'
    ])
  })

  it('refuses to guess between several remotes', async () => {
    await expect(resolveDefaultPublishDestination(remotes('a\nb\n'))).rejects.toThrow(
      PUBLISH_REMOTE_CHOICE_REQUIRED_MESSAGE
    )
  })

  it('explains when there is no remote at all', async () => {
    await expect(resolveDefaultPublishDestination(remotes(''))).rejects.toThrow(
      NO_PUBLISH_REMOTE_MESSAGE
    )
  })
})
