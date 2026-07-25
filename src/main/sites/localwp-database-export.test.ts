import { mkdir, mkdtemp, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { discardLocalDatabaseExport, exportLocalDatabase } from './localwp-database-export'

const PREFIX = 'muster-localwp-export-'
const PASSWORD = 'sup3rsecret-do-not-log'

async function countExportDirectories(): Promise<number> {
  return (await readdir(tmpdir())).filter((entry) => entry.startsWith(PREFIX)).length
}

describe('discardLocalDatabaseExport', () => {
  it('removes one of its own temp directories', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), PREFIX))
    await discardLocalDatabaseExport(directory)
    await expect(stat(directory)).rejects.toThrow()
  })

  // This deletes a whole tree, so being handed a caller-supplied path must be impossible, not
  // merely unlikely: an earlier revision derived it from dirname(dumpPath) and could target /tmp.
  it('refuses a directory that is not an export directory', async () => {
    const foreign = path.join(tmpdir(), `muster-not-an-export-${process.pid}`)
    await mkdir(foreign, { recursive: true })
    await expect(discardLocalDatabaseExport(foreign)).rejects.toThrow(/Refusing to delete/)
    expect((await stat(foreign)).isDirectory()).toBe(true)
    await discardLocalDatabaseExport(await mkdtemp(path.join(tmpdir(), PREFIX)))
  })

  it('refuses the temp root itself', async () => {
    await expect(discardLocalDatabaseExport(tmpdir())).rejects.toThrow(/Refusing to delete/)
  })
})

describe('exportLocalDatabase', () => {
  // Runs whether or not mysqldump is installed: either branch must fail cleanly, leak no temp
  // directory, and keep the password out of the message.
  it('fails cleanly for an unreachable database without leaking the password or a temp directory', async () => {
    const before = await countExportDirectories()
    const result = await exportLocalDatabase({
      databaseName: 'muster_definitely_missing_db',
      databaseUser: 'muster_missing_user',
      databasePassword: PASSWORD,
      databaseSocket: path.join(tmpdir(), 'muster-no-such-mysqld.sock')
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).not.toContain(PASSWORD)
      expect(result.reason.length).toBeGreaterThan(0)
    }
    expect(await countExportDirectories()).toBe(before)
  })
})
