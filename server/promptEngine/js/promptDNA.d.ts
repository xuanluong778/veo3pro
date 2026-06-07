/**
 * Central visual / technical DNA — system-owned. LLM must not redefine these;
 * only per-scene `subject` + `voice` (dialogue) are model-generated; the Prompt Compiler builds the final prompt.
 */
export interface PromptDNA {
    globalStyle: string;
    cameraBase: string;
    lightingBase: string;
    motionBase: string;
    environmentBase: string;
    negativePrompt: string;
    audioBase: string;
}
export interface DnaRuntimeMeta {
    ratio: string;
    duration: number;
    styleTone: string;
    humor: number;
    context?: string;
}
export declare const DEFAULT_PROMPT_DNA: PromptDNA;
export declare function mergePromptDNA(partial?: Partial<PromptDNA>): PromptDNA;
/** Builds the DNA line block prepended to every compiled scene prompt (system-owned). */
export declare function buildDnaLineStrings(dna: PromptDNA, meta: DnaRuntimeMeta): string[];
/** User negative + DNA negative + shared suffix (suffix lives in constants on JS side — pass fullSuffix). */
export declare function buildNegativeFromDNA(dna: PromptDNA, userNegative: string, fullSuffix: string): string;
//# sourceMappingURL=promptDNA.d.ts.map