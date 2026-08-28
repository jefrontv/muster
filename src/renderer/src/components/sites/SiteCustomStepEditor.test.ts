// The draft holds both a command and a script path because the form needs somewhere to type, but a
// persisted step must carry exactly one. This is where the two models meet, and getting it wrong
// sends main a step with an empty scriptPath, which its validator rejects as an unsafe path.

import { describe, expect, it } from 'vitest'
import {
  draftMode,
  draftToStepFields,
  emptyCustomStepDraft,
  isDraftComplete,
  type CustomStepDraft
} from './SiteCustomStepEditor'

function draft(overrides: Partial<CustomStepDraft> = {}): CustomStepDraft {
  return { ...emptyCustomStepDraft(), name: 'Purge', command: 'wp cache flush', ...overrides }
}

describe('draftMode', () => {
  it('is command until a script path is typed', () => {
    expect(draftMode(draft())).toBe('command')
    expect(draftMode(draft({ scriptPath: '.muster/steps/a.sh' }))).toBe('script')
  })

  it('treats whitespace as no script path', () => {
    expect(draftMode(draft({ scriptPath: '   ' }))).toBe('command')
  })
})

describe('isDraftComplete', () => {
  it('needs a name', () => {
    expect(isDraftComplete(draft({ name: '  ' }))).toBe(false)
  })

  it('needs exactly one source of work', () => {
    expect(isDraftComplete(draft({ command: '', scriptPath: '' }))).toBe(false)
    expect(isDraftComplete(draft({ command: 'x', scriptPath: 'a.sh' }))).toBe(false)
    expect(isDraftComplete(draft({ command: 'x', scriptPath: '' }))).toBe(true)
    expect(isDraftComplete(draft({ command: '', scriptPath: 'a.sh' }))).toBe(true)
  })
})

describe('draftToStepFields', () => {
  it('omits the script path entirely for a command step', () => {
    const fields = draftToStepFields(draft())

    expect(fields.command).toBe('wp cache flush')
    expect(fields.scriptPath).toBeUndefined()
  })

  it('clears the command and trims the path for a script step', () => {
    const fields = draftToStepFields(draft({ scriptPath: '  .muster/steps/a.sh  ' }))

    expect(fields.scriptPath).toBe('.muster/steps/a.sh')
    expect(fields.command).toBe('')
  })

  it('clears a stale script path when switching back to a command', () => {
    // Spread over an existing record, so the key must be present-and-undefined, not absent.
    const fields = draftToStepFields(draft({ command: 'echo', scriptPath: '' }))

    expect('scriptPath' in fields).toBe(true)
    expect(fields.scriptPath).toBeUndefined()
  })

  it('trims the name', () => {
    expect(draftToStepFields(draft({ name: '  Purge  ' })).name).toBe('Purge')
  })
})
