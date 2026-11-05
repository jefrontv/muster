// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureInsertionTarget, insertText } from '../dictation/dictation-insertion-target'
import {
  BOTS_DICTATION_TAG,
  botsDictationInsertScript,
  connectBotsDictation,
  createBotsDictationSink,
  parseBotsDictationRequest,
  type BotsDictationHost
} from './bots-dictation-bridge'

type FakeWebview = HTMLDivElement & {
  executeJavaScript: ReturnType<typeof vi.fn>
  insertText: ReturnType<typeof vi.fn>
}

function fakeWebview(): FakeWebview {
  const element = document.createElement('div') as FakeWebview
  element.tabIndex = 0
  element.executeJavaScript = vi.fn(() => Promise.resolve(true))
  element.insertText = vi.fn(() => Promise.resolve())
  document.body.appendChild(element)
  return element
}

function guestSays(webview: FakeWebview, request: string): void {
  webview.dispatchEvent(
    Object.assign(new Event('console-message'), { message: `${BOTS_DICTATION_TAG}${request}` })
  )
}

function fakeHost(configured: boolean) {
  return {
    voice: () => ({ configured, hold: false }),
    listening: () => false,
    subscribe: (_onChange: () => void) => () => {},
    openVoiceSettings: vi.fn<BotsDictationHost['openVoiceSettings']>(),
    control: vi.fn<BotsDictationHost['control']>()
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('parseBotsDictationRequest', () => {
  it('reads tagged requests and ignores everything else', () => {
    expect(parseBotsDictationRequest(`${BOTS_DICTATION_TAG}toggle`)).toBe('toggle')
    expect(parseBotsDictationRequest(`${BOTS_DICTATION_TAG}focus:1`)).toBe('focus:1')
    expect(parseBotsDictationRequest(`${BOTS_DICTATION_TAG}bogus`)).toBeNull()
    expect(parseBotsDictationRequest('toggle')).toBeNull()
  })
})

describe('connectBotsDictation', () => {
  it('round trips: a guest request starts host dictation and finals go back over the bridge', async () => {
    const webview = fakeWebview()
    const host = fakeHost(true)
    const stop = connectBotsDictation(webview as unknown as Electron.WebviewTag, host)

    guestSays(webview, 'toggle')
    expect(host.control).toHaveBeenCalledWith('toggle')
    expect(document.activeElement).toBe(webview)

    const target = captureInsertionTarget()
    expect(target?.kind).toBe('guest')
    insertText('hello there', target!)
    await flush()
    expect(webview.executeJavaScript).toHaveBeenCalledWith(botsDictationInsertScript('hello there'))
    expect(webview.insertText).not.toHaveBeenCalled()

    stop()
    expect(captureInsertionTarget()).toBeNull()
  })

  it('opens Voice settings instead of dictating when no speech model is set up', () => {
    const webview = fakeWebview()
    const host = fakeHost(false)
    connectBotsDictation(webview as unknown as Electron.WebviewTag, host)

    guestSays(webview, 'toggle')
    expect(host.openVoiceSettings).toHaveBeenCalledTimes(1)
    expect(host.control).not.toHaveBeenCalled()
    guestSays(webview, 'stop')
    expect(host.openVoiceSettings).toHaveBeenCalledTimes(1)
    guestSays(webview, 'settings')
    expect(host.openVoiceSettings).toHaveBeenCalledTimes(2)
  })

  it('tells the guest it is listening only for a session it started', () => {
    const webview = fakeWebview()
    let listening = false
    let notify = (): void => {}
    connectBotsDictation(webview as unknown as Electron.WebviewTag, {
      ...fakeHost(true),
      listening: () => listening,
      subscribe: (onChange) => {
        notify = onChange
        return () => {}
      }
    })
    const lastState = (): string => String(webview.executeJavaScript.mock.lastCall?.[0])

    listening = true
    notify()
    expect(lastState()).toContain('"listening":false')
    listening = false
    notify()
    webview.focus()
    listening = true
    notify()
    expect(lastState()).toContain('"listening":true')
  })
})

describe('createBotsDictationSink', () => {
  it('types into the focused composer when the bridge is busy or the guest cannot place it', async () => {
    let finish: (value: boolean) => void = () => {}
    const webview = {
      executeJavaScript: vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve))),
      insertText: vi.fn(() => Promise.resolve())
    }
    const deliver = createBotsDictationSink(webview as unknown as Electron.WebviewTag, () => true)
    deliver('one')
    await flush()
    deliver(' two')
    expect(webview.insertText).toHaveBeenCalledWith(' two')
    finish(false)
    await flush()
    expect(webview.insertText).toHaveBeenLastCalledWith('one')
    expect(webview.executeJavaScript).toHaveBeenCalledTimes(1)
  })

  it('queues segments in order while the composer is not focused', async () => {
    const webview = {
      executeJavaScript: vi.fn((_script: string) => Promise.resolve(true)),
      insertText: vi.fn(() => Promise.resolve())
    }
    const deliver = createBotsDictationSink(webview as unknown as Electron.WebviewTag, () => false)
    deliver('one')
    deliver(' two')
    await flush()
    expect(webview.executeJavaScript.mock.calls.map((call) => call[0])).toEqual([
      botsDictationInsertScript('one'),
      botsDictationInsertScript(' two')
    ])
    expect(webview.insertText).not.toHaveBeenCalled()
  })
})
