import { geminiGenerateContent, extractTextFromGenerateContent } from './geminiRest.js';

const MODEL = process.env.FLOW_PROMPT_ENHANCE_MODEL || 'gemini-2.0-flash';

const SYSTEM = `You are a senior cinematographer and prompt engineer for AI video (Veo-class).

Rewrite the user's idea into a SINGLE cohesive cinematic brief that preserves their intent, subject, and setting.

Requirements:
- Keep the user's core story, characters, and location faithful.
- Add professional detail: lens feel (e.g. 35mm/50mm mood), camera movement (dolly, handheld, crane mood — not literal gear lists unless helpful), lighting hierarchy (key/fill/rim, practicals), color palette, time of day.
- Mention atmospheric audio implicitly (rain, city hum, wind) where it fits the scene.
- Output MUST be strict JSON only, parseable by JSON.parse, no markdown:
{
  "cinematicPrompt": "full rewritten brief in English suitable for downstream storyboard + video models",
  "styleKeywords": ["...", "..."],
  "cameraMovement": "concise description",
  "lightingApproach": "concise description"
}`;

export async function enhancePromptForCinema(apiKey, userPrompt) {
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${SYSTEM}\n\nUSER_IDEA:\n${String(userPrompt).trim()}` }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  let data;
  try {
    data = await geminiGenerateContent(apiKey, MODEL, payload, { temperaturePurpose: 'finalSceneContent' });
  } catch {
    data = await geminiGenerateContent(
      apiKey,
      MODEL,
      {
        contents: payload.contents,
        generationConfig: { responseMimeType: 'application/json' },
      },
      { temperaturePurpose: 'finalSceneContent' },
    );
  }

  const raw = extractTextFromGenerateContent(data);
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim());
  } catch {
    return {
      cinematicPrompt: `${userPrompt.trim()} — cinematic lighting, motivated practicals, deliberate camera movement, filmic color grading.`,
      styleKeywords: ['cinematic', 'filmic'],
      cameraMovement: 'slow motivated moves',
      lightingApproach: 'motivated practical key with soft fill',
      fallback: true,
    };
  }

  if (!parsed.cinematicPrompt || typeof parsed.cinematicPrompt !== 'string') {
    parsed.cinematicPrompt = String(userPrompt).trim();
  }
  return parsed;
}
