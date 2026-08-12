import type React from 'react'
import { Fragment } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SiteSecretField } from './SiteSecretField'

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

// Order pairs each field with its partner across the two-column grid: host+root locate the
// server, user+password authenticate to it (the secret is injected after `username` below).
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
    key: 'rootPath' as const,
    label: translate('auto.components.sites.SiteEnvironmentSection.rootPath', 'Remote root'),
    placeholder: translate(
      'auto.components.sites.SiteEnvironmentSection.rootPathHint',
      'public_html'
    )
  },
  {
    key: 'username' as const,
    label: translate('auto.components.sites.SiteEnvironmentSection.username', 'SSH user'),
    placeholder: translate('auto.components.sites.SiteEnvironmentSection.usernameHint', 'acme')
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
          <Fragment key={field.key}>
            <div className="space-y-1">
              <Label className="text-xs">{field.label}</Label>
              <Input
                value={environment[field.key]}
                placeholder={field.placeholder}
                onChange={(event) => onPatch({ [field.key]: event.target.value })}
              />
            </div>
            {/* The password belongs beside the user it authenticates, not in a block of its own. */}
            {field.key === 'username' ? (
              <SiteSecretField
                key={`ssh-secret:${environmentName}`}
                kind="ssh"
                label={translate(
                  'auto.components.sites.SiteEnvironmentSection.sshPassword',
                  'SSH password'
                )}
                isSet={presence.ssh}
                onSetSecret={onSetSecret}
              />
            ) : null}
          </Fragment>
        ))}
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
