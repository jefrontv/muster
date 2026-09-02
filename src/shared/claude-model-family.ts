// Family (picker-level) identity from a concrete Claude model id. Claude Code
// accepts family aliases ("fable", "opus") for --model and /model, so a family
// learned from any transcript is immediately usable as a picker entry.

export type ClaudeModelFamily = { id: string; label: string }

/**
 * `claude-fable-5` → fable, `claude-opus-4-8` → opus, `claude-haiku-4-5-2025…`
 * → haiku, `anthropic.claude-3-sonnet…` (Bedrock) → sonnet. Null for anything
 * without a `claude-` marker (`<synthetic>`, other vendors' ids).
 */
export function claudeModelFamilyFromId(
  modelId: string | null | undefined
): ClaudeModelFamily | null {
  const id = (modelId ?? '').toLowerCase()
  const tail = /(?:^|[^a-z])claude-([a-z0-9][a-z0-9-]*)/.exec(id)?.[1]
  if (!tail) {
    return null
  }
  // Family = alphabetic segments after any leading version digits (legacy ids
  // like claude-3-5-sonnet put the number first); digits or date stamps end it.
  const parts = tail.split('-')
  let start = 0
  while (start < parts.length && /^\d+$/.test(parts[start])) {
    start += 1
  }
  const segments: string[] = []
  for (const segment of parts.slice(start)) {
    if (!/^[a-z]+$/.test(segment)) {
      break
    }
    segments.push(segment)
  }
  if (segments.length === 0) {
    return null
  }
  const family = segments.join('-')
  const label = segments
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
  return { id: family, label }
}
