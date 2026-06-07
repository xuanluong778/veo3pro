import OpenAI from 'openai';
import { getProxyDispatcher } from './proxyService.js';

const JSON_INSTRUCTION = `Respond with valid JSON only (no markdown fences), keys:
- hook: string (opening 0–3s pattern)
- contentStructure: string (beats / flow)
- visualStyle: string (camera, color, transitions)
- scriptOutline: string (numbered beats or short script)
- cta: string (call-to-action pattern)
- viralPatterns: string[] (5–12 concrete patterns)
- reusableAiPrompt: string (one markdown block to paste into an AI video generator)
- disclaimer: string (optional; if you inferred without watching pixels, say so)`;

const SYSTEM_PROMPT = `You are a senior short-form video strategist (TikTok, Reels, Shorts).
Analyze hook, pacing, content flow, CTA, visuals, editing style, and viral mechanics.
Prefer Vietnamese for user-facing strings where natural. Be specific and actionable.
${JSON_INSTRUCTION}`;

function getClient(opts = {}) {
  const apiKey = String(opts.apiKey || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Chưa cấu hình OPENAI_API_KEY trong .env.');
  }
  const baseURL = typeof opts.baseURL === 'string' ? opts.baseURL.trim() : '';
  const dispatcher = getProxyDispatcher(opts.proxyUrl || '');
  const fetchWithProxy = dispatcher ? (url, init = {}) => fetch(url, { ...init, dispatcher }) : undefined;
  return new OpenAI(baseURL ? { apiKey, baseURL, ...(fetchWithProxy ? { fetch: fetchWithProxy } : {}) } : { apiKey, ...(fetchWithProxy ? { fetch: fetchWithProxy } : {}) });
}

function parseJsonContent(text) {
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
 * URL-only: model may not fetch private links; infer platform + deliver blueprint + disclaimer.
 */
export async function analyzeVideoFromUrl(url, notes = '', clientOpts = {}) {
  const client = getClient(clientOpts);
  const model = process.env.OPENAI_VIDEO_ANALYSIS_URL_MODEL || 'gpt-4o-mini';

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Video URL: ${url}\n\nUser notes:\n${String(notes || '').trim() || '(none)'}\n\nIf you cannot access the video file, infer from the URL host/path and platform norms, and set disclaimer clearly.`,
      },
    ],
    temperature: 0.45,
    max_tokens: 4096,
  });

  const text = completion.choices[0]?.message?.content;
  return parseJsonContent(text);
}

/**
 * Uploaded MP4/MOV: pass as chat file input (models that support video files).
 */
export async function analyzeVideoFromBuffer(buffer, mimeType, originalName, notes = '', clientOpts = {}) {
  const client = getClient(clientOpts);
  const model = process.env.OPENAI_VIDEO_ANALYSIS_FILE_MODEL || 'gpt-4o';

  const maxMb = Number(process.env.OPENAI_VIDEO_MAX_MB || 32);
  const sizeMb = buffer.length / (1024 * 1024);
  if (sizeMb > maxMb) {
    throw new Error(`File quá lớn (${sizeMb.toFixed(1)}MB). Giới hạn ${maxMb}MB (cấu hình OPENAI_VIDEO_MAX_MB).`);
  }

  const filename =
    String(originalName || 'upload.mp4')
      .replace(/[^\w.\-]/g, '_')
      .slice(0, 120) || 'upload.mp4';

  const b64 = buffer.toString('base64');

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this video file for viral patterns and structure.\n\nUser notes:\n${String(notes || '').trim() || '(none)'}`,
          },
          {
            type: 'file',
            file: {
              filename,
              file_data: b64,
            },
          },
        ],
      },
    ],
    temperature: 0.35,
    max_tokens: 4096,
  });

  const text = completion.choices[0]?.message?.content;
  return parseJsonContent(text);
}
