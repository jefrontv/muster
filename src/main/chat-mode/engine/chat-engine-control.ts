// Client side of the CLI's stdin control protocol: numbered control_requests,
// correlated with the control_response records the CLI writes to stdout.

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const DEFAULT_TIMEOUT_MS = 10_000

export class ChatEngineControlClient {
  private counter = 0
  private readonly pending = new Map<string, Pending>()
  private disposed = false

  constructor(
    private readonly write: (payload: unknown) => boolean,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {}

  request<T = unknown>(
    subtype: string,
    fields: Record<string, unknown> = {},
    timeoutMs = this.timeoutMs
  ): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error('The chat session has ended.'))
    }
    this.counter += 1
    // Prefixed so our ids never collide with request ids the CLI mints for can_use_tool.
    const requestId = `muster_${this.counter}`
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`Claude did not answer "${subtype}" in time.`))
      }, timeoutMs)
      timer.unref?.()
      this.pending.set(requestId, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      })
      const written = this.write({
        type: 'control_request',
        request_id: requestId,
        request: { subtype, ...fields }
      })
      if (!written) {
        clearTimeout(timer)
        this.pending.delete(requestId)
        reject(new Error('The chat session is not accepting input.'))
      }
    })
  }

  /** Returns true when the record was a response to one of our requests. */
  handleRecord(record: Record<string, unknown>): boolean {
    if (record.type !== 'control_response') {
      return false
    }
    const response =
      typeof record.response === 'object' && record.response !== null
        ? (record.response as Record<string, unknown>)
        : null
    const requestId = typeof response?.request_id === 'string' ? response.request_id : null
    const entry = requestId ? this.pending.get(requestId) : undefined
    if (!requestId || !entry) {
      return false
    }
    this.pending.delete(requestId)
    clearTimeout(entry.timer)
    if (response?.subtype === 'error') {
      entry.reject(
        new Error(
          typeof response.error === 'string' ? response.error : 'Claude refused the request.'
        )
      )
    } else {
      entry.resolve(response?.response)
    }
    return true
  }

  dispose(): void {
    this.disposed = true
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(new Error('The chat session has ended.'))
    }
    this.pending.clear()
  }
}
