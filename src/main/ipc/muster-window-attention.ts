// Getting the user's eyes on Muster when an agent is waiting on them and the window is behind.

import { app, BrowserWindow, Notification } from 'electron'

/** Held so a notification is not garbage-collected before its click handler runs. */
const shownNotifications = new Set<Notification>()

export function focusMusterWindow(): void {
  const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
  window?.show()
  window?.focus()
}

/**
 * An OS notification (click focuses Muster) plus a Dock bounce, only while no window has focus.
 * evenWhenFocused: the thing waiting sits somewhere in Muster the user is not looking at.
 */
export function notifyWhenUnfocused(
  content: { title: string; body: string },
  options: { evenWhenFocused?: boolean; onClick?: () => void } = {}
): void {
  const focused = BrowserWindow.getFocusedWindow() !== null
  if (focused && !options.evenWhenFocused) {
    return
  }
  if (process.platform === 'darwin' && !focused) {
    app.dock?.bounce('informational')
  }
  if (!Notification.isSupported()) {
    return
  }
  const notification = new Notification(content)
  const release = (): void => {
    shownNotifications.delete(notification)
  }
  notification.on('click', () => {
    release()
    focusMusterWindow()
    options.onClick?.()
  })
  notification.on('close', release)
  shownNotifications.add(notification)
  notification.show()
}
