// Port choice and readiness for the bots server.
import { createServer } from 'node:net'

// Why stable ports: the Bots UI keeps local state per origin (theme, drafts), and the origin
// includes the port. These sit away from upstream OpenMausBot's 8799 so both apps can run.
const PREFERRED_PORTS = [18899, 28899, 38899] as const
const READY_TIMEOUT_MS = 45_000
const POLL_MS = 250

function tryListen(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(null))
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      const bound = typeof address === 'object' && address ? address.port : null
      server.close(() => resolve(bound))
    })
  })
}

export async function pickBotsPort(): Promise<number> {
  for (const port of PREFERRED_PORTS) {
    if ((await tryListen(port)) !== null) {
      return port
    }
  }
  const any = await tryListen(0)
  if (any === null) {
    throw new Error('No free local port for the bots server.')
  }
  return any
}

/** Resolves once the server on `port` answers as our own child, so a stray server on the port never counts. */
export async function waitForBotsServer(
  port: number,
  pid: () => number | undefined,
  timeoutMs = READY_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(2_000)
      })
      const health = (await response.json()) as { app?: unknown; pid?: unknown }
      if (health.app === 'openmausbot' && health.pid === pid()) {
        return
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
  throw new Error('The bots server did not start within 45 seconds.')
}
