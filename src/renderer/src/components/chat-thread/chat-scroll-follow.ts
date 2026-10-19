// Keeps the transcript pinned to the bottom while it streams. Only the user's
// own input (wheel, touch, scrollbar drag, keys) can release the pin; layout
// shifts and programmatic scrolls never do.

export type ChatScrollPort = {
  scrollTop: number
  readonly scrollHeight: number
  readonly clientHeight: number
}

export type ChatScrollFollowState = { following: boolean; away: boolean }

export const FOLLOW_THRESHOLD_PX = 24
// Wheel and key events land just before the scroll they cause.
const INTENT_WINDOW_MS = 300

export class ChatScrollFollow {
  private following = true
  private away = false
  private intentUntil = -Infinity
  private pointerHeld = false

  constructor(
    private readonly port: ChatScrollPort,
    private readonly onChange: (state: ChatScrollFollowState) => void = () => undefined
  ) {}

  state(): ChatScrollFollowState {
    return { following: this.following, away: this.away }
  }

  noteIntent(now: number): void {
    this.intentUntil = now + INTENT_WINDOW_MS
  }

  pointerDown(): void {
    this.pointerHeld = true
  }

  pointerUp(now: number): void {
    this.pointerHeld = false
    this.noteIntent(now)
  }

  onScroll(now: number): void {
    let next = this.following
    if (this.distance() <= FOLLOW_THRESHOLD_PX) {
      next = true
    } else if (this.pointerHeld || now < this.intentUntil) {
      next = false
    } else if (this.following) {
      // Content moved under us without the user asking; stay pinned.
      this.pin()
    }
    this.update(next)
  }

  onContentResize(): void {
    if (this.following) {
      this.pin()
    }
    this.update(this.following)
  }

  /** The user's own send, or the back-to-bottom button. */
  follow(): void {
    this.pin()
    this.update(true)
  }

  /** Programmatic navigation away from the bottom, such as jumping to an earlier turn. */
  release(): void {
    this.update(false)
  }

  /** Restores a saved position the user had scrolled away to. */
  restore(scrollTop: number): void {
    this.port.scrollTop = scrollTop
    this.update(this.distance() <= FOLLOW_THRESHOLD_PX)
  }

  private pin(): void {
    this.port.scrollTop = this.port.scrollHeight - this.port.clientHeight
  }

  private distance(): number {
    return this.port.scrollHeight - this.port.clientHeight - this.port.scrollTop
  }

  private update(following: boolean): void {
    const away = this.distance() > FOLLOW_THRESHOLD_PX
    if (following === this.following && away === this.away) {
      return
    }
    this.following = following
    this.away = away
    this.onChange(this.state())
  }
}
