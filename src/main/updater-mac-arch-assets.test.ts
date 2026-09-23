import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { runningUnderARM64Translation: false } }))

import { hasMacUpdateAssetForHost } from './updater-mac-arch-assets'

const arm64Only = [{ url: 'Muster-1.14.21-arm64-mac.zip' }, { url: 'muster-macos-arm64.dmg' }]
const bothSlices = [...arm64Only, { url: 'Muster-1.14.9-mac.zip' }, { url: 'muster-macos-x64.dmg' }]

describe('hasMacUpdateAssetForHost', () => {
  it('rejects an arm64-only release on an x64 host', () => {
    expect(hasMacUpdateAssetForHost(arm64Only, false)).toBe(false)
  })

  it('accepts the unmarked x64 zip on an x64 host', () => {
    expect(hasMacUpdateAssetForHost(bothSlices, false)).toBe(true)
  })

  it('accepts any release on an arm64 host', () => {
    expect(hasMacUpdateAssetForHost(arm64Only, true)).toBe(true)
    expect(hasMacUpdateAssetForHost([{ url: 'Muster-1.14.9-mac.zip' }], true)).toBe(true)
  })

  it('defers to electron-updater when the manifest has no file list', () => {
    expect(hasMacUpdateAssetForHost(undefined, false)).toBe(true)
    expect(hasMacUpdateAssetForHost([], false)).toBe(true)
  })
})
