import crypto from 'node:crypto';
import { geminiGenerateContent, extractTextFromGenerateContent } from '../services/geminiRest.js';
import { ENGINE_VERSION, clampClipDurationSec } from './constants.mjs';
import { sceneFunctionsForQuantity as sceneFunctionsFromFlow } from './js/sceneFlow.js';
import { resolvePromptDNA, resolveCharacterInjections, buildMetaLine, buildNegativeLine } from './kernels.mjs';
import {
  buildSequentialPartialUserPrompt,
  buildSingleScenePartialUserPrompt,
  parseSingleScenePartialJson,
} from './llmPartialScenes.mjs';
import { collectSceneMemoryEntries, buildSceneMemoryContext, SCENE_MEMORY_MAX_PRIOR } from './sceneMemory.mjs';
import { ensureDistinctPartials } from './sceneUniqueness.mjs';
import { buildFinalPrompt } from './promptCompiler.mjs';
import { buildCommercialVeoSheetPrompt, buildSceneDisplayTitle } from './commercialPromptFormat.mjs';
import {
  sanitizeSubject,
  sanitizeDialogueVi,
  sanitizeNarratorVi,
  validateCompiledPrompt,
  validateScene,
} from './validator.mjs';
import {
  buildCentralThesisUserPrompt,
  parseCentralThesisJson,
  fallbackThesisFromTopic,
} from './centralThesis.mjs';
import { buildIntensityLine } from './sceneIntensity.mjs';
import { isStudioVoiceSilentPreset } from './studioVoice.mjs';
import { buildRenderPromptBundle, RENDER_EXTRACT_VERSION } from './renderPromptExtractor.mjs';

const DEFAULT_MODEL = 'gemini-2.5-flash';

/** Tránh cache / lặp prompt: mỗi lần gọi Gemini một id ngẫu nhiên + slot cảnh. */
function withSceneDiversityFooter(prompt, sceneIndex, quantity) {
  const id = crypto.randomBytes(12).toString('base64url');
  return `${String(prompt || '').trim()}\n\n---\nINTERNAL ONLY — do not place this line inside JSON string values: diversity_request_id=${id}; scene_slot=${sceneIndex + 1}_of_${quantity}. This request is unique: subject, narrator_vi, and voice must be lexically novel vs SCENE_MEMORY (avoid >60% overlapping content-words with any prior subject or narrator line).\n`;
}
/** Max Gemini retries per scene index when partial validation fails (does not re-run full batch). */
const MAX_SINGLE_SCENE_REGEN = 2;

/**
 * @param {number} quantity
 * @returns {string[]}
 */
export function sceneFunctionsForQuantity(quantity) {
  return sceneFunctionsFromFlow(quantity);
}

/**
 * One Gemini JSON call for CENTRAL_THESIS; deterministic fallback if parse fails.
 * @param {string} apiKey
 * @param {string} model
 * @param {import('./types.mjs').StudioGenerateInput} input
 * @returns {Promise<{ thesis: string, rawText: string, parseOk: boolean, source: 'llm' | 'fallback', geminiError?: string }>}
 */
async function resolveCentralThesis(apiKey, model, input, proxyUrl = '') {
  const prompt = buildCentralThesisUserPrompt(input);
  let rawText = '';
  let geminiError = '';
  try {
    const data = await geminiGenerateContent(
      apiKey,
      model || DEFAULT_MODEL,
      {
        generationConfig: { responseMimeType: 'application/json' },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      },
      { temperaturePurpose: 'thesis', proxyUrl },
    );
    rawText = String(extractTextFromGenerateContent(data) || '');
  } catch (e) {
    geminiError = String(e?.message || e);
    rawText = '';
  }
  const parsed = parseCentralThesisJson(rawText);
  if (parsed) {
    return { thesis: parsed, rawText, parseOk: true, source: /** @type {const} */ ('llm'), geminiError: '' };
  }
  return {
    thesis: fallbackThesisFromTopic(input.topic, input.context),
    rawText,
    parseOk: false,
    source: /** @type {const} */ ('fallback'),
    geminiError,
  };
}

/**
 * @param {string} apiKey
 * @param {string} model
 * @param {import('./types.mjs').StudioGenerateInput} input
 * @param {number} sceneIndex
 * @param {string[]} sceneFns
 * @param {boolean} usesRegistry
 * @param {{ subject?: string, voice?: string }[]} rowsSoFar Prior rows (indices less than sceneIndex); used for SCENE_MEMORY.
 * @returns {Promise<{ rawText: string, partial: { subject: string, voice: string, narrator_vi: string } | null }>}
 */
async function regenerateSingleScenePartial(
  apiKey,
  model,
  input,
  sceneIndex,
  sceneFns,
  usesRegistry,
  rowsSoFar,
  centralThesis,
  quantity,
  proxyUrl = '',
) {
  const mem = buildSceneMemoryContext(collectSceneMemoryEntries(rowsSoFar, sceneFns, sceneIndex));
  const intensityLine = buildIntensityLine(sceneIndex, quantity);
  const prompt = withSceneDiversityFooter(
    buildSingleScenePartialUserPrompt(
      input,
      sceneIndex,
      sceneFns,
      usesRegistry,
      mem,
      centralThesis,
      intensityLine,
    ),
    sceneIndex,
    quantity,
  );
  try {
    const data = await geminiGenerateContent(
      apiKey,
      model || DEFAULT_MODEL,
      {
        generationConfig: { responseMimeType: 'application/json' },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      },
      { temperaturePurpose: 'sceneIdea', proxyUrl },
    );
    const text = extractTextFromGenerateContent(data);
    const partial = parseSingleScenePartialJson(text);
    if (!partial?.subject || !String(partial.narrator_vi ?? '').trim()) return { rawText: text, partial: null };
    return { rawText: text, partial };
  } catch (e) {
    return { rawText: '', partial: null, geminiError: String(e?.message || e) };
  }
}

/**
 * Vietnamese narrator fallback when Gemini omits `narrator_vi`.
 * @param {string} topic
 * @param {string} sceneFunction
 * @param {number} idx
 * @param {string} centralThesis
 * @returns {string}
 */
function buildFallbackNarratorVi(topic, sceneFunction, idx, centralThesis) {
  const t = String(topic || 'chủ đề').trim().replace(/\s+/g, ' ');
  const topicShort = t.length > 48 ? `${t.slice(0, 45)}…` : t;
  const th = String(centralThesis || '')
    .trim()
    .replace(/\s+/g, ' ');
  const thesisShort = th.length > 56 ? `${th.slice(0, 53)}…` : th;
  const fn = String(sceneFunction || 'HOOK').trim();
  const tails = [
    'Cùng xem một chi tiết mới trong clip này.',
    'Đổi góc hành động, vẫn một thông điệp.',
    'Một nhịp nhỏ khác — không nhắc lại câu cảnh trước.',
    'Nối sang bước kế tiếp, diễn đạt mới.',
    'Thêm một lớp ý rõ ràng, không lặp chữ máy móc.',
    'Không copy câu cũ: một cách nói mới cho cùng chủ đề.',
  ];
  const tail = tails[idx % tails.length];
  const line = thesisShort
    ? `${fn} · ${topicShort}: ${thesisShort} ${tail}`
    : `${fn} · ${topicShort}. ${tail}`;
  return sanitizeNarratorVi(line);
}

/**
 * @param {{ subject?: string, voice?: string, narrator_vi?: string }} row
 * @param {string} sceneFunction
 * @param {string} topic
 * @param {number} idx
 * @param {string} centralThesis
 */
function coerceScenePartialAfterRetries(row, sceneFunction, topic, idx, centralThesis) {
  const fn = String(sceneFunction || '').trim();
  const t = String(topic || '').trim() || 'Chủ đề';
  let subject = String(row?.subject ?? '').trim();
  let voice = String(row?.voice ?? row?.dialogue_vi ?? '').trim();
  let narrator_vi = String(row?.narrator_vi ?? '').trim();
  if (!subject) subject = `${t} — nhịp ${idx + 1} (${fn})`;
  let check = validateScene({ subject, voice, narrator_vi, sceneFunction: fn });
  if (!check.ok && check.errors.includes('voice_too_many_words')) {
    voice = sanitizeDialogueVi(voice);
    check = validateScene({ subject, voice, narrator_vi, sceneFunction: fn });
  }
  if (!check.ok && check.errors.includes('missing_subject')) {
    subject = `${t} — nhịp ${idx + 1} (${fn})`;
    check = validateScene({ subject, voice, narrator_vi, sceneFunction: fn });
  }
  if (!check.ok && check.errors.includes('missing_narrator_vi')) {
    narrator_vi = buildFallbackNarratorVi(t, fn, idx, centralThesis);
    check = validateScene({ subject, voice, narrator_vi, sceneFunction: fn });
  }
  if (!check.ok && check.errors.includes('narrator_too_many_words')) {
    narrator_vi = sanitizeNarratorVi(narrator_vi);
    check = validateScene({ subject, voice, narrator_vi, sceneFunction: fn });
  }
  if (!narrator_vi) narrator_vi = buildFallbackNarratorVi(t, fn, idx, centralThesis);
  narrator_vi = sanitizeNarratorVi(narrator_vi);
  return { subject, voice, narrator_vi };
}

/**
 * @param {string} apiKey
 * @param {string} model
 * @param {import('./types.mjs').StudioGenerateInput} input
 * @param {number} sceneIndex
 * @param {number} quantity
 * @param {string[]} sceneFns
 * @param {boolean} usesRegistry
 * @param {{ subject?: string, voice?: string }[]} rowsSoFar
 * @returns {Promise<{ rawText: string, partial: { subject: string, voice: string, narrator_vi?: string } | null, geminiError?: string }>}
 */
async function generateSequentialScenePartial(
  apiKey,
  model,
  input,
  sceneIndex,
  quantity,
  sceneFns,
  usesRegistry,
  rowsSoFar,
  centralThesis,
  proxyUrl = '',
) {
  const mem = buildSceneMemoryContext(collectSceneMemoryEntries(rowsSoFar, sceneFns, sceneIndex));
  const intensityLine = buildIntensityLine(sceneIndex, quantity);
  const prompt = withSceneDiversityFooter(
    buildSequentialPartialUserPrompt(
      input,
      sceneIndex,
      quantity,
      sceneFns,
      usesRegistry,
      mem,
      centralThesis,
      intensityLine,
    ),
    sceneIndex,
    quantity,
  );
  try {
    const data = await geminiGenerateContent(
      apiKey,
      model || DEFAULT_MODEL,
      {
        generationConfig: { responseMimeType: 'application/json' },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      },
      { temperaturePurpose: 'sceneIdea', proxyUrl },
    );
    const text = extractTextFromGenerateContent(data);
    const partial = parseSingleScenePartialJson(text);
    return { rawText: text, partial };
  } catch (e) {
    return { rawText: '', partial: null, geminiError: String(e?.message || e) };
  }
}

/**
 * @param {{
 *   thesisResult: { source: string, parseOk: boolean, geminiError?: string },
 *   partialSource: string,
 *   sceneGeminiErrors: { sceneIndex: number, phase: string, message: string }[],
 * }} p
 * @returns {string[]}
 */
function buildPromptStudioWarnings(p) {
  const { thesisResult, partialSource, sceneGeminiErrors } = p;
  const w = [];
  if (thesisResult.geminiError) {
    w.push(
      'Gemini báo lỗi khi sinh thesis — đang dùng luận điểm dự phòng từ chủ đề. Kiểm tra GEMINI_API_KEY, quota/billing trên Google AI Studio hoặc Cloud Console.',
    );
  } else if (thesisResult.source === 'fallback' && !thesisResult.parseOk) {
    w.push(
      'Thesis không parse được từ JSON Gemini — đã thay bản dự phòng. Bật «Debug sinh prompt» để xem raw response.',
    );
  }
  if (partialSource === 'fallback') {
    w.push(
      'Mọi cảnh đều dùng bản dự phòng (Gemini không trả JSON hợp lệ hoặc lỗi mạng). Prompt dễ trùng/không sát chủ đề — kiểm tra quota, key, hoặc model.',
    );
  } else if (partialSource === 'mixed') {
    w.push('Một phần cảnh dùng dự phòng do Gemini trả về sai định dạng JSON hoặc lỗi tạm thời. Thử tạo lại hoặc bật «Debug sinh prompt» để xem raw response.');
  }
  const risky = sceneGeminiErrors.find((x) =>
    /quota|resource_exhausted|429|billing|permission|api key|invalid|unauthenticated|consumer_suspended|detected user ctr|exceeded your current quota/i.test(
      String(x.message || ''),
    ),
  );
  if (risky) w.push(`Chi tiết từ API: ${String(risky.message).slice(0, 320)}`);
  return w;
}

function fallbackPartials(quantity, topic, sceneFunctions, centralThesis = '') {
  const t = String(topic || 'Chủ đề').trim() || 'Chủ đề';
  return Array.from({ length: quantity }, (_, i) => ({
    subject: `${t} — nhịp ${i + 1} (${sceneFunctions[i]})`,
    voice: 'SILENT',
    narrator_vi: buildFallbackNarratorVi(t, sceneFunctions[i], i, centralThesis),
  }));
}

/**
 * @param {string} apiKey
 * @param {string} model
 * @param {import('./types.mjs').StudioGenerateInput} input
 * @returns {Promise<{ scenes: { title: string, prompt: string }[], meta: object, debug?: object }>}
 */
export async function runScenePipeline(apiKey, model, input, opts = {}) {
  const debug = Boolean(input?.debug);
  const quantity = Math.min(20, Math.max(1, Number(input.quantity) || 1));
  const sceneFns = sceneFunctionsForQuantity(quantity);
  const { characterCentral, focusPool: characterPool, usesRegistry } = resolveCharacterInjections(input, quantity);

  const thesisResult = await resolveCentralThesis(apiKey, model || DEFAULT_MODEL, input, opts.proxyUrl || '');
  const centralThesis = String(thesisResult.thesis || '').trim() || fallbackThesisFromTopic(input.topic, input.context);

  const dna = resolvePromptDNA(input);
  const negativeLine = buildNegativeLine(input);
  const metaLine = buildMetaLine(input);
  const ratio = String(input.ratio || '16:9');
  const duration = clampClipDurationSec(input.duration);
  const styleTone = String(input.style || 'cinematic').trim();
  const humor = Math.min(100, Math.max(0, Number(input.humorLevel) || 0));
  const context = String(input.context || '').trim();

  const topicForFallback = String(input.topic || '').trim();
  const rows = [];
  const rawPartialEvents = [];
  /** @type {{ sceneIndex: number, phase: string, message: string }[]} */
  const sceneGeminiErrors = [];
  let llmOkCount = 0;
  for (let i = 0; i < quantity; i++) {
    let row = null;
    let seqRaw = '';
    const seq = await generateSequentialScenePartial(
      apiKey,
      model || DEFAULT_MODEL,
      input,
      i,
      quantity,
      sceneFns,
      usesRegistry,
      rows,
      centralThesis,
      opts.proxyUrl || '',
    );
    seqRaw = String(seq.rawText || '');
    row = seq.partial;
    if (seq.geminiError) {
      sceneGeminiErrors.push({ sceneIndex: i, phase: 'sequential', message: seq.geminiError });
    } else if (!row?.subject && seqRaw.length > 40) {
      sceneGeminiErrors.push({
        sceneIndex: i,
        phase: 'sequential',
        message:
          'Gemini trả về nội dung nhưng không parse được JSON scene (schema/markdown). Kiểm tra model hoặc bật Debug.',
      });
    }
    if (debug) {
      rawPartialEvents.push({
        sceneIndex: i,
        phase: 'sequential',
        raw: seqRaw,
        parseOk: Boolean(row?.subject && String(row?.narrator_vi ?? '').trim()),
      });
    }
    if (row?.subject && String(row?.narrator_vi ?? '').trim()) {
      llmOkCount += 1;
      rows.push(row);
    } else {
      rows.push(fallbackPartials(1, topicForFallback, [sceneFns[i]], centralThesis)[0]);
    }
  }

  const partialSource =
    llmOkCount === quantity ? 'llm-sequential' : llmOkCount === 0 ? 'fallback' : 'mixed';

  const scenePartialRetries = Array.from({ length: quantity }, () => 0);
  const topicStr = String(input.topic || '').trim();
  for (let idx = 0; idx < quantity; idx++) {
    const fn = sceneFns[idx];
    let row = rows[idx] || { subject: '', voice: '' };
    let check = validateScene({ ...row, sceneFunction: fn });
    let regenCount = 0;
    while (!check.ok && regenCount < MAX_SINGLE_SCENE_REGEN) {
      const regen = await regenerateSingleScenePartial(
        apiKey,
        model || DEFAULT_MODEL,
        input,
        idx,
        sceneFns,
        usesRegistry,
        rows,
        centralThesis,
        quantity,
      );
      regenCount += 1;
      scenePartialRetries[idx] += 1;
      if (debug) {
        rawPartialEvents.push({
          sceneIndex: idx,
          phase: 'regen',
          attempt: regenCount,
          raw: String(regen?.rawText || ''),
          parseOk: Boolean(regen?.partial?.subject && String(regen?.partial?.narrator_vi ?? '').trim()),
        });
      }
      if (regen.geminiError) {
        sceneGeminiErrors.push({ sceneIndex: idx, phase: 'regen', message: regen.geminiError });
      } else if (!regen?.partial?.subject && String(regen?.rawText || '').length > 40) {
        sceneGeminiErrors.push({
          sceneIndex: idx,
          phase: 'regen',
          message: 'Gemini trả về nhưng JSON scene không parse được.',
        });
      }
      if (regen?.partial?.subject && String(regen.partial.narrator_vi ?? '').trim()) {
        row = regen.partial;
        check = validateScene({ ...row, sceneFunction: fn });
      } else {
        break;
      }
    }
    if (!check.ok) {
      row = coerceScenePartialAfterRetries(row, fn, topicStr, idx, centralThesis);
    }
    rows[idx] = row;
  }

  ensureDistinctPartials(rows, sceneFns);

  const voiceNone = isStudioVoiceSilentPreset(input.voice);

  const parsedPartialsForDebug = rows.map((row, idx) => ({
    sceneIndex: idx,
    sceneFunction: sceneFns[idx],
    subject: String(row?.subject ?? '').trim(),
    voice: String(row?.voice ?? row?.dialogue_vi ?? '').trim(),
    narrator_vi: String(row?.narrator_vi ?? '').trim(),
  }));

  const scenes = rows.map((row, idx) => {
    const sceneFunction = sceneFns[idx];
    const focusBeat =
      characterPool.length > 0 ? String(characterPool[idx % characterPool.length] || '').trim() : '';
    let voice = sanitizeDialogueVi(row.voice ?? row.dialogue_vi);
    if (voiceNone) voice = 'SILENT';
    const subject = sanitizeSubject(row.subject);
    const narrator_vi = sanitizeNarratorVi(row.narrator_vi ?? '');

    const scenePayload = {
      subject,
      voice,
      sceneFunction,
      centralThesis,
      sceneIndex0: idx,
      totalScenes: quantity,
      focusBeat: focusBeat || undefined,
      negativeLine,
      metaLine,
      ratio,
      duration,
      styleTone,
      humor,
      context,
    };

    let compiledPrompt = buildFinalPrompt(scenePayload, dna, characterCentral);

    let v = validateCompiledPrompt(compiledPrompt);
    if (!v.ok) {
      voice = sanitizeDialogueVi('SILENT');
      compiledPrompt = buildFinalPrompt({ ...scenePayload, voice }, dna, characterCentral);
      v = validateCompiledPrompt(compiledPrompt);
    }

    const prompt = buildCommercialVeoSheetPrompt(compiledPrompt, {
      voicePreset: String(input.voice || '').trim(),
      styleTone,
      context,
      environmentBase: dna.environmentBase,
      duration,
      language: String(input.language || '').trim(),
      narratorVi: narrator_vi,
      ratio,
      topic: topicStr,
      centralThesis,
    });

    const sceneOut = {
      title: buildSceneDisplayTitle({ focusBeat, sceneFunction, subject }),
      prompt,
      sceneFunction,
      render: buildRenderPromptBundle(compiledPrompt),
    };
    if (debug) sceneOut.enginePrompt = compiledPrompt;
    return sceneOut;
  });

  const out = {
    scenes: scenes.map((s) => {
      const row = { title: s.title, prompt: s.prompt, render: s.render };
      if (debug && s.enginePrompt) row.enginePrompt = s.enginePrompt;
      return row;
    }),
    meta: {
      engine: ENGINE_VERSION,
      renderExtractor: RENDER_EXTRACT_VERSION,
      sceneFunctions: sceneFns,
      centralThesis,
      thesisSource: thesisResult.source,
      partialSource,
      llmSceneOkCount: llmOkCount,
      llmSceneTotal: quantity,
      sceneMemoryMaxPrior: SCENE_MEMORY_MAX_PRIOR,
      scenePartialRetries,
      promptDNA: { keys: Object.keys(dna) },
      warnings: buildPromptStudioWarnings({ thesisResult, partialSource, sceneGeminiErrors }),
      ...(debug ? { debug: true, sceneGeminiErrors } : {}),
    },
  };

  if (debug) {
    out.debug = {
      rawThesis: {
        raw: String(thesisResult.rawText || ''),
        parseOk: thesisResult.parseOk,
        source: thesisResult.source,
        geminiError: thesisResult.geminiError || '',
      },
      rawPartialOutputs: rawPartialEvents,
      parsedPartials: parsedPartialsForDebug,
      compiledPrompts: scenes.map((s, i) => ({
        sceneIndex: i,
        sceneFunction: s.sceneFunction,
        title: s.title,
        promptCommercial: s.prompt,
        promptEngine: s.enginePrompt,
      })),
    };
  }

  return out;
}
