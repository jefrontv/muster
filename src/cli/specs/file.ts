import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const FILE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['file', 'open'],
    summary: 'Open a workspace file in the Muster editor',
    usage: 'muster file open <path> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'path', 'worktree'],
    positionalArgs: ['path'],
    notes: [
      'The path may be relative to the selected worktree or an absolute path inside that worktree. When --worktree is omitted, local CLI calls infer the current Muster worktree from cwd.'
    ],
    examples: [
      'muster file open src/App.tsx',
      'muster file open --path docs/readme.md --worktree active'
    ]
  },
  {
    path: ['file', 'diff'],
    summary: 'Open a workspace file diff in the Muster editor',
    usage: 'muster file diff <path> [--staged] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'path', 'staged', 'worktree'],
    positionalArgs: ['path'],
    notes: [
      'Diffs default to unstaged changes. Pass --staged to open the staged source-control diff.',
      'The path may be relative to the selected worktree or an absolute path inside that worktree.'
    ],
    examples: [
      'muster file diff src/App.tsx',
      'muster file diff --path package.json --staged --worktree branch:feature'
    ]
  },
  {
    path: ['file', 'open-changed'],
    summary: 'Open all git-changed files for a workspace',
    usage: 'muster file open-changed [--mode edit|diff|both] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'mode', 'worktree'],
    notes: [
      'For v1, changed files come from git status for the selected worktree.',
      'The default mode is diff. Edit mode skips deleted files because there is no file to open.'
    ],
    examples: [
      'muster file open-changed',
      'muster file open-changed --mode both',
      'muster file open-changed --mode diff --worktree active'
    ]
  }
]
