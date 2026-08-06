import { KeyRound, ShieldCheck, ShieldX } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import {
  SITE_DEPLOY_TOGGLES,
  SITE_IMPORT_TOGGLES,
  type SiteEnvironment,
  type SiteSecretKind,
  type SiteSummary
} from '../../../../shared/site-types'
import { getSiteToggleLabels } from './site-toggle-labels'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type SiteEnvironmentSectionProps = {
  summary: SiteSummary
  environmentName: string
  environment: SiteEnvironment
  onPatch: (patch: Partial<SiteEnvironment>) => void
  onSetSecret: (kind: SiteSecretKind, value: string) => void
  /** Run button rendered at the foot of the import-steps column, so action sits with its options. */
  importAction?: React.ReactNode
  /** Run button rendered at the foot of the deploy-steps column. */
  deployAction?: React.ReactNode
}

const getTextFields = createLocalizedCatalog(() => [
  {
    key: 'hostname' as const,
    label: translate('auto.components.sites.SiteEnvironmentSection.hostname', 'SSH host'),
    placeholder: translate(
      'auto.components.sites.SiteEnvironmentSection.hostnameHint',
      'dedicated-11.example.com'
    )
  },
  {
    key: 'username' as const,
    label: translate('auto.components.sites.SiteEnvironmentSection.username', 'SSH user'),
    placeholder: translate('auto.components.sites.SiteEnvironmentSection.usernameHint', 'acme')
  },
  {
    key: 'rootPath' as const,
    label: translate('auto.components.sites.SiteEnvironmentSection.rootPath', 'Remote root'),
    placeholder: translate(
      'auto.components.sites.SiteEnvironmentSection.rootPathHint',
      'public_html'
    )
  },
  {
    key: 'liveDomain' as const,
    label: translate('auto.components.sites.SiteEnvironmentSection.liveDomain', 'Live domain'),
    placeholder: translate(
      'auto.components.sites.SiteEnvironmentSection.liveDomainHint',
      'acme.com'
    )
  },
  {
    key: 'deployCommand' as const,
    label: translate('auto.components.sites.SiteEnvironmentSection.deployCommand', 'Build command'),
    placeholder: translate(
      'auto.components.sites.SiteEnvironmentSection.deployCommandHint',
      'npm ci && npm run build:prod'
    )
  },
  {
    key: 'themeDistPath' as const,
    label: translate(
      'auto.components.sites.SiteEnvironmentSection.themeDistPath',
      'Theme dist path'
    ),
    placeholder: translate(
      'auto.components.sites.SiteEnvironmentSection.themeDistPathHint',
      'wp-content/themes/<theme>/dist'
    )
  }
])

function SecretRow({
  kind,
  isSet,
  onSetSecret
}: {
  kind: SiteSecretKind
  isSet: boolean
  onSetSecret: (kind: SiteSecretKind, value: string) => void
}): React.JSX.Element {
  const [value, setValue] = useState('')
  const label =
    kind === 'ssh'
      ? translate('auto.components.sites.SiteEnvironmentSection.sshPassword', 'SSH password')
      : translate('auto.components.sites.SiteEnvironmentSection.dbPassword', 'Database password')

  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1 space-y-1">
        <Label className="flex items-center gap-1.5 text-xs">
          <KeyRound className="size-3" />
          {label}
          {isSet ? (
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="size-3" />
              {translate('auto.components.sites.SiteEnvironmentSection.secretSet', 'Stored')}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <ShieldX className="size-3" />
              {translate('auto.components.sites.SiteEnvironmentSection.secretUnset', 'Not set')}
            </Badge>
          )}
        </Label>
        <Input
          type="password"
          value={value}
          autoComplete="off"
          placeholder={
            isSet
              ? translate(
                  'auto.components.sites.SiteEnvironmentSection.secretReplace',
                  'Enter a new value to replace'
                )
              : translate('auto.components.sites.SiteEnvironmentSection.secretEnter', 'Enter value')
          }
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={value.length === 0}
        onClick={() => {
          onSetSecret(kind, value)
          setValue('')
        }}
      >
        {translate('auto.components.sites.SiteEnvironmentSection.secretSave', 'Save')}
      </Button>
      <Button variant="ghost" size="sm" disabled={!isSet} onClick={() => onSetSecret(kind, '')}>
        {translate('auto.components.sites.SiteEnvironmentSection.secretClear', 'Clear')}
      </Button>
    </div>
  )
}

export function SiteEnvironmentSection({
  summary,
  environmentName,
  environment,
  onPatch,
  onSetSecret,
  importAction,
  deployAction
}: SiteEnvironmentSectionProps): React.JSX.Element {
  const presence = summary.secrets[environmentName] ?? { ssh: false, db: false }
  const toggleLabels = getSiteToggleLabels()

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {getTextFields().map((field) => (
          <div key={field.key} className="space-y-1">
            <Label className="text-xs">{field.label}</Label>
            <Input
              value={environment[field.key]}
              placeholder={field.placeholder}
              onChange={(event) => onPatch({ [field.key]: event.target.value })}
            />
          </div>
        ))}
      </div>

      {/* Secrets sit with the other connection settings; the step toggles and their run buttons
          close the section as the action area. */}
      <div className="space-y-3">
        <SecretRow kind="ssh" isSet={presence.ssh} onSetSecret={onSetSecret} />
        <SecretRow kind="db" isSet={presence.db} onSetSecret={onSetSecret} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex flex-col space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">
            {translate('auto.components.sites.SiteEnvironmentSection.importSteps', 'Import steps')}
          </legend>
          {SITE_IMPORT_TOGGLES.map((toggle) => (
            <label key={toggle.key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={environment[toggle.key]}
                onCheckedChange={(checked) => onPatch({ [toggle.key]: checked === true })}
              />
              {toggleLabels[toggle.key] ?? toggle.label}
            </label>
          ))}
          {importAction ? <div className="mt-auto pt-2">{importAction}</div> : null}
        </fieldset>
        <fieldset className="flex flex-col space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">
            {translate('auto.components.sites.SiteEnvironmentSection.deploySteps', 'Deploy steps')}
          </legend>
          {SITE_DEPLOY_TOGGLES.map((toggle) => (
            <label key={toggle.key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={environment[toggle.key]}
                onCheckedChange={(checked) => onPatch({ [toggle.key]: checked === true })}
              />
              {toggleLabels[toggle.key] ?? toggle.label}
            </label>
          ))}
          {deployAction ? <div className="mt-auto pt-2">{deployAction}</div> : null}
        </fieldset>
      </div>
    </div>
  )
}
