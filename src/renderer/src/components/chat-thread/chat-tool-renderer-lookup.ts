// Picks a tool's renderer: its exact name, then its MCP server
// (`mcp__<server>__`), then any MCP tool (`mcp__`), then the generic card.

const MCP_SERVER_PREFIX = /^mcp__.+?__/

export function lookupToolRenderer<T>(
  registry: ReadonlyMap<string, T>,
  name: string,
  fallback: T
): T {
  const exact = registry.get(name)
  if (exact !== undefined) {
    return exact
  }
  const server = MCP_SERVER_PREFIX.exec(name)?.[0]
  if (server) {
    return registry.get(server) ?? registry.get('mcp__') ?? fallback
  }
  return fallback
}
