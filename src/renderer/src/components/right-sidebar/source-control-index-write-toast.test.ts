import { beforeEach, describe, expect, it, vi } from 'vitest'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

import { toastIndexWriteFailure } from './source-control-index-write-toast'

describe('toastIndexWriteFailure', () => {
  beforeEach(() => {
    toastError.mockReset()
  })

  it('shows the git message without the IPC wrapper as the description', () => {
    toastIndexWriteFailure(
      'stage',
      new Error(
        "Error invoking remote method 'git:stage': Error: fatal: Unable to create '/repo/.git/index.lock': File exists."
      )
    )
    expect(toastError).toHaveBeenCalledWith("Couldn't stage changes", {
      description: "fatal: Unable to create '/repo/.git/index.lock': File exists."
    })
  })

  it('titles each kind of index write', () => {
    toastIndexWriteFailure('unstage', new Error('boom'))
    toastIndexWriteFailure('discard', new Error('boom'))
    expect(toastError.mock.calls.map((call) => call[0])).toEqual([
      "Couldn't unstage changes",
      "Couldn't discard changes"
    ])
  })

  it('omits the description when there is no message', () => {
    toastIndexWriteFailure('discard', 'not an error')
    expect(toastError).toHaveBeenCalledWith("Couldn't discard changes", undefined)
  })
})
