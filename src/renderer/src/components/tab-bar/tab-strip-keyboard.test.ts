// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type React from 'react'
import {
  getTabStripFocusIndex,
  getTabStripKeyMove,
  handleTabStripKeyDown
} from './tab-strip-keyboard'

describe('getTabStripKeyMove', () => {
  it('maps arrows, Home and End', () => {
    expect(getTabStripKeyMove('ArrowRight')).toBe('next')
    expect(getTabStripKeyMove('ArrowLeft')).toBe('previous')
    expect(getTabStripKeyMove('Home')).toBe('first')
    expect(getTabStripKeyMove('End')).toBe('last')
    expect(getTabStripKeyMove('ArrowDown')).toBeNull()
  })
})

describe('getTabStripFocusIndex', () => {
  it('wraps next and previous', () => {
    expect(getTabStripFocusIndex(2, 3, 'next')).toBe(0)
    expect(getTabStripFocusIndex(0, 3, 'previous')).toBe(2)
    expect(getTabStripFocusIndex(1, 3, 'next')).toBe(2)
  })

  it('jumps to the ends', () => {
    expect(getTabStripFocusIndex(1, 4, 'first')).toBe(0)
    expect(getTabStripFocusIndex(1, 4, 'last')).toBe(3)
  })

  it('handles an unfocused or empty strip', () => {
    expect(getTabStripFocusIndex(-1, 3, 'next')).toBe(0)
    expect(getTabStripFocusIndex(-1, 3, 'previous')).toBe(2)
    expect(getTabStripFocusIndex(0, 0, 'next')).toBe(-1)
  })
})

function stripWithTabs(count: number): { strip: HTMLElement; tabs: HTMLElement[] } {
  const strip = document.createElement('div')
  const tabs = Array.from({ length: count }, () => {
    const tab = document.createElement('div')
    tab.setAttribute('role', 'tab')
    tab.tabIndex = -1
    tab.scrollIntoView = () => {}
    strip.appendChild(tab)
    return tab
  })
  document.body.appendChild(strip)
  return { strip, tabs }
}

function keyDown(strip: HTMLElement, target: HTMLElement, key: string, shiftKey = false) {
  const event = {
    key,
    shiftKey,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    target,
    currentTarget: strip,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true
    }
  }
  handleTabStripKeyDown(event as unknown as React.KeyboardEvent<HTMLElement>)
  return event
}

describe('handleTabStripKeyDown', () => {
  it('moves focus with arrows and wraps', () => {
    const { strip, tabs } = stripWithTabs(3)
    keyDown(strip, tabs[2], 'ArrowRight')
    expect(document.activeElement).toBe(tabs[0])
    keyDown(strip, tabs[0], 'End')
    expect(document.activeElement).toBe(tabs[2])
    strip.remove()
  })

  it('opens the context menu on Shift+F10', () => {
    const { strip, tabs } = stripWithTabs(2)
    let opened = false
    tabs[1].addEventListener('contextmenu', () => {
      opened = true
    })
    expect(keyDown(strip, tabs[1], 'F10', true).defaultPrevented).toBe(true)
    expect(opened).toBe(true)
    strip.remove()
  })

  it('leaves keys alone inside a rename input', () => {
    const { strip, tabs } = stripWithTabs(2)
    const input = document.createElement('input')
    tabs[0].appendChild(input)
    expect(keyDown(strip, input, 'ArrowRight').defaultPrevented).toBe(false)
    strip.remove()
  })
})
