// Muster's per-thread MCP server, attached over the control protocol once the
// CLI answers its first control request. Not --mcp-config, and not before that
// answer: a dynamic server present during startup makes the CLI hold the first
// turn until the user's slower MCP servers connect (8-16s seen).
// Deliberately not strict: the user's own MCP servers keep loading.

/** Never block a send on an attach the CLI does not acknowledge. */
const ATTACH_ACK_TIMEOUT_MS = 10_000

export type MusterMcpAttach = {
  observe: (record: Record<string, unknown>) => void
  /** Resolves once the server is attached, failed, or no longer worth waiting for. */
  ready: Promise<void>
  dispose: () => void
}

export function musterMcpServersRequest(
  connector: { url: string; token: string },
  requestId: string
): Record<string, unknown> {
  return {
    type: 'control_request',
    request_id: requestId,
    request: {
      subtype: 'mcp_set_servers',
      servers: {
        muster: {
          type: 'http',
          url: connector.url,
          headers: { Authorization: `Bearer ${connector.token}` }
        }
      }
    }
  }
}

export function createMusterMcpAttach(args: {
  connector: { url: string; token: string } | null
  /** True when `initialize` is the child's first stdin line, so its answer comes before any turn. */
  initializeFirst: boolean
  nextRequestId: () => string
  write: (payload: unknown) => boolean
}): MusterMcpAttach {
  const { connector } = args
  let resolveReady = (): void => undefined
  const ready = new Promise<void>((resolve) => (resolveReady = resolve))
  // Without initialize, init only arrives after the first user message, so holding sends would deadlock.
  if (!connector || !args.initializeFirst) {
    resolveReady()
  }
  let requestId: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const settle = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    resolveReady()
  }
  const attach = (): void => {
    requestId = args.nextRequestId()
    if (!args.write(musterMcpServersRequest(connector!, requestId))) {
      settle()
      return
    }
    timer = setTimeout(settle, ATTACH_ACK_TIMEOUT_MS)
  }
  return {
    ready,
    observe: (record) => {
      if (!connector) {
        return
      }
      if (requestId === null) {
        const answered = args.initializeFirst
          ? record.type === 'control_response'
          : record.type === 'system' && record.subtype === 'init'
        if (answered) {
          attach()
        }
        return
      }
      const response = record.type === 'control_response' ? record.response : null
      if (
        typeof response === 'object' &&
        response !== null &&
        (response as Record<string, unknown>).request_id === requestId
      ) {
        settle()
      }
    },
    dispose: settle
  }
}
