// Turns the skills already on this machine into Extension Hub rows.
//
// The Skills tab's first job is answering "what do my harnesses actually have?", and most of that
// answer is skills Muster never published: ones the user installed, ones a plugin brought along,
// ones a repo carries. Listing only the curated catalog would show an empty tab on a machine with
// thirty skills on it.
//
// These rows are informational. There is no install command and no update, because Muster did not
// put them there and has no idea how they arrived — claiming otherwise would offer an action that
// cannot work.

import type { DiscoveredSkill, SkillDiscoveryResult } from '../../shared/skills'
import type { ExtensionEntry } from '../../shared/extension-catalog-types'
import type { ExtensionInventoryEntry } from '../../shared/extension-state-types'

/** Ids reach settings keys and React keys, so they get the same treatment catalog ids get. */
export function discoveredSkillId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `local-skill-${slug || 'unnamed'}`
}

function toEntry(skill: DiscoveredSkill): ExtensionEntry {
  return {
    id: discoveredSkillId(skill.name),
    kind: 'skill',
    name: skill.name,
    description: skill.description ?? '',
    keywords: [skill.sourceKind, ...skill.providers],
    version: '',
    install: { method: 'bundled-skill', skill: skill.name },
    latest: { source: 'bundled' }
  }
}

export function discoveredSkillEntries(
  discovery: SkillDiscoveryResult,
  takenIds: ReadonlySet<string>
): ExtensionInventoryEntry[] {
  const seen = new Set(takenIds)
  const entries: ExtensionInventoryEntry[] = []
  for (const skill of discovery.skills) {
    const entry = toEntry(skill)
    // Why dedupe: the same skill can be reached through several roots, and a catalog entry for it
    // already carries an install route this row would contradict.
    if (seen.has(entry.id)) {
      continue
    }
    seen.add(entry.id)
    entries.push({
      entry,
      state: {
        id: entry.id,
        installed: true,
        installedVersion: null,
        latestVersion: null,
        status: 'current',
        binaryPath: null,
        harnesses: [],
        autoUpdateSupported: false,
        autoUpdateEnabled: false,
        origin: {
          label: skill.sourceLabel,
          path: skill.skillFilePath,
          providers: skill.providers
        }
      }
    })
  }
  return entries
}
