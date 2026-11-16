import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BOTS_NOTIFICATION_CLICK_TAG,
  BOTS_NOTIFICATION_PATCH_SCRIPT,
  connectBotsNotifications
} from './bots-notification-bridge'

class FakeNotification extends EventTarget {
  static permission = 'granted'
  onclick: ((event: Event) => void) | null = null
  constructor(
    readonly title: string,
    readonly options?: NotificationOptions
  ) {
    super()
    this.addEventListener('click', (event) => this.onclick?.(event))
  }
}

type Guest = { Notification: typeof FakeNotification }

function runInGuest(guest: Guest): void {
  // eslint-disable-next-line no-new-func
  new Function('window', BOTS_NOTIFICATION_PATCH_SCRIPT)(guest)
}

describe('BOTS_NOTIFICATION_PATCH_SCRIPT', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs the click tag and still runs the guest handler', () => {
    const guest: Guest = { Notification: FakeNotification }
    runInGuest(guest)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const open = vi.fn()
    const Wrapped = guest.Notification
    expect(Wrapped).not.toBe(FakeNotification)
    const notification = new Wrapped('Scout', { body: 'done' })
    notification.onclick = open
    notification.dispatchEvent(new Event('click'))
    expect(open).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith(BOTS_NOTIFICATION_CLICK_TAG)
    expect(Wrapped.permission).toBe('granted')
  })

  it('wraps once across reloads of the script', () => {
    const guest: Guest = { Notification: FakeNotification }
    runInGuest(guest)
    const first = guest.Notification
    runInGuest(guest)
    expect(guest.Notification).toBe(first)
  })
})

describe('connectBotsNotifications', () => {
  it('patches on dom-ready and shows Bots on the click tag only', () => {
    const target = new EventTarget()
    const executeJavaScript = vi.fn(() => Promise.resolve())
    const webview = {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      executeJavaScript
    } as unknown as Electron.WebviewTag
    const showBots = vi.fn()
    const stop = connectBotsNotifications(webview, showBots)

    target.dispatchEvent(new Event('dom-ready'))
    expect(executeJavaScript).toHaveBeenCalledWith(BOTS_NOTIFICATION_PATCH_SCRIPT)

    const message = (text: string): Event =>
      Object.assign(new Event('console-message'), { message: text })
    target.dispatchEvent(message('unrelated'))
    target.dispatchEvent(message(BOTS_NOTIFICATION_CLICK_TAG))
    expect(showBots).toHaveBeenCalledOnce()

    stop()
    target.dispatchEvent(message(BOTS_NOTIFICATION_CLICK_TAG))
    expect(showBots).toHaveBeenCalledOnce()
  })
})
