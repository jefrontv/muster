import { describe, expect, it, vi } from 'vitest'
import type { ChatModeState } from '../../shared/chat-mode-types'
import type { ProjectPagesAgentAccess } from '../../shared/agent-capabilities'
import { chatConnectorPagesToolDefs } from './chat-connector-pages-tools'
import { callChatConnectorTool, type ChatConnectorToolDeps } from './chat-connector-tools'

const STATE: ChatModeState = {
  version: 1,
  workspaces: [
    { id: 'w1', name: 'Acme', directories: ['/repos/acme'], createdAt: 1, updatedAt: 1 }
  ],
  threads: [
    {
      id: 't1',
      workspaceId: 'w1',
      title: 'Chat',
      agent: 'claude',
      claudeSessionId: null,
      transcriptPath: null,
      createdAt: 1,
      lastActivityAt: 1
    }
  ]
}

function deps(access: ProjectPagesAgentAccess, run = vi.fn(async () => ({ pages: [] }))) {
  return {
    deps: {
      getChatState: () => STATE,
      projectPages: { access: () => access, run }
    } as unknown as ChatConnectorToolDeps,
    run
  }
}

describe('chat connector pages tools', () => {
  it('lists tools by the agent access setting', () => {
    expect(chatConnectorPagesToolDefs(deps('off').deps)).toEqual([])
    const read = chatConnectorPagesToolDefs(deps('read').deps).map((tool) => tool.name)
    expect(read).toEqual(['list_pages', 'search_pages', 'read_page'])
    expect(chatConnectorPagesToolDefs(deps('write').deps).map((tool) => tool.name)).toContain(
      'append_to_page'
    )
  })

  it("runs a pages op scoped by the chat workspace's folder", async () => {
    const { deps: d, run } = deps('write')
    const result = await callChatConnectorTool({
      name: 'list_pages',
      args: { depth: 1 },
      threadId: 't1',
      deps: d
    })
    expect(result.isError).toBeUndefined()
    expect(run).toHaveBeenCalledWith(
      'list',
      { depth: 1 },
      { cwd: '/repos/acme', agent: 'Muster chat', worktreeId: null, terminalHandle: null }
    )
  })

  it('refuses when pages are off and reports op errors with the revision', async () => {
    const off = await callChatConnectorTool({
      name: 'read_page',
      args: {},
      threadId: 't1',
      deps: deps('off').deps
    })
    expect(off.isError).toBe(true)
    const failing = vi.fn(async () => {
      throw Object.assign(new Error('Page changed.'), { revision: 4 })
    })
    const stale = await callChatConnectorTool({
      name: 'update_page',
      args: {},
      threadId: 't1',
      deps: deps('write', failing).deps
    })
    expect(stale.content[0].text).toBe('Page changed. (current revision 4)')
  })
})
