import { describe, expect, it } from 'vitest'
import { stripIpcErrorPrefix, withIpcErrorPrefixStripped } from './ipc-error'

describe('stripIpcErrorPrefix', () => {
  it('keeps every line after the Electron prefix', () => {
    const error = new Error(
      "Error invoking remote method 'git:push': Error: husky - pre-push hook failed\neslint found 2 errors"
    )

    expect(stripIpcErrorPrefix(error).message).toBe(
      'husky - pre-push hook failed\neslint found 2 errors'
    )
  })

  it('leaves unprefixed errors and non-errors untouched', () => {
    const error = new Error('Network error. Check your connection.')

    expect(stripIpcErrorPrefix(error)).toBe(error)
    expect(error.message).toBe('Network error. Check your connection.')
    expect(stripIpcErrorPrefix('boom')).toBe('boom')
  })
})

describe('withIpcErrorPrefixStripped', () => {
  it('strips the prefix from rejected calls and passes results through', async () => {
    const api = withIpcErrorPrefixStripped({
      ok: async (value: number) => value + 1,
      fail: async () => {
        throw new Error("Error invoking remote method 'git:pull': Error: SSH key rejected.")
      }
    })

    await expect(api.ok(1)).resolves.toBe(2)
    await expect(api.fail()).rejects.toThrow(/^SSH key rejected\.$/)
  })
})
