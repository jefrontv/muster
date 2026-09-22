// Runs one extension's install or update and collects what it prints, for the dialog to show.
//
// Only the id crosses to the main process. The command is resolved there, from the catalog, so
// nothing in this window decides what executes.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  describeExtensionRunFailure,
  EXTENSION_RUN_PRODUCED_NOTHING,
  type ExtensionCommandRunEvent,
  type ExtensionRunPhase
} from '../../../shared/extension-run-types'
import { refreshExtensionInventory } from './useExtensionInventory'

/** Trimmed from the front: a long install prints far more than anyone reads, and the tail is why. */
const MAX_OUTPUT_CHARS = 40_000

export type ExtensionRun = {
  phase: ExtensionRunPhase
  command: string | null
  output: string
  error: string | null
  /** Agents the install just wired the server into. Empty when there was nothing to wire. */
  registered: string[]
  /** What the current or last run was, so the progress line can name it. */
  mode: 'install' | 'setup'
  start: (mode?: 'install' | 'setup') => Promise<void>
  cancel: () => void
  reset: () => void
}

export function useExtensionRun(id: string): ExtensionRun {
  const [phase, setPhase] = useState<ExtensionRunPhase>('idle')
  const [command, setCommand] = useState<string | null>(null)
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [registered, setRegistered] = useState<string[]>([])
  const idRef = useRef(id)
  idRef.current = id
  const [mode, setMode] = useState<'install' | 'setup'>('install')
  const modeRef = useRef<'install' | 'setup'>('install')

  useEffect(() => {
    return window.api.extensions.onRunEvent((event: ExtensionCommandRunEvent) => {
      if (event.id !== idRef.current) {
        return
      }
      if (event.kind === 'started') {
        setCommand(event.command)
        setOutput('')
        setRegistered([])
        setPhase('running')
        return
      }
      if (event.kind === 'output') {
        setOutput((previous) => (previous + event.chunk).slice(-MAX_OUTPUT_CHARS))
        return
      }
      // Why the mode is read from a ref: a setup pass configures software that is already there, so
      // "exited 0 but the binary is missing" is only a lie worth calling out after an install.
      if (event.code === 0 && !event.installed && modeRef.current === 'install') {
        setPhase('failed')
        setError(EXTENSION_RUN_PRODUCED_NOTHING)
        void refreshExtensionInventory(true)
        return
      }
      if (event.code === 0) {
        setPhase('succeeded')
        setRegistered(event.registeredHarnesses)
        // Why refresh here: the version the card shows came from before this command ran, and the
        // whole point of watching it was to see the new one.
        void refreshExtensionInventory(true)
      } else {
        setPhase('failed')
        // Why read from the setter: the last output chunk and this event can land in the same
        // batch, so the captured `output` in this closure may be one chunk behind.
        setOutput((current) => {
          setError(describeExtensionRunFailure(event.code, event.timedOut, current))
          return current
        })
      }
    })
  }, [])

  const start = useCallback(async (next: 'install' | 'setup' = 'install') => {
    setError(null)
    setOutput('')
    setRegistered([])
    setPhase('running')
    modeRef.current = next
    setMode(next)
    const result = await window.api.extensions.runCommand({ id: idRef.current, mode: next })
    if (!result.ok) {
      setPhase('failed')
      setError(result.error)
    }
  }, [])

  const cancel = useCallback(() => {
    void window.api.extensions.cancelCommand()
  }, [])

  const reset = useCallback(() => {
    setPhase('idle')
    setOutput('')
    setError(null)
    setRegistered([])
  }, [])

  return { phase, command, output, error, registered, mode, start, cancel, reset }
}
