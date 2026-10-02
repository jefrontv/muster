// Docker, which DDEV drives: whether it answers, and starting it when Muster knows how.

import { ddevPlainError, DOCKER_NOT_RUNNING, type DdevHost } from './ddev-host'

const DOCKER_PROBE_TIMEOUT_MS = 8_000
/** Colima boots its VM in about 30 s here; Docker Desktop can take a minute and a half. */
const DOCKER_START_TIMEOUT_MS = 3 * 60_000

export async function isDockerRunning(host: DdevHost): Promise<boolean> {
  const docker = host.findBinary('docker')
  if (!docker) {
    return false
  }
  const result = await host.run(docker, ['info', '--format', '{{.ServerVersion}}'], {
    timeoutMs: DOCKER_PROBE_TIMEOUT_MS
  })
  return result.code === 0 && result.stdout.trim().length > 0
}

/**
 * Brings Docker up when Muster knows how: Colima by command, OrbStack or Docker Desktop by opening
 * the app (macOS only). Returns null when Docker is up, else the message to show.
 */
export async function ensureDockerRunning(
  host: DdevHost,
  onStatus?: (message: string) => void
): Promise<string | null> {
  if (await isDockerRunning(host)) {
    return null
  }
  const colima = host.findBinary('colima')
  if (colima) {
    onStatus?.('Docker is not running. Starting Colima (about 30 seconds)…')
    const started = await host.run(colima, ['start'], { timeoutMs: DOCKER_START_TIMEOUT_MS })
    if (started.code === 0 && (await isDockerRunning(host))) {
      onStatus?.('Colima is running.')
      return null
    }
    return `Colima did not start: ${ddevPlainError(`${started.stderr}\n${started.stdout}`)}`
  }
  if (host.platform === 'darwin') {
    for (const app of ['OrbStack', 'Docker']) {
      if (await host.pathExists(`/Applications/${app}.app`)) {
        onStatus?.(`Docker is not running. Opening ${app === 'Docker' ? 'Docker Desktop' : app}…`)
        await host.run('open', ['-a', app], { timeoutMs: DOCKER_PROBE_TIMEOUT_MS })
        const deadline = Date.now() + DOCKER_START_TIMEOUT_MS
        while (Date.now() < deadline) {
          await host.sleep(3_000)
          if (await isDockerRunning(host)) {
            return null
          }
        }
        return `${app === 'Docker' ? 'Docker Desktop' : app} did not finish starting. Open it, wait for it to say it is running, then retry.`
      }
    }
  }
  return DOCKER_NOT_RUNNING
}
