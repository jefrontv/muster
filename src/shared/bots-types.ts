// Muster Bots: the state of the bundled bots server, as the Bots tab sees it.
export type BotsSidecarStatus =
  | { state: 'stopped' }
  | { state: 'starting' }
  | { state: 'running'; url: string; partition: string }
  | { state: 'failed'; error: string }
  /** This build has no bots server bundled (dev checkout without `pnpm fetch:muster-bots`). */
  | { state: 'missing' }

export const BOTS_PARTITION = 'persist:muster-bots'

/** A saved bots key, shown by its last four characters only. */
export type BotsKeyStatus = { saved: boolean; hint: string | null }

export type BotsKeySaveResult =
  | { ok: true; status: BotsKeyStatus }
  | { ok: false; message: string; status: BotsKeyStatus }
