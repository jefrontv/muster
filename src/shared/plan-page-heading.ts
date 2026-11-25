// A plan saved as a page carries its title in the page title, so the body drops a matching H1.
const LEADING_H1 = /^\s*#[ \t]+(.+?)[ \t#]*(?:\n|$)/

export function leadingHeading(markdown: string): string | null {
  return LEADING_H1.exec(markdown)?.[1]?.trim() || null
}

function sameHeading(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** The plan's H1 names the page unless the caller gave a real title (not a file name or "Plan"). */
export function planPageTitle(title: string, content: string): string {
  const heading = leadingHeading(content)
  const unnamed = !title.trim() || title === 'Plan' || /\.(md|markdown|mdx|txt)$/i.test(title)
  return heading && unnamed ? heading.slice(0, 120) : title
}

/** The page body: the plan without a leading H1 that repeats the page title. */
export function stripTitleHeading(content: string, title: string): string {
  const match = LEADING_H1.exec(content)
  if (!match?.[1] || !sameHeading(match[1], title)) {
    return content
  }
  return content.slice(match[0].length).replace(/^(?:[ \t]*\n)+/, '')
}

/** Puts the plan's H1 back on a page body, so diffs and line numbers match the agent's plan. */
export function restoreTitleHeading(pageMarkdown: string, planContent: string): string {
  const heading = leadingHeading(planContent)
  const pageHeading = leadingHeading(pageMarkdown)
  if (!heading || (pageHeading && sameHeading(pageHeading, heading))) {
    return pageMarkdown
  }
  return `# ${heading}\n\n${pageMarkdown.replace(/^(?:[ \t]*\n)+/, '')}`
}
