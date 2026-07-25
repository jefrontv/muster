// One connect, one layout resolve, one guaranteed close — the resource boundary every remote site
// tool shares.
//
// ocsites opened a fresh paramiko client inside each of its fifteen tool implementations and closed
// it in a `finally` copied fifteen times. Every tool here borrows a session from this instead, so a
// tool body contains only its own logic and a cancelled tool can never leak a connection.

import type { RemoteLayout, SiteRunConfig, SiteSshSession } from './pipeline-contract'
import { resolveRemoteLayout } from './remote-wordpress-layout'
import { createSiteSshSession } from './site-ssh-session'

export type RemoteSiteTool = {
  session: SiteSshSession
  /** Resolved once per tool call: a Bedrock site's webroot is not its configured root path. */
  layout: RemoteLayout
}

/** Injected so tests drive a fake session without sockets; production always uses the real one. */
export type SiteToolSessionOpener = (
  config: SiteRunConfig,
  signal: AbortSignal
) => Promise<SiteSshSession>

export async function withRemoteSiteTool<T>(
  config: SiteRunConfig,
  signal: AbortSignal,
  run: (tool: RemoteSiteTool) => Promise<T>,
  openSession: SiteToolSessionOpener = createSiteSshSession
): Promise<T> {
  const session = await openSession(config, signal)
  try {
    const layout = await resolveRemoteLayout(session, config.environment.rootPath)
    return await run({ session, layout })
  } finally {
    // Best effort: a failing close must not mask the tool's own error.
    await session.close().catch(() => undefined)
  }
}
