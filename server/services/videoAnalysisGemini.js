import { geminiGenerateContent, extractTextFromGenerateContent } from './geminiRest.js';

const JSON_INSTRUCTION = `Return valid JSON only (no markdown fences), keys:
- hook: string (opening 0–3s pattern)
- contentStructure: string (beats / flow)
- visualStyle: string (camera, color, transitions)
- scriptOutline: string (numbered beats or short script)
- cta: string (call-to-action pattern)
- viralPatterns: string[] (5–12 concrete patterns)
- reusableAiPrompt: string (one block to paste into an AI video generator)
- disclaimer: string (optional; if you inferred without watching pixels, say so)`;

const SYSTEM_PROMPT = `You are a senior short-form video strategist (TikTok, Reels, Shorts).
Analyze hook, pacing, content flow, CTA, visuals, editing style, and viral mechanics.
Prefer Vietnamese for user-facing strings where natural.
${JSON_INSTRUCTION}`;

function parseJsonContent(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Gemini trả về nội dung rỗng.');
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Không parse được JSON từ Gemini.');
  }
}

function modelForPurpose() {
  return String(process.env.GEMINI_VIDEO_ANALYSIS_MODEL || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
}

export async function analyzeVideoFromUrlGemini(apiKey, url, notes = '', opts = {}) {
  const model = modelForPurpose();
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: SYSTEM_PROMPT },
          {
            text: `Video URL: ${url}\n\nUser notes:\n${String(notes || '').trim() || '(none)'}\n\nIf you cannot access the video file, infer from the URL host/path and platform norms, and set disclaimer clearly.`,
          },
        ],
      },
    ],
    generationConfig: { temperature: 0.4 },
  };
  const data = await geminiGenerateContent(apiKey, model, payload, { temperaturePurpose: 'suggestions', proxyUrl: opts.proxyUrl || '' });
  const text = extractTextFromGenerateContent(data);
  return parseJsonContent(text);
}

export async function analyzeVideoFromBufferGemini(apiKey, buffer, mimeType, originalName, notes = '', opts = {}) {
  const model = modelForPurpose();
  const maxMb = Number(process.env.GEMINI_VIDEO_MAX_MB || 18);
  const sizeMb = buffer.length / (1024 * 1024);
  if (sizeMb > maxMb) {
    throw new Error(`File quá lớn (${sizeMb.toFixed(1)}MB). Giới hạn ${maxMb}MB (GEMINI_VIDEO_MAX_MB).`);
  }

  const b64 = buffer.toString('base64');
  const filename =
    String(originalName || 'upload.mp4')
      .replace(/[^\w.\-]/g, '_')
      .slice(0, 120) || 'upload.mp4';

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: SYSTEM_PROMPT },
          { text: `Analyze this video file "${filename}" for viral patterns and structure.\n\nUser notes:\n${String(notes || '').trim() || '(none)'}` },
          {
            inlineData: {
              mimeType: mimeType || 'video/mp4',
              data: b64,
            },
          },
        ],
      },
    ],
    generationConfig: { temperature: 0.35 },
  };

  const data = await geminiGenerateContent(apiKey, model, payload, { temperaturePurpose: 'visionQc', proxyUrl: opts.proxyUrl || '' });
  const text = extractTextFromGenerateContent(data);
  return parseJsonContent(text);
}

