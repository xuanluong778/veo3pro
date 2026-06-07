import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalPrompt, buildSceneTitle } from './promptCompiler.mjs';
import {
  validateCompiledPrompt,
  validateScene,
  sanitizeDialogueVi,
  sanitizeSubject,
  dedupeRepeatedWordRuns,
} from './validator.mjs';
import {
  collectSceneMemoryEntries,
  buildSceneMemoryContext,
  truncateSceneSummary,
  SCENE_MEMORY_MAX_PRIOR,
} from './sceneMemory.mjs';
import { ensureDistinctPartials, multisetJaccardStrings } from './sceneUniqueness.mjs';
import { sceneFunctionsForQuantity } from './orchestrator.mjs';
import { mergePromptDNA, buildNegativeFromDNA } from './js/promptDNA.js';
import { buildCharacterCentral, buildMetaLine, resolveCharacterInjections } from './kernels.mjs';
import { NEGATIVE_SUFFIX } from './constants.mjs';
import {
  parseCompiledPromptBlocks,
  extractDialogueFromAudioBlock,
  buildRenderPromptBundle,
} from './renderPromptExtractor.mjs';
import { buildCommercialVeoSheetPrompt, buildSceneDisplayTitle } from './commercialPromptFormat.mjs';
import { parseCharacterPool } from './pool.mjs';

test('buildFinalPrompt + validator accept compiler template', () => {
  const dna = mergePromptDNA();
  const p = buildFinalPrompt(
    {
      subject: 'Một cái nhìn duy nhất vào mắt camera.',
      voice: 'SILENT',
      sceneFunction: 'HOOK',
      centralThesis: 'Một thông điệp cốt lõi cho cả video.',
      sceneIndex0: 0,
      totalScenes: 5,
      negativeLine: buildNegativeFromDNA(dna, 'blur', NEGATIVE_SUFFIX),
      metaLine: buildMetaLine({ ratio: '16:9', duration: 8, humorLevel: 0 }),
      ratio: '16:9',
      duration: 8,
      styleTone: 'cinematic',
      humor: 0,
    },
    dna,
    buildCharacterCentral({ character: 'Hero', characterMode: 'keep' }),
  );
  assert.equal(validateCompiledPrompt(p).ok, true);
  assert.match(p, /^GLOBAL_STYLE:/m);
  assert.match(p, /^CENTRAL_THESIS:/m);
  assert.match(p, /^CONSISTENCY_LOCK:/m);
  assert.match(p, /^INTENSITY:/m);
  assert.match(p, /^CHARACTER:/m);
  assert.match(p, /SCENE: \[HOOK\]/);
  assert.match(p, /^CAMERA:/m);
  assert.match(p, /^LIGHTING:/m);
  assert.match(p, /^MOTION:/m);
  assert.match(p, /^AUDIO:/m);
  assert.match(p, /^NEGATIVE_PROMPT:/m);
  assert.match(buildSceneTitle('HOOK', 'abc'), /^HOOK —/);
});

test('scene memory keeps last N prior summaries only', () => {
  assert.equal(SCENE_MEMORY_MAX_PRIOR, 3);
  const rows = [
    { subject: 'A' },
    { subject: 'B' },
    { subject: 'C' },
    { subject: 'D' },
  ];
  const fns = ['HOOK', 'SETUP', 'PROBLEM', 'INSIGHT'];
  const at4 = collectSceneMemoryEntries(rows, fns, 4);
  assert.equal(at4.length, 3);
  assert.equal(at4[0].summary, 'B');
  assert.equal(at4[2].summary, 'D');
  const mem = buildSceneMemoryContext(at4);
  assert.match(mem, /SCENE_MEMORY/);
  assert.match(mem, /READ-ONLY/);
  assert.ok(truncateSceneSummary('x'.repeat(250)).length < 250);
});

test('multiset jaccard flags reordered near-duplicate subjects', () => {
  const a = 'Nhân vật cầm chai nước trên bàn bếp sáng.';
  const b = 'Trên bàn bếp sáng nhân vật cầm chai nước.';
  assert.ok(multisetJaccardStrings(a, b) > 0.55);
});

test('ensureDistinctPartials nudges duplicate subjects narrators and dialogue', () => {
  const sameNarr =
    'Hai clip khác phải có hai lời narrator khác nhau hoàn toàn cho chủ đề sức khỏe và thói quen tốt.';
  const rows = [
    { subject: 'Hero đứng cạnh quầy bar trong ánh đèn ấm.', narrator_vi: sameNarr, voice: 'SILENT' },
    { subject: 'Hero đứng cạnh quầy bar trong ánh đèn ấm.', narrator_vi: sameNarr, voice: 'Xin chào bạn hôm nay.' },
    { subject: 'Hero đứng cạnh quầy bar trong ánh đèn ấm.', narrator_vi: sameNarr, voice: 'Xin chào bạn hôm nay.' },
  ];
  const fns = ['HOOK', 'SETUP', 'PROBLEM'];
  ensureDistinctPartials(rows, fns);
  assert.notEqual(rows[0].subject, rows[1].subject);
  assert.notEqual(rows[1].narrator_vi, rows[2].narrator_vi);
  assert.notEqual(rows[1].voice, rows[2].voice);
});

test('ensureDistinctPartials lowers token overlap for paraphrased subjects', () => {
  const rows = [
    { subject: 'Nhân vật cầm chai nước trên bàn bếp sáng.', narrator_vi: narrOk, voice: 'SILENT' },
    { subject: 'Trên bàn bếp sáng nhân vật cầm chai nước.', narrator_vi: narrOk, voice: 'SILENT' },
  ];
  ensureDistinctPartials(rows, ['HOOK', 'SETUP']);
  assert.notEqual(rows[0].subject, rows[1].subject);
  assert.ok(multisetJaccardStrings(rows[0].subject, rows[1].subject) < 0.62);
});

const narrOk = 'Đây là một dòng narrator tiếng Việt ngắn cho clip.';

test('validateScene requires subject, sceneFunction, voice ≤48 words, and narrator_vi', () => {
  assert.equal(validateScene({ subject: 'Một beat', voice: 'SILENT', sceneFunction: 'HOOK', narrator_vi: narrOk }).ok, true);
  assert.equal(validateScene({ subject: '', voice: 'SILENT', sceneFunction: 'HOOK', narrator_vi: narrOk }).ok, false);
  assert.equal(validateScene({ subject: 'x', voice: 'SILENT', sceneFunction: '', narrator_vi: narrOk }).ok, false);
  assert.equal(validateScene({ subject: 'x', voice: 'SILENT', sceneFunction: 'HOOK', narrator_vi: '' }).ok, false);
  const w = Array.from({ length: 49 }, (_, i) => `w${i + 1}`).join(' ');
  assert.equal(validateScene({ subject: 'x', voice: w, sceneFunction: 'HOOK', narrator_vi: narrOk }).ok, false);
});

test('dedupeRepeatedWordRuns removes adjacent duplicates', () => {
  assert.equal(dedupeRepeatedWordRuns('nhịp nhịp tim tim đồ hoạ'), 'nhịp tim đồ hoạ');
  assert.equal(dedupeRepeatedWordRuns('a b a b c'), 'a b c');
  assert.equal(dedupeRepeatedWordRuns('x y y x y'), 'x y');
});

test('sanitize dialogue max 48 words', () => {
  const long = Array.from({ length: 55 }, (_, i) => `t${i + 1}`).join(' ');
  const out = sanitizeDialogueVi(long);
  assert.ok(out.split(/\s+/).length <= 48);
});

test('sanitize subject fallback', () => {
  assert.ok(sanitizeSubject('').length > 0);
});

test('scene function flow: five-beat narrative then cycles', () => {
  const flow = ['HOOK', 'SETUP', 'PROBLEM', 'INSIGHT', 'CONCLUSION'];
  assert.deepEqual(sceneFunctionsForQuantity(5), flow);
  assert.equal(sceneFunctionsForQuantity(5).length, 5);
  const seven = sceneFunctionsForQuantity(7);
  assert.equal(seven.length, 7);
  assert.deepEqual(seven, [...flow, 'HOOK', 'SETUP']);
  const twelve = sceneFunctionsForQuantity(12);
  assert.equal(twelve.length, 12);
  assert.deepEqual(twelve.slice(0, 5), flow);
  assert.equal(twelve[5], 'HOOK');
  assert.equal(sceneFunctionsForQuantity(20).length, 20);
});

test('mergePromptDNA overrides camera only', () => {
  const d = mergePromptDNA({ cameraBase: 'TEST_CAM' });
  assert.equal(d.cameraBase, 'TEST_CAM');
  assert.ok(d.globalStyle.includes('cohesive'));
});

test('render prompt extractor parses blocks and builds vendor bundles', () => {
  const compiled = [
    'GLOBAL_STYLE: cinematic look aspect 9:16 test.',
    'CENTRAL_THESIS: One core message.',
    'CONSISTENCY_LOCK: lock text',
    'INTENSITY: Scene 1/2 arc',
    'CHARACTER: Hero host',
    'SCENE: [HOOK] A single beat.',
    'CAMERA: wide lens',
    'LIGHTING: soft key',
    'MOTION: slow dolly',
    'AUDIO: diegetic mix| Spoken dialogue (verbatim): Xin chào bạn',
    'NEGATIVE_PROMPT: blur, watermark',
  ].join('\n');
  const blocks = parseCompiledPromptBlocks(compiled);
  assert.equal(blocks.CENTRAL_THESIS, 'One core message.');
  assert.equal(extractDialogueFromAudioBlock(blocks.AUDIO), 'Xin chào bạn');
  const bundle = buildRenderPromptBundle(compiled);
  assert.equal(bundle.version, 'render-extract-v1');
  assert.ok(bundle.runway.prompt.includes('[Film thesis]'));
  assert.ok(bundle.runway.prompt.includes('[Scene]'));
  assert.equal(bundle.runway.negativePrompt, 'blur, watermark');
  assert.ok(bundle.sora.prompt.includes('Constraints'));
});

test('parseCharacterPool keeps full roster (not truncated by scene count)', () => {
  const joined = Array.from({ length: 10 }, (_, i) => `Vai ${i + 1}`).join('; ');
  const p = parseCharacterPool(joined, 24);
  assert.equal(p.length, 10);
});

test('buildCharacterCentral adds ENSEMBLE for multi cast', () => {
  const line = buildCharacterCentral({
    character: 'A; B',
    characterMode: 'Giữ nguyên',
  });
  assert.match(line, /ENSEMBLE_CAST/);
  assert.match(line, /A · B/);
});

test('character registry injects VISUAL_LOCK and disables legacy free-text', () => {
  const legacy = buildCharacterCentral({ character: 'Hero', characterMode: 'keep' });
  assert.match(legacy, /Hero/);

  const reg = resolveCharacterInjections(
    { characterIds: ['host-neutral-vn'], character: 'IGNORED', characterMode: 'keep' },
    3,
  );
  assert.equal(reg.usesRegistry, true);
  assert.match(reg.characterCentral, /VISUAL_LOCK_REGISTRY_ONLY/);
  assert.match(reg.characterCentral, /\[host-neutral-vn\]/);
  assert.equal(reg.focusPool.length, 3);
  assert.ok(reg.focusPool.every((x) => typeof x === 'string' && x.length > 0));
});

test('commercial prompt is one-line sheet like Veo Style/Character/…/Negative', () => {
  const compiled = [
    'GLOBAL_STYLE: Cinematic cool grade; aspect 9:16.',
    'CENTRAL_THESIS: Giữ da khỏe khi rửa mặt.',
    'CONSISTENCY_LOCK: lock',
    'INTENSITY: 1/3',
    'CHARACTER: Water Drop, pearlescent blue sphere mascot.',
    'SCENE: [HOOK] Steamy sink edge.',
    'CAMERA: Macro shallow DOF',
    'LIGHTING: Soft rim',
    'MOTION: Micro sway',
    'AUDIO: mix| Spoken dialogue (verbatim): Ôi nóng quá!',
    'NEGATIVE_PROMPT: text, watermark',
  ].join('\n');
  const sheet = buildCommercialVeoSheetPrompt(compiled, {
    voicePreset: 'Nữ trẻ',
    styleTone: 'Châm biếm',
    context: 'Phòng tắm',
    environmentBase: 'Porcelain sink',
    duration: 8,
    ratio: '9:16',
    narratorVi: 'Narrator tiếng Việt mẫu: giữ nhịp 8 giây cho Google Flow.',
  });
  assert.ok(!/\r|\n/.test(sheet), 'single continuous line');
  assert.match(sheet, /^Style: High-End 3D Commercial Animation \(Unreal Engine 5\)/i);
  assert.match(sheet, /Character:/i);
  assert.match(sheet, /Anatomy:.*Disney\/Pixar/i);
  assert.match(sheet, /Face:.*Large 3D expressive eyes/i);
  assert.match(sheet, /Composition:/i);
  assert.match(sheet, /Environment:/i);
  assert.match(sheet, /Phòng tắm/);
  assert.match(sheet, /Dialogue \(Voice: Young Female, Tone: Sarcastic/i);
  assert.match(sheet, /Ôi nóng quá/);
  assert.match(sheet, /Negative:/i);
  assert.match(sheet, /text, watermark/);
  assert.ok(!/ENSEMBLE_CAST/i.test(sheet));
  assert.equal(buildSceneDisplayTitle({ focusBeat: 'Giọt nước', sceneFunction: 'HOOK', subject: 'x' }), 'Giọt nước');
});

test('commercial sheet can append thesis spine to environment when under-covered', () => {
  const compiled = [
    'GLOBAL_STYLE: x',
    'CENTRAL_THESIS: Luôn uống đủ nước mỗi ngày.',
    'CONSISTENCY_LOCK: lock',
    'INTENSITY: 1/1',
    'CHARACTER: Bình nước xanh.',
    'SCENE: [HOOK] Góc bàn làm việc.',
    'CAMERA: macro',
    'LIGHTING: soft',
    'MOTION: slow',
    'AUDIO: base| Spoken dialogue (verbatim): SILENT',
    'NEGATIVE_PROMPT: y',
  ].join('\n');
  const sheet = buildCommercialVeoSheetPrompt(compiled, {
    topic: 'Thói quen uống nước',
    centralThesis: 'Luôn uống đủ nước mỗi ngày.',
    context: 'Văn phòng',
    environmentBase: 'Bàn gỗ',
  });
  assert.match(sheet, /Environment:.*Core message:/i);
  assert.match(sheet, /uống đủ nước/i);
});

test('commercial prompt falls back to narrator dialogue when voice preset is silent', () => {
  const compiled = [
    'GLOBAL_STYLE: test',
    'CENTRAL_THESIS: thesis',
    'CONSISTENCY_LOCK: lock',
    'INTENSITY: 1/1',
    'CHARACTER: mascot',
    'SCENE: [HOOK] Beat one.',
    'CAMERA: macro',
    'LIGHTING: soft',
    'MOTION: slow',
    'AUDIO: base| Spoken dialogue (verbatim): SILENT',
    'NEGATIVE_PROMPT: x',
  ].join('\n');
  const sheetVi = buildCommercialVeoSheetPrompt(compiled, {
    voicePreset: 'Không thoại (nhạc/SFX)',
    styleTone: 'Giáo dục',
    duration: 8,
    language: 'Tiếng Việt',
    narratorVi: 'HOOK: một lời narrator tiếng Việt ngắn gọn cho clip 8 giây.',
  });
  assert.match(sheetVi, /Dialogue \(Voice: Narrator \(Gemini VN\)/i);
  assert.match(sheetVi, /HOOK:.*một lời narrator/i);

  const sheetNone = buildCommercialVeoSheetPrompt(compiled, {
    voicePreset: 'none',
    styleTone: 'Giáo dục',
    duration: 8,
    language: 'Tiếng Việt',
    narratorVi: 'Narrator dự phòng khi preset none.',
  });
  assert.match(sheetNone, /Dialogue \(Voice: Narrator \(Gemini VN\).*Narrator dự phòng/i);
});
