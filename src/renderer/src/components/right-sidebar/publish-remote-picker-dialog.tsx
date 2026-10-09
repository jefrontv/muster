import React, { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'

type PickerRequest = {
  remotes: string[]
  branchName: string
  resolve: (remote: string | null) => void
}

export function PublishRemotePickerDialog({
  request,
  onClose
}: {
  request: PickerRequest | null
  onClose: (remote: string | null) => void
}): React.JSX.Element {
  const [selected, setSelected] = useState<string>('')
  const remote = request && request.remotes.includes(selected) ? selected : ''

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.right.sidebar.publish_remote.title', 'Publish Branch')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.right.sidebar.publish_remote.description',
              'This repository has more than one remote. Choose where to publish {{value0}}.',
              { value0: request?.branchName ?? '' }
            )}
          </DialogDescription>
        </DialogHeader>
        <Select value={remote} onValueChange={setSelected}>
          <SelectTrigger
            className="w-full"
            aria-label={translate('auto.components.right.sidebar.publish_remote.label', 'Remote')}
          >
            <SelectValue
              placeholder={translate(
                'auto.components.right.sidebar.publish_remote.placeholder',
                'Choose a remote'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {(request?.remotes ?? []).map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onClose(null)}>
            {translate('auto.components.right.sidebar.publish_remote.cancel', 'Cancel')}
          </Button>
          <Button type="button" disabled={!remote} onClick={() => onClose(remote)}>
            {translate('auto.components.right.sidebar.publish_remote.publish', 'Publish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function usePublishRemotePicker(): {
  pickPublishRemote: (remotes: string[], branchName: string) => Promise<string | null>
  publishRemotePicker: React.JSX.Element
} {
  const [request, setRequest] = useState<PickerRequest | null>(null)
  const requestRef = useRef<PickerRequest | null>(null)

  const pickPublishRemote = useCallback(
    (remotes: string[], branchName: string): Promise<string | null> =>
      new Promise((resolve) => {
        // Why: a second prompt supersedes an unanswered one; settle the old promise so its caller unwinds.
        requestRef.current?.resolve(null)
        const next = { remotes, branchName, resolve }
        requestRef.current = next
        setRequest(next)
      }),
    []
  )

  const close = useCallback((remote: string | null): void => {
    requestRef.current?.resolve(remote)
    requestRef.current = null
    setRequest(null)
  }, [])

  return {
    pickPublishRemote,
    publishRemotePicker: <PublishRemotePickerDialog request={request} onClose={close} />
  }
}
