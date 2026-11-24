// Reading agent tool arguments with the errors agents see.
import { ProjectPagesError } from './project-pages-store'

export type ToolArgs = Record<string, unknown>

export function toolText(args: ToolArgs, key: string, required = false): string {
  const value = args[key]
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new ProjectPagesError('invalid', `${key} is required.`)
    }
    return ''
  }
  if (typeof value !== 'string') {
    throw new ProjectPagesError('invalid', `${key} must be a string.`)
  }
  return value
}

export function toolCount(args: ToolArgs, key: string): number | undefined {
  const value = args[key]
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ProjectPagesError('invalid', `${key} must be a whole number.`)
  }
  return value
}
