# ActiveCollab Project → Site Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind an ActiveCollab project to a local site once, then start a pre-briefed agent workspace for any task in that project.

**Architecture:** A per-profile settings map keys `"<instanceUrl>::<projectId>"` to a `Site.id`. A bind icon on the project group header writes it; a start-work control in the task row and detail pane reads it, resolves the site's repo, and opens the existing New Workspace composer with the task attached as a linked work item. The agent is briefed through the composer's existing draft path, extended with an ActiveCollab context block.

**Tech Stack:** TypeScript, React 19, Zustand, vitest, Tailwind, shadcn primitives, lucide icons.

## Global Constraints

- Design source of truth: `docs/muster/2026-07-29-activecollab-project-site-binding-design.md`.
- UI must follow `docs/STYLEGUIDE.md`; use existing tokens in `src/renderer/src/assets/main.css` and primitives in `src/renderer/src/components/ui/`. Do not invent colours, sizes or shadow tiers.
- NEVER add a `max-lines` disable or a per-file bump. Split a file instead.
- Comments explain WHY, not WHAT. No `unwrap`-style shortcuts.
- Every user-visible string goes through `translate('auto.components.<path>.<key>', 'English default')`, then `pnpm sync:localization-catalog`.
- Run only the vitest files named in each task plus `pnpm typecheck`. Do NOT run the full suite or a production build.
- Commit at the end of each task. Conventional commits, lowercase, subject line only, no co-author trailer.
- `src/main/ipc/pty.test.ts` fails on Node < 24 in this repo. Pre-existing; ignore it.

---

### Task 1: Binding key and settings field

**Files:**
- Create: `src/shared/activecollab-project-site.ts`
- Create: `src/shared/activecollab-project-site.test.ts`
- Modify: `src/shared/types.ts` (add one field to `GlobalSettings`, which starts at line 2644)
- Modify: `src/main/persistence.ts` (sanitise the new field on load)

**Interfaces:**
- Consumes: nothing.
- Produces: `activeCollabProjectSiteKey(instanceUrl: string | null | undefined, projectId: number | string): string`; `GlobalSettings['activeCollabProjectSites']: Record<string, string>`; `sanitizeActiveCollabProjectSites(raw: unknown): Record<string, string>`.

- [ ] **Step 1: Write the failing test**

Create `src/shared/activecollab-project-site.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  activeCollabProjectSiteKey,
  sanitizeActiveCollabProjectSites
} from './activecollab-project-site'

describe('activeCollabProjectSiteKey', () => {
  it('scopes a project id to its instance', () => {
    expect(activeCollabProjectSiteKey('https://projects.efront.com.au', 5937)).toBe(
      'https://projects.efront.com.au::5937'
    )
  })

  it('keeps two instances apart for the same project id', () => {
    expect(activeCollabProjectSiteKey('https://a.example', 1)).not.toBe(
      activeCollabProjectSiteKey('https://b.example', 1)
    )
  })

  it('never emits an empty segment when the instance is unknown', () => {
    // A blank instance would make "::5937", which collides with every other unknown-instance
    // project and reads as a valid key. The placeholder keeps keys total and greppable.
    expect(activeCollabProjectSiteKey(null, 5937)).toBe('unknown-instance::5937')
    expect(activeCollabProjectSiteKey('   ', 5937)).toBe('unknown-instance::5937')
  })

  it('ignores a trailing slash so one instance cannot produce two keys', () => {
    expect(activeCollabProjectSiteKey('https://a.example/', 7)).toBe(
      activeCollabProjectSiteKey('https://a.example', 7)
    )
  })
})

describe('sanitizeActiveCollabProjectSites', () => {
  it('keeps well-formed string pairs', () => {
    expect(sanitizeActiveCollabProjectSites({ 'https://a.example::1': 'site-1' })).toEqual({
      'https://a.example::1': 'site-1'
    })
  })

  it('drops entries that are not string-to-string', () => {
    // This is disk data a user can hand-edit, so a non-string value must not reach a Site lookup.
    expect(
      sanitizeActiveCollabProjectSites({ a: 1, b: null, c: {}, d: 'site-1', '': 'site-2' })
    ).toEqual({ d: 'site-1' })
  })

  it('answers an empty map for anything that is not an object', () => {
    expect(sanitizeActiveCollabProjectSites(undefined)).toEqual({})
    expect(sanitizeActiveCollabProjectSites('nope')).toEqual({})
    expect(sanitizeActiveCollabProjectSites([])).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --config config/vitest.config.ts src/shared/activecollab-project-site.test.ts`
Expected: FAIL — cannot resolve `./activecollab-project-site`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/activecollab-project-site.ts`:

```ts
// Bindings from an ActiveCollab project to a local site.
//
// Keyed by instance as well as project: project ids are only unique within one ActiveCollab
// instance, so a second account would otherwise inherit the first account's bindings and point
// its tasks at the wrong site. The task notification snapshot is keyed the same way.

/** Stand-in for a missing instance URL; keeps every key two non-empty segments. */
export const UNKNOWN_ACTIVECOLLAB_INSTANCE = 'unknown-instance'

export function activeCollabProjectSiteKey(
  instanceUrl: string | null | undefined,
  projectId: number | string
): string {
  // Trailing slashes vary by where the URL came from; normalising here stops one instance
  // producing two keys that never find each other's bindings.
  const instance = (instanceUrl ?? '').trim().replace(/\/+$/, '')
  return `${instance || UNKNOWN_ACTIVECOLLAB_INSTANCE}::${projectId}`
}

/**
 * Settings arrive from disk and can be hand-edited, so a malformed entry must be dropped rather
 * than trusted: a non-string value reaching a Site lookup would fail far from its cause.
 */
export function sanitizeActiveCollabProjectSites(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.length > 0 && typeof value === 'string' && value.length > 0) {
      next[key] = value
    }
  }
  return next
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --config config/vitest.config.ts src/shared/activecollab-project-site.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Add the settings field**

In `src/shared/types.ts`, inside `export type GlobalSettings = {` (starts line 2644), add:

```ts
  /** ActiveCollab project → site bindings, keyed by `activeCollabProjectSiteKey`. */
  activeCollabProjectSites: Record<string, string>
```

- [ ] **Step 6: Sanitise it on load**

In `src/main/persistence.ts`, find where sibling ActiveCollab settings are normalised (search `activeCollabStyle`, around line 908) and add alongside them:

```ts
  const activeCollabProjectSites = sanitizeActiveCollabProjectSites(raw.activeCollabProjectSites)
```

Import it at the top of the file:

```ts
import { sanitizeActiveCollabProjectSites } from '../shared/activecollab-project-site'
```

Then include `activeCollabProjectSites` in the same returned settings object that carries `activeCollabStyle`.

- [ ] **Step 7: Typecheck and fix fallout**

Run: `pnpm typecheck`
Expected: 0 errors. Adding a required field to `GlobalSettings` will surface any settings fixture that must now include it — add `activeCollabProjectSites: {}` to each one it names.

- [ ] **Step 8: Commit**

```bash
git add src/shared/activecollab-project-site.ts src/shared/activecollab-project-site.test.ts src/shared/types.ts src/main/persistence.ts
git commit -m "feat: add activecollab project site binding setting"
```

---

### Task 2: Resolve a task's bound site

**Files:**
- Create: `src/renderer/src/lib/activecollab-site-binding.ts`
- Create: `src/renderer/src/lib/activecollab-site-binding.test.ts`

**Interfaces:**
- Consumes: `activeCollabProjectSiteKey` (Task 1); `SiteSummary` from `src/shared/site-types.ts` (`{ site: Site; pathExists: boolean; ... }`); `Site` (`{ id, path, repoId: string | null, displayName, ... }`).
- Produces:

```ts
export type ActiveCollabSiteBinding =
  | { kind: 'unbound' }
  | { kind: 'missing-site'; siteId: string }
  | { kind: 'needs-repo'; site: Site }
  | { kind: 'ready'; site: Site; repoId: string }

export function resolveActiveCollabSiteBinding(args: {
  bindings: Record<string, string>
  sites: readonly SiteSummary[]
  instanceUrl: string | null | undefined
  projectId: number
}): ActiveCollabSiteBinding
```

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/lib/activecollab-site-binding.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Site, SiteSummary } from '../../../shared/site-types'
import { activeCollabProjectSiteKey } from '../../../shared/activecollab-project-site'
import { resolveActiveCollabSiteBinding } from './activecollab-site-binding'

const INSTANCE = 'https://projects.efront.com.au'

function site(overrides: Partial<Site> & { id: string }): Site {
  return {
    path: `/Sites/${overrides.id}`,
    repoId: null,
    displayName: overrides.id,
    localWpRoot: 'app/public',
    localDomain: `${overrides.id}.local`,
    localStack: 'localwp',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '8.2',
    activeEnvironment: 'production',
    environments: {},
    notes: '',
    searchReplaceTimeoutSeconds: 0,
    ...overrides
  } as Site
}

function summaries(...list: Site[]): SiteSummary[] {
  return list.map((entry) => ({
    site: entry,
    pathExists: true,
    branch: null,
    resolvedEnvironment: { name: 'production', reason: 'default' },
    secrets: {},
    importSelectedCount: 0,
    deploySelectedCount: 0
  })) as SiteSummary[]
}

describe('resolveActiveCollabSiteBinding', () => {
  it('is unbound when the project has no entry', () => {
    expect(
      resolveActiveCollabSiteBinding({
        bindings: {},
        sites: summaries(site({ id: 'acme' })),
        instanceUrl: INSTANCE,
        projectId: 5937
      })
    ).toEqual({ kind: 'unbound' })
  })

  it('reports a bound site that no longer exists instead of resolving it', () => {
    // A site can be removed after binding. Answering "missing-site" lets the UI offer a re-bind
    // rather than rendering a button that would resolve to nothing.
    expect(
      resolveActiveCollabSiteBinding({
        bindings: { [activeCollabProjectSiteKey(INSTANCE, 5937)]: 'gone' },
        sites: summaries(site({ id: 'acme' })),
        instanceUrl: INSTANCE,
        projectId: 5937
      })
    ).toEqual({ kind: 'missing-site', siteId: 'gone' })
  })

  it('reports a bound site that is not open as a repo', () => {
    const acme = site({ id: 'acme', repoId: null })
    expect(
      resolveActiveCollabSiteBinding({
        bindings: { [activeCollabProjectSiteKey(INSTANCE, 5937)]: 'acme' },
        sites: summaries(acme),
        instanceUrl: INSTANCE,
        projectId: 5937
      })
    ).toEqual({ kind: 'needs-repo', site: acme })
  })

  it('resolves a bound, repo-backed site', () => {
    const acme = site({ id: 'acme', repoId: 'repo-1' })
    expect(
      resolveActiveCollabSiteBinding({
        bindings: { [activeCollabProjectSiteKey(INSTANCE, 5937)]: 'acme' },
        sites: summaries(acme),
        instanceUrl: INSTANCE,
        projectId: 5937
      })
    ).toEqual({ kind: 'ready', site: acme, repoId: 'repo-1' })
  })

  it('does not read another instance\u2019s binding for the same project id', () => {
    expect(
      resolveActiveCollabSiteBinding({
        bindings: { [activeCollabProjectSiteKey('https://other.example', 5937)]: 'acme' },
        sites: summaries(site({ id: 'acme', repoId: 'repo-1' })),
        instanceUrl: INSTANCE,
        projectId: 5937
      })
    ).toEqual({ kind: 'unbound' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/lib/activecollab-site-binding.test.ts`
Expected: FAIL — cannot resolve `./activecollab-site-binding`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/src/lib/activecollab-site-binding.ts`:

```ts
// Resolving "which site does this ActiveCollab project belong to" in one place, because the
// answer has four distinct outcomes and every caller must handle all of them the same way.

import { activeCollabProjectSiteKey } from '../../../shared/activecollab-project-site'
import type { Site, SiteSummary } from '../../../shared/site-types'

export type ActiveCollabSiteBinding =
  | { kind: 'unbound' }
  /** Bound to a site that has since been removed; the id is kept so the UI can explain itself. */
  | { kind: 'missing-site'; siteId: string }
  /** A site is only a folder until it is opened as a repo, and a worktree needs a repo. */
  | { kind: 'needs-repo'; site: Site }
  | { kind: 'ready'; site: Site; repoId: string }

export function resolveActiveCollabSiteBinding(args: {
  bindings: Record<string, string>
  sites: readonly SiteSummary[]
  instanceUrl: string | null | undefined
  projectId: number
}): ActiveCollabSiteBinding {
  const siteId = args.bindings[activeCollabProjectSiteKey(args.instanceUrl, args.projectId)]
  if (!siteId) {
    return { kind: 'unbound' }
  }
  const found = args.sites.find((summary) => summary.site.id === siteId)
  if (!found) {
    return { kind: 'missing-site', siteId }
  }
  const repoId = found.site.repoId
  return repoId ? { kind: 'ready', site: found.site, repoId } : { kind: 'needs-repo', site: found.site }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/lib/activecollab-site-binding.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/activecollab-site-binding.ts src/renderer/src/lib/activecollab-site-binding.test.ts
git commit -m "feat: resolve the site bound to an activecollab project"
```

---

### Task 3: ActiveCollab agent brief

**Files:**
- Modify: `src/renderer/src/lib/linked-work-item-context.ts` (add a builder beside `buildLinearLaunchContextBlock` at line 87; branch in `resolveQuickCreateLinkedWorkItemPrompt` at line 202 and `getLinkedWorkItemPromptContext` at line 153)
- Modify: `src/renderer/src/lib/linked-work-item-context.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `buildActiveCollabLaunchContextBlock(args: { provider?: string; title?: string; projectName?: string; url?: string }): string | null`.

**Why this task exists:** `resolveQuickCreateLinkedWorkItemPrompt` currently degrades any non-Linear item to a bare URL. That is what the agent receives as its draft, so an ActiveCollab task would arrive as a naked link.

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/src/lib/linked-work-item-context.test.ts`:

```ts
describe('buildActiveCollabLaunchContextBlock', () => {
  it('names the task and its project above the link', () => {
    expect(
      buildActiveCollabLaunchContextBlock({
        provider: 'activecollab',
        title: 'Walk in form',
        projectName: 'Orleton',
        url: 'https://projects.efront.com.au/projects/5937/tasks/509749'
      })
    ).toBe(
      [
        'Linked ActiveCollab task: Walk in form (Orleton)',
        'https://projects.efront.com.au/projects/5937/tasks/509749'
      ].join('\n')
    )
  })

  it('omits the project when it is unknown', () => {
    expect(
      buildActiveCollabLaunchContextBlock({
        provider: 'activecollab',
        title: 'Walk in form',
        url: 'https://x.example/t/1'
      })
    ).toBe(['Linked ActiveCollab task: Walk in form', 'https://x.example/t/1'].join('\n'))
  })

  it('answers null with neither a title nor a url, so no empty block is emitted', () => {
    expect(buildActiveCollabLaunchContextBlock({ provider: 'activecollab' })).toBeNull()
  })

  it('ignores items from other providers', () => {
    expect(
      buildActiveCollabLaunchContextBlock({ provider: 'github', title: 'x', url: 'https://y' })
    ).toBeNull()
  })
})

describe('resolveQuickCreateLinkedWorkItemPrompt with an ActiveCollab task', () => {
  it('drafts the named task rather than a bare url', () => {
    const { draftPrompt } = resolveQuickCreateLinkedWorkItemPrompt(
      {
        provider: 'activecollab',
        number: 509749,
        url: 'https://projects.efront.com.au/projects/5937/tasks/509749',
        title: 'Walk in form',
        projectName: 'Orleton'
      } as Parameters<typeof resolveQuickCreateLinkedWorkItemPrompt>[0],
      ''
    )
    expect(draftPrompt).toContain('Linked ActiveCollab task: Walk in form (Orleton)')
    expect(draftPrompt).toContain('https://projects.efront.com.au/projects/5937/tasks/509749')
  })

  it('keeps a typed note above the task block', () => {
    const { draftPrompt } = resolveQuickCreateLinkedWorkItemPrompt(
      {
        provider: 'activecollab',
        number: 1,
        url: 'https://x.example/t/1',
        title: 'Fix header'
      } as Parameters<typeof resolveQuickCreateLinkedWorkItemPrompt>[0],
      'Start with the mobile breakpoint'
    )
    expect(draftPrompt?.startsWith('Start with the mobile breakpoint')).toBe(true)
  })
})
```

Add `buildActiveCollabLaunchContextBlock` to the existing import from `./linked-work-item-context` at the top of that test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/lib/linked-work-item-context.test.ts`
Expected: FAIL — `buildActiveCollabLaunchContextBlock` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/src/lib/linked-work-item-context.ts`, add after `buildLinearLaunchContextBlock` (ends line 99):

```ts
/**
 * The agent's draft for an ActiveCollab task.
 *
 * Without this the generic path hands the agent a bare URL, which reads as a link to open rather
 * than work to do. Name and project only: the task body can be long and stale, and comments are
 * discussion that often contradicts the brief. The agent has the ActiveCollab MCP and can read the
 * task from this URL when it needs the detail.
 */
export function buildActiveCollabLaunchContextBlock(args: {
  provider?: string
  title?: string
  projectName?: string
  url?: string
}): string | null {
  if (args.provider !== 'activecollab') {
    return null
  }
  const title = args.title?.trim()
  const url = args.url?.trim()
  if (!title && !url) {
    return null
  }
  const projectName = args.projectName?.trim()
  const heading = title
    ? `Linked ActiveCollab task: ${projectName ? `${title} (${projectName})` : title}`
    : 'Linked ActiveCollab task'
  return [heading, url].filter(Boolean).join('\n')
}
```

In `resolveQuickCreateLinkedWorkItemPrompt` (line 202), widen the parameter type with `projectName?: string` and compute the block before `draftPrompt` is assembled:

```ts
  const activeCollabBlock = buildActiveCollabLaunchContextBlock({
    provider: linkedWorkItem?.provider,
    title: linkedWorkItem?.title,
    projectName: linkedWorkItem?.projectName,
    url: linkedWorkItem?.url
  })
```

Then prefer it in the `draftPrompt` chain, before the bare-URL fallback:

```ts
  const draftPrompt = linearDraft
    ? [trimmedNote, linearDraft].filter(Boolean).join('\n\n')
    : activeCollabBlock
      ? [trimmedNote, formatDraftContextBlock(activeCollabBlock)].filter(Boolean).join('\n\n')
      : linkedUrl
        ? [trimmedNote, linkedUrl].filter(Boolean).join('\n\n')
        : null
```

Apply the same preference in `getLinkedWorkItemPromptContext` (line 153) so a non-quick-create launch gets the block too, returning `{ linkedUrls: [], linkedContextBlocks: [activeCollabBlock] }` when it is non-null.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/lib/linked-work-item-context.test.ts`
Expected: PASS, including the pre-existing Linear and GitHub cases — they must not change.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/linked-work-item-context.ts src/renderer/src/lib/linked-work-item-context.test.ts
git commit -m "feat: brief the agent with the linked activecollab task"
```

---

### Task 4: Bind button on the project group header

**Files:**
- Create: `src/renderer/src/components/task-page-activecollab-bind-site-button.tsx`
- Create: `src/renderer/src/components/task-page-activecollab-bind-site-button.test.tsx`
- Modify: `src/renderer/src/components/task-page-activecollab-task-group-section.tsx`

**Interfaces:**
- Consumes: `resolveActiveCollabSiteBinding`, `ActiveCollabSiteBinding` (Task 2); `activeCollabProjectSiteKey` (Task 1).
- Produces: `<ActiveCollabBindSiteButton projectId={number} projectName={string} />`.

**Structural note:** the existing collapse control is `<button className="flex w-full ...">` filling the header row (line 51). A button cannot nest inside a button, so the header must become a flex row holding the toggle and the bind button as siblings. Keep the toggle's `aria-controls`, `aria-expanded` and its `<h3>` wrapper exactly as they are — the group's `aria-labelledby` resolves to that heading.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/task-page-activecollab-bind-site-button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActiveCollabBindSiteButton } from './task-page-activecollab-bind-site-button'

const mocks = vi.hoisted(() => ({ state: { sites: [], settings: { activeCollabProjectSites: {} }, activeCollabStatus: null } }))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector(mocks.state)
}))

describe('ActiveCollabBindSiteButton', () => {
  it('offers to link an unbound project', () => {
    render(<ActiveCollabBindSiteButton projectId={5937} projectName="Orleton" />)
    expect(screen.getByRole('button', { name: /link .*site/i })).toBeTruthy()
  })

  it('names the bound site so the row explains itself without a click', () => {
    mocks.state.sites = [{ site: { id: 'acme', displayName: 'Acme', repoId: 'r1' } }] as never
    mocks.state.settings = { activeCollabProjectSites: { 'unknown-instance::5937': 'acme' } } as never
    render(<ActiveCollabBindSiteButton projectId={5937} projectName="Orleton" />)
    expect(screen.getByRole('button', { name: /acme/i })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/task-page-activecollab-bind-site-button.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `src/renderer/src/components/task-page-activecollab-bind-site-button.tsx`. Requirements:

- Read `settings.activeCollabProjectSites ?? {}`, `sites`, and the connected instance URL from `activeCollabStatus`. Read every one defensively (`?.`, `?? {}`): this row mounts against partial store stand-ins in several suites, and a bare read of an absent slice takes the whole Tasks surface down.
- Call `resolveActiveCollabSiteBinding` for state.
- Render a `Button` with `variant="ghost"` and `size="icon-sm"`, `Link2` when bound and `Link2Off` when unbound (both from `lucide-react`).
- `aria-label`: bound → `translate('auto.components.activecollab.bind_site.linked', 'Linked to {{value0}}', { value0: site.displayName })`; unbound → `translate('auto.components.activecollab.bind_site.link', 'Link this project to a site')`.
- Clicking opens a `Popover` listing sites: `displayName` as the label and `site.path` as muted secondary text, because display names repeat across clients. Include a text filter when there are more than eight sites.
- Selecting a site writes the binding:

```tsx
void updateSettings({
  activeCollabProjectSites: {
    ...bindings,
    [activeCollabProjectSiteKey(instanceUrl, projectId)]: site.id
  }
})
```

- When bound, show an **Unbind** item that deletes the key (build a new object without it; do not assign `undefined`, which would persist a null-ish entry the sanitiser then drops on the next load, making the UI disagree with disk until restart).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/task-page-activecollab-bind-site-button.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount it in the group header**

In `src/renderer/src/components/task-page-activecollab-task-group-section.tsx`, wrap the heading's children in a flex row so the toggle and the bind button are siblings:

```tsx
      <h3 id={headingId} className="sticky top-0 z-10 border-y border-border/60 bg-muted/80 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground backdrop-blur-sm">
        <span className="flex w-full items-center gap-1 pr-2">
          <button
            type="button"
            aria-controls={listId}
            aria-expanded={!collapsed}
            onClick={() => onToggleCollapsed(group.projectId)}
            className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-left uppercase tracking-[inherit] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {/* unchanged children */}
          </button>
          <ActiveCollabBindSiteButton
            projectId={group.projectId}
            projectName={group.projectName}
          />
        </span>
      </h3>
```

`w-full` moves from the button to the wrapper; the button becomes `flex-1` so the bind control keeps its width.

- [ ] **Step 6: Verify the group section still passes**

Run: `pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/task-page-activecollab-task-list.test.tsx src/renderer/src/components/task-page-activecollab-bind-site-button.test.tsx`
Expected: PASS. If a test asserted the header's accessible name by matching the whole row, re-point it at the toggle button specifically rather than deleting it.

- [ ] **Step 7: Sync localization and commit**

```bash
pnpm sync:localization-catalog
pnpm exec oxfmt src/renderer/src/components >/dev/null
git add src/renderer/src/components/task-page-activecollab-bind-site-button.tsx src/renderer/src/components/task-page-activecollab-bind-site-button.test.tsx src/renderer/src/components/task-page-activecollab-task-group-section.tsx src/renderer/src/i18n/locales
git commit -m "feat: bind an activecollab project to a site"
```

---

### Task 5: Start work on a task

**Files:**
- Create: `src/renderer/src/components/activecollab-start-work.ts`
- Create: `src/renderer/src/components/activecollab-start-work.test.ts`
- Modify: `src/renderer/src/components/task-page-activecollab-task-row.tsx` (props at line 137)
- Modify: `src/renderer/src/components/task-page-activecollab-panel.tsx` (detail pane header)

**Interfaces:**
- Consumes: `resolveActiveCollabSiteBinding` (Task 2); `ActiveCollabTask` from `src/shared/activecollab-types.ts` — note `urlPath` is **relative** (`/projects/3790/tasks/509323`) and must be joined with the instance URL for a permalink.
- Produces:

```ts
export function buildActiveCollabTaskPermalink(instanceUrl: string | null | undefined, urlPath: string): string | null

export function buildActiveCollabWorkspaceRequest(args: {
  binding: Extract<ActiveCollabSiteBinding, { kind: 'ready' }>
  task: ActiveCollabTask
  instanceUrl: string | null | undefined
}): { prefilledName: string; initialRepoId: string; linkedWorkItem: LinkedWorkItemSummary; taskSourceContext: TaskSourceContext; telemetrySource: 'activecollab-task' }
```

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/activecollab-start-work.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildActiveCollabTaskPermalink,
  buildActiveCollabWorkspaceRequest
} from './activecollab-start-work'

const INSTANCE = 'https://projects.efront.com.au'

describe('buildActiveCollabTaskPermalink', () => {
  it('joins the relative path onto the instance', () => {
    expect(buildActiveCollabTaskPermalink(INSTANCE, '/projects/5937/tasks/509749')).toBe(
      'https://projects.efront.com.au/projects/5937/tasks/509749'
    )
  })

  it('does not double the slash when the instance has a trailing one', () => {
    expect(buildActiveCollabTaskPermalink(`${INSTANCE}/`, '/projects/1/tasks/2')).toBe(
      'https://projects.efront.com.au/projects/1/tasks/2'
    )
  })

  it('answers null without an instance, because a relative path is not a link', () => {
    expect(buildActiveCollabTaskPermalink(null, '/projects/1/tasks/2')).toBeNull()
  })
})

describe('buildActiveCollabWorkspaceRequest', () => {
  const task = {
    id: 509749,
    projectId: 5937,
    projectName: 'Orleton',
    name: 'Walk in form',
    urlPath: '/projects/5937/tasks/509749'
  } as never

  it('targets the bound site\u2019s repo and carries the task as a linked item', () => {
    const request = buildActiveCollabWorkspaceRequest({
      binding: { kind: 'ready', site: { id: 'acme' } as never, repoId: 'repo-1' },
      task,
      instanceUrl: INSTANCE
    })
    expect(request.initialRepoId).toBe('repo-1')
    expect(request.linkedWorkItem.provider).toBe('activecollab')
    expect(request.linkedWorkItem.url).toBe(
      'https://projects.efront.com.au/projects/5937/tasks/509749'
    )
    expect(request.taskSourceContext.provider).toBe('activecollab')
    expect(request.prefilledName.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/activecollab-start-work.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the builders**

Create `src/renderer/src/components/activecollab-start-work.ts`. `buildActiveCollabTaskPermalink` trims a trailing slash from the instance and returns `null` when the instance is blank. `buildActiveCollabWorkspaceRequest` derives the workspace name with the existing `getLinkedWorkItemWorkspaceName` from `src/shared/workspace-name.ts` and builds:

```ts
  const linkedWorkItem = {
    provider: 'activecollab' as const,
    number: task.id,
    url: permalink ?? '',
    title: task.name,
    projectName: task.projectName
  }
  const taskSourceContext = {
    kind: 'task-source' as const,
    provider: 'activecollab' as const,
    instanceUrl: instanceUrl ?? null,
    projectId: String(task.projectId),
    projectName: task.projectName
  }
```

Match the exact field names on `LinkedWorkItemSummary` (`src/renderer/src/lib/new-workspace.ts:58`) and `TaskSourceContext` (`src/shared/task-source-context.ts:62`); adjust if either requires more fields.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/activecollab-start-work.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the shared click handler**

In the same module, export a hook `useStartActiveCollabTaskWork()` returning `(task: ActiveCollabTask) => void`. Behaviour by binding kind:

- `unbound` / `missing-site` → `toast.error` naming the project and telling the user to link it from the project header. Do not open the composer.
- `needs-repo` → confirm via the existing confirmation dialog that the site is not open as a repo yet and offer to open it; on confirm add it as a repo and continue; on cancel do nothing.
- `ready` → `openModal('new-workspace-composer', buildActiveCollabWorkspaceRequest({ ... }))`.

One handler, two call sites — the row and the pane must not each grow their own copy.

- [ ] **Step 6: Wire both surfaces**

In `task-page-activecollab-task-row.tsx`, add a hover-revealed icon button (`Play` from lucide, `variant="ghost"`, `size="icon-sm"`) inside the existing row, using the `group-hover:` idiom already used by the sidebar rows. It must call `event.stopPropagation()` so starting work does not also select the row. Hide it when the binding is not `ready`.

In `task-page-activecollab-panel.tsx`, add a labelled `Button` beside the existing task actions. Render it **disabled with a tooltip** when the binding is not `ready`, explaining that the project needs linking to a site first — the pane has room for the explanation and is where users look for actions.

- [ ] **Step 7: Verify**

Run: `pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components/activecollab-start-work.test.ts src/renderer/src/components/task-page-activecollab-task-list.test.tsx src/renderer/src/components/ActiveCollabTaskWorkspace.test.tsx`
Then: `pnpm typecheck`
Expected: PASS, 0 type errors.

- [ ] **Step 8: Sync localization and commit**

```bash
pnpm sync:localization-catalog
pnpm exec oxfmt src/renderer/src/components >/dev/null
git add src/renderer/src/components src/renderer/src/i18n/locales
git commit -m "feat: start a workspace for an activecollab task"
```

---

### Task 6: Gates and live verification

**Files:** none created; this task proves the feature works.

- [ ] **Step 1: Run the full gate set**

```bash
pnpm typecheck
pnpm exec oxlint src --format=default
node config/scripts/check-max-lines-ratchet.mjs
node config/scripts/check-reliability-gates.mjs
pnpm verify:localization-coverage
pnpm verify:localization-catalog
```

Expected: 0 type errors; no new lint errors (27 warnings is the current baseline); ratchet OK; gates pass; localization passes.

- [ ] **Step 2: Run the regression band these changes touch**

```bash
pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/components src/renderer/src/lib src/shared
```

Expected: PASS. `src/renderer/src/store/slices/agent-status-live-map-leak.test.ts` and `github-pr-refresh-states-leak.test.ts` are known parallelism flakes — re-run either in isolation before treating it as a failure.

- [ ] **Step 3: Verify live**

Restart the app, activate the window (`osascript -e 'tell application "Muster" to activate'` — rAF-driven UI does not run in a hidden window), then:

1. Tasks → a project header shows the unlinked icon. Click it, pick a site, confirm the icon changes and the tooltip names the site.
2. Confirm the start-work control appears on a task row on hover and in the detail pane.
3. Start work: the composer opens with the site's repo selected and a workspace name derived from the task.
4. Pick a harness, create, and confirm the agent's draft contains `Linked ActiveCollab task: <name> (<project>)` and the task URL.
5. Unbind and confirm the row control disappears and the pane control disables with its tooltip.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address activecollab site binding review findings"
```

---

## Self-Review

**Spec coverage:** settings map → Task 1; instance keying → Task 1; resolution incl. missing-site and no-repo → Task 2; agent brief → Task 3; bind button on the group header → Task 4; both start-work surfaces, no-repo offer, composer prefill → Task 5; testing section → Tasks 1–5; live proof → Task 6.

**Placeholders:** none. Task 4's component is described by requirement rather than a full listing because it is a popover assembled from existing primitives; every prop, label key and store read it needs is named explicitly.

**Type consistency:** `activeCollabProjectSiteKey` and `sanitizeActiveCollabProjectSites` (Task 1) are used under those names in Tasks 2 and 4. `ActiveCollabSiteBinding`'s four `kind` values are the same four branched on in Task 5. `buildActiveCollabLaunchContextBlock` (Task 3) is consumed only inside its own module. `buildActiveCollabWorkspaceRequest` returns exactly the `ComposerModalData` fields `NewWorkspaceComposerModal` reads at lines 134–147.

**Known risk:** Task 5 asserts `LinkedWorkItemSummary` and `TaskSourceContext` field names from their declarations; if either carries a required field not listed, the fix is to add it in Task 5 rather than to widen the type.
