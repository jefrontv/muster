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

  it('renames argument aliases and names a missing argument with the accepted ones', async () => {
    const calls: unknown[] = []
    const context: SiteMcpContext = {
      ...createFakeContext(),
      projectPagesTool: (op, args) => {
        calls.push([op, args])
        return Promise.resolve({ ok: true })
      }
    }
    await dispatchSiteMcpTool(context, findSiteMcpTool('grep_pages')!, { pattern: 'x' })
    await dispatchSiteMcpTool(context, findSiteMcpTool('query_database')!, { database: 'Bugs' })
    await dispatchSiteMcpTool(context, findSiteMcpTool('query_database')!, { page: 'Bugs' })
    expect(calls).toEqual([
      ['grep', { query: 'x' }],
      ['query_database', { page: 'Bugs' }],
      ['query_database', { page: 'Bugs' }]
    ])
    const missing = await dispatchSiteMcpTool(context, findSiteMcpTool('grep_pages')!, {
      regex: true
    })
    expect(missing.isError).toBe(true)
    expect(JSON.parse((missing.content[0] as { text: string }).text).error).toBe(
      'grep_pages needs "query" (accepts: query, regex, case_sensitive, folder, tag, limit, context, comments)'
    )
    expect(calls).toHaveLength(3)
  })

  it('tells agents [[links]] resolve by themselves', () => {
    for (const name of ['create_page', 'edit_page', 'read_page']) {
      expect(findSiteMcpTool(name)!.description).toMatch(/resolve|links once/)
    }
    expect(findSiteMcpTool('read_page')!.description).toContain('unresolved_links')
    expect(findSiteMcpTool('edit_page')!.description).toContain('unresolved_links')
  })

  it('keeps aliased arguments out of the schema required list', () => {
    const schema = (name: string): unknown => findSiteMcpTool(name)!.inputSchema
    expect(schema('grep_pages')).toMatchObject({ required: [] })
    expect(schema('query_database')).toMatchObject({ required: [] })
    expect(schema('read_page')).toMatchObject({ required: ['page'] })
  })
})
