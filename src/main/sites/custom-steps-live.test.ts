// Runs a real bash process through the real streamCommand — no mocks.
//
// Earns its keep: the mocked tests cannot see that `bash -c /path/script.sh` execve()s the file and
// fails with 126 unless it is chmod +x. This pins that a committed, non-executable script runs, and
// that braces inside a script survive (the reason values arrive as env vars, not substitutions).

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmptySiteEnvironment, type Site } from '../../shared/site-types'
import type { SiteRunConfig, SiteRunContext } from './pipeline-contract'
import { runCustomSteps } from './custom-steps'

describe('live local script execution', () => {
  // Local steps shell out to bash, as the theme build already does; Windows has no such path.
  it.skipIf(process.platform === 'win32')(
    'runs the file under bash with MUSTER_ variables set',
    async () => {
      const checkout = mkdtempSync(join(tmpdir(), 'muster-live-'))
      mkdirSync(join(checkout, '.muster/steps'), { recursive: true })
      writeFileSync(
        join(checkout, '.muster/steps/smoke.sh'),
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          // Braces on purpose: substitution would have mangled this, env vars do not.
          'printf "%s|%s\\n" "$MUSTER_LIVE_DOMAIN" "$(echo \'{{not-a-placeholder}}\')" > "$MUSTER_SITE_PATH/out.txt"',
          'echo "ran in $PWD"'
        ].join('\n')
      )

      const site = {
        id: 'site-1',
        path: checkout,
        repoId: null,
        displayName: 'Acme',
        localWpRoot: '',
        localDomain: 'acme.local',
        localStack: 'plain',
        dbUser: '',
        dbSocket: '',
        dbPort: null,
        phpVersion: '',
        activeEnvironment: 'main',
        environments: { main: createEmptySiteEnvironment() },
        notes: '',
        searchReplaceTimeoutSeconds: 0,
        customSteps: [
          {
            id: 'step-1',
            name: 'Smoke',
            group: 'deploy' as const,
            runsOn: 'local' as const,
            command: '',
            scriptPath: '.muster/steps/smoke.sh',
            position: 'after' as const,
            order: 0,
            enabled: true
          }
        ]
      } satisfies Site

      const logs: string[] = []
      const context: SiteRunContext = {
        signal: new AbortController().signal,
        log: (line) => logs.push(line),
        status: () => undefined,
        progress: () => undefined,
        throwIfCancelled: () => undefined
      }
      const config: SiteRunConfig = {
        site,
        environmentName: 'main',
        environment: { ...createEmptySiteEnvironment(), liveDomain: 'acme.com' },
        group: 'deploy',
        wpDir: checkout,
        sshPassword: '',
        dbPassword: ''
      }

      await runCustomSteps(context, config, 'deploy', 'after', null)

      expect(readFileSync(join(checkout, 'out.txt'), 'utf8').trim()).toBe(
        'acme.com|{{not-a-placeholder}}'
      )
      expect(logs.join('\n')).toContain('ran in')
      rmSync(checkout, { recursive: true, force: true })
    }
  )
})
