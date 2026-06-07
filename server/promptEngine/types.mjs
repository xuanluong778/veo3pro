/**
 * @typedef {Object} StudioGenerateInput
 * @property {string} [topic]
 * @property {string} [style]
 * @property {number} [duration]
 * @property {string} [ratio]
 * @property {string} [character]
 * @property {string[]} [characterIds] Registry character IDs (server injects full locks; overrides free-text character for CHARACTER line).
 * @property {string} [characterMode]
 * @property {number} [humorLevel]
 * @property {string} [context]
 * @property {string} [negative]
 * @property {string} [voice]
 * @property {string} [language]
 * @property {number} [quantity]
 * @property {Object} [promptDNA] Optional Prompt DNA field overrides (see `promptDNA.ts`).
 * @property {boolean} [debug] When true, pipeline returns `debug` object (raw partial LLM text, parsed partials, compiled prompts).
 */

/**
 * @typedef {Object} LlmScenePartial
 * @property {string} subject Visual beat (AI-generated).
 * @property {string} voice Spoken line or SILENT (AI-generated). Legacy JSON key `dialogue_vi` is accepted at parse time only.
 * @property {string} narrator_vi Vietnamese narrator / voice-over for Google Flow (AI-generated).
 */

/**
 * @typedef {Object} CompiledScene
 * @property {string} title
 * @property {string} prompt
 * @property {string} sceneFunction
 */

export {};
