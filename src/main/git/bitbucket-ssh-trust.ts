import { nonInteractiveGitEnv } from './runner'

// scp-style (`git@host:w/r`) or ssh:// URL on either Bitbucket SSH host.
const BITBUCKET_SSH_URL = /^(?:ssh:\/\/)?(?:[^@/\s]+@)?(?:ssh\.)?bitbucket\.org(?=[:/])/i

export function isBitbucketSshUrl(url: string): boolean {
  return BITBUCKET_SSH_URL.test(url.trim())
}

/**
 * Non-interactive git env for a network call to `url`. Bitbucket moved SSH to ssh.bitbucket.org
 * (12 Nov 2026), which most known_hosts lack, and BatchMode can't answer the first-connect prompt;
 * accept-new records an unseen host key but still refuses a changed one.
 */
export function remoteGitEnv(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  const next = nonInteractiveGitEnv(env, platform)
  // A caller-set GIT_SSH_COMMAND is user policy; only extend the one we supplied.
  if (!env.GIT_SSH_COMMAND && isBitbucketSshUrl(url)) {
    next.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new'
  }
  return next
}
