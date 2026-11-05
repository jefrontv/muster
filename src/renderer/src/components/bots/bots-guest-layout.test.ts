import { describe, expect, it } from 'vitest'
import { BOTS_SIDEBAR_ROOM_TAG, parseBotsSidebarRoom } from './bots-guest-layout'

describe('parseBotsSidebarRoom', () => {
  it('reads the guest room report and ignores other console output', () => {
    expect(parseBotsSidebarRoom(`${BOTS_SIDEBAR_ROOM_TAG}1`)).toBe(true)
    expect(parseBotsSidebarRoom(`${BOTS_SIDEBAR_ROOM_TAG}0`)).toBe(false)
    expect(parseBotsSidebarRoom('Download the React DevTools')).toBeNull()
    expect(parseBotsSidebarRoom(`x${BOTS_SIDEBAR_ROOM_TAG}1`)).toBeNull()
  })
})
