import { describe, expect, it } from 'vitest'
import { chatModeSupported } from './chat-mode-platform'

describe('chatModeSupported', () => {
  it('is off on Windows only', () => {
    expect(chatModeSupported('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/38')).toBe(false)
    expect(chatModeSupported('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Electron/38')).toBe(
      true
    )
    expect(chatModeSupported('Mozilla/5.0 (X11; Linux x86_64) Electron/38')).toBe(true)
  })
})
