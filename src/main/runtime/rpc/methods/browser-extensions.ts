// RPC surface for browser extensions, so agent harnesses can install, enable and configure them
// without a human clicking through Settings.

import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import {
  clearWordPressLoginPassword,
  disableBundledExtension,
  getWordPressLoginStatus,
  installAndEnableBundledExtension,
  listBundledExtensions,
  setWordPressLoginConfig,
  uninstallBundledExtensionCompletely
} from '../../../browser/bundled-extension-service'
import {
  getBrowserExtensionStatuses,
  reloadBrowserExtensionsEverywhere
} from '../../../browser/browser-extension-service'
import { browserSessionRegistry } from '../../../browser/browser-session-registry'

const BundledExtensionRef = z.object({ id: z.string().min(1) })

const WordPressLoginConfig = z.object({
  username: z.string(),
  // Omit to keep the stored password; the secret is never returned by any read method.
  password: z.string().optional(),
  autoLogin: z.boolean().default(false)
})

export const BROWSER_EXTENSION_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'extension.list',
    params: z.object({}).optional(),
    handler: async () => ({
      bundled: listBundledExtensions(),
      loaded: getBrowserExtensionStatuses()
    })
  }),
  defineMethod({
    name: 'extension.reload',
    params: z.object({}).optional(),
    handler: async () => ({
      // force: an agent calling reload expects edited extension files to take effect.
      loaded: await reloadBrowserExtensionsEverywhere(
        browserSessionRegistry.listConfiguredPartitions(),
        { force: true }
      )
    })
  }),
  defineMethod({
    name: 'extension.install',
    params: BundledExtensionRef,
    handler: async (params) => await installAndEnableBundledExtension(params.id)
  }),
  defineMethod({
    name: 'extension.disable',
    params: BundledExtensionRef,
    handler: async (params) => await disableBundledExtension(params.id)
  }),
  defineMethod({
    name: 'extension.uninstall',
    params: BundledExtensionRef,
    handler: async (params) => await uninstallBundledExtensionCompletely(params.id)
  }),
  defineMethod({
    name: 'extension.wordpressLogin.get',
    params: z.object({}).optional(),
    handler: async () => getWordPressLoginStatus()
  }),
  defineMethod({
    name: 'extension.wordpressLogin.set',
    params: WordPressLoginConfig,
    handler: async (params) =>
      await setWordPressLoginConfig({
        username: params.username,
        password: params.password ?? null,
        autoLogin: params.autoLogin
      })
  }),
  defineMethod({
    name: 'extension.wordpressLogin.clearPassword',
    params: z.object({}).optional(),
    handler: async () => await clearWordPressLoginPassword()
  })
]
