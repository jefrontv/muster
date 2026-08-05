import { defineMethod, type RpcMethod } from '../core'
import { assertRpcClipboardTextWriteWithinLimit } from '../rpc-clipboard-text-validation'
import { BrowserTarget, requiredString } from '../schemas'
import {
  Eval,
  Goto,
  KeyboardInsert,
  Keypress,
  ProfileCreate,
  ProfileDelete,
  ProfileImportFromBrowser,
  TabCurrent,
  TabSetProfile,
  TabClose,
  TabCreate,
  TabList,
  TabProfileClone,
  TabShow,
  TabSwitch
} from './browser-schemas'

const CertificateProceed = BrowserTarget.extend({
  challengeId: requiredString('Missing required challengeId')
})

// Why: agent-driven browser automation was removed, so what remains is only the
// surface the desktop BrowserPane and the mobile companion drive over RPC —
// tab lifecycle, navigation, profiles, and input replay.
export const BROWSER_CORE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'browser.goto',
    params: Goto,
    handler: async (params, { runtime }) => runtime.browserGoto(params)
  }),
  defineMethod({
    name: 'browser.certificate.proceed',
    params: CertificateProceed,
    handler: async (params, { runtime }) => runtime.browserProceedCertificate(params)
  }),
  defineMethod({
    name: 'browser.keyboardInsertText',
    params: KeyboardInsert,
    handler: async (params, { runtime }) => {
      await assertRpcClipboardTextWriteWithinLimit(params.text)
      return runtime.browserKeyboardInsertText(params)
    }
  }),
  defineMethod({
    name: 'browser.back',
    params: BrowserTarget,
    handler: async (params, { runtime }) => runtime.browserBack(params)
  }),
  defineMethod({
    name: 'browser.forward',
    params: BrowserTarget,
    handler: async (params, { runtime }) => runtime.browserForward(params)
  }),
  defineMethod({
    name: 'browser.reload',
    params: BrowserTarget,
    handler: async (params, { runtime }) => runtime.browserReload(params)
  }),
  defineMethod({
    name: 'browser.eval',
    params: Eval,
    handler: async (params, { runtime }) => runtime.browserEval(params)
  }),
  defineMethod({
    name: 'browser.keypress',
    params: Keypress,
    handler: async (params, { runtime }) => runtime.browserKeypress(params)
  }),
  defineMethod({
    name: 'browser.tabList',
    params: TabList,
    handler: async (params, { runtime }) => runtime.browserTabList(params)
  }),
  defineMethod({
    name: 'browser.tabShow',
    params: TabShow,
    handler: async (params, { runtime }) => runtime.browserTabShow(params)
  }),
  defineMethod({
    name: 'browser.tabCurrent',
    params: TabCurrent,
    handler: async (params, { runtime }) => runtime.browserTabCurrent(params)
  }),
  defineMethod({
    name: 'browser.tabSwitch',
    params: TabSwitch,
    handler: async (params, { runtime }) => runtime.browserTabSwitch(params)
  }),
  defineMethod({
    name: 'browser.tabCreate',
    params: TabCreate,
    handler: async (params, { runtime }) => runtime.browserTabCreate(params)
  }),
  defineMethod({
    name: 'browser.tabSetProfile',
    params: TabSetProfile,
    handler: async (params, { runtime }) => runtime.browserTabSetProfile(params)
  }),
  defineMethod({
    name: 'browser.tabProfileShow',
    params: TabShow,
    handler: async (params, { runtime }) => runtime.browserTabProfileShow(params)
  }),
  defineMethod({
    name: 'browser.tabProfileClone',
    params: TabProfileClone,
    handler: async (params, { runtime }) => runtime.browserTabProfileClone(params)
  }),
  defineMethod({
    name: 'browser.tabClose',
    params: TabClose,
    handler: async (params, { runtime }) => runtime.browserTabClose(params)
  }),
  defineMethod({
    name: 'browser.profileList',
    params: null,
    handler: async (_params, { runtime }) => runtime.browserProfileList()
  }),
  defineMethod({
    name: 'browser.profileCreate',
    params: ProfileCreate,
    handler: async (params, { runtime }) => runtime.browserProfileCreate(params)
  }),
  defineMethod({
    name: 'browser.profileDelete',
    params: ProfileDelete,
    handler: async (params, { runtime }) => runtime.browserProfileDelete(params)
  }),
  defineMethod({
    name: 'browser.profileDetectBrowsers',
    params: null,
    handler: async (_params, { runtime }) => runtime.browserProfileDetectBrowsers()
  }),
  defineMethod({
    name: 'browser.profileImportFromBrowser',
    params: ProfileImportFromBrowser,
    handler: async (params, { runtime }) => runtime.browserProfileImportFromBrowser(params)
  }),
  defineMethod({
    name: 'browser.profileClearDefaultCookies',
    params: null,
    handler: async (_params, { runtime }) => runtime.browserProfileClearDefaultCookies()
  })
]
