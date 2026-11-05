// @vitest-environment happy-dom
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { handleTablistKeyDown } from './tablist-keyboard'

function tablist(): { list: HTMLElement; tabs: HTMLButtonElement[]; clicks: string[] } {
  const list = document.createElement('div')
  const clicks: string[] = []
  const tabs = ['a', 'b', 'c'].map((name) => {
    const tab = document.createElement('button')
    tab.setAttribute('role', 'tab')
    tab.textContent = name
    tab.addEventListener('click', () => clicks.push(name))
    list.append(tab)
    return tab
  })
  document.body.append(list)
  return { list, tabs, clicks }
}

function press(list: HTMLElement, key: string): { prevented: boolean } {
  const result = { prevented: false }
  const event = {
    key,
    currentTarget: list,
    preventDefault: vi.fn(() => {
      result.prevented = true
    })
  } as unknown as React.KeyboardEvent<HTMLElement>
  return { ...result, prevented: (handleTablistKeyDown(event), result.prevented) }
}

describe('handleTablistKeyDown', () => {
  it('moves and selects with arrows, wrapping at the ends', () => {
    const { list, tabs, clicks } = tablist()
    tabs[0].focus()
    press(list, 'ArrowLeft')
    expect(document.activeElement).toBe(tabs[2])
    press(list, 'ArrowRight')
    expect(document.activeElement).toBe(tabs[0])
    expect(clicks).toEqual(['c', 'a'])
  })

  it('jumps with Home and End and ignores other keys', () => {
    const { list, tabs } = tablist()
    tabs[1].focus()
    press(list, 'End')
    expect(document.activeElement).toBe(tabs[2])
    press(list, 'Home')
    expect(document.activeElement).toBe(tabs[0])
    expect(press(list, 'a').prevented).toBe(false)
  })

  it('only moves focus under manual activation', () => {
    const { list, tabs, clicks } = tablist()
    tabs[0].focus()
    const event = {
      key: 'ArrowRight',
      currentTarget: list,
      preventDefault: vi.fn()
    } as unknown as React.KeyboardEvent<HTMLElement>
    handleTablistKeyDown(event, { activation: 'manual' })
    expect(document.activeElement).toBe(tabs[1])
    expect(clicks).toEqual([])
  })
})
