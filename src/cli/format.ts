import type { CliStatusResult } from '../shared/runtime-types'
import type { RuntimeRpcFailure, RuntimeRpcSuccess } from './runtime-client'
import { RuntimeClientError, RuntimeRpcFailureError } from './runtime-client'
import { glyph, isCliStyleEnabled, keyValueBlock, statusLine, tone } from './cli-style'

export {
  formatBrowserProfileList,
  formatScreenshot,
  formatSnapshot,
  formatTabList,
  formatTabListWithProfiles,
  formatTabProfileClone,
  formatTabProfileShow,
  formatTabShow
} from './browser-format'

export {
  formatProjectHostSetupCreateResult,
  formatProjectHostSetupDeleteResult,
  formatProjectHostSetupList,
  formatProjectHostSetupResult,
  formatProjectHostSetupUpdateResult,
  formatProjectList
} from './project-format'
export {
  formatTerminalClose,
  formatTerminalCreate,
  formatTerminalFocus,
  formatTerminalList,
  formatTerminalRead,
  formatTerminalRename,
  formatTerminalSend,
  formatTerminalShow,
  formatTerminalSplit,
  formatTerminalWait
} from './terminal-format'
export {
  formatAutomationList,
  formatAutomationRemoved,
  formatAutomationRun,
  formatAutomationRuns,
  formatAutomationShow,
  formatEnvironment,
  formatEnvironmentList,
  formatMemorySnapshot,
  formatRepoList,
  formatRepoRefs,
  formatRepoShow,
  formatWorktreeList,
  formatWorktreePs,
  formatWorktreeShow
} from './workspace-format'

export function printResult<TResult>(
  response: RuntimeRpcSuccess<TResult>,
  json: boolean,
  formatter: (value: TResult) => string
): void {
  if (json) {
    console.log(JSON.stringify(response, null, 2))
    return
  }
  console.log(formatter(response.result))
}

export function formatCliError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof RuntimeClientError && error.code === 'runtime_unavailable') {
    return `${message}\nMuster is not running. Run 'muster open' first.`
  }
  if (error instanceof RuntimeClientError) {
    const nextSteps = nextStepsFromData(error.data)
    if (nextSteps.length > 0) {
      return formatMessageWithNextSteps(message, nextSteps)
    }
  }
  if (
    error instanceof RuntimeRpcFailureError &&
    error.response.error.code === 'runtime_unavailable'
  ) {
    return `${message}\nMuster is not running. Run 'muster open' first.`
  }
  if (error instanceof RuntimeRpcFailureError) {
    return formatMessageWithNextSteps(message, nextStepsFromData(error.response.error.data))
  }
  return message
}

export function reportCliError(error: unknown, json: boolean): void {
  if (json) {
    if (error instanceof RuntimeRpcFailureError) {
      console.log(JSON.stringify(error.response, null, 2))
    } else {
      const response: RuntimeRpcFailure = {
        id: 'local',
        ok: false,
        error: {
          code: error instanceof RuntimeClientError ? error.code : 'runtime_error',
          message: error instanceof Error ? error.message : String(error),
          data: error instanceof RuntimeClientError ? error.data : undefined
        },
        _meta: {
          runtimeId: null
        }
      }
      console.log(JSON.stringify(response, null, 2))
    }
  } else {
    console.error(
      isCliStyleEnabled(process.stderr) ? formatStyledCliError(error) : formatCliError(error)
    )
  }
}

function formatStyledCliError(error: unknown): string {
  const [message, ...details] = formatCliError(error).split('\n')
  const lines = [statusLine('failure', message, process.stderr)]
  for (const detail of details) {
    const step = detail.startsWith('Next step: ') ? detail.slice('Next step: '.length) : detail
    lines.push(`  ${tone('muted', glyph('pointer'), process.stderr)} ${step}`)
  }
  return lines.join('\n')
}

function formatMessageWithNextSteps(message: string, nextSteps: readonly string[]): string {
  if (nextSteps.length === 0) {
    return message
  }
  return `${message}\n${nextSteps.map((step) => `Next step: ${step}`).join('\n')}`
}

function nextStepsFromData(data: unknown): string[] {
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { nextSteps?: unknown }).nextSteps)
  ) {
    return (data as { nextSteps: unknown[] }).nextSteps.filter(
      (step): step is string => typeof step === 'string'
    )
  }
  return []
}

export function formatCliStatus(status: CliStatusResult): string {
  if (isCliStyleEnabled()) {
    return formatStyledCliStatus(status)
  }
  return [
    `appRunning: ${status.app.running}`,
    `pid: ${status.app.pid ?? 'none'}`,
    `desktopWindowStatus: ${status.app.desktopWindowStatus ?? 'unknown'}`,
    `runtimeState: ${status.runtime.state}`,
    `runtimeReachable: ${status.runtime.reachable}`,
    `runtimeId: ${status.runtime.runtimeId ?? 'none'}`,
    `graphState: ${status.graph.state}`
  ].join('\n')
}

export function formatStatus(status: CliStatusResult): string {
  return formatCliStatus(status)
}

function formatStyledCliStatus(status: CliStatusResult): string {
  const ready = status.runtime.reachable && status.graph.state === 'ready'
  const headline = !status.app.running
    ? statusLine('failure', 'Muster is not running')
    : ready
      ? statusLine('success', 'Muster is running')
      : statusLine('warning', `Muster is starting (${status.graph.state})`)
  return [
    headline,
    keyValueBlock([
      ['pid', String(status.app.pid ?? 'none')],
      ['window', status.app.desktopWindowStatus ?? 'unknown'],
      ['runtime', `${status.runtime.state}${status.runtime.reachable ? '' : ' (unreachable)'}`],
      ['runtime id', status.runtime.runtimeId ?? 'none'],
      ['projects', status.graph.state]
    ])
  ].join('\n')
}
