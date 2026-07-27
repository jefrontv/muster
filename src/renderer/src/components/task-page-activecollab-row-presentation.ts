// The two presentation decisions an assigned-task row has to derive from raw ActiveCollab values:
// how urgent a due date is, and what a label's instance-defined hex is safe to paint.

export type ActiveCollabDueStatus = 'overdue' | 'today' | 'upcoming'

/**
 * Compares LOCAL calendar days. `dueOn` is already anchored to local midnight by the main codec, so
 * both sides are reduced to a Y/M/D index read with local getters — a UTC comparison would call a
 * task due today "overdue" for every timezone east of UTC after its offset rolls the day over.
 */
export function activeCollabDueStatus(dueOn: number, now: number): ActiveCollabDueStatus {
  const due = new Date(dueOn)
  const today = new Date(now)
  const dueDay = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate())
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  if (dueDay < todayDay) {
    return 'overdue'
  }
  return dueDay === todayDay ? 'today' : 'upcoming'
}

export type ActiveCollabLabelChipStyle = {
  backgroundColor: string
  borderColor: string
  color: string
}

const HEX_COLOR = /^#(?:([\da-f]{3})|([\da-f]{6}))$/i

function parseHexChannels(color: string): [number, number, number] | null {
  const match = HEX_COLOR.exec(color.trim())
  if (!match) {
    return null
  }
  const digits = match[1] ?? match[2] ?? ''
  // `#f60` and `#ff6600` are the same colour; widen the shorthand so one slicing path serves both.
  const hex = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ]
}

/** WCAG 2.x relative luminance. */
function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const toLinear = (channel: number): number => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue)
}

/** WCAG AA for the small text a chip renders at. */
const MIN_CONTRAST_RATIO = 4.5

/**
 * ActiveCollab ships one arbitrary hex per label and the normalised type carries no paired text
 * colour, so that hex used AS TEXT lands wherever it lands against the app surface — mid-tone brand
 * colours come in around 3:1, which is the legibility complaint.
 *
 * So the hex becomes the chip FILL and the text becomes white, dropping to black only when white
 * would miss AA. That can never leave the chip below the floor: the worst colour for this is the
 * one where black and white tie, and there both measure 4.58:1 — so whenever white falls under
 * 4.5:1, black is the higher of the two and clears it.
 *
 * White-first rather than always-highest because the two only diverge in a sliver around that tie,
 * and inside it a saturated mid-tone (Google blue, say) reads as a normal coloured chip instead of
 * sprouting black text. Null means the instance gave no usable colour; the caller falls back to the
 * neutral token chip.
 */
export function activeCollabLabelChipStyle(
  color: string | null
): ActiveCollabLabelChipStyle | null {
  if (!color) {
    return null
  }
  const channels = parseHexChannels(color)
  if (!channels) {
    return null
  }
  const againstWhite = 1.05 / (relativeLuminance(channels) + 0.05)
  const background = color.trim()
  return {
    backgroundColor: background,
    borderColor: background,
    color: againstWhite >= MIN_CONTRAST_RATIO ? '#ffffff' : '#000000'
  }
}
