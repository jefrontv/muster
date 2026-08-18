import { track } from '@/lib/telemetry'
import type { EventProps } from '../../../../shared/telemetry-events'

export type OrcaCliFeatureTipSource = EventProps<'orca_cli_feature_tip_shown'>['source']
export type CmdJPaletteFeatureTipSource = EventProps<'cmd_j_palette_feature_tip_shown'>['source']

export function getOrcaCliFeatureTipTelemetrySource(value: unknown): OrcaCliFeatureTipSource {
  return value === 'app_open' ? 'app_open' : 'manual'
}

export function trackCmdJPaletteFeatureTipShown(source: CmdJPaletteFeatureTipSource): void {
  track('cmd_j_palette_feature_tip_shown', { source })
}

export function trackCmdJPaletteFeatureTipAcknowledged(source: CmdJPaletteFeatureTipSource): void {
  track('cmd_j_palette_feature_tip_acknowledged', { source })
}
