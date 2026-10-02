// Where the ActiveCollab MCP server lives on this machine: the home directory its credential file
// hangs off, the PATH its binary is searched on, and the fs, all redirectable by tests.
//
// Agent configs are not written from here: the Extension Hub owns those (extensions/
// mcp-entry-adapters.ts), so there is one writer per config file.

import { homedir } from 'node:os'
import { delimiter } from 'node:path'
import { createNodeActiveCollabMcpFs, type ActiveCollabMcpFs } from './mcp-config-io'

export const ACTIVECOLLAB_MCP_BINARY_NAME = 'activecollab-mcp'

export type ActiveCollabMcpEnv = {
  homeDir: string
  /** Already split, in search order. */
  pathEntries: readonly string[]
  /** Platform-appropriate basenames for the pipx console script. */
  executableNames: readonly string[]
  fs: ActiveCollabMcpFs
}

export function createDefaultActiveCollabMcpEnv(): ActiveCollabMcpEnv {
  return {
    homeDir: homedir(),
    pathEntries: (process.env.PATH ?? '').split(delimiter).filter((entry) => entry.length > 0),
    executableNames:
      process.platform === 'win32'
        ? [
            `${ACTIVECOLLAB_MCP_BINARY_NAME}.exe`,
            `${ACTIVECOLLAB_MCP_BINARY_NAME}.cmd`,
            ACTIVECOLLAB_MCP_BINARY_NAME
          ]
        : [ACTIVECOLLAB_MCP_BINARY_NAME],
    fs: createNodeActiveCollabMcpFs()
  }
}
