import type { Plugin, PluginInput } from '@opencode-ai/plugin'
import {
  autoDetectLiteLLM,
  checkLiteLLMHealth,
  discoverLiteLLMModelInfo,
  discoverLiteLLMModels,
  normalizeBaseURL,
} from '../utils/litellm-api'
import {
  formatModelName,
  extractModelOwner,
  categorizeModel,
} from '../utils/format-model-name'
import type { LiteLLMModel, LiteLLMModelInfo } from '../types'

const CHAT_PROVIDER_ID = 'litellm'
const DISCOVERY_TIMEOUT_MS = 5000

/**
 * Read `customHeaders` from a provider options block.
 */
function readCustomHeaders(
  options: Record<string, unknown>,
): Record<string, string> | undefined {
  const raw = options.customHeaders
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    return Object.keys(out).length > 0 ? out : undefined
  }
  return undefined
}

/**
 * Overlay metadata from `/v1/model/info` onto a `/v1/models` entry.
 * Fields already present on the lean entry win; the info block only
 * fills gaps (notably `mode`, which `/v1/models` omits for
 * database-defined models).
 */
function enrichModel(model: LiteLLMModel, info: LiteLLMModelInfo): LiteLLMModel {
  return {
    ...model,
    mode: model.mode ?? info.mode,
    max_tokens: model.max_tokens ?? info.max_tokens,
    max_input_tokens: model.max_input_tokens ?? info.max_input_tokens,
    max_output_tokens: model.max_output_tokens ?? info.max_output_tokens,
    supports_function_calling: model.supports_function_calling ?? info.supports_function_calling,
    supports_vision: model.supports_vision ?? info.supports_vision,
  }
}

/**
 * Convert a discovered LiteLLM model into an OpenCode config-level
 * model entry (the shape used in `provider.*.models` inside
 * `opencode.json`). Returns `null` for non-chat models (embedding,
 * image, audio) — they can't be used as primary chat models and would
 * clutter the picker.
 */
function toConfigModel(model: LiteLLMModel): Record<string, unknown> | null {
  const type = categorizeModel(model)
  if (type === 'embedding' || type === 'image' || type === 'audio') {
    return null
  }
  const entry: Record<string, unknown> = {
    name: formatModelName(model),
  }
  if (model.max_input_tokens || model.max_output_tokens) {
    entry.limit = {
      context: model.max_input_tokens ?? 0,
      output: model.max_output_tokens ?? 0,
    }
  }
  if (model.supports_function_calling) {
    entry.tool_call = true
  }
  if (model.supports_vision) {
    entry.attachment = true
  }
  return entry
}

/**
 * LiteLLM Plugin for OpenCode.
 *
 * Uses the `config` hook to discover models from a LiteLLM proxy and
 * inject them into the provider's `models` map at startup. This is the
 * only reliable way to dynamically populate a provider — the
 * `provider.models` hook is not called by OpenCode for custom providers.
 *
 * Configure the provider in your `opencode.json`:
 *
 * {
 *   "plugin": ["opencode-plugin-litellm@latest"],
 *   "provider": {
 *     "litellm": {
 *       "npm": "@ai-sdk/openai-compatible",
 *       "name": "LiteLLM (proxy)",
 *       "options": {
 *         "baseURL": "http://localhost:4000/v1",
 *         "apiKey": "{env:LITELLM_API_KEY}"
 *       }
 *     }
 *   }
 * }
 */
export const LiteLLMPlugin: Plugin = async (_input: PluginInput) => {
  return {
    config: async (config: any) => {
      // Ensure the provider entry exists
      if (!config.provider) config.provider = {}

      const existing = config.provider[CHAT_PROVIDER_ID] as
        | Record<string, unknown>
        | undefined
      const options = (existing?.options ?? {}) as Record<string, unknown>
      const configuredBase =
        typeof options.baseURL === 'string' ? options.baseURL : undefined
      const configuredKey =
        typeof options.apiKey === 'string' && options.apiKey
          ? options.apiKey
          : undefined
      const envKey =
        process.env.LITELLM_API_KEY ?? process.env.LITELLM_MASTER_KEY
      const apiKey = configuredKey ?? envKey
      const customHeaders = readCustomHeaders(options)

      // Resolve base URL
      let baseURL: string | null = null
      if (configuredBase) {
        baseURL = normalizeBaseURL(configuredBase)
      } else {
        baseURL = await autoDetectLiteLLM(apiKey, customHeaders)
      }

      if (!baseURL) {
        console.warn(
          '[opencode-litellm] No LiteLLM proxy found. Configure provider.litellm.options.baseURL or start LiteLLM on port 4000/8000/8080.',
        )
        return
      }

      // Create provider entry if it doesn't exist
      if (!existing) {
        config.provider[CHAT_PROVIDER_ID] = {
          npm: '@ai-sdk/openai-compatible',
          name: 'LiteLLM (proxy)',
          options: {
            baseURL: `${baseURL}/v1`,
          },
          models: {},
        }
      }

      const provider = config.provider[CHAT_PROVIDER_ID] as Record<
        string,
        unknown
      >

      // Ensure npm is set
      if (!provider.npm) {
        provider.npm = '@ai-sdk/openai-compatible'
      }

      // Ensure options.baseURL is set
      if (!provider.options) {
        provider.options = { baseURL: `${baseURL}/v1` }
      }

      // Ensure models map exists
      if (!provider.models) {
        provider.models = {}
      }

      const models = provider.models as Record<string, unknown>

      // Discover models with timeout
      const work = async () => {
        if (!(await checkLiteLLMHealth(baseURL!, apiKey, customHeaders))) {
          console.warn(
            `[opencode-litellm] LiteLLM appears offline or unauthorized at ${baseURL}`,
          )
          return
        }

        // `/v1/models` omits `mode` and capability metadata for
        // database-defined models, so fetch `/v1/model/info` alongside
        // it. The info call is best-effort: without it, classification
        // falls back to id heuristics.
        const [modelsResult, infoResult] = await Promise.allSettled([
          discoverLiteLLMModels(baseURL!, apiKey, customHeaders),
          discoverLiteLLMModelInfo(baseURL!, apiKey, customHeaders),
        ])

        if (modelsResult.status === 'rejected') {
          const error = modelsResult.reason
          console.warn(
            '[opencode-litellm] Model discovery failed:',
            error instanceof Error ? error.message : String(error),
          )
          return
        }

        const discovered = modelsResult.value
        const infoByName =
          infoResult.status === 'fulfilled' ? infoResult.value : null

        if (discovered.length === 0) {
          console.warn(
            '[opencode-litellm] LiteLLM responded but exposed zero models.',
          )
          return
        }

        let added = 0
        let skipped = 0
        for (const model of discovered) {
          // Don't overwrite user-curated entries
          if (models[model.id]) continue
          const info = infoByName?.get(model.id)
          const entry = toConfigModel(info ? enrichModel(model, info) : model)
          if (!entry) {
            skipped++
            continue
          }
          models[model.id] = entry
          added++
        }

        // Remove the seed placeholder if real models were discovered
        if (models['_'] && Object.keys(models).length > 1) {
          delete models['_']
        }

        console.log(
          `[opencode-litellm] Discovered ${added} models from ${baseURL}` +
            (skipped > 0 ? ` (${skipped} non-chat models hidden)` : ''),
        )
      }

      await Promise.race([
        work(),
        new Promise<void>((resolve) =>
          setTimeout(resolve, DISCOVERY_TIMEOUT_MS),
        ),
      ])
    },
  }
}

// Re-export the responses plugin for backwards compat, but it's now a no-op.
// The config hook approach handles all models in a single provider.
export const LiteLLMResponsesPlugin: Plugin = async (_input: PluginInput) => {
  return {}
}
