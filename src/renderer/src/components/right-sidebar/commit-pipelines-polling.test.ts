import { describe, expect, it } from 'vitest'
import type { CommitPipelineRun } from '../../../../shared/commit-pipelines'
import {
  COMMIT_PIPELINES_STALE_RUN_MS,
  hasActiveCommitPipeline,
  isPushTransition,
  shouldPollCommitPipelines
} from './commit-pipelines-polling'
import { describeCommitPipeline, formatPipelineDuration } from './commit-pipeline-labels'

const NOW = 10 * COMMIT_PIPELINES_STALE_RUN_MS

function run(overrides: Partial<CommitPipelineRun>): CommitPipelineRun {
  return {
    status: 'success',
    runNumber: 412,
    durationSeconds: null,
    currentStep: null,
    startedAt: NOW - 60_000,
    url: 'https://bitbucket.org/w/r/pipelines/results/412',
    ...overrides
  }
}

describe('shouldPollCommitPipelines', () => {
  it('polls while a run is in flight', () => {
    expect(
      shouldPollCommitPipelines({
        runsBySha: { a: run({ status: 'running' }) },
        now: NOW,
        pushGraceUntil: 0
      })
    ).toBe(true)
    expect(hasActiveCommitPipeline({ a: run({ status: 'pending' }) }, NOW)).toBe(true)
  })

  it('stops once every run has finished', () => {
    expect(
      shouldPollCommitPipelines({
        runsBySha: { a: run({ status: 'success' }), b: run({ status: 'failure' }) },
        now: NOW,
        pushGraceUntil: 0
      })
    ).toBe(false)
  })

  it('does not poll a run paused on a manual step', () => {
    expect(hasActiveCommitPipeline({ a: run({ status: 'paused' }) }, NOW)).toBe(false)
  })

  it('gives up on a run stuck in progress for hours', () => {
    const stuck = run({ status: 'running', startedAt: NOW - COMMIT_PIPELINES_STALE_RUN_MS - 1 })

    expect(hasActiveCommitPipeline({ a: stuck }, NOW)).toBe(false)
  })

  it('keeps polling during the grace window after a push, before the run exists', () => {
    expect(shouldPollCommitPipelines({ runsBySha: {}, now: NOW, pushGraceUntil: NOW + 1 })).toBe(
      true
    )
    expect(shouldPollCommitPipelines({ runsBySha: {}, now: NOW, pushGraceUntil: NOW })).toBe(false)
  })

  it('never polls when pipelines are unavailable', () => {
    expect(shouldPollCommitPipelines({ runsBySha: null, now: NOW, pushGraceUntil: NOW + 1 })).toBe(
      false
    )
  })
})

describe('isPushTransition', () => {
  const pushed = { hasUpstream: true, upstreamName: 'origin/main', ahead: 0 }

  it('treats the ahead count draining on the same upstream as a push', () => {
    expect(isPushTransition({ ...pushed, ahead: 2 }, pushed)).toBe(true)
  })

  it('treats publishing a branch as a push', () => {
    expect(isPushTransition({ hasUpstream: false, ahead: 0 }, pushed)).toBe(true)
  })

  it('ignores an upstream switch, an unchanged count and a first observation', () => {
    expect(isPushTransition({ ...pushed, ahead: 2, upstreamName: 'origin/other' }, pushed)).toBe(
      false
    )
    expect(isPushTransition(pushed, pushed)).toBe(false)
    expect(isPushTransition(null, pushed)).toBe(false)
  })
})

describe('describeCommitPipeline', () => {
  it('names the run, outcome and duration', () => {
    expect(describeCommitPipeline(run({ status: 'failure', durationSeconds: 192 }))).toBe(
      'Pipeline #412 failed · 3m 12s'
    )
  })

  it('names the current step for a running run', () => {
    expect(describeCommitPipeline(run({ status: 'running', currentStep: 'Deploy' }))).toBe(
      'Pipeline #412 running · Deploy'
    )
  })

  it('falls back to a check rollup label when the provider has no run number', () => {
    expect(describeCommitPipeline(run({ runNumber: null, status: 'success' }))).toBe(
      'Checks passed'
    )
  })

  it('formats durations compactly', () => {
    expect(formatPipelineDuration(45)).toBe('45s')
    expect(formatPipelineDuration(3_840)).toBe('1h 4m')
  })
})
