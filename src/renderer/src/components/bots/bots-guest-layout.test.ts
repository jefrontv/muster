import { describe, expect, it } from 'vitest'
import {
  BOTS_SIDEBAR_ROOM_TAG,
  BOTS_TOGGLE_CHROME_TOP,
  createBotsGuestLayout,
  parseBotsSidebarRoom,
  watchBotsSidebarRoom
} from './bots-guest-layout'

describe('parseBotsSidebarRoom', () => {
  it('reads the guest room report and ignores other console output', () => {
    expect(parseBotsSidebarRoom(`${BOTS_SIDEBAR_ROOM_TAG}1`)).toBe(true)
    expect(parseBotsSidebarRoom(`${BOTS_SIDEBAR_ROOM_TAG}0`)).toBe(false)
    expect(parseBotsSidebarRoom('Download the React DevTools')).toBeNull()
    expect(parseBotsSidebarRoom(`x${BOTS_SIDEBAR_ROOM_TAG}1`)).toBeNull()
  })
})

describe('watchBotsSidebarRoom', () => {
  function fakeWebview(): EventTarget & {
    say: (message: string) => void
    fire: (type: string) => void
  } {
    const target = new EventTarget()
    return Object.assign(target, {
      say: (message: string) =>
        target.dispatchEvent(Object.assign(new Event('console-message'), { message })),
      fire: (type: string) => target.dispatchEvent(new Event(type))
    })
  }

  it('keeps the answer through subframe loads and resets on main-frame navigation', () => {
    const webview = fakeWebview()
    const seen: boolean[] = []
    const stop = watchBotsSidebarRoom(webview as unknown as Electron.WebviewTag, (room) =>
      seen.push(room)
    )
    webview.say(`${BOTS_SIDEBAR_ROOM_TAG}1`)
    webview.fire('did-start-loading')
    webview.fire('did-navigate')
    stop()
    webview.say(`${BOTS_SIDEBAR_ROOM_TAG}1`)
    expect(seen).toEqual([true, false])
  })
})

describe('createBotsGuestLayout', () => {
  it('pads the guest only while it has made room, and pushes when that changes', () => {
    const layout = createBotsGuestLayout({ getWidth: () => 280, subscribeWidth: () => () => {} })
    let pushes = 0
    const stop = layout.subscribe(() => pushes++)
    expect(layout.get()).toEqual({ sidebarWidth: 280, chromeTop: 0 })
    layout.setRoom(true)
    layout.setRoom(true)
    expect(layout.get().chromeTop).toBe(BOTS_TOGGLE_CHROME_TOP)
    layout.setRoom(false)
    expect(layout.get().chromeTop).toBe(0)
    expect(pushes).toBe(2)
    stop()
  })
})
