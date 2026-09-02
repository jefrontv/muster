// Who is on the other end of this MCP connection.
//
// One process serves one agent, so a module-level value is exactly the right scope. It exists so a
// plan review can say which agent asked for it — an anonymous "a plan needs reviewing" is much
// harder to act on than "claude-code, on melbournejazz.com".
//
// Informational only. Nothing is authorised on the strength of a self-reported client name.

let clientName: string | null = null

function readName(clientInfo: unknown): string | null {
  if (typeof clientInfo !== 'object' || clientInfo === null) {
    return null
  }
  const name = (clientInfo as { name?: unknown }).name
  if (typeof name !== 'string') {
    return null
  }
  const trimmed = name.trim()
  // Bounded: it is rendered in a dialog header, and the value is whatever the client claims.
  return trimmed.length > 0 ? trimmed.slice(0, 60) : null
}

export function rememberSiteMcpClient(clientInfo: unknown): void {
  clientName = readName(clientInfo)
}

export function siteMcpClientName(): string | null {
  return clientName
}

/** Test-only: forget the handshake so cases do not leak into each other. */
export function clearSiteMcpClientForTests(): void {
  clientName = null
}
