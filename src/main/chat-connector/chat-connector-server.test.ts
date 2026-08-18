import { afterEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { ChatModeState } from '../../shared/chat-mode-types'
import type { ChatConnectorToolDeps } from './chat-connector-tools'
import {
  chatConnectorTokenCountForTests,
  ensureChatConnectorServer,
  registerChatConnectorThread,
  revokeChatConnectorThread,
  stopChatConnectorServer
} from './chat-connector-server'

const state: ChatModeState = {
  version: 1,
  workspaces: [
    { id: 'w1', name: 'Client site', directories: ['/sites/client'], createdAt: 1, updatedAt: 1 }
  ],
  threads: [
    {
      id: 't-workspace',
      workspaceId: 'w1',
      title: 'Workspace chat',
      agent: 'claude',
      claudeSessionId: null,
      transcriptPath: null,
      createdAt: 1,
      lastActivityAt: 1
    },
    {
      id: 't-standalone',
      workspaceId: null,
      title: 'Standalone chat',
      agent: 'claude',
      claudeSessionId: null,
      transcriptPath: null,
      createdAt: 1,
      lastActivityAt: 1
    }
  ]
}

function fakeDeps(): ChatConnectorToolDeps {
  return {
    getChatState: () => state,
    updateWorkspace: () => null,
    updateThread: () => null,
    deleteThread: () => false,
    getDefaultModel: () => 'claude-opus-5',
    setDefaultModel: () => undefined,
    listLearnedModels: async () => ({}),
    confirm: async () => false,
    stopThreadStream: () => undefined,
    broadcastChange: () => undefined,
    directoryExists: () => false,
    createWorkspace: ({ name, directories }) => ({
      id: 'w-new',
      name,
      directories,
      createdAt: 1,
      updatedAt: 1
    }),
    moveThread: () => null
  }
}

async function connectClient(url: string, token: string): Promise<Client> {
  const client = new Client({ name: 'test-client', version: '0.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } }
  })
  await client.connect(transport)
  return client
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as { type: string; text?: string }[]
  return content[0]?.text ?? ''
}

describe('chat-connector server', () => {
  afterEach(() => {
    stopChatConnectorServer()
  })

  it('refuses unauthenticated, wrong-token, wrong-path, and non-POST requests', async () => {
    const port = await ensureChatConnectorServer(fakeDeps())
    const { token } = registerChatConnectorThread('t-workspace')!
    const base = `http://127.0.0.1:${port}`
    expect((await fetch(`${base}/mcp`, { method: 'POST', body: '{}' })).status).toBe(401)
    expect(
      (
        await fetch(`${base}/mcp`, {
          method: 'POST',
          headers: { Authorization: 'Bearer wrong' },
          body: '{}'
        })
      ).status
    ).toBe(401)
    expect((await fetch(`${base}/other`, { method: 'POST' })).status).toBe(404)
    expect(
      (await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${token}` } })).status
    ).toBe(405)
  })

  it('serves the muster tools to an authenticated MCP client, scoped by token', async () => {
    const port = await ensureChatConnectorServer(fakeDeps())
    const url = `http://127.0.0.1:${port}/mcp`
    const workspaceReg = registerChatConnectorThread('t-workspace')!
    const standaloneReg = registerChatConnectorThread('t-standalone')!
    expect(workspaceReg.url).toBe(url)

    const workspaceClient = await connectClient(url, workspaceReg.token)
    const tools = await workspaceClient.listTools()
    expect(tools.tools.map((t) => t.name)).toContain('workspace_get_settings')
    expect(tools.tools.map((t) => t.name)).toContain('delete_threads')
    const settings = await workspaceClient.callTool({ name: 'workspace_get_settings' })
    expect(textOf(settings)).toContain('Client site')
    await workspaceClient.close()

    // The standalone thread's token resolves to its own (workspace-less) scope.
    const standaloneClient = await connectClient(url, standaloneReg.token)
    const standaloneSettings = await standaloneClient.callTool({ name: 'workspace_get_settings' })
    expect(standaloneSettings.isError).toBe(true)
    expect(textOf(standaloneSettings)).toContain("isn't in a workspace")
    const list = await standaloneClient.callTool({ name: 'list_threads' })
    expect(textOf(list)).toContain('t-standalone')
    expect(textOf(list)).not.toContain('t-workspace')
    await standaloneClient.close()
  })

  it('rejects revoked tokens and replaces tokens on re-registration', async () => {
    const port = await ensureChatConnectorServer(fakeDeps())
    const url = `http://127.0.0.1:${port}/mcp`
    const first = registerChatConnectorThread('t-workspace')!
    const second = registerChatConnectorThread('t-workspace')!
    expect(chatConnectorTokenCountForTests()).toBe(1)
    // The superseded token no longer authenticates.
    await expect(connectClient(url, first.token)).rejects.toThrow()
    // A stale revoke (old token) must not kill the live registration.
    revokeChatConnectorThread('t-workspace', first.token)
    const client = await connectClient(url, second.token)
    await client.close()
    // A matching revoke does.
    revokeChatConnectorThread('t-workspace', second.token)
    expect(chatConnectorTokenCountForTests()).toBe(0)
    await expect(connectClient(url, second.token)).rejects.toThrow()
  })

  it('does not mint coordinates before the server is running', () => {
    expect(registerChatConnectorThread('t-early')).toBeNull()
  })
})
