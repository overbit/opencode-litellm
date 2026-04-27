import type { LiteLLMModel } from '../types'

/**
 * Extract owner / provider from a LiteLLM model ID.
 *
 * LiteLLM model IDs commonly take the shape `<provider>/<model>` (e.g.
 * `openai/gpt-4o`, `anthropic/claude-3-5-sonnet`, `bedrock/...`). When
 * available we prefer the `litellm_provider` field returned by the API.
 */
export function extractModelOwner(model: LiteLLMModel): string | undefined {
  if (model.litellm_provider) return model.litellm_provider
  const parts = model.id.split('/')
  if (parts.length > 1) return parts[0]
  return undefined
}

/**
 * Categorize the model so we can attach sensible `modalities` metadata
 * in the OpenCode provider config.
 */
export function categorizeModel(model: LiteLLMModel): 'chat' | 'embedding' | 'image' | 'audio' | 'unknown' {
  if (model.mode) {
    const m = model.mode.toLowerCase()
    if (m.includes('embedding')) return 'embedding'
    if (m.includes('image')) return 'image'
    if (m.includes('audio') || m.includes('speech') || m.includes('transcription')) return 'audio'
    if (m.includes('chat') || m.includes('completion')) return 'chat'
  }

  const id = model.id.toLowerCase()
  if (id.includes('embed') || id.includes('embedding')) return 'embedding'
  if (id.includes('whisper') || id.includes('tts')) return 'audio'
  if (id.includes('dall-e') || id.includes('stable-diffusion') || id.includes('flux')) return 'image'
  return 'chat'
}

/**
 * Format a LiteLLM model ID into a human readable display name.
 *
 * Examples:
 *   "openai/gpt-4o-mini"             -> "GPT 4o Mini"
 *   "anthropic/claude-3-5-sonnet"    -> "Claude 3 5 Sonnet"
 *   "bedrock/amazon.nova-pro-v1"     -> "Amazon Nova Pro V1"
 *   "qwen/qwen3-30b-a3b"             -> "Qwen3 30B A3B"
 */
export function formatModelName(model: LiteLLMModel): string {
  const { id } = model

  // Drop provider prefix when present, but only the FIRST segment, so
  // ids like `bedrock/amazon.nova-pro-v1` still carry the vendor name
  // through to the display.
  const slashIdx = id.indexOf('/')
  const modelPart = slashIdx >= 0 ? id.slice(slashIdx + 1) : id

  const acronyms = new Set([
    'gpt', 'oss', 'api', 'gguf', 'ggml', 'nomic', 'vl', 'it', 'mlx',
    'llm', 'ai', 'sdk', 'aws', 'gcp', 'tts', 'stt', 'mm',
  ])

  const tokens = modelPart
    .split(/[-_.]/) // split on -, _ and .
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase()
      if (acronyms.has(lower)) return token.toUpperCase()
      // sizes (30b, 7b, 4k...)
      if (/^\d+[bkmg]$/i.test(token)) return token.toUpperCase()
      // quantizations (q4, q8...)
      if (/^q\d+$/i.test(token)) return token.toUpperCase()
      // semantic versions like 3.5
      if (/^\d+\.\d+/.test(token)) return token
      // shapes like a3b, e4b, 3n  -> uppercase
      if (/^[a-z]\d+[a-z]?$/i.test(token)) {
        return token.toUpperCase()
      }
      // shapes like "4o" (OpenAI branding) — keep digit + lowercase letter
      if (/^\d+[a-z]$/i.test(token)) {
        return token.toLowerCase()
      }
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
    })
    .join(' ')

  return tokens || id
}
