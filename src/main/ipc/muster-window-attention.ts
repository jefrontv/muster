// Getting the user's eyes on Muster when an agent is waiting on them and the window is behind.

import { app, BrowserWindow, Notification } from 'electron'

/** Held so a notification is not garbage-collected before its click handler runs. */
const shownNotifications = new Set<Notification>()

export function focusMusterWindow(): void {
  const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
  window?.show()
  window?.focus()
}

/** An OS notification (click focuses Muster) plus a Dock bounce, only while no window has focus. */
export function notifyWhenUnfocused(content: { title: string; body: string }): void {
  if (BrowserWindow.getFocusedWindow()) {
    return
  }
  if (process.platform === 'darwin') {
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
  })
  notification.on('close', release)
  shownNotifications.add(notification)
  notification.show()
}
