import { geminiGenerateContent, extractTextFromGenerateContent } from './geminiRest.js';

const MODEL = process.env.FLOW_VISION_QC_MODEL || 'gemini-2.0-flash';

/**
 * Gemini Vision gate: relevance vs intent + obvious distortion/blank heuristics.
 * Returns { ok, reason, raw }.
 */
export async function validateImageWithGeminiVision(apiKey, {
  mimeType,
  dataBase64,
  intentPrompt,
  sceneContext,
}) {
  const instruction = `You are a strict QC model for film stills used as Veo references.

Evaluate the image against the creative intent.

Respond with STRICT JSON only (no markdown):
{
  "relevant": boolean,
  "blank_or_near_blank": boolean,
  "severely_distorted": boolean,
  "score": number
}

Rules:
- relevant=true only if the image clearly matches subject/setting/mood of the intent.
- blank_or_near_blank=true for empty gradients, single flat color fields, broken renders.
- severely_distorted=true for mangled faces/hands, extreme warping, unreadable composition.

INTENT:
${intentPrompt}

SCENE CONTEXT:
${sceneContext || 'n/a'}
`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/png',
              data: dataBase64,
            },
          },
          { text: instruction },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  let data;
  try {
    data = await geminiGenerateContent(apiKey, MODEL, payload, { temperaturePurpose: 'visionQc' });
  } catch (e) {
    return { ok: true, reason: 'vision_qc_skipped_api_error', skipped: true, error: e.message };
  }

  const raw = extractTextFromGenerateContent(data);
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim());
  } catch {
    return { ok: true, reason: 'vision_qc_parse_fail_pass_through', raw: raw?.slice(0, 200) };
  }

  const bad =
    parsed.blank_or_near_blank ||
    parsed.severely_distorted ||
    parsed.relevant === false ||
    (typeof parsed.score === 'number' && parsed.score < 0.35);

  if (bad) {
    return {
      ok: false,
      reason: 'vision_reject',
      meta: parsed,
    };
  }

  return { ok: true, meta: parsed };
}
