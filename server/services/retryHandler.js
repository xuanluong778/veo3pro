import { getImageModelCandidates, generateReferenceImageWithModel } from './imagenSimulated.js';
import { validateGeneratedImageQuality } from './imageQuality.js';

const MAX_PROMPT_RETRIES = 2;

function augmentPromptForAttempt(basePrompt, sceneContext, attemptIndex) {
  const suffix = [
    '',
    ' Pro-grade detail, sharp facial features, realistic textures, no blur.',
    ' Strong depth cues, rich micro-contrast, cinematic color separation, crisp edges.',
  ];
  const ctx = sceneContext ? ` Context: ${sceneContext}.` : '';
  return `Photoreal cinematic film still.${ctx} ${basePrompt}${suffix[attemptIndex] || suffix[suffix.length - 1]}\nNo UI, no watermark, no subtitles.`;
}

/**
 * Per model: initial + up to MAX_PROMPT_RETRIES retries with varied wording.
 * Then advance to next model in FLOW_IMAGE_MODEL list.
 * QC rejects trigger retry chain (counts as failed attempt with log).
 */
export async function generateImageWithRetryAndFallback(apiKey, {
  prompt,
  sceneContext,
  log,
  visionValidator,
}) {
  const models = getImageModelCandidates();
  const attempts = [];

  for (const model of models) {
    for (let attempt = 0; attempt <= MAX_PROMPT_RETRIES; attempt++) {
      const text = augmentPromptForAttempt(prompt, sceneContext, attempt);
      try {
        const img = await generateReferenceImageWithModel(apiKey, model, text);
        const qc = await validateGeneratedImageQuality(img);
        attempts.push({
          model,
          attempt,
          phase: 'generated',
          qc: qc.ok ? 'pass' : qc.reason,
          std: qc.std,
        });
        log?.({
          level: 'info',
          message: `Image attempt model=${model} attempt=${attempt}`,
          meta: { qc },
        });

        if (!qc.ok) {
          attempts.push({
            model,
            attempt,
            phase: 'qc_reject',
            reason: qc.reason,
          });
          continue;
        }

        if (typeof visionValidator === 'function') {
          const vis = await visionValidator(img);
          attempts.push({
            model,
            attempt,
            phase: 'vision_qc',
            ok: vis.ok,
            reason: vis.reason,
          });
          if (!vis.ok) {
            log?.({
              level: 'warn',
              message: `Vision QC reject model=${model} attempt=${attempt}`,
              meta: { reason: vis.reason },
            });
            continue;
          }
        }

        return {
          mimeType: img.mimeType,
          data: img.data,
          modelUsed: model,
          attemptsLog: attempts,
        };
      } catch (e) {
        attempts.push({
          model,
          attempt,
          phase: 'error',
          error: e.message,
        });
        log?.({
          level: 'warn',
          message: `Image gen failed model=${model} attempt=${attempt}`,
          meta: { error: e.message },
        });
      }
    }
  }

  const err = new Error('All image models and prompt retries exhausted');
  err.attemptsLog = attempts;
  throw err;
}
