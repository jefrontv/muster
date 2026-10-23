import { createAgentLocalHost, type AgentLocalHost } from './agent-local-host'

const SUFFIX_SHAPE = /^\.[a-z0-9-]+(\.[a-z0-9-]+)*$/

/** The suffix agent-local gives new sites (`agent-local suffix`); null when the daemon cannot say. */
export async function readAgentLocalSuffix(
  host: AgentLocalHost = createAgentLocalHost()
): Promise<string | null> {
  const response = await host.request('GET', '/suffix')
  const raw = (response.data as { suffix?: unknown } | undefined)?.suffix
  const suffix = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return response.ok && SUFFIX_SHAPE.test(suffix) ? suffix : null
}
