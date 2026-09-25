// Feature floors for the agent-local daemon, read from `/status.version` once per run.

export const AGENT_LOCAL_IMPORT_ROUTES_MIN_VERSION = '0.32.2'

/** `[major, minor, patch]`; anything unparseable is `[0, 0, 0]`, which fails every gate. */
export function parseAgentLocalVersion(version: string): [number, number, number] {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  if (!match) {
    return [0, 0, 0]
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function agentLocalVersionAtLeast(version: string, minimum: string): boolean {
  // A source build without git metadata; the integration contract says to assume every feature.
  if (version.trim() === 'dev') {
    return true
  }
  const have = parseAgentLocalVersion(version)
  const want = parseAgentLocalVersion(minimum)
  for (let index = 0; index < 3; index += 1) {
    if (have[index] !== want[index]) {
      return (have[index] ?? 0) > (want[index] ?? 0)
    }
  }
  return true
}
