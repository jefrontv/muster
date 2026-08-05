/** One skill shipped inside the app bundle, as listed by `resources/skills/current-manifest.json`. */
export type BundledAgentSkill = {
  /** Manifest name; also the key used in `GlobalSettings.agentCapabilityBundledSkills`. */
  name: string
  /** SKILL.md frontmatter description, or null when the package ships without one. */
  description: string | null
  /** True when Muster lays this skill down itself on launch rather than waiting to be asked. */
  autoInstalled: boolean
}
