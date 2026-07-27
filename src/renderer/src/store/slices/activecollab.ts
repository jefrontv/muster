// The ActiveCollab store boundary: connection lifecycle plus the composed read and write actions.
// One token addresses one instance, so there is no site selection anywhere in this slice — connect
// and disconnect are the only operations that change whose rows the caches hold.
import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type {
  ActiveCollabConnection,
  ActiveCollabConnectionStatus
} from '../../../../shared/activecollab-types'
import type {
  ActiveCollabConnectArgs,
  ActiveCollabResult
} from '../../../../shared/activecollab-api-types'
import {
  activeCollabConnect,
  activeCollabDisconnect,
  activeCollabStatus as readActiveCollabStatus
} from '@/runtime/runtime-activecollab-client'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import {
  beginActiveCollabMutation,
  currentActiveCollabMutation,
  isCurrentActiveCollabMutation,
  isCurrentActiveCollabRuntimeContext
} from './activecollab-cache'
import { activeCollabSupersededFailure } from './activecollab-failure'
import {
  clearActiveCollabInflightReads,
  createActiveCollabReadActions,
  type ActiveCollabReadActions
} from './activecollab-reads'
import {
  createActiveCollabWriteActions,
  type ActiveCollabWriteActions
} from './activecollab-writes'
import type { ActiveCollabCacheState } from './activecollab-task-patch'

export type { ActiveCollabReadOptions } from './activecollab-cache'
export type { ActiveCollabTaskPageRows } from './activecollab-task-patch'
export type { ActiveCollabWriteOptions } from './activecollab-writes'

const DISCONNECTED_STATUS: ActiveCollabConnectionStatus = {
  configured: false,
  connection: null,
  reason: ''
}

const EMPTY_CACHES: ActiveCollabCacheState = {
  activeCollabTaskPageCache: {},
  activeCollabProjectCache: {},
  activeCollabTaskDetailCache: {},
  activeCollabLabelCache: {}
}

let statusReadGeneration = 0

export type ActiveCollabConnectionState = {
  activeCollabStatus: ActiveCollabConnectionStatus
  activeCollabStatusChecked: boolean
  activeCollabStatusContextKey: string | null
  /** Covers connect and disconnect, owned by the mutation generation that raised it. */
  activeCollabConnecting: boolean
  activeCollabLastError: string | null
}

export type ActiveCollabSlice = ActiveCollabConnectionState &
  ActiveCollabCacheState &
  ActiveCollabReadActions &
  ActiveCollabWriteActions & {
    checkActiveCollabConnection: () => Promise<void>
    connectActiveCollab: (
      args: ActiveCollabConnectArgs
    ) => Promise<ActiveCollabResult<ActiveCollabConnection>>
    disconnectActiveCollab: () => Promise<ActiveCollabResult<ActiveCollabConnectionStatus>>
  }

export const createActiveCollabSlice: StateCreator<AppState, [], [], ActiveCollabSlice> = (
  set,
  get
) => ({
  activeCollabStatus: DISCONNECTED_STATUS,
  activeCollabStatusChecked: false,
  activeCollabStatusContextKey: null,
  activeCollabConnecting: false,
  activeCollabLastError: null,
  ...EMPTY_CACHES,
  ...createActiveCollabReadActions(set, get),
  ...createActiveCollabWriteActions(set, get),

  checkActiveCollabConnection: async () => {
    const contextKey = getProviderRuntimeContextKey(get().settings)
    const statusRead = (statusReadGeneration += 1)
    const mutation = currentActiveCollabMutation()
    if (get().activeCollabStatusContextKey !== contextKey) {
      set({ activeCollabStatusChecked: false })
    }
    const result = await readActiveCollabStatus(get().settings)
    if (
      !isCurrentActiveCollabMutation(mutation) ||
      statusRead !== statusReadGeneration ||
      !isCurrentActiveCollabRuntimeContext(contextKey, get().settings)
    ) {
      return
    }
    if (!result.ok) {
      set({
        activeCollabStatusChecked: true,
        activeCollabStatusContextKey: contextKey,
        activeCollabLastError: result.error
      })
      return
    }
    // Status polls on a timer; reusing the previous object keeps subscribers from rerendering.
    const previous = get().activeCollabStatus
    const unchanged =
      previous.configured === result.value.configured &&
      previous.reason === result.value.reason &&
      previous.connection?.userId === result.value.connection?.userId &&
      previous.connection?.instanceUrl === result.value.connection?.instanceUrl
    // `activeCollabLastError` is deliberately untouched here: a background poll succeeding says
    // nothing about the read or write that failed, and it races the very call that recorded it.
    set({
      ...(unchanged ? {} : { activeCollabStatus: result.value }),
      activeCollabStatusChecked: true,
      activeCollabStatusContextKey: contextKey
    })
  },

  connectActiveCollab: async (args) => {
    const generation = beginActiveCollabMutation()
    const contextKey = getProviderRuntimeContextKey(get().settings)
    set({ activeCollabConnecting: true, activeCollabLastError: null })
    const result = await activeCollabConnect(args, get().settings)
    const sameMutation = isCurrentActiveCollabMutation(generation)
    if (!sameMutation || !isCurrentActiveCollabRuntimeContext(contextKey, get().settings)) {
      if (sameMutation) {
        set({ activeCollabConnecting: false })
      }
      // The token did land, but in the context the user just left.
      return result.ok ? activeCollabSupersededFailure() : result
    }
    if (!result.ok) {
      set({ activeCollabConnecting: false, activeCollabLastError: result.error })
      return result
    }
    clearActiveCollabInflightReads()
    // No follow-up status read: `connect` already answered with the connection, so re-reading only
    // adds a round trip that can land later and overwrite a correct state with a staler one.
    set({
      ...EMPTY_CACHES,
      activeCollabStatus: { configured: true, connection: result.value, reason: '' },
      activeCollabStatusChecked: true,
      activeCollabStatusContextKey: contextKey,
      activeCollabConnecting: false,
      activeCollabLastError: null
    })
    return result
  },

  disconnectActiveCollab: async () => {
    const generation = beginActiveCollabMutation()
    const contextKey = getProviderRuntimeContextKey(get().settings)
    set({ activeCollabConnecting: true })
    const result = await activeCollabDisconnect(get().settings)
    const sameMutation = isCurrentActiveCollabMutation(generation)
    if (!sameMutation || !isCurrentActiveCollabRuntimeContext(contextKey, get().settings)) {
      if (sameMutation) {
        set({ activeCollabConnecting: false })
      }
      return result
    }
    clearActiveCollabInflightReads()
    set({
      ...EMPTY_CACHES,
      activeCollabStatus: result.ok ? result.value : DISCONNECTED_STATUS,
      activeCollabStatusChecked: true,
      activeCollabStatusContextKey: contextKey,
      activeCollabConnecting: false,
      activeCollabLastError: result.ok ? null : result.error
    })
    return result
  }
})
