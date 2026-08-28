// Library tools: promote a site step into the shared library, and install a library entry onto a
// site. Split from site-mcp-custom-step-tools.ts to keep both files inside the max-lines budget.
//
// Both directions COPY. A library entry is a template: editing it later must never change what an
// already-installed step runs against production.

import { randomUUID } from 'node:crypto'
import type { SiteCustomStep } from '../../../shared/site-types'
import {
  readString,
  resolveMcpSite,
  SiteMcpToolError,
  type ToolArguments
} from './site-mcp-arguments'
import type { SiteMcpTool } from './site-mcp-context'
import { objectSchema, SITE_PROPERTY } from './site-mcp-schemas'
import {
  describeStep,
  findStep,
  listSteps,
  nextOrder,
  readLibrary,
  saveSteps,
  STEP_ID_PROPERTY,
  writeLibrary
} from './site-mcp-custom-step-support'

export const SITE_MCP_STEP_LIBRARY_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'promote_custom_step',
    description:
      'Copy a site step into the shared step library so other sites can install it. The library entry is a copy: editing it later never changes what an existing site runs.',
    inputSchema: objectSchema({ ...STEP_ID_PROPERTY, ...SITE_PROPERTY }, ['step']),
    async run(context, args: ToolArguments) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const original = findStep(site, readString(args, 'step'))
      const library = readLibrary(context)
      const entry: SiteCustomStep = {
        ...original,
        id: randomUUID(),
        order: library.length,
        // A library entry is a template, not something that runs; enabling happens on install.
        enabled: false,
        origin: { kind: 'copied', fromSiteId: site.id }
      }
      await writeLibrary(context, [...library, entry])
      return {
        ok: true,
        promoted: describeStep(entry),
        library_size: library.length + 1
      }
    }
  },
  {
    name: 'install_library_step',
    description:
      'Install a step from the shared library onto a site. The site gets its own copy, so later library edits do not change it.',
    inputSchema: objectSchema(
      {
        library_step: { type: 'string', description: 'Library step id.' },
        enabled: {
          type: 'boolean',
          description: 'Whether the installed step starts ticked (default true).'
        },
        ...SITE_PROPERTY
      },
      ['library_step']
    ),
    async run(context, args: ToolArguments) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const libraryId = readString(args, 'library_step')
      const library = readLibrary(context)
      const template = library.find((entry) => entry.id === libraryId)
      if (!template) {
        throw new SiteMcpToolError(`No library step with id '${libraryId}'.`, {
          available_ids: library.map((entry) => entry.id)
        })
      }
      const raw = args as Record<string, unknown>
      const steps = [...listSteps(site)]
      const installed: SiteCustomStep = {
        ...template,
        id: randomUUID(),
        order: nextOrder(steps, template.group, template.position),
        enabled: raw.enabled === undefined ? true : raw.enabled === true || raw.enabled === 'true',
        origin: { kind: 'library', libraryId: template.id }
      }
      steps.push(installed)
      return {
        ...(await saveSteps(context, site, steps)),
        installed: describeStep(installed)
      }
    }
  }
]
