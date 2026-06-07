export const DEFAULT_PROMPT_DNA = {
    globalStyle: 'Single cohesive cinematic world; one film LUT and contrast curve for the entire run; no genre or decade hop.',
    cameraBase: '35–50mm equivalent lens family; stable horizon; motivated blocking; no unmotivated handheld shake.',
    lightingBase: 'Soft key with controlled rim; consistent color temperature and shadow density across every scene.',
    motionBase: 'Motivated camera moves only; match on action; no random whip-pan or speed ramp unless SCENE_FUNCTION demands one clear beat.',
    environmentBase: 'Continuity geography and production design; same materials palette; no random location redesign between scenes.',
    negativePrompt: 'AI must not invent new lens pack, new LUT, new aspect, new film stock, or new lighting scheme; no text watermark; no burned-in subtitles',
    audioBase: 'Diegetic-first mix; score supports picture; spoken dialogue only in the compiled AUDIO line (verbatim segment); no mic peaking.',
};
export function mergePromptDNA(partial) {
    return { ...DEFAULT_PROMPT_DNA, ...partial };
}
/** Builds the DNA line block prepended to every compiled scene prompt (system-owned). */
export function buildDnaLineStrings(dna, meta) {
    const ratio = String(meta.ratio || '16:9').trim();
    const duration = Math.min(8, Math.max(3, Number(meta.duration) || 8));
    const styleTone = String(meta.styleTone || 'cinematic').trim();
    const humor = Math.min(100, Math.max(0, Number(meta.humor) || 0));
    const ctx = meta.context?.trim();
    const gs = `${dna.globalStyle} Execution binders: aspect ${ratio}, ~${duration}s beats, humor register ${humor}/100 (performance only); tone label "${styleTone}" must not override DNA look.`;
    return [
        `GLOBAL_STYLE: ${gs}`,
        `CAMERA_BASE: ${dna.cameraBase}`,
        `LIGHTING_BASE: ${dna.lightingBase}`,
        `MOTION_BASE: ${dna.motionBase}`,
        `ENVIRONMENT_BASE: ${dna.environmentBase}${ctx ? ` | Story anchor: ${ctx}` : ''}`,
        `AUDIO_BASE: ${dna.audioBase}`,
    ];
}
/** User negative + DNA negative + shared suffix (suffix lives in constants on JS side — pass fullSuffix). */
export function buildNegativeFromDNA(dna, userNegative, fullSuffix) {
    const u = String(userNegative || '').trim();
    const parts = [dna.negativePrompt, u, fullSuffix].filter(Boolean);
    return parts.join('; ').replace(/\s+/g, ' ').trim();
}
//# sourceMappingURL=promptDNA.js.map