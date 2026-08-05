// Why: browser schemas stay separate from handler registration so both sides
// remain under the line cap and dispatch wiring stays scannable.
import { z } from 'zod'
import {
  BrowserTarget,
  OptionalBoolean,
  OptionalFiniteNumber,
  OptionalPlainString,
  OptionalString,
  requiredString
} from '../schemas'

export const Goto = BrowserTarget.extend({
  url: requiredString('Missing required --url')
})

export const Screencast = BrowserTarget.extend({
  format: z
    .unknown()
    .optional()
    .transform((v) => (v === 'png' ? 'png' : 'jpeg'))
    .pipe(z.enum(['png', 'jpeg'])),
  quality: OptionalFiniteNumber,
  maxWidth: OptionalFiniteNumber,
  maxHeight: OptionalFiniteNumber,
  viewportWidth: OptionalFiniteNumber,
  viewportHeight: OptionalFiniteNumber,
  deviceScaleFactor: OptionalFiniteNumber,
  mobile: OptionalBoolean,
  everyNthFrame: OptionalFiniteNumber,
  minFrameIntervalMs: OptionalFiniteNumber
})

export const Eval = BrowserTarget.extend({
  expression: requiredString('Missing required --expression')
})

export const TabList = z.object({ worktree: OptionalString })

// Why: --index xor --page must be present. The refine guards that invariant
// so the dispatcher surfaces a single legible error instead of either shape
// leaking into the runtime.
//
// `focus` is opt-in: when true, the runtime sends `browser:pane-focus` to
// the renderer after the switch lands. The renderer surfaces the browser
// pane only if the user is already on the targeted worktree; otherwise it
// pre-stages per-worktree state silently. This avoids cross-worktree screen
// theft when multiple agents drive browsers in parallel worktrees.
export const TabSwitch = BrowserTarget.extend({
  index: z
    .unknown()
    .transform((v) => (typeof v === 'number' ? v : undefined))
    .pipe(z.union([z.number(), z.undefined()]))
    .optional(),
  focus: z.boolean().optional()
}).refine(
  (val) => {
    if (val.page !== undefined) {
      return true
    }
    return val.index !== undefined && Number.isInteger(val.index) && val.index >= 0
  },
  { message: 'Missing required --index (non-negative integer) or --page' }
)

export const TabCreate = z.object({
  url: OptionalString,
  worktree: OptionalString,
  profileId: OptionalString,
  waitForRegistration: z.boolean().optional(),
  // User-initiated opens focus the tab; agent/automation opens stay background.
  activate: z.boolean().optional(),
  // Why: the split group whose "+" was clicked, so a headless host places the
  // new browser tab there instead of coalescing into the first/active group.
  targetGroupId: OptionalString
})

export const TabShow = z.object({
  page: requiredString('Missing required --page'),
  worktree: OptionalString
})

export const TabCurrent = z.object({ worktree: OptionalString })

export const TabClose = z.object({
  index: z
    .unknown()
    .transform((v) => (typeof v === 'number' ? v : undefined))
    .pipe(z.union([z.number(), z.undefined()]))
    .optional(),
  page: OptionalString,
  worktree: OptionalString
})

export const TabSetProfile = BrowserTarget.extend({
  profileId: requiredString('Missing required --profile')
})

export const TabProfileClone = BrowserTarget.extend({
  profileId: requiredString('Missing required --profile')
})

export const ProfileCreate = z.object({
  label: requiredString('Missing required --label'),
  // Strict enum so unknown scope values surface validation errors instead of being
  // silently coerced to 'isolated' (pr-bug-scan finding from #1397).
  scope: z.enum(['isolated', 'imported'])
})

export const ProfileDelete = z.object({ profileId: requiredString('Missing required --profile') })

export const ProfileImportFromBrowser = z.object({
  profileId: requiredString('Missing required --profile'),
  browserFamily: requiredString('Missing required --browser-family'),
  browserProfile: OptionalString
})

export const Keypress = BrowserTarget.extend({
  key: requiredString('Missing required --key')
})

export const KeyboardInsert = BrowserTarget.extend({
  text: requiredString('Missing required --text')
})

export const CookieGet = BrowserTarget.extend({
  url: OptionalPlainString
})

export const CookieSet = BrowserTarget.extend({
  name: z.custom<string>((v) => typeof v === 'string' && v.length > 0, {
    message: 'Missing name or value'
  }),
  value: z.custom<string>((v) => typeof v === 'string', {
    message: 'Missing name or value'
  }),
  domain: OptionalPlainString,
  path: OptionalPlainString,
  secure: OptionalBoolean,
  httpOnly: OptionalBoolean,
  sameSite: OptionalPlainString,
  expires: OptionalFiniteNumber
})

export const CookieDelete = BrowserTarget.extend({
  name: requiredString('Missing cookie name'),
  domain: OptionalPlainString,
  url: OptionalPlainString
})

export const Viewport = BrowserTarget.extend({
  width: z.custom<number>((v) => typeof v === 'number' && v > 0, {
    message: 'Width and height must be positive numbers'
  }),
  height: z.custom<number>((v) => typeof v === 'number' && v > 0, {
    message: 'Width and height must be positive numbers'
  }),
  deviceScaleFactor: OptionalFiniteNumber,
  mobile: OptionalBoolean
})

export const Geolocation = BrowserTarget.extend({
  latitude: z.custom<number>((v) => typeof v === 'number', {
    message: 'Missing latitude or longitude'
  }),
  longitude: z.custom<number>((v) => typeof v === 'number', {
    message: 'Missing latitude or longitude'
  }),
  accuracy: OptionalFiniteNumber
})

export const MouseXY = BrowserTarget.extend({
  x: z.custom<number>((v) => typeof v === 'number', {
    message: 'Missing required x and y coordinates'
  }),
  y: z.custom<number>((v) => typeof v === 'number', {
    message: 'Missing required x and y coordinates'
  })
})

export const MouseButton = BrowserTarget.extend({
  button: OptionalPlainString
})

export const MouseWheel = BrowserTarget.extend({
  dy: z.custom<number>((v) => typeof v === 'number', {
    message: 'Missing required --dy'
  }),
  dx: OptionalFiniteNumber
})

export const ClipboardWrite = BrowserTarget.extend({
  text: requiredString('Missing required --text')
})

export const DialogAccept = BrowserTarget.extend({
  text: OptionalPlainString
})
