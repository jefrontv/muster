import type { WebContents } from 'electron'
import { describe, expect, it } from 'vitest'
import {
  createMigrationProgressForwarder,
  redactMigrationStatus,
  SITE_STACK_MIGRATION_PROGRESS_CHANNEL
} from './site-stack-progress'

type Sent = { channel: string; payload: unknown }

function sender(destroyed = false): { webContents: WebContents; sent: Sent[] } {
  const sent: Sent[] = []
  const webContents = {
    isDestroyed: () => destroyed,
    send: (channel: string, payload: unknown) => {
      sent.push({ channel, payload })
    }
  } as unknown as WebContents
  return { webContents, sent }
}

describe('redactMigrationStatus', () => {
  it('masks a mysqldump --password flag', () => {
    expect(redactMigrationStatus('mysqldump --password=hunter2 acme_db failed')).toBe(
      'mysqldump --password=•••••• acme_db failed'
    )
  })

  it("masks mysql's packed -p short form", () => {
    expect(redactMigrationStatus('mysql -uroot -phunter2 --socket=/tmp/s.sock')).toBe(
      'mysql -uroot -p•••••• --socket=/tmp/s.sock'
    )
  })

  it('masks a quoted define value without eating its quotes', () => {
    expect(redactMigrationStatus("read DB_PASSWORD: 'hunter2' from wp-config.php")).toBe(
      "read DB_PASSWORD: '••••••' from wp-config.php"
    )
  })

  it('masks a literal secret wherever it appears, even unlabelled', () => {
    expect(redactMigrationStatus('Creating LocalWP site as admin/hunter2…', ['hunter2'])).toBe(
      'Creating LocalWP site as admin/••••••…'
    )
  })

  it('keeps the failure reason readable instead of dropping the line', () => {
    // Dropping a credential-shaped error would read as "nothing happened" — the original bug.
    const message = redactMigrationStatus(
      "Access denied for user 'root'@'localhost' (using password: YES)"
    )
    expect(message).toContain('Access denied')
    expect(message).not.toContain('YES')
  })

  it('leaves an ordinary status line untouched', () => {
    const message = 'Waiting for LocalWP to complete setup…'
    expect(redactMigrationStatus(message, ['hunter2'])).toBe(message)
  })
})

describe('createMigrationProgressForwarder', () => {
  it('tags every line with the siteId so a second window cannot cross-wire', () => {
    const { webContents, sent } = sender()
    const forward = createMigrationProgressForwarder(webContents, 'site-1')
    forward('Creating LocalWP site: acme.local…')
    forward('Socket ready.')
    expect(sent).toEqual([
      {
        channel: SITE_STACK_MIGRATION_PROGRESS_CHANNEL,
        payload: { siteId: 'site-1', message: 'Creating LocalWP site: acme.local…' }
      },
      {
        channel: SITE_STACK_MIGRATION_PROGRESS_CHANNEL,
        payload: { siteId: 'site-1', message: 'Socket ready.' }
      }
    ])
  })

  it('redacts the run’s admin password before it reaches the renderer', () => {
    const { webContents, sent } = sender()
    createMigrationProgressForwarder(webContents, 'site-1', ['hunter2'])('logged in as hunter2')
    expect(sent[0]?.payload).toEqual({ siteId: 'site-1', message: 'logged in as ••••••' })
  })

  it('goes quiet when the window closed mid-migration rather than throwing', () => {
    const { webContents, sent } = sender(true)
    const forward = createMigrationProgressForwarder(webContents, 'site-1')
    expect(() => forward('Socket ready.')).not.toThrow()
    expect(sent).toEqual([])
  })
})
