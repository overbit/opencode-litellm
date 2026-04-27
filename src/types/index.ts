// Core types for the LiteLLM OpenCode plugin

/**
 * A single model entry returned by LiteLLM's `/v1/models` endpoint.
 * LiteLLM follows the OpenAI-compatible schema.
 */
export interface LiteLLMModel {
  id: string
  object: string
  created?: number
  owned_by?: string
  /**
   * LiteLLM-specific extension. Some deployments include the underlying
   * provider (e.g. "openai", "anthropic", "bedrock") here.
   */
  litellm_provider?: string
  /**
   * Optional capability metadata exposed by some LiteLLM versions
   * via `/model/info` (we ignore it for the lean discovery endpoint
   * but keep the type around for forward-compat).
   */
  mode?: string
  max_tokens?: number
  max_input_tokens?: number
  max_output_tokens?: number
  supports_function_calling?: boolean
  supports_vision?: boolean
}

export interface LiteLLMModelsResponse {
  object: string
  data: LiteLLMModel[]
}

export type ModelType = 'chat' | 'embedding' | 'image' | 'audio' | 'unknown'

export interface LiteLLMOptions {
  baseURL?: string
  apiKey?: string
}
