import { geminiGenerateContent, extractTextFromGenerateContent } from './geminiRest.js';

const DEFAULT_MODEL = process.env.FLOW_STORYBOARD_MODEL || 'gemini-2.0-flash';

const STORYBOARD_INSTRUCTION = `You are a cinematographer AI. The user gives ONE high-level scene idea.

Return STRICT JSON only (no markdown), parseable by JSON.parse, with this shape:
{
  "title": "short film title",
  "scenes": [
    {
      "id": "sc1",
      "description": "what happens in this beat",
      "camera": "lens / movement / framing",
      "lighting": "key mood and practicals",
      "imagePrompts": ["...", "..."]
    }
  ]
}

Rules:
- 2 to 5 scenes that flow as one continuous cinematic sequence.
- Each scene MUST include exactly 2, 3, or 4 strings in imagePrompts (English, highly visual, no camera jargon duplication — save camera/lighting fields for motion intent).
- Descriptions should align with the user's idea and stay visually consistent across scenes (same subject, wardrobe, location palette unless script demands change).
`;

function stripJsonFence(text) {
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'');
  }
  return t.trim();
}

export async function generateStructuredStoryboard(apiKey, userPrompt) {
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${STORYBOARD_INSTRUCTION}\n\nUSER_IDEA:\n${userPrompt.trim()}` }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  let data;
  try {
    data = await geminiGenerateContent(apiKey, DEFAULT_MODEL, payload, { temperaturePurpose: 'structuredStoryboard' });
  } catch (e) {
    const fallbackPayload = {
      contents: payload.contents,
      generationConfig: { responseMimeType: 'application/json' },
    };
    data = await geminiGenerateContent(apiKey, DEFAULT_MODEL, fallbackPayload, {
      temperaturePurpose: 'structuredStoryboard',
    });
  }

  const raw = extractTextFromGenerateContent(data);
  if (!raw) throw new Error('Storyboard: empty response from Gemini');

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(raw));
  } catch {
    throw new Error(`Storyboard: invalid JSON — ${raw.slice(0, 400)}`);
  }

  if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length < 2) {
    throw new Error('Storyboard: expected at least 2 scenes');
  }

  for (const sc of parsed.scenes) {
    const ips = sc.imagePrompts;
    if (!Array.isArray(ips) || ips.length < 2 || ips.length > 4) {
      throw new Error(`Scene ${sc.id}: imagePrompts must have 2–4 entries`);
    }
  }

  return parsed;
}
