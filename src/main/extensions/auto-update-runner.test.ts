import { beforeEach, describe, expect, it, vi } from 'vitest'

const readExtensionInventoryMock = vi.fn()
vi.mock('./extension-service', () => ({
  readExtensionInventory: () => readExtensionInventoryMock()
}))

const { runExtensionAutoUpdates } = await import('./auto-update-runner')
type RunnerEnv = Parameters<typeof runExtensionAutoUpdates>[1]

function item(
  id: string,
  overrides: {
    command?: string
    status?: string
    autoUpdateEnabled?: boolean
    autoUpdateSupported?: boolean
  } = {}
): unknown {
  return {
    entry: {
      id,
      name: id,
      install:
        overrides.command === undefined
          ? { method: 'bundled-skill', skill: 'inert' }
          : { method: 'command', command: { update: overrides.command } }
    },
    state: {
      id,
      installed: true,
      installedVersion: '1.0.0',
      latestVersion: '2.0.0',
      status: overrides.status ?? 'outdated',
      autoUpdateSupported: overrides.autoUpdateSupported ?? true,
      autoUpdateEnabled: overrides.autoUpdateEnabled ?? true,
      harnesses: [],
      binaryPath: null
    }
  }
}

function env(overrides: Partial<NonNullable<RunnerEnv>> = {}): NonNullable<RunnerEnv> {
  return {
    runCommand: vi.fn().mockResolvedValue({ code: 0, stderr: '', timedOut: false }),
    disableAutoUpdate: vi.fn(),
    log: vi.fn(),
    ...overrides
  } as NonNullable<RunnerEnv>
}

beforeEach(() => {
  readExtensionInventoryMock.mockReset()
})

describe('runExtensionAutoUpdates', () => {
  it('does nothing when nothing is eligible', async () => {
    readExtensionInventoryMock.mockResolvedValue({
      entries: [item('acme', { command: 'x', status: 'current' })]
    })
    const runner = env()
    expect(await runExtensionAutoUpdates({} as never, runner)).toEqual([])
    expect(runner.runCommand).not.toHaveBeenCalled()
  })

  it('leaves an entry whose switch is off alone', async () => {
    readExtensionInventoryMock.mockResolvedValue({
      entries: [item('acme', { command: 'x', autoUpdateEnabled: false })]
    })
    const runner = env()
    await runExtensionAutoUpdates({} as never, runner)
    expect(runner.runCommand).not.toHaveBeenCalled()
  })

  it('leaves an entry the catalog never cleared alone', async () => {
    readExtensionInventoryMock.mockResolvedValue({
      entries: [item('acme', { command: 'x', autoUpdateSupported: false })]
    })
    const runner = env()
    await runExtensionAutoUpdates({} as never, runner)
    expect(runner.runCommand).not.toHaveBeenCalled()
  })

  it('runs an eligible update and reports what changed', async () => {
    readExtensionInventoryMock.mockResolvedValue({
      entries: [item('acme', { command: 'pipx install --force acme' })]
    })
    const runner = env()
    const outcomes = await runExtensionAutoUpdates({} as never, runner)
    expect(runner.runCommand).toHaveBeenCalledWith('pipx install --force acme')
    expect(outcomes).toEqual([
      { id: 'acme', name: 'acme', from: '1.0.0', to: '2.0.0', ok: true }
    ])
  })

  it('runs entries one at a time rather than racing two package managers', async () => {
    readExtensionInventoryMock.mockResolvedValue({
      entries: [item('one', { command: 'a' }), item('two', { command: 'b' })]
    })
    let inFlight = 0
    let maxInFlight = 0
    const runner = env({
      runCommand: vi.fn(async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await Promise.resolve()
        inFlight -= 1
        return { code: 0, stderr: '', timedOut: false }
      })
    })
    await runExtensionAutoUpdates({} as never, runner)
    expect(maxInFlight).toBe(1)
  })

  it('switches a failing entry back to manual instead of retrying it forever', async () => {
    readExtensionInventoryMock.mockResolvedValue({ entries: [item('acme', { command: 'boom' })] })
    const runner = env({
      runCommand: vi.fn().mockResolvedValue({ code: 1, stderr: 'no such package', timedOut: false })
    })
    const [outcome] = await runExtensionAutoUpdates({} as never, runner)
    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain('no such package')
    expect(runner.disableAutoUpdate).toHaveBeenCalledWith('acme')
  })

  it('reports a timeout as a timeout rather than as an exit code', async () => {
    readExtensionInventoryMock.mockResolvedValue({ entries: [item('acme', { command: 'hang' })] })
    const runner = env({
      runCommand: vi.fn().mockResolvedValue({ code: -1, stderr: '', timedOut: true })
    })
    const [outcome] = await runExtensionAutoUpdates({} as never, runner)
    expect(outcome.error).toContain('time limit')
    expect(runner.disableAutoUpdate).toHaveBeenCalledWith('acme')
  })

  it('disables an entry marked auto-updatable with no command to run', async () => {
    readExtensionInventoryMock.mockResolvedValue({ entries: [item('acme')] })
    const runner = env()
    const [outcome] = await runExtensionAutoUpdates({} as never, runner)
    expect(outcome.ok).toBe(false)
    expect(runner.disableAutoUpdate).toHaveBeenCalledWith('acme')
  })

  it('keeps going after one entry fails', async () => {
    readExtensionInventoryMock.mockResolvedValue({
      entries: [item('bad', { command: 'boom' }), item('good', { command: 'ok' })]
    })
    const runner = env({
      runCommand: vi.fn(async (command: string) =>
        command === 'boom'
          ? { code: 1, stderr: 'nope', timedOut: false }
          : { code: 0, stderr: '', timedOut: false }
      )
    })
    const outcomes = await runExtensionAutoUpdates({} as never, runner)
    expect(outcomes.map((outcome) => outcome.ok)).toEqual([false, true])
  })

  it('records every outcome, so an unattended change is never unrecorded', async () => {
    readExtensionInventoryMock.mockResolvedValue({ entries: [item('acme', { command: 'ok' })] })
    const runner = env()
    await runExtensionAutoUpdates({} as never, runner)
    expect(runner.log).toHaveBeenCalledWith([
      { id: 'acme', name: 'acme', from: '1.0.0', to: '2.0.0', ok: true }
    ])
  })
})
