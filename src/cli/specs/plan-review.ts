import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const PLAN_REVIEW_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['annotate'],
    summary: 'Open a markdown plan for review in Muster and wait for the decision',
    usage:
      'muster annotate <path> [--timeout <seconds>] [--detach] [--json] | muster annotate --resume <review-id> [--timeout <seconds>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'path', 'timeout', 'resume', 'detach'],
    positionalArgs: ['path'],
    notes: [
      'Uses the same review queue as the annotate_plan and collect_plan_review MCP tools. Use it when those calls error or hang.',
      'Exit codes: 0 approved, approved_with_notes or dismissed (proceed); 1 error; 2 still pending after --timeout (run --resume); 3 annotated (revise, then run annotate again); 4 review id unknown or expired.',
      'Default --timeout is 540 seconds, under the 10 minute cap on agent shell commands.'
    ],
    examples: [
      'muster annotate docs/specs/plan.md',
      'muster annotate docs/specs/plan.md --detach',
      'muster annotate --resume 3f2c9a1e-0000-4000-8000-000000000000'
    ]
  }
]
