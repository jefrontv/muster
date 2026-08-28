// Custom step tools: list/create/update/remove, plus copy between sites.
//
// A custom step is a named command persisted on the site and run by the import/deploy pipeline —
// effectively a saved, toggleable run_ssh_command with a position in the run order. These tools are
// the agent's authoring surface for them.
//
// Writes are all-or-nothing like the other config tools: every field is validated before anything is
// saved, so a bad `group` cannot leave a half-written step behind. The full command is always
// returned in listings — a step's behaviour is never hidden behind its name.

import { randomUUID } from 'node:crypto'
import { selectCustomSteps, type SiteCustomStep } from '../../../shared/site-types'
import { readString, resolveMcpSite, type ToolArguments } from './site-mcp-arguments'
import type { SiteMcpTool } from './site-mcp-context'
import { objectSchema, SITE_PROPERTY } from './site-mcp-schemas'
import {
  describeStep,
  findStep,
  listSteps,
  nextOrder,
  readCommand,
  readGroup,
  readName,
  readPosition,
  readRunsOn,
  saveSteps,
  STEP_ID_PROPERTY
} from './site-mcp-custom-step-support'

export const SITE_MCP_CUSTOM_STEP_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'list_custom_steps',
    description:
      "List a site's user-defined import/deploy steps, including the full command each one runs and whether it is enabled.",
    inputSchema: objectSchema({ ...SITE_PROPERTY }, []),
    async run(context, args: ToolArguments) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      return {
        ok: true,
        steps: listSteps(site).map((step) => describeStep(step)),
        // Run order, resolved — what the pipeline will actually do.
        import_order: selectCustomSteps(site, 'import').map((step) => step.name),
        deploy_order: selectCustomSteps(site, 'deploy').map((step) => step.name)
      }
    }
  },
  {
    name: 'create_custom_step',
    description:
      "Create a repeatable import or deploy step for a site. The step appears as a checkbox in the site panel and runs as part of that group's pipeline. Placeholders {{sitePath}}, {{wpDir}}, {{remoteRoot}}, {{liveDomain}}, {{localDomain}}, {{environment}} are substituted (shell-quoted) at run time; secrets are never available to a command.",
    inputSchema: objectSchema(
      {
        name: { type: 'string', description: 'Label shown next to the checkbox.' },
        command: { type: 'string', description: 'Shell command to run.' },
        group: { type: 'string', description: "'import' or 'deploy'." },
        runs_on: {
          type: 'string',
          description: "'remote' runs over the site's SSH session; 'local' runs in the checkout."
        },
        position: {
          type: 'string',
          description:
            "'before' or 'after' the built-in steps of the group (default 'after'). Use 'before' for things like enabling maintenance mode."
        },
        description: { type: 'string', description: 'Optional note about what the step does.' },
        enabled: { type: 'boolean', description: 'Whether it is ticked (default true).' },
        ...SITE_PROPERTY
      },
      ['name', 'command', 'group', 'runs_on']
    ),
    async run(context, args: ToolArguments) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const raw = args as Record<string, unknown>
      const group = readGroup(raw, 'group')
      const position = readPosition(raw)
      const steps = [...listSteps(site)]
      const step: SiteCustomStep = {
        id: randomUUID(),
        name: readName(raw, true)!,
        group,
        runsOn: readRunsOn(raw),
        command: readCommand(raw, true)!,
        position,
        order: nextOrder(steps, group, position),
        enabled: raw.enabled === undefined ? true : raw.enabled === true || raw.enabled === 'true'
      }
      const description = raw.description
      if (typeof description === 'string' && description.trim().length > 0) {
        step.description = description
      }
      steps.push(step)
      return { ...(await saveSteps(context, site, steps)), created: describeStep(step) }
    }
  },
  {
    name: 'update_custom_step',
    description:
      'Edit an existing custom step by id. Only the fields you pass change; the id is preserved so the checkbox keeps its state.',
    inputSchema: objectSchema(
      {
        ...STEP_ID_PROPERTY,
        name: { type: 'string' },
        command: { type: 'string' },
        group: { type: 'string' },
        runs_on: { type: 'string' },
        position: { type: 'string' },
        description: { type: 'string' },
        enabled: { type: 'boolean' },
        order: { type: 'number' },
        ...SITE_PROPERTY
      },
      ['step']
    ),
    async run(context, args: ToolArguments) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const raw = args as Record<string, unknown>
      const existing = findStep(site, readString(args, 'step'))
      const name = readName(raw, false)
      const command = readCommand(raw, false)
      const next: SiteCustomStep = {
        ...existing,
        ...(name === undefined ? {} : { name }),
        ...(command === undefined ? {} : { command }),
        group: readGroup(raw, 'group', existing.group),
        runsOn: readRunsOn(raw, existing.runsOn),
        position: readPosition(raw, existing.position),
        enabled:
          raw.enabled === undefined
            ? existing.enabled
            : raw.enabled === true || raw.enabled === 'true'
      }
      if (typeof raw.description === 'string') {
        next.description = raw.description
      }
      if (typeof raw.order === 'number' && Number.isInteger(raw.order) && raw.order >= 0) {
        next.order = raw.order
      }
      const steps = listSteps(site).map((step) => (step.id === existing.id ? next : step))
      return { ...(await saveSteps(context, site, steps)), updated: describeStep(next) }
    }
  },
  {
    name: 'remove_custom_step',
    description: 'Delete a custom step from a site by id.',
    inputSchema: objectSchema({ ...STEP_ID_PROPERTY, ...SITE_PROPERTY }, ['step']),
    async run(context, args: ToolArguments) {
      const site = resolveMcpSite(context, readString(args, 'site'))
      const existing = findStep(site, readString(args, 'step'))
      const steps = listSteps(site).filter((step) => step.id !== existing.id)
      return { ...(await saveSteps(context, site, steps)), removed: existing.id }
    }
  },
  {
    name: 'copy_custom_step',
    description:
      "Copy a custom step from another site onto this one — 'bring site X's import step over here'. Passing the same site duplicates the step. The copy always gets a new id and records where it came from, so editing it never affects the original.",
    inputSchema: objectSchema(
      {
        from_site: {
          type: 'string',
          description: 'Source site (name, slug, or path) to copy the step from.'
        },
        step: { type: 'string', description: 'Step id on the source site.' },
        enabled: {
          type: 'boolean',
          description: 'Whether the copy starts ticked (defaults to the source step).'
        },
        ...SITE_PROPERTY
      },
      ['from_site', 'step']
    ),
    async run(context, args: ToolArguments) {
      const target = resolveMcpSite(context, readString(args, 'site'))
      const source = resolveMcpSite(context, readString(args, 'from_site'))
      const original = findStep(source, readString(args, 'step'))
      const raw = args as Record<string, unknown>
      const steps = [...listSteps(target)]
      const copy: SiteCustomStep = {
        ...original,
        id: randomUUID(),
        order: nextOrder(steps, original.group, original.position),
        enabled:
          raw.enabled === undefined
            ? original.enabled
            : raw.enabled === true || raw.enabled === 'true',
        origin: { kind: 'copied', fromSiteId: source.id }
      }
      steps.push(copy)
      return {
        ...(await saveSteps(context, target, steps)),
        copied: describeStep(copy),
        from_site: source.displayName || source.path
      }
    }
  }
]
