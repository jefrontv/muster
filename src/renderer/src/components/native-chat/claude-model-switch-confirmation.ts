import type { GlobalSettings } from '../../../../shared/types'
import { subscribeToPtyData } from '../terminal-pane/pty-data-sidecar-subscriptions'
import { isRemoteRuntimePtyId, sendRuntimePtyInput } from '@/runtime/runtime-terminal-inspection'
import { subscribeToRuntimeTerminalData } from '@/runtime/runtime-terminal-stream'
import { NATIVE_CHAT_SUBMIT } from './native-chat-send'
import { stripScrollbackAnsi } from './native-chat-scrape-fallback'

const DETECTION_TIMEOUT_MS = 5_000
const MAX_OBSERVED_BYTES = 64 * 1024
// Why: an Enter that lands while the confirmation dialog is still painting gets
// swallowed and the dialog sticks open, so the accept waits a beat and retries once.
const CONFIRMATION_SUBMIT_DELAY_MS = 150
const CONFIRMATION_RETRY_DELAY_MS = 1_200

type SubscribeToData = (watcher: (data: string) => void) => Promise<() => void> | (() => void)

export type ClaudeModelSwitchOutcome = 'applied' | 'rejected' | 'interaction-required' | 'unknown'

export type ClaudeModelSwitchConfirmationObserver = {
  ready: Promise<void>
  result: Promise<ClaudeModelSwitchOutcome>
  arm(): void
  startDetection(): void
  dispose(): void
}

export function hasClaudeModelSwitchConfirmation(buffer: string): boolean {
  const text = compactTerminalText(buffer)
  return (
    text.includes('switchmodel?') && text.includes('thisconversationiscachedforthecurrentmodel')
  )
}

function compactTerminalText(buffer: string): string {
  // Why: Claude positions TUI words with cursor-column escapes instead of
  // emitting literal spaces, so matching must not depend on rendered gaps.
  return stripScrollbackAnsi(buffer).replace(/\s+/g, '').toLowerCase()
}

function hasClaudeModelSwitchSuccess(buffer: string, modelLabel: string): boolean {
  const text = compactTerminalText(buffer)
  const marker = `setmodelto${modelLabel.replace(/\s+/g, '').toLowerCase()}`
  return text.includes(marker)
}

function hasClaudeModelSwitchRejection(buffer: string): boolean {
  return compactTerminalText(buffer).includes('keptmodelas')
}

function hasClaudeModelSwitchInteraction(buffer: string): boolean {
  const text = compactTerminalText(buffer)
  return (
    text.includes('fable5usesusagecreditsandneedsaone-timeconsent') ||
    text.includes('pickfablefrom/modelinaninteractivesessiontosetitup') ||
    (text.includes('switchtofable5?') && text.includes('usagecredits'))
  )
}

function subscribeToClaudeModelSwitchData(args: {
  ptyId: string
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  subscribeToData?: SubscribeToData
  watcher: (data: string) => void
}): Promise<() => void> | (() => void) {
  if (args.subscribeToData) {
    return args.subscribeToData(args.watcher)
  }
  if (isRemoteRuntimePtyId(args.ptyId)) {
    return subscribeToRuntimeTerminalData(
      args.settings,
      args.ptyId,
      `desktop:native-chat-model-switch:${args.ptyId}`,
      args.watcher,
      { startAtLiveTail: true }
    )
  }
  return subscribeToPtyData(args.ptyId, args.watcher)
}

export function createClaudeModelSwitchConfirmationObserver(args: {
  ptyId: string
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  expectedModelLabel: string | null
  subscribeToData?: SubscribeToData
  submitConfirmation?: () => boolean | void
  timeoutMs?: number
}): ClaudeModelSwitchConfirmationObserver {
  let armed = false
  let settled = false
  let confirmationSubmitted = false
  let observed = ''
  let timeout: ReturnType<typeof setTimeout> | null = null
  let confirmationTimer: ReturnType<typeof setTimeout> | null = null
  let unsubscribe: (() => void) | null = null
  let resolveResult!: (outcome: ClaudeModelSwitchOutcome) => void
  let resolveReady!: () => void
  const result = new Promise<ClaudeModelSwitchOutcome>((resolve) => {
    resolveResult = resolve
  })
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })

  const finish = (outcome: ClaudeModelSwitchOutcome): void => {
    if (settled) {
      return
    }
    settled = true
    if (timeout !== null) {
      clearTimeout(timeout)
      timeout = null
    }
    if (confirmationTimer !== null) {
      clearTimeout(confirmationTimer)
      confirmationTimer = null
    }
    unsubscribe?.()
    unsubscribe = null
    if (outcome === 'unknown' && armed && observed.length > 0) {
      // Why: 'unknown' surfaces as a user-facing failure toast; keep the raw
      // evidence in the console so a report can be root-caused without a repro.
      console.warn('[native-chat] model switch unverified', {
        expected: args.expectedModelLabel,
        confirmationSubmitted,
        tail: observed.slice(-400)
      })
    }
    resolveResult(outcome)
  }

  const scheduleTimeout = (): void => {
    if (timeout !== null) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => finish('unknown'), args.timeoutMs ?? DETECTION_TIMEOUT_MS)
  }

  const observeData = (data: string): void => {
    if (!armed || settled) {
      return
    }
    observed = `${observed}${data}`.slice(-MAX_OBSERVED_BYTES)
    if (args.expectedModelLabel && hasClaudeModelSwitchSuccess(observed, args.expectedModelLabel)) {
      finish('applied')
      return
    }
    if (hasClaudeModelSwitchRejection(observed)) {
      finish('rejected')
      return
    }
    if (hasClaudeModelSwitchInteraction(observed)) {
      finish('interaction-required')
      return
    }
    if (!confirmationSubmitted && hasClaudeModelSwitchConfirmation(observed)) {
      confirmationSubmitted = true
      scheduleConfirmationSubmit(CONFIRMATION_SUBMIT_DELAY_MS, true)
    }
  }

  const submitConfirmationAccept = (allowRetry: boolean): void => {
    if (settled) {
      return
    }
    try {
      // Why: the picker selection already expresses consent to switch; this
      // exact Claude warning defaults to “Yes” and needs only one Enter.
      const accepted = args.submitConfirmation
        ? args.submitConfirmation() !== false
        : sendRuntimePtyInput(args.settings, args.ptyId, NATIVE_CHAT_SUBMIT)
      if (!accepted) {
        finish('unknown')
        return
      }
      scheduleTimeout()
      if (allowRetry) {
        scheduleConfirmationSubmit(CONFIRMATION_RETRY_DELAY_MS, false)
      }
    } catch {
      finish('unknown')
    }
  }

  function scheduleConfirmationSubmit(delayMs: number, allowRetry: boolean): void {
    confirmationTimer = setTimeout(() => {
      confirmationTimer = null
      submitConfirmationAccept(allowRetry)
    }, delayMs)
  }

  try {
    const subscription = subscribeToClaudeModelSwitchData({
      ptyId: args.ptyId,
      settings: args.settings,
      subscribeToData: args.subscribeToData,
      watcher: observeData
    })
    void Promise.resolve(subscription)
      .then((dispose) => {
        if (settled) {
          dispose()
        } else {
          unsubscribe = dispose
        }
      })
      .catch(() => finish('unknown'))
      .finally(resolveReady)
  } catch {
    finish('unknown')
    resolveReady()
  }

  return {
    ready,
    result,
    arm: () => {
      if (settled || armed) {
        return
      }
      armed = true
    },
    startDetection: () => {
      // Why: measure the detection window from when the command is actually
      // delivered, not from arm(). On SSH/remote the body+Enter round-trips can
      // otherwise burn the timeout before the agent has even responded, turning
      // a successful switch into a false "could not verify the model change".
      if (settled) {
        return
      }
      scheduleTimeout()
    },
    dispose: () => finish('unknown')
  }
}
