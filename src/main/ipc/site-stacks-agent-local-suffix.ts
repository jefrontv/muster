import { ipcMain } from 'electron'
import { readAgentLocalSuffix } from '../sites/agent-local-suffix'
import type { SiteResult } from './sites-result'

/** The suffix agent-local gives new sites, so setup proposes `<slug>.al` rather than `.local`. */
export function registerAgentLocalSuffixHandler(): void {
  ipcMain.removeHandler('siteStacks:agentLocalSuffix')
  ipcMain.handle(
    'siteStacks:agentLocalSuffix',
    async (): Promise<SiteResult<string | null>> => ({
      ok: true,
      value: await readAgentLocalSuffix()
    })
  )
}
