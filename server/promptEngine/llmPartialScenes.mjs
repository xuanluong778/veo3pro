import { formatSceneFlowGuideForSlots, SCENE_FLOW_NARRATIVE_ROLES } from './js/sceneFlow.js';
import { buildLlmDialogueLanguageLine } from './studioLanguage.mjs';
import { isStudioVoiceSilentPreset } from './studioVoice.mjs';
import { buildVoiceDurationBudgetBlock, buildNarratorVietnameseBudgetBlock } from './dialogueDurationBudget.mjs';

function cleanJsonFence(text) {
  const t = String(text || '').trim();
  if (!t.startsWith('```')) return t;
  return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function extractLikelyJson(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const s = cleanJsonFence(t);
  const firstObj = s.indexOf('{');
  const lastObj = s.lastIndexOf('}');
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    return s.slice(firstObj, lastObj + 1).trim();
  }
  return s;
}

/**
 * @param {import('./types.mjs').StudioGenerateInput} input
 * @param {number} quantity
 * @param {string[]} sceneFunctions
 * @returns {string}
 */
export function buildPartialGenerationUserPrompt(input, quantity, sceneFunctions, usesCharacterRegistry = false) {
  const topic = String(input.topic || 'General topic').trim();
  const voice = String(input.voice || '').trim();
  const spoken = !isStudioVoiceSilentPreset(voice);
  const langLine = buildLlmDialogueLanguageLine(input, { spoken });
  const budget = buildVoiceDurationBudgetBlock(input);
  const narratorBudget = buildNarratorVietnameseBudgetBlock(input);
  const voiceLine =
    spoken
      ? `Delivery hint for dialogue (do not echo this string inside JSON): ${voice}${langLine ? `\n${langLine}` : ''}${budget ? `\n${budget}` : ''}`
      : 'No spoken dialogue: use voice exactly SILENT for every scene.';
  const ctx = String(input.context || '').trim();
  const contextBlock = ctx
    ? `User priority setting / environment (must match visually in every "subject" where relevant):\n${ctx}\n`
    : '';

  const registryRules = usesCharacterRegistry
    ? [
        '- Character appearance, wardrobe, age, skin, hair, and physique are FIXED by the server Character Registry; do NOT describe or change them in "subject".',
        '- If you must refer to a character, use role-only wording (e.g. "the host", "the mascot", "the hand with the product") — never contradict locked visuals.',
      ]
    : [];

  return [
    'Return STRICT JSON ONLY: {"scenes":[{"subject":"...","voice":"...","narrator_vi":"..."}]}',
    `The "scenes" array MUST have exactly ${quantity} items, in order.`,
    'Rules:',
    '- "subject": exactly ONE core idea, ONE short sentence, max 220 characters, same story world (visual beat only).',
    '- "voice": spoken line in the user-selected dialogue language (see language line + duration cap below), natural, max 48 words OR exactly SILENT when no-voice mode.',
    ...(budget ? [`- ${budget}`] : []),
    `- ${narratorBudget}`,
    '- Do NOT include camera specs, lighting, color grade, negative prompts, or style words.',
    '- System compiles the final prompt from a fixed template (GLOBAL_STYLE, CHARACTER, SCENE, …); never echo DNA blocks inside subject or voice.',
    '- Do NOT restate the topic verbatim every scene; advance the narrative.',
    '- TOPIC_LOCK: every "subject" + "narrator_vi" must clearly serve the Topic (same domain, same user intent); ban generic beats that could fit any unrelated product.',
    '- CHARACTER_TOPIC_UNITY: one stable hero entity (product/mascot/persona implied by Topic + user character hints); never swap to an unrelated protagonist or new species mid-run unless the Topic explicitly demands it.',
    '- SCENE_UNIQUENESS: each array item is a DIFFERENT ~8s video beat — subject, voice, and narrator_vi must all differ from every other scene (no copy-paste, no same sentence with one word swapped).',
    '- LEXICAL_DISTANCE: across the scenes array, pairwise overlapping content-words (ignore glue words) should stay under ~60% between any two subjects and between any two narrator_vi lines.',
    '- ANTI_REPETITION: no duplicated clauses or the same 3+ word chunk twice in one "subject" or "narrator_vi"; vary wording across scenes.',
    ...registryRules,
    '',
    contextBlock,
    `Topic: ${topic}`,
    voiceLine,
    formatSceneFlowGuideForSlots(sceneFunctions),
    `Sequence tokens (do not paste into subject): ${sceneFunctions.join(' → ')}`,
    '',
    'JSON only. No markdown.',
  ].join('\n');
}

/**
 * @param {string} text
 * @returns {{ scenes: { subject: string, voice: string }[] } | null}
 */
export function parsePartialScenesJson(text) {
  const cleaned = extractLikelyJson(text);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.scenes)) return null;
  const scenes = parsed.scenes
    .map((s) => {
      const voiceRaw = s?.voice ?? s?.dialogue_vi;
      return {
        subject: String(s?.subject ?? '').trim(),
        voice: String(voiceRaw ?? '').trim(),
        narrator_vi: String(s?.narrator_vi ?? s?.narratorVi ?? '').trim(),
      };
    })
    .filter((s) => s.subject);
  return scenes.length ? { scenes } : null;
}

/**
 * Sequential partial: one scene with optional SCENE_MEMORY block from prior summaries.
 * @param {import('./types.mjs').StudioGenerateInput} input
 * @param {number} sceneIndex 0-based
 * @param {number} totalQuantity
 * @param {string[]} sceneFunctions
 * @param {boolean} [usesCharacterRegistry]
 * @param {string} [sceneMemorySection] from {@link import('./sceneMemory.mjs').buildSceneMemoryContext}
 * @returns {string}
 */
export function buildSequentialPartialUserPrompt(
  input,
  sceneIndex,
  totalQuantity,
  sceneFunctions,
  usesCharacterRegistry = false,
  sceneMemorySection = '',
  centralThesis = '',
  intensityLine = '',
) {
  const topic = String(input.topic || 'General topic').trim();
  const voiceHint = String(input.voice || '').trim();
  const spoken = !isStudioVoiceSilentPreset(voiceHint);
  const langLine = buildLlmDialogueLanguageLine(input, { spoken });
  const budget = buildVoiceDurationBudgetBlock(input);
  const narratorBudget = buildNarratorVietnameseBudgetBlock(input);
  const voiceLine =
    spoken
      ? `Delivery hint for dialogue (do not echo inside JSON): ${voiceHint}${langLine ? `\n${langLine}` : ''}${budget ? `\n${budget}` : ''}`
      : 'No spoken dialogue: voice must be exactly SILENT.';

  const fn = String(sceneFunctions[sceneIndex] || '').trim();
  const role = SCENE_FLOW_NARRATIVE_ROLES[fn] || 'Advance the story spine for this beat.';

  const registryRules = usesCharacterRegistry
    ? ['- Registry lock: do NOT describe character appearance in subject; role-only wording if needed.']
    : [];

  const mem = String(sceneMemorySection || '').trim();
  const ctx = String(input.context || '').trim();
  const contextLine = ctx
    ? `User priority setting / environment (match in "subject" when relevant): ${ctx}`
    : '';

  const thesis = String(centralThesis || '').trim();
  const thesisBlock = thesis
    ? `CENTRAL_THESIS (entire film — subject + narrator_vi must serve it; do not contradict):\n${thesis}\n`
    : '';
  const inten = String(intensityLine || '').trim();
  const intenBlock = inten ? `PROGRESSION:\n${inten}\n` : '';

  return [
    'Return STRICT JSON ONLY for this single scene.',
    'Allowed shapes: {"subject":"...","voice":"...","narrator_vi":"..."} OR {"scenes":[{"subject":"...","voice":"...","narrator_vi":"..."}]} with exactly one scene.',
    'Rules:',
    '- "subject": one short visual beat, max 220 characters; must follow SCENE_MEMORY continuity when present; align with CENTRAL_THESIS when present.',
    '- "voice": max 48 words in the user-selected dialogue language, OR exactly SILENT when no-voice mode.',
    `- ${narratorBudget}`,
    '- No camera, lighting, negative prompts, or style tokens in JSON.',
    '- Do NOT restate the topic verbatim; build on prior beats when SCENE_MEMORY is provided.',
    '- TOPIC_LOCK: "subject" and "narrator_vi" must stay on the Topic domain (same story problem/solution space); no random genre hop.',
    '- CHARACTER_TOPIC_UNITY: keep the same implied hero PRODUCT_OR_MASCOT across scenes; align wording with Topic + CENTRAL_THESIS—no protagonist swap.',
    '- SCENE_UNIQUENESS: this scene is its own clip; subject, voice (if not SILENT), and narrator_vi must NOT reuse verbatim (or obvious paraphrase of) any subject/voice/narrator line listed in SCENE_MEMORY—new action, new lines, same hero only.',
    '- LEXICAL_DISTANCE: vs SCENE_MEMORY, keep overlapping content-words (ignoring glue words) under ~60% with any prior subject or prior narrator line—change verbs/nouns/camera-in-subject beats until true.',
    '- ANTI_REPETITION: do not repeat the same 3+ word phrase twice inside subject or narrator_vi; do not echo SCENE_MEMORY lines verbatim—advance.',
    ...registryRules,
    '',
    thesisBlock,
    intenBlock,
    contextLine,
    mem,
    `Topic: ${topic}`,
    voiceLine,
    `Generate ONLY scene ${sceneIndex + 1} of ${totalQuantity}. Its narrative slot MUST be: ${fn}.`,
    `Slot guidance: ${role}`,
    `Full sequence (context): ${sceneFunctions.join(' → ')}`,
    '',
    'JSON only. No markdown.',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Gemini prompt for a **single** scene partial (used when batch row fails {@link import('./validator.mjs').validateScene}).
 * @param {import('./types.mjs').StudioGenerateInput} input
 * @param {number} sceneIndex 0-based
 * @param {string[]} sceneFunctions
 * @param {boolean} [usesCharacterRegistry]
 * @param {string} [sceneMemorySection] prior-scene memory block (same as sequential flow)
 * @returns {string}
 */
export function buildSingleScenePartialUserPrompt(
  input,
  sceneIndex,
  sceneFunctions,
  usesCharacterRegistry = false,
  sceneMemorySection = '',
  centralThesis = '',
  intensityLine = '',
) {
  const topic = String(input.topic || 'General topic').trim();
  const voiceHint = String(input.voice || '').trim();
  const spoken = !isStudioVoiceSilentPreset(voiceHint);
  const langLine = buildLlmDialogueLanguageLine(input, { spoken });
  const budget = buildVoiceDurationBudgetBlock(input);
  const narratorBudget = buildNarratorVietnameseBudgetBlock(input);
  const voiceLine =
    spoken
      ? `Delivery hint for dialogue (do not echo inside JSON): ${voiceHint}${langLine ? `\n${langLine}` : ''}${budget ? `\n${budget}` : ''}`
      : 'No spoken dialogue: voice must be exactly SILENT.';

  const fn = String(sceneFunctions[sceneIndex] || '').trim();
  const role = SCENE_FLOW_NARRATIVE_ROLES[fn] || 'Advance the story spine for this beat.';

  const registryRules = usesCharacterRegistry
    ? ['- Registry lock: do NOT describe character appearance in subject; role-only wording if needed.']
    : [];

  const ctx = String(input.context || '').trim();
  const contextLine = ctx ? `User priority setting / environment (match in "subject" when relevant): ${ctx}` : '';

  const mem = String(sceneMemorySection || '').trim();
  const regenBudgetLine = buildVoiceDurationBudgetBlock(input);
  const thesis = String(centralThesis || '').trim();
  const thesisBlock = thesis
    ? `CENTRAL_THESIS (entire film — subject must serve it; do not contradict):\n${thesis}\n`
    : '';
  const inten = String(intensityLine || '').trim();
  const intenBlock = inten ? `PROGRESSION:\n${inten}\n` : '';

  return [
    'Return STRICT JSON ONLY for this single scene.',
    'Allowed shapes: {"subject":"...","voice":"...","narrator_vi":"..."} OR {"scenes":[{"subject":"...","voice":"...","narrator_vi":"..."}]} with exactly one scene.',
    'Rules:',
    '- "subject": exactly ONE visual idea, max 120 characters; align with CENTRAL_THESIS and PROGRESSION.',
    '- "voice": max 48 words in the user-selected dialogue language, OR exactly SILENT when no-voice mode.',
    ...(regenBudgetLine ? [`- ${regenBudgetLine}`] : []),
    `- ${narratorBudget}`,
    '- No camera, lighting, negative prompts, or style tokens in JSON.',
    '- TOPIC_LOCK: subject + narrator_vi must clearly match Topic + CENTRAL_THESIS (same user intent); no off-topic filler.',
    '- CHARACTER_TOPIC_UNITY: same hero entity as the rest of the run; do not introduce a new lead that contradicts Topic or CHARACTER roster.',
    '- SCENE_UNIQUENESS: rewrite must differ from every prior scene in this run (see SCENE_MEMORY): new subject beat, new narrator_vi, new voice line if spoken—no duplicate lines.',
    '- LEXICAL_DISTANCE: vs SCENE_MEMORY, keep overlapping content-words with any prior subject or narrator under ~60%; rewrite until true.',
    '- ANTI_REPETITION: no duplicated 3+ word chunk twice in subject or narrator_vi.',
    ...registryRules,
    '',
    thesisBlock,
    intenBlock,
    contextLine,
    mem,
    `Topic: ${topic}`,
    voiceLine,
    `Rewrite ONLY scene ${sceneIndex + 1} of ${sceneFunctions.length}. Its narrative slot MUST be: ${fn}.`,
    `Slot guidance: ${role}`,
    `Full sequence (context only): ${sceneFunctions.join(' → ')}`,
    '',
    'JSON only. No markdown.',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * @param {string} text
 * @returns {{ subject: string, voice: string } | null}
 */
export function parseSingleScenePartialJson(text) {
  const cleaned = extractLikelyJson(text);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.subject === 'string') {
    return {
      subject: String(parsed.subject).trim(),
      voice: String(parsed.voice ?? parsed.dialogue_vi ?? '').trim(),
      narrator_vi: String(parsed.narrator_vi ?? parsed.narratorVi ?? '').trim(),
    };
  }
  const arr = parsed.scenes;
  if (!Array.isArray(arr) || !arr[0]) return null;
  const s = arr[0];
  return {
    subject: String(s?.subject ?? '').trim(),
    voice: String(s?.voice ?? s?.dialogue_vi ?? '').trim(),
    narrator_vi: String(s?.narrator_vi ?? s?.narratorVi ?? '').trim(),
  };
}
