import {
  autoDetectLiteLLM,
  checkLiteLLMHealth,
  discoverLiteLLMModels,
  normalizeBaseURL,
} from '../utils/litellm-api'
import { categorizeModel, extractModelOwner, formatModelName } from '../utils/format-model-name'
import type { LiteLLMModel } from '../types'

const PROVIDER_KEY = 'litellm'

/**
 * Build the OpenCode model entry for a single discovered model.
 */
function buildModelEntry(model: LiteLLMModel): Record<string, unknown> {
  const owner = extractModelOwner(model)
  const type = categorizeModel(model)

  const entry: Record<string, unknown> = {
    id: model.id,
    name: formatModelName(model),
  }

  if (owner) entry.organizationOwner = owner

  switch (type) {
    case 'embedding':
      entry.modalities = { input: ['text'], output: ['embedding'] }
      break
    case 'image':
      entry.modalities = { input: ['text'], output: ['image'] }
      break
    case 'audio':
      entry.modalities = { input: ['audio', 'text'], output: ['text'] }
      break
    case 'chat':
    default:
      entry.modalities = {
        input: model.supports_vision ? ['text', 'image'] : ['text'],
        output: ['text'],
      }
      break
  }

  if (model.supports_function_calling) {
    entry.toolCall = true
  }

  return entry
}

/**
 * Mutates `config` in place: ensures the litellm provider exists,
 * fetches all models from the LiteLLM proxy and merges them in.
 */
export async function enhanceConfig(config: any): Promise<void> {
  if (!config) return

  if (!config.provider) config.provider = {}
  let provider = config.provider[PROVIDER_KEY]

  // Resolve baseURL & apiKey, either from the user's provider config
  // or by auto-detecting a running LiteLLM proxy.
  let baseURL: string
  let apiKey: string | undefined

  if (provider) {
    baseURL = normalizeBaseURL(provider.options?.baseURL ?? 'http://localhost:4000')
    apiKey = provider.options?.apiKey ?? process.env.LITELLM_API_KEY ?? process.env.LITELLM_MASTER_KEY
  } else {
    const detected = await autoDetectLiteLLM()
    if (!detected) {
      // Nothing to do — LiteLLM doesn't appear to be running anywhere
      // we know about. Silently bail; this is the no-op case.
      return
    }
    baseURL = normalizeBaseURL(detected)
    apiKey = process.env.LITELLM_API_KEY ?? process.env.LITELLM_MASTER_KEY

    provider = {
      npm: '@ai-sdk/openai-compatible',
      name: 'LiteLLM (proxy)',
      options: {
        baseURL: `${baseURL}/v1`,
        ...(apiKey ? { apiKey } : {}),
      },
      models: {},
    }
    config.provider[PROVIDER_KEY] = provider
  }

  // Verify the server is actually answering before we hammer /v1/models.
  if (!(await checkLiteLLMHealth(baseURL, apiKey))) {
    console.warn(`[opencode-litellm] LiteLLM appears offline or unauthorized at ${baseURL}`)
    return
  }

  let models: LiteLLMModel[]
  try {
    models = await discoverLiteLLMModels(baseURL, apiKey)
  } catch (error) {
    console.warn('[opencode-litellm] Model discovery failed:', error instanceof Error ? error.message : String(error))
    return
  }

  if (models.length === 0) {
    console.warn('[opencode-litellm] LiteLLM responded but exposed zero models. Check your `model_list` in litellm config.yaml')
    return
  }

  const existing: Record<string, any> = provider.models ?? {}
  const discovered: Record<string, any> = {}

  for (const model of models) {
    // Use the raw id as the key when it's safe (most LiteLLM ids are
    // safe — e.g. "gpt-4o" or "anthropic/claude-3-5-sonnet"), otherwise
    // sanitize it so OpenCode can parse it.
    const key = /^[a-zA-Z0-9/_.\-:]+$/.test(model.id)
      ? model.id
      : model.id.replace(/[^a-zA-Z0-9_-]/g, '_')

    if (existing[key] || existing[model.id]) continue
    discovered[key] = buildModelEntry(model)
  }

  if (Object.keys(discovered).length === 0) return

  provider.models = { ...existing, ...discovered }
  console.log(`[opencode-litellm] Discovered ${Object.keys(discovered).length} model(s) from LiteLLM at ${baseURL}`)
}
