import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { StreamCommandOptions, StreamCommandResult } from '../lib/stream-command'
import { SiteRunCancelledError, SiteRunStepError } from './pipeline-contract'
import type {
  SiteExecOptions,
  SiteExecResult,
  SiteRunContext,
  SiteRunProgress,
  SiteSshSession,
  SiteTransferProgress
} from './pipeline-contract'
import type { ThemeDeployPaths } from './theme-build'
import { buildRemoteExtractCommand, uploadThemeDist, zipThemeDist } from './theme-upload'

const THEME = 'acme-theme'

type Recorder = {
  context: SiteRunContext
  logs: string[]
  stages: string[]
  progressEvents: SiteRunProgress[]
  cancel: () => void
}

function createRecordingContext(): Recorder {
  const controller = new AbortController()
  const logs: string[] = []
  const stages: string[] = []
  const progressEvents: SiteRunProgress[] = []
  return {
    logs,
    stages,
    progressEvents,
    cancel: () => controller.abort(),
    context: {
      signal: controller.signal,
      log: (line) => logs.push(line),
      status: (stage) => stages.push(stage),
      progress: (event) => progressEvents.push(event),
      throwIfCancelled: () => {
        if (controller.signal.aborted) {
          throw new SiteRunCancelledError()
        }
      }
    }
  }
}

type RunnerCall = { command: string; args: string[]; options?: StreamCommandOptions }

type FakeRunner = {
  run: (
    command: string,
    args: string[],
    options?: StreamCommandOptions
  ) => Promise<StreamCommandResult>
  calls: RunnerCall[]
}

function createFakeRunner(
  handler: (call: RunnerCall) => Promise<Partial<StreamCommandResult>>
): FakeRunner {
  const calls: RunnerCall[] = []
  return {
    calls,
    run: async (command, args, options) => {
      calls.push({ command, args, options })
      const partial = await handler({ command, args, options })
      return {
        code: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
        truncated: false,
        stoppedEarly: false,
        ...partial
      }
    }
  }
}

type UploadCall = { localPath: string; remotePath: string }

type SessionSpy = {
  session: SiteSshSession
  commands: string[]
  execOptions: (SiteExecOptions | undefined)[]
  uploads: UploadCall[]
  closed: number
}

function createFakeSession(options: {
  exec?: (command: string) => Partial<SiteExecResult>
  onUpload?: (call: UploadCall, onProgress?: SiteTransferProgress) => Promise<void>
}): SessionSpy {
  const commands: string[] = []
  const execOptions: (SiteExecOptions | undefined)[] = []
  const uploads: UploadCall[] = []
  const spy: SessionSpy = {
    commands,
    execOptions,
    uploads,
    closed: 0,
    session: {
      exec: async (command, execOption) => {
        commands.push(command)
        execOptions.push(execOption)
        return { code: 0, stdout: '', stderr: '', ...options.exec?.(command) }
      },
      download: async () => {},
      upload: async (localPath, remotePath, onProgress) => {
        const call = { localPath, remotePath }
        uploads.push(call)
        await options.onUpload?.(call, onProgress)
      },
      writeSecureRemoteFile: async () => {},
      removeRemoteFile: async () => {},
      close: async () => {
        spy.closed += 1
      }
    }
  }
  return spy
}

describe('buildRemoteExtractCommand', () => {
  it('quotes every interpolated value and keeps the find placeholders literal', () => {
    expect(
      buildRemoteExtractCommand({
        localDistPath: '/sites/acme/wp-content/themes/acme-theme/assets/dist',
        remoteDistParent: 'public_html/wp-content/themes/acme-theme/assets',
        distBasename: 'dist',
        localZipPath: '/sites/acme/acme-theme_dist.zip',
        remoteZipName: 'acme-theme_dist.zip'
      })
    ).toBe(
      `cd 'public_html/wp-content/themes/acme-theme/assets' && ` +
        `rm -rf 'dist' && ` +
        `unzip -o 'acme-theme_dist.zip' -d 'dist' && ` +
        `rm 'acme-theme_dist.zip' && ` +
        `find 'dist' -type d -exec chmod 755 {} + && ` +
        `find 'dist' -type f -exec chmod 644 {} +`
    )
  })

  it('escapes a single quote in the remote parent, zip name and basename', () => {
    const command = buildRemoteExtractCommand({
      localDistPath: '/local/dist',
      remoteDistParent: "public_html/o'brien",
      distBasename: "di'st",
      localZipPath: '/local/x.zip',
      remoteZipName: "o'brien_dist.zip"
    })

    expect(command).toContain(`cd 'public_html/o'\\''brien'`)
    expect(command).toContain(`rm -rf 'di'\\''st'`)
    expect(command).toContain(`unzip -o 'o'\\''brien_dist.zip' -d 'di'\\''st'`)
    // The raw values must never appear unescaped, or the remote shell would end the quoted word.
    expect(command).not.toContain("o'brien")
    expect(command).not.toContain("di'st")
  })
})

describe('theme dist zipping and upload', () => {
  let wpDir: string
  let paths: ThemeDeployPaths

  beforeEach(async () => {
    wpDir = await mkdtemp(path.join(tmpdir(), 'muster-theme-upload-'))
    paths = {
      localDistPath: path.join(wpDir, 'wp-content', 'themes', THEME, 'assets', 'dist'),
      remoteDistParent: `public_html/wp-content/themes/${THEME}/assets`,
      distBasename: 'dist',
      localZipPath: path.join(wpDir, `${THEME}_dist.zip`),
      remoteZipName: `${THEME}_dist.zip`
    }
    await mkdir(paths.localDistPath, { recursive: true })
    await writeFile(path.join(paths.localDistPath, 'main.css'), 'body{}')
  })

  afterEach(async () => {
    await rm(wpDir, { recursive: true, force: true })
  })

  /** Stands in for a successful `zip -r`: writes an archive of the requested size. */
  async function writeZip(size: number): Promise<void> {
    await writeFile(paths.localZipPath, 'z'.repeat(size))
  }

  describe('zipThemeDist', () => {
    it('zips the dist contents from inside the dist directory', async () => {
      const { context, stages } = createRecordingContext()
      const runner = createFakeRunner(async () => {
        await writeZip(2048)
        return {}
      })

      await expect(zipThemeDist(context, paths, { runCommand: runner.run })).resolves.toBe(2048)

      expect(runner.calls).toHaveLength(1)
      expect(runner.calls[0]!.command).toBe('/bin/sh')
      expect(runner.calls[0]!.options?.cwd).toBe(paths.localDistPath)
      expect(stages).toEqual(['Zipping theme dist'])
    })

    it('quotes the archive path but leaves the globs expandable', async () => {
      const { context } = createRecordingContext()
      const runner = createFakeRunner(async () => {
        await writeZip(16)
        return {}
      })

      await zipThemeDist(context, paths, { runCommand: runner.run })

      const archive = `'${paths.localZipPath}'`
      expect(runner.calls[0]!.args[1]).toBe(
        `zip -r ${archive} * .[^.]* 2>/dev/null || zip -r ${archive} *`
      )
    })

    it('deletes a stale archive from a previous deploy first', async () => {
      const { context } = createRecordingContext()
      await writeFile(paths.localZipPath, 'stale')
      let staleSurvived = true
      const runner = createFakeRunner(async () => {
        staleSurvived = await stat(paths.localZipPath)
          .then(() => true)
          .catch(() => false)
        await writeZip(8)
        return {}
      })

      await zipThemeDist(context, paths, { runCommand: runner.run })

      expect(staleSurvived).toBe(false)
    })

    it('fails when the zip command exits non-zero', async () => {
      const { context } = createRecordingContext()
      const runner = createFakeRunner(async () => ({ code: 12 }))

      await expect(zipThemeDist(context, paths, { runCommand: runner.run })).rejects.toThrowError(
        'Zipping the theme dist failed (exit 12).'
      )
    })

    it('fails when the zip command claims success but produced no archive', async () => {
      const { context } = createRecordingContext()
      const runner = createFakeRunner(async () => ({}))

      await expect(zipThemeDist(context, paths, { runCommand: runner.run })).rejects.toThrowError(
        `Zip file was not created at ${paths.localZipPath}`
      )
    })
  })

  describe('uploadThemeDist', () => {
    function successfulRunner(size = 4096): FakeRunner {
      return createFakeRunner(async () => {
        await writeZip(size)
        return {}
      })
    }

    it('creates the remote parent, uploads with byte progress, then extracts in place', async () => {
      const { context, progressEvents, stages } = createRecordingContext()
      const spy = createFakeSession({
        onUpload: async (_call, onProgress) => {
          onProgress?.(2048, 4096)
          onProgress?.(4096, 4096)
        }
      })

      await uploadThemeDist(context, spy.session, paths, { runCommand: successfulRunner().run })

      expect(spy.commands[0]).toBe(`mkdir -p '${paths.remoteDistParent}'`)
      expect(spy.uploads).toEqual([
        {
          localPath: paths.localZipPath,
          remotePath: `${paths.remoteDistParent}/${paths.remoteZipName}`
        }
      ])
      expect(spy.commands[1]).toBe(buildRemoteExtractCommand(paths))
      // No deadline on the extract: the old dist is gone, so a killed unzip breaks the live theme.
      expect(spy.execOptions[1]).toEqual({ timeoutMs: 0 })
      expect(progressEvents).toEqual([
        { label: 'Uploading theme dist', transferred: 2048, total: 4096 },
        { label: 'Uploading theme dist', transferred: 4096, total: 4096 }
      ])
      expect(stages).toEqual([
        'Zipping theme dist',
        'Uploading theme dist',
        'Extracting theme dist on the server'
      ])
    })

    it('deletes the local archive once the upload has finished', async () => {
      const { context } = createRecordingContext()
      const spy = createFakeSession({})

      await uploadThemeDist(context, spy.session, paths, { runCommand: successfulRunner().run })

      await expect(stat(paths.localZipPath)).rejects.toThrow()
    })

    it('reports the remote path when the transfer itself fails, and still cleans up', async () => {
      const { context } = createRecordingContext()
      const spy = createFakeSession({
        onUpload: async () => {
          throw new Error('Permission denied')
        }
      })

      const error = await uploadThemeDist(context, spy.session, paths, {
        runCommand: successfulRunner().run
      }).catch((thrown: unknown) => thrown)

      expect(error).toBeInstanceOf(SiteRunStepError)
      expect((error as SiteRunStepError).message).toBe(
        `Could not upload zip to ${paths.remoteDistParent}/${paths.remoteZipName}: Permission denied`
      )
      await expect(stat(paths.localZipPath)).rejects.toThrow()
    })

    it('treats any stderr from the remote extraction as fatal', async () => {
      const { context } = createRecordingContext()
      const spy = createFakeSession({
        exec: (command) =>
          command.startsWith('cd ') ? { stderr: 'unzip: cannot find zipfile' } : {}
      })

      await expect(
        uploadThemeDist(context, spy.session, paths, { runCommand: successfulRunner().run })
      ).rejects.toThrowError('unzip: cannot find zipfile')
    })

    it('fails on a non-zero remote extraction exit with no stderr', async () => {
      const { context } = createRecordingContext()
      const spy = createFakeSession({
        exec: (command) => (command.startsWith('cd ') ? { code: 9 } : {})
      })

      await expect(
        uploadThemeDist(context, spy.session, paths, { runCommand: successfulRunner().run })
      ).rejects.toThrowError('Remote theme extraction failed.')
    })

    it('aborts before touching the server when cancelled during zipping', async () => {
      const { context, cancel } = createRecordingContext()
      const spy = createFakeSession({})
      const runner = createFakeRunner(async () => {
        await writeZip(16)
        cancel()
        return {}
      })

      await expect(
        uploadThemeDist(context, spy.session, paths, { runCommand: runner.run })
      ).rejects.toBeInstanceOf(SiteRunCancelledError)
      expect(spy.commands).toHaveLength(0)
      expect(spy.uploads).toHaveLength(0)
    })

    it('aborts before extracting when cancelled during the upload', async () => {
      const { context, cancel } = createRecordingContext()
      const spy = createFakeSession({
        onUpload: async () => {
          cancel()
        }
      })

      await expect(
        uploadThemeDist(context, spy.session, paths, { runCommand: successfulRunner().run })
      ).rejects.toBeInstanceOf(SiteRunCancelledError)
      expect(spy.commands).toEqual([`mkdir -p '${paths.remoteDistParent}'`])
    })
  })
})
