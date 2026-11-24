// Lets a tool payload carry one image, which MCP surfaces send as an image content block.

export const TOOL_IMAGE_KEY = 'mcp_image'

export type ToolImage = { data: string; mimeType: string }

/** Takes the image out of a payload; the rest is sent as text. */
export function splitToolImage(payload: unknown): { rest: unknown; image: ToolImage | null } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { rest: payload, image: null }
  }
  const { [TOOL_IMAGE_KEY]: raw, ...rest } = payload as Record<string, unknown>
  const image = raw as Partial<ToolImage> | undefined
  if (typeof image?.data !== 'string' || typeof image.mimeType !== 'string') {
    return { rest: payload, image: null }
  }
  return { rest, image: { data: image.data, mimeType: image.mimeType } }
}
