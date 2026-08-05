import { app, ipcMain } from 'electron'
import type { Store } from '../persistence'
import {
  SkillDiscoveryTargetSchema,
  type SkillDiscoveryResult,
  type SkillDiscoveryTarget
} from '../../shared/skills'
import type { SkillFreshnessInventory } from '../../shared/skill-freshness'
import { inventorySkillFreshness } from '../skills/skill-freshness-inventory'
import {
  discoverSkillsOnTarget,
  resolveSkillDiscoveryTarget
} from '../skills/skill-discovery-target'
import { listBundledAgentSkills } from '../skills/bundled-skill-catalog'
import type { BundledAgentSkill } from '../../shared/bundled-agent-skills'

export function registerSkillsHandlers(store: Store): void {
  for (const channel of ['skills:discover', 'skills:freshnessInventory', 'skills:bundled']) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('skills:bundled', async (): Promise<BundledAgentSkill[]> => {
    return listBundledAgentSkills()
  })

  ipcMain.handle(
    'skills:discover',
    async (_event, target?: SkillDiscoveryTarget): Promise<SkillDiscoveryResult> => {
      const parsedTarget = target ? SkillDiscoveryTargetSchema.parse(target) : undefined
      return discoverSkillsOnTarget(resolveSkillDiscoveryTarget(parsedTarget), store.getRepos())
    }
  )

  ipcMain.handle('skills:freshnessInventory', async (): Promise<SkillFreshnessInventory> => {
    // Why: the update command targets this machine's global homes. WSL and SSH
    // inventories stay out until their installer rail has an equivalent proof.
    return inventorySkillFreshness({
      currentAppVersion: app.getVersion(),
      repos: store.getRepos()
    })
  })
}
