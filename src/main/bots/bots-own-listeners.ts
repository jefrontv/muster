// Muster's own loopback listeners (agent hooks, chat connector, site bridge...). The bots server's
// browser egress gate refuses these ports, so a bot's browser can never call into Muster itself.
// Imported early in main so listeners opened at startup are seen.
import { subscribe } from 'node:diagnostics_channel'

type PortSink = (ports: number[]) => void

const ownPorts = new Set<number>()
let sink: PortSink | null = null

subscribe('tracing:net.server.listen:asyncEnd', (message) => {
  const address = (message as { server?: { address?: () => unknown } }).server?.address?.()
  if (!address || typeof address !== 'object' || !('port' in address)) {
    return
  }
  const port = (address as { port: unknown }).port
  if (typeof port !== 'number' || ownPorts.has(port)) {
    return
  }
  ownPorts.add(port)
  sink?.([...ownPorts])
})

/** Sends the current list now and again whenever Muster opens another listener; null detaches. */
export function reportBotsOwnListeners(next: PortSink | null): void {
  sink = next
  sink?.([...ownPorts])
}
