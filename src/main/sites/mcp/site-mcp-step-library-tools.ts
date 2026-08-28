// Library tools: promote a site step into the shared library, and install a library entry onto a
// site. Split from site-mcp-custom-step-tools.ts to keep both files inside the max-lines budget.
//
// Both directions COPY. A library entry is a template: editing it later must never change what an
// already-installed step runs against production.

import { buildInstalledStep, buildLibraryEntry } from '../custom-step-library'
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
      const entry = await buildLibraryEntry(site, original, library).catch((error: unknown) => {
        throw new SiteMcpToolError(String(error instanceof Error ? error.message : error))
      })
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
      const { step: installed, script } = await buildInstalledStep(
        site,
        template,
        steps,
        raw.enabled === undefined ? true : raw.enabled === true || raw.enabled === 'true'
      ).catch((error: unknown) => {
        throw new SiteMcpToolError(String(error instanceof Error ? error.message : error))
      })
      steps.push(installed)
      return {
        ...(await saveSteps(context, site, steps)),
        installed: describeStep(installed, site),
        ...(script ? { script_file: `${script.path} (${script.outcome})` } : {})
      }
    }
  },
  {
    name: 'remove_library_step',
    description:
      'Delete an entry from the shared step library. Sites that already installed it keep their own copy and are unaffected, because installing copies rather than links.',
    inputSchema: objectSchema(
      { library_step: { type: 'string', description: 'Library step id.' } },
      ['library_step']
    ),
    async run(context, args: ToolArguments) {
      const libraryId = readString(args, 'library_step')
      const library = readLibrary(context)
      const removed = library.find((entry) => entry.id === libraryId)
      if (!removed) {
        throw new SiteMcpToolError(`No library step with id '${libraryId}'.`, {
          available_ids: library.map((entry) => entry.id)
        })
      }
      const remaining = library.filter((entry) => entry.id !== libraryId)
      await writeLibrary(context, remaining)
      return {
        ok: true,
        removed: describeStep(removed),
        library_size: remaining.length
      }
    }
  }
]
