/**
 * Multi-provider LLM client (OpenAI-compatible + Anthropic).
 */

const ANTHROPIC_VERSION = '2023-06-01';

function normalizeBase(url) {
  return String(url || '')
    .trim()
    .replace(/\/+$/, '');
}

/**
 * @param {object} llm
 * @param {Array<{role: string, content: string}>} messages
 * @param {Array<object>} [tools]
 * @returns {Promise<{ content: string, toolCalls: Array<{id: string, name: string, arguments: object}> }>}
 */
export async function chat(llm, messages, tools = []) {
  const provider = String(llm.provider || 'openai').toLowerCase();
  if (provider === 'anthropic') {
    return chatAnthropic(llm, messages, tools);
  }
  return chatOpenAiCompatible(llm, messages, tools);
}

async function chatOpenAiCompatible(llm, messages, tools) {
  let base = normalizeBase(llm.baseUrl) || 'https://api.openai.com/v1';
  if (!/\/v1$/i.test(base) && !base.includes('/v1/')) {
    base = `${base}/v1`;
  }
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  if (llm.apiKey) headers.Authorization = `Bearer ${llm.apiKey}`;

  const body = {
    model: llm.model || 'gpt-4o',
    messages,
    temperature: 0.2
  };
  if (tools.length) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
    body.tool_choice = 'auto';
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message || {};
  const toolCalls = (msg.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function?.name,
    arguments: safeJson(tc.function?.arguments)
  }));
  return { content: msg.content || '', toolCalls, rawRole: 'assistant' };
}

async function chatAnthropic(llm, messages, tools) {
  let base = normalizeBase(llm.baseUrl) || 'https://api.anthropic.com/v1';
  base = base.replace(/\/v1$/i, '') + '/v1';

  const systemParts = [];
  const converted = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
      continue;
    }
    if (m.role === 'tool') {
      converted.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.tool_call_id,
            content: m.content
          }
        ]
      });
      continue;
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const blocks = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.tool_calls) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name || tc.function?.name,
          input: tc.arguments || safeJson(tc.function?.arguments)
        });
      }
      converted.push({ role: 'assistant', content: blocks });
      continue;
    }
    converted.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    });
  }

  const body = {
    model: llm.model || 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: converted
  };
  if (systemParts.length) body.system = systemParts.join('\n\n');
  if (tools.length) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters
    }));
  }

  const res = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-key': llm.apiKey,
      'anthropic-version': ANTHROPIC_VERSION
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  let content = '';
  const toolCalls = [];
  for (const block of data.content || []) {
    if (block.type === 'text') content += block.text;
    if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input || {}
      });
    }
  }
  return { content, toolCalls, rawRole: 'assistant' };
}

function safeJson(s) {
  if (typeof s === 'object' && s !== null) return s;
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
}
