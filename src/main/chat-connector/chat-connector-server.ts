// Localhost streamable-HTTP MCP server ("muster" tools) for chat-mode threads.
// One shared node:http server on 127.0.0.1 with a random port; each thread gets
// its own bearer token, resolved back to the thread on every request so the
// tools always act on the caller's current workspace scope.

import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http'
import type { ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { chatConnectorToolDefs } from './chat-connector-tool-defs'
import { callChatConnectorTool, type ChatConnectorToolDeps } from './chat-connector-tools'

const MCP_PATH = '/mcp'

let httpServer: HttpServer | null = null
let boundPort: number | null = null
let startPromise: Promise<number> | null = null
let toolDeps: ChatConnectorToolDeps | null = null

const tokenByThread = new Map<string, string>()
const threadByToken = new Map<string, string>()

/** Mint (or replace) the thread's token. Null until the server is running. */
export function registerChatConnectorThread(
  threadId: string
): { url: string; token: string } | null {
  if (boundPort === null) {
    return null
  }
  const prior = tokenByThread.get(threadId)
  if (prior) {
    threadByToken.delete(prior)
  }
  const token = randomBytes(32).toString('hex')
  tokenByThread.set(threadId, token)
  threadByToken.set(token, threadId)
  return { url: `http://127.0.0.1:${boundPort}${MCP_PATH}`, token }
}

/** Token-matched revoke: a stale child's late close can't kill a relaunch's token. */
export function revokeChatConnectorThread(threadId: string, token: string): void {
  if (tokenByThread.get(threadId) !== token) {
    return
  }
  tokenByThread.delete(threadId)
  threadByToken.delete(token)
}

function authenticateRequest(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return null
  }
  return threadByToken.get(header.slice('Bearer '.length).trim()) ?? null
}

async function handleMcpPost(
  req: IncomingMessage,
  res: ServerResponse,
  threadId: string,
  deps: ChatConnectorToolDeps
): Promise<void> {
  const mcpServer = new McpServer(
    { name: 'muster', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: chatConnectorToolDefs()
  }))
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) =>
    callChatConnectorTool({
      name: request.params.name,
      args: (request.params.arguments ?? {}) as Record<string, unknown>,
      threadId,
      deps
    })
  )
  // Stateless per-request transport: the CLI may open several HTTP sessions
  // per child, and a fresh server per POST needs no session bookkeeping.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  })
  res.on('close', () => {
    void transport.close()
    void mcpServer.close()
  })
  await mcpServer.connect(transport)
  await transport.handleRequest(req, res)
}

function requestListener(req: IncomingMessage, res: ServerResponse): void {
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
  if (pathname !== MCP_PATH) {
    res.writeHead(404).end()
    return
  }
  const threadId = authenticateRequest(req)
  const deps = toolDeps
  if (threadId === null || !deps) {
    res
      .writeHead(401, { 'content-type': 'application/json' })
      .end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null }))
    return
  }
  if (req.method !== 'POST') {
    // Stateless mode has no GET notification stream or DELETE session teardown.
    res.writeHead(405, { allow: 'POST' }).end()
    return
  }
  handleMcpPost(req, res, threadId, deps).catch(() => {
    if (!res.headersSent) {
      res.writeHead(500).end()
    }
  })
}

/** Starts once (lazily) and returns the bound port. Deps refresh on every call
 *  so the latest store/settings closures win after a re-registration. */
export function ensureChatConnectorServer(deps: ChatConnectorToolDeps): Promise<number> {
  toolDeps = deps
  if (startPromise) {
    return startPromise
  }
  startPromise = new Promise<number>((resolve, reject) => {
    const server = createServer(requestListener)
    const onStartError = (error: Error): void => {
      startPromise = null
      reject(error)
    }
    server.once('error', onStartError)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', onStartError)
      const address = server.address()
      if (typeof address !== 'object' || address === null) {
        startPromise = null
        server.close()
        reject(new Error('chat connector failed to bind a port'))
        return
      }
      httpServer = server
      boundPort = address.port
      // Why: an idle connector must not hold app quit hostage.
      server.unref()
      resolve(address.port)
    })
  })
  return startPromise
}

export function stopChatConnectorServer(): void {
  httpServer?.close()
  httpServer = null
  boundPort = null
  startPromise = null
  tokenByThread.clear()
  threadByToken.clear()
}

/** Test-only visibility into the live token registry. */
export function chatConnectorTokenCountForTests(): number {
  return tokenByThread.size
}
