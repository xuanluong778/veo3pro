import OpenAI from 'openai';
import { getProxyDispatcher } from './proxyService.js';

function getClient(opts = {}) {
  const apiKey = String(opts.apiKey || '').trim();
  if (!apiKey) throw new Error('Thiếu OpenAI API key.');
  const baseURL = typeof opts.baseURL === 'string' ? opts.baseURL.trim() : '';
  const dispatcher = getProxyDispatcher(opts.proxyUrl || '');
  const fetchWithProxy = dispatcher ? (url, init = {}) => fetch(url, { ...init, dispatcher }) : undefined;
  return new OpenAI(baseURL ? { apiKey, baseURL, ...(fetchWithProxy ? { fetch: fetchWithProxy } : {}) } : { apiKey, ...(fetchWithProxy ? { fetch: fetchWithProxy } : {}) });
}

function promptModel() {
  return String(process.env.OPENAI_TEXT_VIDEO_PROMPT_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
}

function parseJsonLoose(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('OpenAI trả về nội dung rỗng.');
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Không parse được JSON từ OpenAI.');
  }
}

/**
 * Một prompt Veo-style qua ChatGPT/OpenAI (JSON {"prompt":"..."}).
 * @param {{ topic: string, style?: string, duration?: number, ratio?: string, language?: string, context?: string }} input
 * @param {{ apiKey: string, baseURL?: string, proxyUrl?: string }} clientOpts
 */
export async function generateTextVideoPromptWithOpenAI(input, clientOpts = {}) {
  const topic = String(input.topic || '').trim();
  if (!topic) throw new Error('Thiếu topic.');

  const style = String(input.style || '').trim();
  const duration = Number(input.duration) > 0 ? Math.floor(Number(input.duration)) : 8;
  const ratio = String(input.ratio || '16:9').trim();
  const language = String(input.language || 'vi').trim();
  const context = String(input.context || '').trim();

  const langLabel = language === 'en' ? 'English' : 'Vietnamese';
  const client = getClient(clientOpts);
  const model = promptModel();

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You write prompts for AI video models (e.g. Google Veo). Respond with valid JSON only: {"prompt":"..."}.
The "prompt" value must be one detailed, shot-oriented description (primary language: ${langLabel}), suitable for live-action unless the user asks otherwise, max ~2200 characters. Include lighting, camera feel, motion, mood. No markdown code fences inside the JSON.`,
      },
      {
        role: 'user',
        content: [
          `Video topic / brief:\n${topic}`,
          style ? `Tone / style label: ${style}` : '',
          `Target clip length: ~${duration}s.`,
          `Aspect ratio: ${ratio}.`,
          context ? `Extra context:\n${context}` : '',
          `Write the final single-block video prompt in ${langLabel}.`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
    temperature: 0.65,
    max_tokens: 1800,
  });

  const text = completion.choices[0]?.message?.content;
  const j = parseJsonLoose(text);
  const prompt = String(j.prompt || j.veo_prompt || '').trim();
  if (!prompt) throw new Error('OpenAI không trả về prompt hợp lệ.');
  return { prompt, model };
}
