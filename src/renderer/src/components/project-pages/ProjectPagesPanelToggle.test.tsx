// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePagesAgentPanelOpen } from './ProjectPagesPanelToggle'

beforeEach(() => localStorage.clear())

describe('usePagesAgentPanelOpen', () => {
  it('stays open after leaving Pages and coming back, and stays closed once closed', () => {
    const first = renderHook(() => usePagesAgentPanelOpen())
    expect(first.result.current[0]).toBe(false)
    act(() => first.result.current[1]((open) => !open))
    first.unmount()

    const back = renderHook(() => usePagesAgentPanelOpen())
    expect(back.result.current[0]).toBe(true)
    act(() => back.result.current[1](false))
    back.unmount()

    expect(renderHook(() => usePagesAgentPanelOpen()).result.current[0]).toBe(false)
  })
})
