/**
 * AI provider presets for admin configuration and connectivity probes.
 * Keep IDs stable — stored in settings.AI_PROVIDER.
 */

/** @typedef {'openai' | 'anthropic' | 'openrouter' | 'ollama' | 'custom'} AiProviderId */

/**
 * @type {readonly {
 *   id: AiProviderId,
 *   label: string,
 *   suggestedBaseUrl: string,
 *   auth: 'bearer' | 'anthropic' | 'none',
 *   apiKeyRequired: boolean,
 *   apiStyle: 'openai' | 'anthropic',
 *   hint: string
 * }[]}
 */
export const AI_PROVIDER_PRESETS = Object.freeze([
  {
    id: 'openai',
    label: 'OpenAI',
    suggestedBaseUrl: 'https://api.openai.com/v1',
    auth: 'bearer',
    apiKeyRequired: true,
    apiStyle: 'openai',
    hint: 'Official OpenAI API. Base URL must end with /v1.'
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    suggestedBaseUrl: 'https://api.anthropic.com/v1',
    auth: 'anthropic',
    apiKeyRequired: true,
    apiStyle: 'anthropic',
    hint: 'Claude API from platform.claude.com. Uses x-api-key (not Bearer). Keys look like sk-ant-…'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    suggestedBaseUrl: 'https://openrouter.ai/api/v1',
    auth: 'bearer',
    apiKeyRequired: true,
    apiStyle: 'openai',
    hint: 'OpenAI-compatible gateway for many models (including Claude and GPT).'
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    suggestedBaseUrl: 'http://host.docker.internal:11434/v1',
    auth: 'none',
    apiKeyRequired: false,
    apiStyle: 'openai',
    hint: 'Local OpenAI-compatible endpoint. API key is optional (leave blank or use any placeholder). From Docker, use host.docker.internal or the host LAN IP — not “localhost” inside the container.'
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    suggestedBaseUrl: '',
    auth: 'bearer',
    apiKeyRequired: false,
    apiStyle: 'openai',
    hint: 'Any OpenAI-compatible server (LM Studio, vLLM, LiteLLM, Azure OpenAI proxy, etc.). Provide the …/v1 base URL. API key optional if the server does not require one.'
  }
]);

/**
 * @param {string} [providerId]
 * @returns {(typeof AI_PROVIDER_PRESETS)[number]}
 */
export function getAiProviderPreset(providerId) {
  const id = String(providerId || 'custom').toLowerCase();
  return AI_PROVIDER_PRESETS.find((p) => p.id === id) || AI_PROVIDER_PRESETS.find((p) => p.id === 'custom');
}

/**
 * Infer a sensible provider from key / URL when AI_PROVIDER is unset.
 * @param {{ apiKey?: string, baseUrl?: string }} opts
 * @returns {AiProviderId}
 */
export function inferAiProvider({ apiKey = '', baseUrl = '' } = {}) {
  const key = String(apiKey || '');
  const url = String(baseUrl || '').toLowerCase();
  if (/^sk-ant-/i.test(key) || /api\.anthropic\.com/i.test(url)) return 'anthropic';
  if (/openrouter\.ai/i.test(url)) return 'openrouter';
  if (/11434|ollama/i.test(url)) return 'ollama';
  if (/api\.openai\.com/i.test(url) || /^sk-(?!ant)/i.test(key)) return 'openai';
  if (url) return 'custom';
  return 'openai';
}
