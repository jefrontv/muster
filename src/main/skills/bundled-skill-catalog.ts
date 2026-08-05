// What the app bundle ships, for the Settings → Agent Capabilities pane.
//
// The manifest is the source of truth for WHICH skills exist (it is what the freshness badge
// fingerprints against), but it carries digests, not prose. The human-readable description comes
// from the shipped SKILL.md's frontmatter — the same text an agent reads — so the pane can never
// describe a skill differently from what the agent is actually given.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { summarizeSkillMarkdown } from '../../shared/skill-metadata'
import type { BundledAgentSkill } from '../../shared/bundled-agent-skills'
import {
  DEFAULT_AGENT_SKILL_NAMES,
  defaultSkillPackageRoot,
  type DefaultAgentSkillName
} from './default-skill-install'
import { loadSkillBundleArtifacts } from './skill-bundle-artifacts'

async function readShippedDescription(packageRoot: string, name: string): Promise<string | null> {
  try {
    const markdown = await readFile(join(packageRoot, name, 'SKILL.md'), 'utf8')
    return summarizeSkillMarkdown(markdown).description
  } catch {
    // A skill listed in the manifest but absent from this build still belongs in the list: the
    // toggle governs future installs, so hiding the row would hide a decision the user can make.
    return null
  }
}

export async function listBundledAgentSkills(args?: {
  resourceRoot?: string
  packageRoot?: string
}): Promise<BundledAgentSkill[]> {
  const { manifest } = await loadSkillBundleArtifacts(args?.resourceRoot)
  const packageRoot = args?.packageRoot ?? defaultSkillPackageRoot()
  return Promise.all(
    manifest.skills.map(async (skill) => ({
      name: skill.name,
      description: await readShippedDescription(packageRoot, skill.name),
      autoInstalled: DEFAULT_AGENT_SKILL_NAMES.includes(skill.name as DefaultAgentSkillName)
    }))
  )
}
