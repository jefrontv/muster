/**
 * Electron's ipcRenderer.invoke wraps errors as:
 *   "Error invoking remote method 'channel': Error: actual message"
 * Strip the wrapper so users see only the meaningful part.
 */
export function extractIpcErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) {
    return fallback
  }
  const match = err.message.match(/Error invoking remote method '[^']*': (?:Error: )?(.+)/)
  return match ? match[1] : err.message
}

const IPC_ERROR_PREFIX_PATTERN = /^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/

// Why: keeps every line after the prefix (push hook output is multi-line) and the original error identity.
export function stripIpcErrorPrefix<T>(error: T): T {
  if (error instanceof Error && IPC_ERROR_PREFIX_PATTERN.test(error.message)) {
    error.message = error.message.replace(IPC_ERROR_PREFIX_PATTERN, '')
  }
  return error
}

/** Wraps an IPC API object so every rejected call throws without Electron's prefix. */
export function withIpcErrorPrefixStripped<T extends object>(api: T): T {
  // Why: contextBridge objects are frozen, and a Proxy may not swap a frozen target's own functions.
  return new Proxy({} as T, {
    get(_target, property) {
      const value = Reflect.get(api, property)
      if (typeof value !== 'function') {
        return value
      }
      return (...args: unknown[]) => {
        let result: unknown
        try {
          result = value.apply(api, args)
        } catch (error) {
          throw stripIpcErrorPrefix(error)
        }
        return result instanceof Promise
          ? result.catch((error: unknown) => {
              throw stripIpcErrorPrefix(error)
            })
          : result
      }
    }
  })
}
