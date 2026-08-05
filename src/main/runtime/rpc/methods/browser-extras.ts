import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { assertRpcClipboardTextWriteWithinLimit } from '../rpc-clipboard-text-validation'
import { BrowserTarget, OptionalFiniteNumber } from '../schemas'
import {
  ClipboardWrite,
  CookieDelete,
  CookieGet,
  CookieSet,
  DialogAccept,
  Geolocation,
  MouseButton,
  MouseWheel,
  MouseXY,
  Viewport
} from './browser-schemas'

const MouseModifiers = z
  .unknown()
  .transform((v) => (Array.isArray(v) ? v : undefined))
  .pipe(z.union([z.array(z.enum(['cmd', 'ctrl', 'alt', 'shift'])), z.undefined()]))
  .optional()

const MouseClick = MouseXY.merge(MouseButton).extend({
  radius: OptionalFiniteNumber,
  modifiers: MouseModifiers
})

export const BROWSER_EXTRA_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'browser.cookie.get',
    params: CookieGet,
    handler: async (params, { runtime }) => runtime.browserCookieGet(params)
  }),
  defineMethod({
    name: 'browser.cookie.set',
    params: CookieSet,
    handler: async (params, { runtime }) => runtime.browserCookieSet(params)
  }),
  defineMethod({
    name: 'browser.cookie.delete',
    params: CookieDelete,
    handler: async (params, { runtime }) => runtime.browserCookieDelete(params)
  }),
  defineMethod({
    name: 'browser.viewport',
    params: Viewport,
    handler: async (params, { runtime }) => runtime.browserSetViewport(params)
  }),
  defineMethod({
    name: 'browser.geolocation',
    params: Geolocation,
    handler: async (params, { runtime }) => runtime.browserSetGeolocation(params)
  }),
  defineMethod({
    name: 'browser.mouseMove',
    params: MouseXY,
    handler: async (params, { runtime }) => runtime.browserMouseMove(params)
  }),
  defineMethod({
    name: 'browser.mouseDown',
    params: MouseButton,
    handler: async (params, { runtime }) => runtime.browserMouseDown(params)
  }),
  defineMethod({
    name: 'browser.mouseClick',
    params: MouseClick,
    handler: async (params, { runtime }) => runtime.browserMouseClick(params)
  }),
  defineMethod({
    name: 'browser.mouseUp',
    params: MouseButton,
    handler: async (params, { runtime }) => runtime.browserMouseUp(params)
  }),
  defineMethod({
    name: 'browser.mouseWheel',
    params: MouseWheel,
    handler: async (params, { runtime }) => runtime.browserMouseWheel(params)
  }),
  defineMethod({
    name: 'browser.clipboardRead',
    params: BrowserTarget,
    handler: async (params, { runtime }) => runtime.browserClipboardRead(params)
  }),
  defineMethod({
    name: 'browser.clipboardWrite',
    params: ClipboardWrite,
    handler: async (params, { runtime }) => {
      await assertRpcClipboardTextWriteWithinLimit(params.text)
      return runtime.browserClipboardWrite(params)
    }
  }),
  defineMethod({
    name: 'browser.dialogAccept',
    params: DialogAccept,
    handler: async (params, { runtime }) => runtime.browserDialogAccept(params)
  }),
  defineMethod({
    name: 'browser.dialogDismiss',
    params: BrowserTarget,
    handler: async (params, { runtime }) => runtime.browserDialogDismiss(params)
  })
]
