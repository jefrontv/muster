// Streaming LocalWP migration status lines back to the window that asked for the migration.
//
// The migration is a multi-minute operation that can block on an OS password prompt, so the
// renderer needs the running log ocsites showed (tui_deploy:2591-2654) instead of one static line.
// Events carry the siteId: the channel is per-window, so a second window running its own migration
// must never have its lines rendered into this one's log.

import type { WebContents } from 'electron'
import type { LocalWpMigrationProgressEvent } from '../../shared/site-stack-types'

export const SITE_STACK_MIGRATION_PROGRESS_CHANNEL = 'siteStacks:migrationProgress'

const REDACTED = '••••••'

// The migration handles wp-admin and database credentials, and a failing mysql/mysqldump reports
// its own argv. Mask the value rather than dropping the line: the reason a step failed is exactly
// what the user needs, and a dropped line reads as "nothing happened" all over again.
// `[\w-]*` picks up prefixed names such as DB_PASSWORD, where \b would not fire before "PASSWORD".
const SECRET_ASSIGNMENT =
  /(--?(?:password|pass|pwd)[= ]|[\w-]*(?:password|passwd|pwd|secret|token)\s*[:=]\s*)(['"]?)([^\s'";,)]+)\2/gi
// mysql's short form packs the value onto the flag: `-phunter2`.
const MYSQL_SHORT_PASSWORD = /(^|\s)-p\S+/g

/** Masks credential-shaped fragments plus any literal secret this run is known to hold. */
export function redactMigrationStatus(message: string, secrets: readonly string[] = []): string {
  let redacted = message
  for (const secret of secrets) {
    if (secret.length > 0) {
      redacted = redacted.split(secret).join(REDACTED)
    }
  }
  return redacted
    .replace(SECRET_ASSIGNMENT, (_match, prefix: string, quote: string) =>
      quote.length > 0 ? `${prefix}${quote}${REDACTED}${quote}` : `${prefix}${REDACTED}`
    )
    .replace(MYSQL_SHORT_PASSWORD, `$1-p${REDACTED}`)
}

/**
 * Returns an `onStatus` sink for runLocalWpMigration. Sending to a destroyed webContents throws, so
 * a window closed mid-migration must silently stop receiving rather than abort the migration.
 */
export function createMigrationProgressForwarder(
  sender: WebContents,
  siteId: string,
  secrets: readonly string[] = []
): (message: string) => void {
  return (message) => {
    if (sender.isDestroyed()) {
      return
    }
    const event: LocalWpMigrationProgressEvent = {
      siteId,
      message: redactMigrationStatus(message, secrets)
    }
    sender.send(SITE_STACK_MIGRATION_PROGRESS_CHANNEL, event)
  }
}
