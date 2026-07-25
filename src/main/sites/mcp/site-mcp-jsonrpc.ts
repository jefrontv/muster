// Newline-delimited JSON-RPC 2.0 framing — the whole wire format, in one place.
//
// There is no MCP SDK in this repo and adding one for `initialize` + `tools/list` + `tools/call`
// would be a dependency for three methods. The subset is small enough to own, and owning it means
// a malformed frame from a misbehaving client is a parse error we answer, not a crash.
//
// A stdio server that dies on bad input takes the agent's whole session with it, so every failure
// mode here degrades to an error response.

export const JSON_RPC_VERSION = '2.0'

export const JSON_RPC_PARSE_ERROR = -32700
export const JSON_RPC_INVALID_REQUEST = -32600
export const JSON_RPC_METHOD_NOT_FOUND = -32601
export const JSON_RPC_INVALID_PARAMS = -32602
export const JSON_RPC_INTERNAL_ERROR = -32603

/** A single frame past this is a broken client, not a big request; dropping it protects memory. */
export const MAX_FRAME_BYTES = 8 * 1024 * 1024

/** Type guard, so a narrowed `params` / `arguments` object needs no unchecked assertion. */
export function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type JsonRpcId = string | number | null

export type JsonRpcRequest = {
  jsonrpc: string
  /** Absent on a notification, which must never be answered. */
  id?: JsonRpcId
  method: string
  params?: Record<string, unknown>
}

export type JsonRpcResponse =
  | { jsonrpc: string; id: JsonRpcId; result: unknown }
  | { jsonrpc: string; id: JsonRpcId; error: { code: number; message: string; data?: unknown } }

export function successResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: JSON_RPC_VERSION, id, result }
}

export function errorResponse(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    error: data === undefined ? { code, message } : { code, message, data }
  }
}

export type ParsedFrame =
  | { ok: true; request: JsonRpcRequest }
  | { ok: false; response: JsonRpcResponse }

export function parseJsonRpcFrame(line: string): ParsedFrame {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch (error) {
    return {
      ok: false,
      response: errorResponse(
        null,
        JSON_RPC_PARSE_ERROR,
        error instanceof Error ? error.message : 'Invalid JSON'
      )
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      response: errorResponse(null, JSON_RPC_INVALID_REQUEST, 'Request must be a JSON object.')
    }
  }
  const message = parsed as Record<string, unknown>
  // Why echo the id even on an invalid request: without it the client cannot settle its promise
  // and the agent hangs until its own timeout instead of seeing the error.
  const id = isJsonRpcId(message.id) ? message.id : null
  if (message.jsonrpc !== JSON_RPC_VERSION) {
    return {
      ok: false,
      response: errorResponse(
        id,
        JSON_RPC_INVALID_REQUEST,
        `jsonrpc must be "${JSON_RPC_VERSION}".`
      )
    }
  }
  if (typeof message.method !== 'string' || message.method.length === 0) {
    return {
      ok: false,
      response: errorResponse(id, JSON_RPC_INVALID_REQUEST, 'method must be a non-empty string.')
    }
  }
  const params = message.params
  if (params !== undefined && !isPlainJsonObject(params)) {
    return {
      ok: false,
      response: errorResponse(id, JSON_RPC_INVALID_PARAMS, 'params must be an object.')
    }
  }
  return {
    ok: true,
    request: {
      jsonrpc: JSON_RPC_VERSION,
      method: message.method,
      ...('id' in message ? { id } : {}),
      ...(params === undefined ? {} : { params })
    }
  }
}

export function encodeJsonRpcFrame(message: JsonRpcResponse): string {
  return `${JSON.stringify(message)}\n`
}

export type LineReader = {
  push: (chunk: string) => void
  /** Flushes a trailing line that arrived without a newline before the stream closed. */
  end: () => void
}

/**
 * Splits a byte stream into newline-delimited frames. Stdin arrives in arbitrary chunks, so a frame
 * can straddle any number of them; an oversized frame is discarded up to the next newline rather
 * than buffered forever.
 */
export function createLineReader(onLine: (line: string) => void): LineReader {
  let buffer = ''
  let discarding = false

  const emit = (line: string): void => {
    const trimmed = line.trim()
    if (trimmed.length > 0) {
      onLine(trimmed)
    }
  }

  return {
    push(chunk) {
      buffer += chunk
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        if (discarding) {
          discarding = false
        } else {
          emit(line)
        }
        newlineIndex = buffer.indexOf('\n')
      }
      if (buffer.length > MAX_FRAME_BYTES) {
        buffer = ''
        discarding = true
      }
    },
    end() {
      const remaining = buffer
      buffer = ''
      if (!discarding) {
        emit(remaining)
      }
      discarding = false
    }
  }
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'string' || typeof value === 'number' || value === null
}
