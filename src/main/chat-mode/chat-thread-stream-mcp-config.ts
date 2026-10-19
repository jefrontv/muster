// Muster's per-thread MCP server, attached over the control protocol once the
// CLI reports init. Not --mcp-config: with a startup dynamic server the CLI
// holds the first turn until the user's slower MCP servers connect (8-16s seen).
// Deliberately not strict: the user's own MCP servers keep loading.

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
