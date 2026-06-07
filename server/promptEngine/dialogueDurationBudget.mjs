import { clampClipDurationSec } from './constants.mjs';
import { isStudioVoiceSilentPreset } from './studioVoice.mjs';

/** ~2.35 từ/giây (thoại quảng ngắn dọc); trần 48 theo validator. */
export function maxVoiceWordsForDuration(durationSec) {
  const d = clampClipDurationSec(durationSec);
  return Math.min(48, Math.max(6, Math.round(d * 2.35)));
}

/**
 * Một đoạn gắn vào prompt Gemini: bắt buộc một dòng thoại thật, độ dài khớp clip.
 * @param {{ voice?: string, duration?: number }} input
 */
export function buildVoiceDurationBudgetBlock(input) {
  if (isStudioVoiceSilentPreset(input?.voice)) return '';
  const d = clampClipDurationSec(input?.duration);
  const maxW = maxVoiceWordsForDuration(d);
  return [
    `Clip target ≈${d}s. Field "voice": ONE contiguous spoken line only (lip-sync / Veo VO).`,
    `Hard cap: ≤${maxW} words so read-aloud fits ~${d}s (not rushed, not padded).`,
    'MUST be real dialogue the character says (concrete words); FORBIDDEN: SILENT, empty, "...", placeholders, stage directions, quotes about the scene.',
  ].join(' ');
}

/** Luôn bật: narrator tiếng Việt cho Google Flow (kể cả khi nhân vật trên hình SILENT). */
export function buildNarratorVietnameseBudgetBlock(input) {
  const d = clampClipDurationSec(input?.duration);
  const maxW = maxVoiceWordsForDuration(d);
  return [
    `Field "narrator_vi": REQUIRED every scene. Vietnamese only, one continuous narrator / voice-over line for Google Flow or TTS (off-screen is OK).`,
    `Hard cap: ≤${maxW} words so read-aloud fits ~${d}s clip.`,
    'Must advance the beat (HOOK/SETUP/…); tie to Topic + CENTRAL_THESIS; FORBIDDEN: empty, "...", meta-only, English unless Topic is English.',
    'When "voice" is SILENT (no lip-sync), narrator_vi MUST still be a full natural line (narrator carries spoken story).',
  ].join(' ');
}
