// Bots' composer dictates through Muster: the guest asks over its console, DictationController runs here, and
// final segments go back through window.__musterDictation. Must match src/lib/muster-dictation.ts in the muster-bots fork.
import type { DictationControlAction } from '../dictation/dictation-control-events'
import { registerDictationGuestSink } from '../dictation/dictation-guest-sinks'

export const BOTS_DICTATION_TAG = '__muster_bots_dictation__'

export type BotsDictationRequest = DictationControlAction | 'settings' | 'focus:1' | 'focus:0'

const REQUESTS: ReadonlySet<string> = new Set<BotsDictationRequest>([
  'toggle',
  'start',
  'stop',
  'settings',
  'focus:1',
  'focus:0'
])

export function parseBotsDictationRequest(message: string): BotsDictationRequest | null {
  if (!message.startsWith(BOTS_DICTATION_TAG)) {
    return null
  }
  const request = message.slice(BOTS_DICTATION_TAG.length)
  return REQUESTS.has(request) ? (request as BotsDictationRequest) : null
}

export type BotsDictationGuestState = { listening: boolean; hold: boolean }

export function botsDictationStateScript(state: BotsDictationGuestState): string {
  return `window.__musterDictation?.setState(${JSON.stringify(state)}); void 0`
}

export function botsDictationInsertScript(text: string): string {
  return `window.__musterDictation?.insert(${JSON.stringify(text)}) === true`
}

type BotsWebview = Pick<Electron.WebviewTag, 'executeJavaScript' | 'insertText'>

/** Segments go over the bridge in order. One that arrives while the bridge is still busy is typed straight
 *  into the focused composer, as is one the guest could not place. */
export function createBotsDictationSink(
  webview: BotsWebview,
  composerFocused: () => boolean
): (text: string) => void {
  let pending: Promise<void> | null = null
  const typeIntoComposer = (text: string): void => {
    if (composerFocused()) {
      webview.insertText(text).catch(() => {})
    }
  }
  const send = (text: string): Promise<void> =>
    webview.executeJavaScript(botsDictationInsertScript(text)).then(
      (inserted) => {
        if (inserted !== true) {
          typeIntoComposer(text)
        }
      },
      () => typeIntoComposer(text)
    )
  return (text) => {
    if (pending && composerFocused()) {
      typeIntoComposer(text)
      return
    }
    const run = (pending ?? Promise.resolve()).then(() => send(text))
    pending = run
    void run.finally(() => {
      if (pending === run) {
        pending = null
      }
    })
  }
}

export type BotsDictationHost = {
  voice: () => { configured: boolean; hold: boolean }
  listening: () => boolean
  subscribe: (onChange: () => void) => () => void
  openVoiceSettings: () => void
  control: (action: DictationControlAction) => void
}

export function connectBotsDictation(
  webview: Electron.WebviewTag,
  host: BotsDictationHost
): () => void {
  let composerFocused = false
  const unregister = registerDictationGuestSink(
    webview,
    createBotsDictationSink(webview, () => composerFocused)
  )
  let last = ''
  let wasListening = false
  // Only a session that started while this webview held focus is the guest's; dictating elsewhere is not.
  let owns = false
  const push = (): void => {
    const listening = host.listening()
    if (listening && !wasListening) {
      owns = document.activeElement === webview
    }
    wasListening = listening
    const script = botsDictationStateScript({
      listening: listening && owns,
      hold: host.voice().hold
    })
    if (script === last) {
      return
    }
    last = script
    webview.executeJavaScript(script).catch(() => {
      // Guest not ready; dom-ready pushes again.
      last = ''
    })
  }
  const onMessage = (event: Electron.ConsoleMessageEvent): void => {
    const request = parseBotsDictationRequest(event.message)
    if (!request) {
      return
    }
    if (request === 'focus:1' || request === 'focus:0') {
      composerFocused = request === 'focus:1'
      return
    }
    if (request === 'settings') {
      host.openVoiceSettings()
      return
    }
    if (!host.voice().configured) {
      if (request !== 'stop') {
        host.openVoiceSettings()
      }
      return
    }
    // The controller dictates into whatever holds host focus; that must be this webview.
    webview.focus()
    host.control(request)
  }
  const onDomReady = (): void => {
    composerFocused = false
    last = ''
    push()
  }
  webview.addEventListener('console-message', onMessage)
  webview.addEventListener('dom-ready', onDomReady)
  const unsubscribe = host.subscribe(push)
  return () => {
    unsubscribe()
    webview.removeEventListener('console-message', onMessage)
    webview.removeEventListener('dom-ready', onDomReady)
    unregister()
  }
}
