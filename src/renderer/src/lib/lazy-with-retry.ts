import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * Resilient replacement for React.lazy.
 *
 * Why: a stale, corrupt, or truncated lazy chunk parses as invalid JavaScript and
 * rejects its dynamic import() with a native SyntaxError (e.g. "Unexpected token
 * ']'"). React.lazy permanently caches that rejection, so the error boundary's
 * "Retry" — which just re-renders the same Lazy — can never recover it; the
 * surface stays dead and reports a react-error-boundary crash. This wrapper first
 * retries transient fetch failures, then performs ONE guarded full reload to
 * refetch fresh chunk bytes and rebuild the ES module map, before finally falling
 * through to the error boundary.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirror React.lazy's own ComponentType<any> constraint so every existing call site type-checks unchanged.
type AnyComponent = ComponentType<any>

type LazyFactory<T extends AnyComponent> = () => Promise<{ default: T }>

type ReloadGuardState = 'not-attempted' | 'attempted' | 'unavailable'

export type LazyWithRetryOptions = {
  retries?: number
  baseDelayMs?: number
  /** Label surfaced in the reload breadcrumb for triage; not used for control flow. */
  reloadKey?: string
}

export class LazyChunkLoadError extends Error {
  constructor(cause: unknown) {
    super('Lazy chunk load failed after reload recovery was exhausted')
    this.name = 'LazyChunkLoadError'
    ;(this as { cause?: unknown }).cause = cause
  }
}

export function isLazyChunkLoadError(error: unknown): error is LazyChunkLoadError {
  return error instanceof LazyChunkLoadError
}

// One recovery reload per short window. The guard must survive location.reload()
// so a still-broken chunk cannot loop, but Electron persists sessionStorage across
// app relaunches — a bare '1' flag permanently killed Tasks after a Vite 504.
// Timestamp + TTL: same-reload stays blocked; a later launch can try again.
export const LAZY_CHUNK_RELOAD_GUARD_KEY = 'orca:lazy-chunk-reload-attempted'
export const LAZY_CHUNK_RELOAD_GUARD_TTL_MS = 60_000
const DEFAULT_RETRIES = 2
const DEFAULT_BASE_DELAY_MS = 250

function parseReloadGuardTimestamp(raw: string | null): number | null {
  if (raw === null || raw.length === 0) {
    return null
  }
  // Why: pre-TTL installs wrote '1'. That value has no clock, so treat it as
  // expired — otherwise Electron would keep the one-shot kill switch forever.
  if (raw === '1') {
    return null
  }
  const timestamp = Number(raw)
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null
}

function readChunkReloadGuardState(now = Date.now()): ReloadGuardState {
  if (typeof window === 'undefined') {
    return 'unavailable'
  }
  try {
    const timestamp = parseReloadGuardTimestamp(
      window.sessionStorage.getItem(LAZY_CHUNK_RELOAD_GUARD_KEY)
    )
    if (timestamp === null) {
      return 'not-attempted'
    }
    if (now - timestamp > LAZY_CHUNK_RELOAD_GUARD_TTL_MS) {
      window.sessionStorage.removeItem(LAZY_CHUNK_RELOAD_GUARD_KEY)
      return 'not-attempted'
    }
    return 'attempted'
  } catch {
    // Why: when storage is blocked we cannot prove a reload happened, but still
    // fail closed on reloads so a broken chunk never loops.
    return 'unavailable'
  }
}

function markChunkReloadAttempted(now = Date.now()): boolean {
  try {
    window.sessionStorage.setItem(LAZY_CHUNK_RELOAD_GUARD_KEY, String(now))
    return true
  } catch {
    // A reload without a durable guard can loop, so treat write failure as unavailable.
    return false
  }
}

export function clearLazyChunkReloadGuard(): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.sessionStorage.removeItem(LAZY_CHUNK_RELOAD_GUARD_KEY)
  } catch {
    // Clearing is best-effort; Retry still falls through to a remount.
  }
}

function recordReloadBreadcrumb(reloadKey: string, message: string): void {
  // Inlined rather than importing crash-diagnostics so this low-level recovery
  // primitive stays free of the renderer/webview module graph (keeps it SSR- and
  // unit-test-friendly). Mirrors crash-diagnostics' best-effort breadcrumb call.
  try {
    const api = (window as Window & { api?: Window['api'] }).api
    api?.crashReports.recordBreadcrumb({ name: 'lazy_chunk_reload', data: { reloadKey, message } })
  } catch {
    // Crash evidence is best-effort and must never mask the original failure.
  }
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// Suspends the React.lazy boundary while window.location.reload() tears the page
// down, so the error fallback never flashes in the moment before the reload lands.
const SUSPEND_UNTIL_RELOAD = new Promise<never>(() => undefined)

function isKnownDynamicImportFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  if (error.name === 'ChunkLoadError') {
    return true
  }

  // Why: a stale/truncated/corrupt chunk parses as invalid JS, so import()
  // rejects with a native SyntaxError ("Unexpected token ')'", "Unexpected end
  // of input", …). That reaches this catch only from the chunk's fetch+parse
  // phase — a recoverable corrupt-chunk failure. Genuine module-evaluation
  // logic bugs throw ordinary Errors (still surfaced raw) or fail later during
  // React render (outside this load path), so they are unaffected.
  if (error.name === 'SyntaxError') {
    return true
  }

  return [
    /failed to fetch dynamically imported module/i,
    /error loading dynamically imported module/i,
    /importing a module script failed/i,
    /failed to load module script/i,
    /loading chunk .+ failed/i,
    /unexpected token/i,
    /unexpected end of (input|script|json)/i
  ].some((pattern) => pattern.test(error.message))
}

export async function loadLazyWithRetry<T extends AnyComponent>(
  factory: LazyFactory<T>,
  options: LazyWithRetryOptions = {}
): Promise<{ default: T }> {
  const retries = options.retries ?? DEFAULT_RETRIES
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await factory()
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        // Exponential backoff absorbs transient fetch hiccups (HTTP / relay / SSH).
        await wait(baseDelayMs * 2 ** attempt)
      }
    }
  }

  const reloadGuardState = readChunkReloadGuardState()
  if (typeof window !== 'undefined' && reloadGuardState === 'not-attempted') {
    if (!markChunkReloadAttempted()) {
      throw lastError
    }
    recordReloadBreadcrumb(
      options.reloadKey ?? 'unknown',
      lastError instanceof Error ? lastError.message : String(lastError)
    )
    window.location.reload()
    return SUSPEND_UNTIL_RELOAD
  }

  if (reloadGuardState === 'attempted' && isKnownDynamicImportFailure(lastError)) {
    throw new LazyChunkLoadError(lastError)
  }

  // No proven reload attempt (SSR / node / blocked storage) or unknown failure:
  // re-throw the original error so normal error reporting semantics stay intact.
  throw lastError
}

export function lazyWithRetry<T extends AnyComponent>(
  factory: LazyFactory<T>,
  options?: LazyWithRetryOptions
): LazyExoticComponent<T> {
  return lazy(() => loadLazyWithRetry(factory, options))
}
