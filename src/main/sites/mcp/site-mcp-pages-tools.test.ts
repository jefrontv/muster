import { describe, expect, it } from 'vitest'
import type { SiteMcpContext } from './site-mcp-context'
import { createFakeContext } from './site-mcp-fake-context'
import { SITE_MCP_PAGES_TOOLS } from './site-mcp-pages-tools'
import { dispatchSiteMcpTool, findSiteMcpTool, listSiteMcpToolDescriptors } from './site-mcp-tools'

const PAGE_TOOLS = new Set(SITE_MCP_PAGES_TOOLS.map((tool) => tool.name))

function listed(context: SiteMcpContext): string[] {
  return listSiteMcpToolDescriptors(context)
    .map((tool) => tool.name)
    .filter((name) => PAGE_TOOLS.has(name))
}

describe('pages MCP tools', () => {
  it('lists pages tools by capability level', () => {
    const context = createFakeContext()
    expect(listed(context)).toHaveLength(PAGE_TOOLS.size)
    expect(listed({ ...context, projectPagesAccess: () => 'read' })).toEqual([
      'list_pages',
      'search_pages',
      'grep_pages',
      'read_page',
      'list_page_comments',
      'query_database',
      'related_pages',
      'list_page_tags',
      'page_blocks',
      'diagram_shapes',
      'read_diagram',
      'render_diagram'
    ])
    expect(listed({ ...context, projectPagesAccess: () => 'off' })).toEqual([])
    expect(listed({ ...context, projectPagesAccess: undefined })).toEqual([])
  })

  it('forwards the op and arguments to the GUI and refuses hidden tools', async () => {
    const calls: unknown[] = []
    const context: SiteMcpContext = {
      ...createFakeContext(),
      projectPagesTool: (op, args) => {
        calls.push([op, args])
        return Promise.resolve({ ok: true })
      }
    }
    const append = findSiteMcpTool('append_to_page')
    const done = await dispatchSiteMcpTool(context, append!, { page: 'A', markdown: 'x' })
    expect(done.isError).toBeFalsy()
    expect(calls).toEqual([['append', { page: 'A', markdown: 'x' }]])
    const refused = await dispatchSiteMcpTool(
      { ...context, projectPagesAccess: () => 'read' },
      append!,
      { page: 'A', markdown: 'x' }
    )
    expect(refused.isError).toBe(true)
    expect(calls).toHaveLength(1)
  })
})
