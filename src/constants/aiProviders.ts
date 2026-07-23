/**
 * AI provider presets for the admin UI (mirrors server/constants/aiProviders.js).
 * Kept client-side so suggested URLs / hints work even before the API responds.
 */
export interface AiProviderPreset {
  id: string;
  label: string;
  suggestedBaseUrl: string;
  apiKeyRequired: boolean;
  hint: string;
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    suggestedBaseUrl: 'https://api.openai.com/v1',
    apiKeyRequired: true,
    hint: 'Official OpenAI API. Base URL must end with /v1.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    suggestedBaseUrl: 'https://api.anthropic.com/v1',
    apiKeyRequired: true,
    hint: 'Claude API from platform.claude.com. Uses x-api-key (not Bearer). Keys look like sk-ant-…',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    suggestedBaseUrl: 'https://openrouter.ai/api/v1',
    apiKeyRequired: true,
    hint: 'OpenAI-compatible gateway for many models (including Claude and GPT).',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    suggestedBaseUrl: 'http://host.docker.internal:11434/v1',
    apiKeyRequired: false,
    hint: 'Local OpenAI-compatible endpoint. API key optional. From Docker, use host.docker.internal (not localhost). Override with your LAN IP if needed.',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    suggestedBaseUrl: '',
    apiKeyRequired: false,
    hint: 'Any OpenAI-compatible server (LM Studio, vLLM, LiteLLM, Azure OpenAI proxy, etc.). Provide the …/v1 base URL.',
  },
];

export function getAiProviderPreset(providerId: string | undefined): AiProviderPreset {
  const id = String(providerId || 'openai').toLowerCase();
  return (
    AI_PROVIDER_PRESETS.find((p) => p.id === id) ||
    AI_PROVIDER_PRESETS.find((p) => p.id === 'custom')!
  );
}

/** True if value is empty or matches any known preset suggestion (safe to auto-replace). */
export function isSuggestedOrEmptyBaseUrl(value: string): boolean {
  const current = value.trim();
  if (!current) return true;
  return AI_PROVIDER_PRESETS.some(
    (p) => p.suggestedBaseUrl && p.suggestedBaseUrl === current
  );
}
