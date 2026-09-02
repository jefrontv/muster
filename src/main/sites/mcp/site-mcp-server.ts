// The MCP stdio server: `initialize`, `tools/list`, `tools/call`, `ping`.
//
// Transport is newline-delimited JSON-RPC over a byte stream (site-mcp-jsonrpc.ts owns the
// framing); this module owns only the method semantics. It never touches process.stdin or
// process.stdout — the caller supplies a writer — so the whole protocol is testable as a
// string-in/string-out function.
//
// Frames are handled strictly in arrival order via a promise chain. MCP permits out-of-order
// responses, but serialising costs nothing here and makes both the log and the tests readable.

import type { SiteMcpContext } from './site-mcp-context'
import {
  createLineReader,
  encodeJsonRpcFrame,
  errorResponse,
  isPlainJsonObject,
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_METHOD_NOT_FOUND,
  parseJsonRpcFrame,
  successResponse,
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcResponse
} from './site-mcp-jsonrpc'
import {
  dispatchSiteMcpTool,
  findSiteMcpTool,
  listSiteMcpToolDescriptors,
  SITE_MCP_SERVER_NAME
} from './site-mcp-tools'

export const SITE_MCP_DEFAULT_PROTOCOL_VERSION = '2024-11-05'

/** Versions whose tools surface is identical to ours; anything else negotiates down to the default. */
const KNOWN_PROTOCOL_VERSIONS: readonly string[] = ['2024-11-05', '2025-03-26', '2025-06-18']

export type SiteMcpServerOptions = {
  context: SiteMcpContext
  /** Receives one complete frame, newline included. */
  write: (frame: string) => void
  version?: string
}

export type SiteMcpServer = {
  /** Feed raw stdin. Frames are parsed and answered in order. */
  push: (chunk: string) => void
  /** Flush a trailing partial line at end-of-stream. */
  end: () => void
  /** Resolves once every frame received so far has been answered. */
  drain: () => Promise<void>
}

/** True only for a `tools/call` naming a tool that declared itself safe to run off the chain. */
function isConcurrentToolCall(request: JsonRpcRequest): boolean {
  if (request.method !== 'tools/call') {
    return false
  }
  const name = (request.params ?? {}).name
  return typeof name === 'string' && findSiteMcpTool(name)?.concurrent === true
}

async function handleRequest(
  context: SiteMcpContext,
  request: JsonRpcRequest,
  version: string
): Promise<JsonRpcResponse | null> {
  const id: JsonRpcId = request.id ?? null
  // A notification carries no id and must never be answered, even to reject it.
  const isNotification = !('id' in request)
  const params = request.params ?? {}

  switch (request.method) {
    case 'initialize': {
      const requested = params.protocolVersion
      const negotiated =
        typeof requested === 'string' && KNOWN_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : SITE_MCP_DEFAULT_PROTOCOL_VERSION
      return successResponse(id, {
        protocolVersion: negotiated,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SITE_MCP_SERVER_NAME, version },
        instructions:
          'WordPress site import/deploy for the checkout you are working in. Omit `site` to target the current directory. Call preview_run before run_import_functions or run_deploy_functions; a deploy off a branch that matches no environment is refused unless you pass env= or confirm=true. Passwords are never returned and cannot be set here.'
      })
    }
    case 'ping':
      return successResponse(id, {})
    case 'tools/list':
      return successResponse(id, { tools: listSiteMcpToolDescriptors() })
    case 'tools/call': {
      const name = params.name
      if (typeof name !== 'string' || name.length === 0) {
        return errorResponse(id, JSON_RPC_INVALID_PARAMS, 'tools/call requires a tool name.')
      }
      const tool = findSiteMcpTool(name)
      if (!tool) {
        return errorResponse(id, JSON_RPC_INVALID_PARAMS, `Unknown tool: ${name}`, {
          available_tools: listSiteMcpToolDescriptors().map((descriptor) => descriptor.name)
        })
      }
      const rawArguments = params.arguments ?? {}
      if (!isPlainJsonObject(rawArguments)) {
        return errorResponse(id, JSON_RPC_INVALID_PARAMS, 'tools/call arguments must be an object.')
      }
      return successResponse(id, await dispatchSiteMcpTool(context, tool, rawArguments))
    }
    default:
      // Notifications we do not implement (notifications/initialized, notifications/cancelled)
      // land here and are correctly dropped.
      return isNotification
        ? null
        : errorResponse(id, JSON_RPC_METHOD_NOT_FOUND, `Unknown method: ${request.method}`)
  }
}

export function createSiteMcpServer(options: SiteMcpServerOptions): SiteMcpServer {
  const version = options.version ?? '0.0.0'
  let tail: Promise<void> = Promise.resolve()

  const respond = (response: JsonRpcResponse | null): void => {
    if (response) {
      options.write(encodeJsonRpcFrame(response))
    }
  }

  // One frame's failure must never poison the queue: a rejected link would skip every `.then`
  // after it and the server would go silent while the client waits forever.
  const enqueue = (work: () => Promise<void> | void): void => {
    tail = tail.then(work).catch(() => undefined)
  }

  // Why detached: `enqueue` answers frames in arrival order, which is the right default — but a
  // tool whose latency is a human holds the chain for as long as they take, stalling every later
  // call behind it. Those tools run off-chain; ordering still holds for everything else.
  const runFrame = async (request: JsonRpcRequest): Promise<void> => {
    try {
      respond(await handleRequest(options.context, request, version))
    } catch (error) {
      // Belt and braces: dispatchSiteMcpTool already converts tool failures into isError
      // results, so reaching this means a protocol-level bug. Answer it rather than die.
      if ('id' in request) {
        respond(
          errorResponse(
            request.id ?? null,
            JSON_RPC_INTERNAL_ERROR,
            error instanceof Error ? error.message : String(error)
          )
        )
      }
    }
  }

  const reader = createLineReader((line) => {
    const frame = parseJsonRpcFrame(line)
    if (!frame.ok) {
      enqueue(() => {
        respond(frame.response)
      })
      return
    }
    const { request } = frame
    if (isConcurrentToolCall(request)) {
      void runFrame(request)
      return
    }
    enqueue(() => runFrame(request))
  })

  return {
    push(chunk) {
      reader.push(chunk)
    },
    end() {
      reader.end()
    },
    drain() {
      return tail
    }
  }
}
