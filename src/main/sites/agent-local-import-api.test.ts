import { describe, expect, it } from 'vitest'
import type { AgentLocalHost, AgentLocalResponse } from './agent-local-host'
import { importDatabaseViaDaemon } from './agent-local-import-api'

function scriptedHost(responses: AgentLocalResponse[]): AgentLocalHost {
  const queue = [...responses]
  return {
    platform: 'darwin',
    homeDir: '/home/test',
    readToken: async () => 'token',
    request: async () => queue.shift() ?? { ok: false, status: 500, error: 'script exhausted' },
    spawnDaemon: async () => ({ kind: 'started' }),
    sleep: async () => undefined
  }
}

describe('importDatabaseViaDaemon', () => {
  it('names a daemon restart when a job that answered before goes 404', async () => {
    const host = scriptedHost([
      { ok: true, status: 200, data: { id: 'job-1' } },
      { ok: true, status: 200, data: { status: 'running', steps: [{ stage: 'database' }] } },
      { ok: false, status: 404, error: 'no such job' }
    ])

    await expect(
      importDatabaseViaDaemon({
        slug: 'acme',
        dumpPath: '/tmp/d.sql',
        keepUrls: false,
        options: { host }
      })
    ).rejects.toThrow('Agent Local restarted during the import')
  })

  it('keeps the daemon message when the job was never seen', async () => {
    const host = scriptedHost([
      { ok: true, status: 200, data: { id: 'job-1' } },
      { ok: false, status: 404, error: 'no such job' }
    ])

    await expect(
      importDatabaseViaDaemon({
        slug: 'acme',
        dumpPath: '/tmp/d.sql',
        keepUrls: false,
        options: { host }
      })
    ).rejects.toThrow('no such job')
  })
})
